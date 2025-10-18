// Unified Message Handler for Multiple Platforms
// Handles messages from WhatsApp, Telegram, and Facebook Messenger

class UnifiedMessageHandler {
  constructor() {
    this.serverUrl = 'http://localhost:8765';
    this.platforms = new Map();
    this.activeConversations = new Map();
    this.responseQueue = [];
    this.isProcessing = false;
    this.settings = {
      autoActivateOnScammer: true,
      scammerThreshold: 0.7,
      maxResponseDelay: 15000,
      minResponseDelay: 2000,
      personalityRotation: false
    };
    this.init();
  }

  init() {
    this.loadSettings();
    this.setupMessageListeners();
    this.startResponseProcessor();
    this.registerPlatforms();
  }

  registerPlatforms() {
    // Register platform-specific configurations
    this.platforms.set('whatsapp', {
      name: 'WhatsApp Web',
      domain: 'web.whatsapp.com',
      contentScript: 'whatsapp-enhanced.js',
      selectors: {
        input: '[data-testid="conversation-compose-box-input"]',
        sendButton: '[data-testid="compose-btn-send"]',
        messageContainer: '[data-testid^="msg-"]'
      }
    });

    this.platforms.set('telegram', {
      name: 'Telegram Web',
      domain: 'web.telegram.org',
      contentScript: 'telegram.js',
      selectors: {
        input: '.composer-input-field',
        sendButton: '.btn-send',
        messageContainer: '.message'
      }
    });

    this.platforms.set('messenger', {
      name: 'Facebook Messenger',
      domain: 'messenger.com',
      contentScript: 'messenger.js',
      selectors: {
        input: '[role="textbox"]',
        sendButton: '[aria-label="Send"]',
        messageContainer: '[role="row"]'
      }
    });
  }

