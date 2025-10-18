// Unified Message Handler for Chrome Manifest V3
// Handles messages from all supported platforms

export class UnifiedMessageHandler {
  constructor() {
    this.serverUrl = 'http://localhost:8765';
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
  }

  async processMessage(data) {
    try {
      // Add to conversation on server
      const contextResponse = await fetch(`${this.serverUrl}/conversation/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: data.chatId,
          platform: data.platform || this.detectPlatform(data.url),
          message: data
        })
      });

      const context = await contextResponse.json();

      // Check for auto-activation
      if (this.settings.autoActivateOnScammer &&
          context.scammerScore > this.settings.scammerThreshold &&
          !this.isConversationActive(data.chatId, data.platform)) {

        this.activateConversation(data.chatId, data.platform, data.tabId);

        // Notify content script
        chrome.tabs.sendMessage(data.tabId, {
          type: 'SCAMMER_DETECTED',
          data: {
            score: context.scammerScore,
            autoActivated: true
          }
        });
      }

      // Only generate response if active
      if (!this.isConversationActive(data.chatId, data.platform)) {
        return {
          processed: false,
          reason: 'Conversation not active',
          scammerScore: context.scammerScore
        };
      }

      // Get response suggestions
      const suggestionsResponse = await fetch(`${this.serverUrl}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: data.chatId,
          platform: data.platform,
          context
        })
      });

      const suggestions = await suggestionsResponse.json();

      // Select personality
      const personality = await this.selectPersonality(data.chatId, context);

      // Generate response
      const generateResponse = await fetch(`${this.serverUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: data.content || data.text,
          personality,
          chatId: data.chatId,
          platform: data.platform || this.detectPlatform(data.url),
          context,
          suggestions,
          timestamp: data.timestamp
        })
      });

      const result = await generateResponse.json();

      // Calculate delay
      const delay = this.calculateResponseDelay(result.reply, context);

      // Queue response
      await this.queueResponse({
        tabId: data.tabId,
        platform: data.platform || this.detectPlatform(data.url),
        chatId: data.chatId,
        reply: result.reply,
        delay,
        personality
      });

      return {
        queued: true,
        reply: result.reply,
        delay,
        personality,
        scammerScore: context.scammerScore
      };

    } catch (error) {
      console.error('[UnifiedHandler] Error:', error);

      const fallback = this.getFallbackResponse(data.platform);
      return {
        reply: fallback,
        delay: 3000,
        error: error.message
      };
    }
  }

  detectPlatform(url) {
    if (!url) return 'unknown';

    if (url.includes('whatsapp.com')) return 'whatsapp';
    if (url.includes('telegram.org')) return 'telegram';
    if (url.includes('messenger.com')) return 'messenger';

    return 'unknown';
  }

  async selectPersonality(chatId, context) {
    if (!this.settings.personalityRotation) {
      return context.personality || 'default';
    }

    // Load available personalities
    const stored = await chrome.storage.local.get('personalities');
    const personalities = stored.personalities || ['default'];

    // Rotate based on message count
    const messageCount = context.messageCount || 0;
    const index = Math.floor(messageCount / 5) % personalities.length;

    return personalities[index];
  }

  calculateResponseDelay(text, context) {
    const wordCount = text.split(' ').length;
    const baseDelay = this.settings.minResponseDelay;
    const perWordDelay = 150;

    let delay = baseDelay + (wordCount * perWordDelay);

    // Adjust based on context
    if (context.conversationTone === 'urgent') {
      delay *= 1.5; // Be slower for urgent scammers
    }

    // Add random variation
    const variation = 0.3;
    const randomFactor = 1 + (Math.random() * 2 * variation - variation);
    delay *= randomFactor;

    return Math.min(delay, this.settings.maxResponseDelay);
  }

  async queueResponse(response) {
    this.responseQueue.push({
      ...response,
      queuedAt: Date.now()
    });

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.responseQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const response = this.responseQueue.shift();

    // Calculate remaining delay
    const elapsed = Date.now() - response.queuedAt;
    const remainingDelay = Math.max(0, response.delay - elapsed);

    // Wait
    await this.sleep(remainingDelay);

    // Send response
    try {
      await chrome.tabs.sendMessage(response.tabId, {
        type: 'SEND_MESSAGE',
        data: {
          text: response.reply,
          delay: 0
        }
      });

      console.log(`[UnifiedHandler] Sent response to ${response.platform}:${response.chatId}`);
    } catch (error) {
      console.error('[UnifiedHandler] Failed to send response:', error);
    }

    // Process next
    this.processQueue();
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

  async getStatistics() {
    const stats = {
      activeConversations: this.activeConversations.size,
      queuedResponses: this.responseQueue.length,
      platformBreakdown: {}
    };

    this.activeConversations.forEach(conv => {
      stats.platformBreakdown[conv.platform] =
        (stats.platformBreakdown[conv.platform] || 0) + 1;
    });

    return stats;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export for use in service worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UnifiedMessageHandler;
}