  setupMessageListeners() {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Identify platform from sender URL
      const platform = this.identifyPlatform(sender.url);

      console.log(`[UnifiedHandler] Message from ${platform}:`, message.type);

      switch (message.type) {
        case 'NEW_MESSAGE':
          this.handleNewMessage(message.data, platform, sender.tab.id)
            .then(sendResponse)
            .catch(error => {
              console.error('Error handling message:', error);
              sendResponse({ error: error.message });
            });
          return true; // Keep channel open for async response

        case 'TOGGLE_ACTIVE':
          this.handleToggleActive(message.data, platform, sender.tab.id);
          sendResponse({ success: true });
          break;

        case 'GET_PLATFORM_STATUS':
          sendResponse({
            platform,
            registered: this.platforms.has(platform),
            active: this.isConversationActive(message.data.chatId, platform)
          });
          break;

        case 'EXPORT_CONVERSATION':
          this.exportConversation(message.data.chatId, platform)
            .then(sendResponse)
            .catch(error => sendResponse({ error: error.message }));
          return true;

        case 'GET_STATISTICS':
          this.getStatistics()
            .then(sendResponse)
            .catch(error => sendResponse({ error: error.message }));
          return true;

        default:
          // Pass through to original background handler
          return false;
      }
    });
  }

  identifyPlatform(url) {
    if (!url) return 'unknown';

    for (const [platformId, config] of this.platforms) {
      if (url.includes(config.domain)) {
        return platformId;
      }
    }

    return 'unknown';
  }

  async handleNewMessage(data, platform, tabId) {
    try {
      // Add to conversation manager on server
      const contextResponse = await fetch(`${this.serverUrl}/conversation/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: data.chatId,
          platform,
          message: data
        })
      });

      const context = await contextResponse.json();

      // Check if we should auto-activate
      if (this.settings.autoActivateOnScammer &&
          context.scammerScore > this.settings.scammerThreshold &&
          !this.isConversationActive(data.chatId, platform)) {

        console.log(`[UnifiedHandler] Auto-activating for suspected scammer (score: ${context.scammerScore})`);
        this.activateConversation(data.chatId, platform, tabId);

        // Notify content script
        browser.tabs.sendMessage(tabId, {
          type: 'SCAMMER_DETECTED',
          data: {
            score: context.scammerScore,
            autoActivated: true
          }
        });
      }

      // Only generate response if conversation is active
      if (!this.isConversationActive(data.chatId, platform)) {
        return { processed: false, reason: 'Conversation not active' };
      }

      // Get response suggestions from server
      const suggestionsResponse = await fetch(`${this.serverUrl}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: data.chatId,
          platform,
          context
        })
      });

      const suggestions = await suggestionsResponse.json();

      // Select personality (rotate if enabled)
      const personality = this.selectPersonality(data.chatId, context);

      // Generate response
      const generateResponse = await fetch(`${this.serverUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: data.content || data.text,
          personality,
          chatId: data.chatId,
          platform,
          context,
          suggestions,
          timestamp: data.timestamp
        })
      });

      const result = await generateResponse.json();

      // Calculate human-like delay
      const delay = this.calculateResponseDelay(result.reply, context);

      // Add to response queue
      this.queueResponse({
        tabId,
        platform,
        chatId: data.chatId,
        reply: result.reply,
        delay,
        personality
      });

      return {
        queued: true,
        reply: result.reply,
        delay,
        personality
      };

    } catch (error) {
      console.error('[UnifiedHandler] Error:', error);

      // Use fallback response
      const fallback = this.getFallbackResponse(platform);
      return {
        reply: fallback,
        delay: 3000,
        error: error.message
      };
    }
  }

  selectPersonality(chatId, context) {
    if (!this.settings.personalityRotation) {
      return context.personality || 'default';
    }

    // Rotate personalities based on conversation state
    const personalities = ['confused-elder', 'tech-support-nightmare', 'conspiracy-theorist'];
    const messageCount = context.messageCount || 0;

    // Change personality every 5 messages
    const index = Math.floor(messageCount / 5) % personalities.length;
    return personalities[index];
  }

  calculateResponseDelay(text, context) {
    // Base delay on text length (typing speed)
    const wordCount = text.split(' ').length;
    const baseDelay = this.settings.minResponseDelay;
    const perWordDelay = 150; // 150ms per word (average typing speed)

    let delay = baseDelay + (wordCount * perWordDelay);

    // Add variation based on context
    if (context.conversationTone === 'urgent') {
      // Take longer to respond to urgent messages (frustrate scammers)
      delay *= 1.5;
    }

    // Add random variation (±30%)
    const variation = 0.3;
    const randomFactor = 1 + (Math.random() * 2 * variation - variation);
    delay *= randomFactor;

    // Cap at max delay
    return Math.min(delay, this.settings.maxResponseDelay);
  }

  queueResponse(response) {
    this.responseQueue.push({
      ...response,
      queuedAt: Date.now()
    });

    // Start processor if not already running
    if (!this.isProcessing) {
      this.processResponseQueue();
    }
  }

  async processResponseQueue() {
    if (this.responseQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const response = this.responseQueue.shift();

    // Wait for the calculated delay
    const elapsed = Date.now() - response.queuedAt;
    const remainingDelay = Math.max(0, response.delay - elapsed);

    await this.sleep(remainingDelay);

    // Send the response to the content script
    try {
      await browser.tabs.sendMessage(response.tabId, {
        type: 'SEND_MESSAGE',
        data: {
          text: response.reply,
          delay: 0 // No additional delay, we've already waited
        }
      });

      console.log(`[UnifiedHandler] Sent response to ${response.platform}:${response.chatId}`);
    } catch (error) {
      console.error('[UnifiedHandler] Failed to send response:', error);
    }

    // Process next in queue
    this.processResponseQueue();
  }

  startResponseProcessor() {
    // Periodic check for stuck responses
    setInterval(() => {
      if (!this.isProcessing && this.responseQueue.length > 0) {
        console.log('[UnifiedHandler] Restarting response processor');
        this.processResponseQueue();
      }
    }, 5000);
  }

  handleToggleActive(data, platform, tabId) {
    const key = `${platform}:${data.chatId}`;

    if (data.isActive) {
      this.activateConversation(data.chatId, platform, tabId);
    } else {
      this.deactivateConversation(data.chatId, platform);
    }
  }

  activateConversation(chatId, platform, tabId) {
    const key = `${platform}:${chatId}`;
    this.activeConversations.set(key, {
      chatId,
      platform,
      tabId,
      activatedAt: Date.now(),
      messageCount: 0
    });

    console.log(`[UnifiedHandler] Activated ${key}`);
  }

  deactivateConversation(chatId, platform) {
    const key = `${platform}:${chatId}`;
    this.activeConversations.delete(key);

    console.log(`[UnifiedHandler] Deactivated ${key}`);
  }

  isConversationActive(chatId, platform) {
    const key = `${platform}:${chatId}`;
    return this.activeConversations.has(key);
  }

  getFallbackResponse(platform) {
    const fallbacks = {
      whatsapp: [
        "Sorry, what was that? My WhatsApp is acting strange.",
        "Can you repeat? The message came through garbled.",
        "Hold on, my phone is being slow..."
      ],
      telegram: [
        "Telegram is glitching for me, one second...",
        "Strange, I'm getting errors. What did you say?",
        "My Telegram is updating, please wait..."
      ],
      messenger: [
        "Facebook is being weird, can you resend?",
        "Messenger crashed, what were you saying?",
        "Sorry, Facebook is slow today..."
      ],
      default: [
        "I didn't catch that, can you repeat?",
        "Sorry, technical difficulties...",
        "One moment please..."
      ]
    };

    const platformFallbacks = fallbacks[platform] || fallbacks.default;
    return platformFallbacks[Math.floor(Math.random() * platformFallbacks.length)];
  }

  async exportConversation(chatId, platform) {
    try {
      const response = await fetch(`${this.serverUrl}/conversation/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, platform })
      });

      const data = await response.json();

      // Save to browser storage for user access
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `loosecannon-${platform}-${chatId}-${timestamp}.json`;

      await browser.storage.local.set({
        [`export_${filename}`]: data
      });

      return {
        success: true,
        filename,
        data
      };
    } catch (error) {
      console.error('[UnifiedHandler] Export error:', error);
      throw error;
    }
  }

  async getStatistics() {
    try {
      const response = await fetch(`${this.serverUrl}/statistics`);
      const serverStats = await response.json();

      // Add local statistics
      const localStats = {
        activeConversations: this.activeConversations.size,
        queuedResponses: this.responseQueue.length,
        platformBreakdown: {}
      };

      // Count active conversations by platform
      this.activeConversations.forEach(conv => {
        localStats.platformBreakdown[conv.platform] =
          (localStats.platformBreakdown[conv.platform] || 0) + 1;
      });

      return {
        server: serverStats,
        local: localStats,
        combined: {
          totalActive: localStats.activeConversations,
          totalProcessed: serverStats.totalMessages || 0,
          platforms: Object.keys({ ...serverStats.platformBreakdown, ...localStats.platformBreakdown })
        }
      };
    } catch (error) {
      console.error('[UnifiedHandler] Statistics error:', error);
      throw error;
    }
  }

  async loadSettings() {
    try {
      const stored = await browser.storage.local.get('unifiedSettings');
      if (stored.unifiedSettings) {
        this.settings = { ...this.settings, ...stored.unifiedSettings };
      }
    } catch (error) {
      console.error('[UnifiedHandler] Error loading settings:', error);
    }
  }

  async saveSettings() {
    try {
      await browser.storage.local.set({ unifiedSettings: this.settings });
    } catch (error) {
      console.error('[UnifiedHandler] Error saving settings:', error);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export for use in background.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UnifiedMessageHandler;
}