// Enhanced WhatsApp Web Content Script for LooseCannon
// Detects various message types and implements sophisticated interaction

console.log('[LooseCannon] Enhanced WhatsApp content script loaded');

class EnhancedWhatsAppIntegration {
  constructor() {
    this.isActive = false;
    this.currentChat = null;
    this.messageObserver = null;
    this.typingTimer = null;
    this.conversationState = new Map();
    this.scammerPatterns = this.loadScammerPatterns();
    this.init();
  }

  init() {
    this.waitForWhatsApp().then(() => {
      console.log('[LooseCannon] WhatsApp detected and ready');
      this.setupMessageObserver();
      this.injectControls();
      this.listenForCommands();
      this.setupConversationTracking();
    });
  }

  waitForWhatsApp() {
    return new Promise((resolve) => {
      const checkForApp = setInterval(() => {
        const mainWrapper = document.querySelector('[data-testid="conversation-panel-wrapper"]');
        if (mainWrapper) {
          clearInterval(checkForApp);
          resolve();
        }
      }, 1000);
    });
  }

  setupMessageObserver() {
    const messageContainer = document.querySelector('[role="application"]');

    if (!messageContainer) {
      console.error('[LooseCannon] Could not find message container');
      return;
    }

    const config = {
      childList: true,
      subtree: true,
      characterData: true
    };

    this.messageObserver = new MutationObserver((mutations) => {
      if (!this.isActive) return;

      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (this.isIncomingMessage(node)) {
              this.handleIncomingMessage(node);
            }
          });
        }
      });
    });

    this.messageObserver.observe(messageContainer, config);
    console.log('[LooseCannon] Enhanced message observer setup complete');
  }

  isIncomingMessage(node) {
    if (!node.querySelector) return false;

    const messageElement = node.querySelector('[data-testid^="msg-"]');
    if (!messageElement) return false;

    // Check if it's an incoming message (not sent by us)
    const isIncoming = !messageElement.classList.contains('message-out');

    // Additional check for system messages
    const isSystemMessage = messageElement.querySelector('[data-testid="system-message"]');

    return isIncoming && !isSystemMessage;
  }

  handleIncomingMessage(node) {
    const messageData = this.extractMessageData(node);
    const timestamp = new Date().toISOString();
    const chatId = this.getCurrentChatId();

    console.log('[LooseCannon] New message detected:', messageData);

    // Update conversation state
    this.updateConversationState(chatId, messageData);

    // Check for scammer patterns
    const scammerScore = this.analyzeForScammerPatterns(messageData);
    if (scammerScore > 0.7) {
      console.warn('[LooseCannon] High scammer probability detected:', scammerScore);
      this.addScammerWarning(node);
    }

    // Send to background script for processing
    browser.runtime.sendMessage({
      type: 'NEW_MESSAGE',
      data: {
        ...messageData,
        timestamp,
        chatId,
        scammerScore,
        conversationContext: this.getConversationContext(chatId)
      }
    }).then(response => {
      if (response && response.reply) {
        this.simulateHumanResponse(response.reply, response.delay);
      }
    });
  }

  extractMessageData(node) {
    const data = {
      type: 'text',
      content: '',
      media: null,
      links: [],
      metadata: {}
    };

    // Extract text content
    const textElement = node.querySelector('[data-testid="msg-container"] .selectable-text');
    if (textElement) {
      data.content = textElement.textContent;

      // Extract links from text
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const links = data.content.match(urlRegex);
      if (links) {
        data.links = links;
        data.metadata.hasLinks = true;
      }
    }

    // Check for images
    const imageElement = node.querySelector('[data-testid="msg-container"] img[src^="blob:"]');
    if (imageElement) {
      data.type = 'image';
      data.media = {
        type: 'image',
        src: imageElement.src,
        alt: imageElement.alt || 'Image message'
      };
      data.metadata.hasImage = true;
    }

    // Check for voice messages
    const audioElement = node.querySelector('[data-testid="audio-play"]');
    if (audioElement) {
      data.type = 'audio';
      data.media = {
        type: 'audio',
        duration: this.extractAudioDuration(audioElement)
      };
      data.metadata.hasAudio = true;
    }

    // Check for documents
    const documentElement = node.querySelector('[data-testid="msg-document"]');
    if (documentElement) {
      data.type = 'document';
      data.media = {
        type: 'document',
        name: documentElement.textContent
      };
      data.metadata.hasDocument = true;
    }

    // Check for location
    const locationElement = node.querySelector('[data-testid="msg-location"]');
    if (locationElement) {
      data.type = 'location';
      data.media = {
        type: 'location'
      };
      data.metadata.hasLocation = true;
    }

    // Extract phone numbers from content
    const phoneRegex = /[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,5}[-\s\.]?[0-9]{1,5}/g;
    const phones = data.content.match(phoneRegex);
    if (phones) {
      data.metadata.phoneNumbers = phones;
    }

    // Extract email addresses
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = data.content.match(emailRegex);
    if (emails) {
      data.metadata.emails = emails;
    }

    return data;
  }

  extractAudioDuration(audioElement) {
    const durationElement = audioElement.parentElement.querySelector('[data-testid="audio-duration"]');
    return durationElement ? durationElement.textContent : 'Unknown duration';
  }

  loadScammerPatterns() {
    return {
      keywords: [
        'prize', 'winner', 'congratulations', 'claim', 'urgent', 'act now',
        'limited time', 'verify account', 'suspended', 'click here',
        'confirm identity', 'update payment', 'refund', 'tax', 'irs',
        'amazon', 'paypal', 'bank', 'visa', 'mastercard', 'bitcoin',
        'investment opportunity', 'guaranteed return', 'risk free'
      ],
      urgency: [
        'immediate', 'expire', 'deadline', 'last chance', 'final notice',
        'within 24 hours', 'today only', 'act fast'
      ],
      requests: [
        'send money', 'wire transfer', 'gift card', 'personal information',
        'social security', 'password', 'pin', 'account number',
        'credit card', 'cvv', 'routing number'
      ],
      suspicious: [
        'no reply', 'do not ignore', 'this is not a scam',
        'legitimate', 'official', 'authorized'
      ]
    };
  }

  analyzeForScammerPatterns(messageData) {
    let score = 0;
    const content = messageData.content.toLowerCase();

    // Check for scammer keywords
    this.scammerPatterns.keywords.forEach(keyword => {
      if (content.includes(keyword)) score += 0.1;
    });

    // Check for urgency patterns
    this.scammerPatterns.urgency.forEach(pattern => {
      if (content.includes(pattern)) score += 0.15;
    });

    // Check for information requests
    this.scammerPatterns.requests.forEach(request => {
      if (content.includes(request)) score += 0.2;
    });

    // Check for suspicious phrases
    this.scammerPatterns.suspicious.forEach(phrase => {
      if (content.includes(phrase)) score += 0.15;
    });

    // Check for links (especially shortened URLs)
    if (messageData.links && messageData.links.length > 0) {
      messageData.links.forEach(link => {
        if (link.includes('bit.ly') || link.includes('tinyurl') || link.includes('short.link')) {
          score += 0.25;
        } else {
          score += 0.1;
        }
      });
    }

    // Check for phone numbers or emails early in conversation
    const conversationLength = this.getConversationLength(this.getCurrentChatId());
    if (conversationLength < 5) {
      if (messageData.metadata.phoneNumbers) score += 0.2;
      if (messageData.metadata.emails) score += 0.2;
    }

    // Cap the score at 1.0
    return Math.min(score, 1.0);
  }

  updateConversationState(chatId, messageData) {
    if (!this.conversationState.has(chatId)) {
      this.conversationState.set(chatId, {
        messages: [],
        startTime: new Date(),
        messageCount: 0,
        mediaCount: 0,
        linkCount: 0,
        scammerScore: 0
      });
    }

    const state = this.conversationState.get(chatId);
    state.messages.push({
      timestamp: new Date(),
      type: messageData.type,
      content: messageData.content.substring(0, 100) // Store truncated for memory
    });
    state.messageCount++;

    if (messageData.media) state.mediaCount++;
    if (messageData.links && messageData.links.length > 0) {
      state.linkCount += messageData.links.length;
    }

    // Keep only last 20 messages in memory
    if (state.messages.length > 20) {
      state.messages = state.messages.slice(-20);
    }

    this.conversationState.set(chatId, state);
  }

  getConversationContext(chatId) {
    const state = this.conversationState.get(chatId);
    if (!state) return null;

    return {
      messageCount: state.messageCount,
      duration: new Date() - state.startTime,
      mediaCount: state.mediaCount,
      linkCount: state.linkCount,
      recentMessages: state.messages.slice(-5)
    };
  }

  getConversationLength(chatId) {
    const state = this.conversationState.get(chatId);
    return state ? state.messageCount : 0;
  }

  simulateHumanResponse(text, delay = null) {
    // Calculate realistic delay if not provided
    if (!delay) {
      const wordCount = text.split(' ').length;
      const baseDelay = 2000; // 2 seconds base
      const perWordDelay = 200; // 200ms per word
      const randomVariation = Math.random() * 2000; // 0-2 seconds random
      delay = baseDelay + (wordCount * perWordDelay) + randomVariation;

      // Cap at 15 seconds
      delay = Math.min(delay, 15000);
    }

    // Show typing indicator
    this.simulateTyping();

    // Send message after delay
    setTimeout(() => {
      this.stopTyping();
      this.sendMessage(text);
    }, delay);
  }

  simulateTyping() {
    const inputElement = document.querySelector('[data-testid="conversation-compose-box-input"]');
    if (!inputElement) return;

    // Focus the input
    inputElement.focus();

    // Add some placeholder text to trigger typing indicator
    inputElement.textContent = '...';

    // Trigger input event
    const inputEvent = new InputEvent('input', {
      bubbles: true,
      cancelable: true,
    });
    inputElement.dispatchEvent(inputEvent);
  }

  stopTyping() {
    const inputElement = document.querySelector('[data-testid="conversation-compose-box-input"]');
    if (inputElement) {
      inputElement.textContent = '';
    }
  }

  sendMessage(text) {
    const inputElement = document.querySelector('[data-testid="conversation-compose-box-input"]');

    if (!inputElement) {
      console.error('[LooseCannon] Could not find message input');
      return;
    }

    // Set the message text
    inputElement.textContent = text;

    // Trigger input event
    const inputEvent = new InputEvent('input', {
      bubbles: true,
      cancelable: true,
    });
    inputElement.dispatchEvent(inputEvent);

    // Find and click send button
    setTimeout(() => {
      const sendButton = document.querySelector('[data-testid="compose-btn-send"]');
      if (sendButton) {
        sendButton.click();
        console.log('[LooseCannon] Message sent:', text);

        // Mark message as automated for tracking
        this.markLastMessageAsAutomated();
      }
    }, 100);
  }

  markLastMessageAsAutomated() {
    setTimeout(() => {
      const messages = document.querySelectorAll('[data-testid^="msg-"]');
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.classList.contains('message-out')) {
        lastMessage.classList.add('loosecannon-automated-message');
      }
    }, 500);
  }

  addScammerWarning(node) {
    const warning = document.createElement('div');
    warning.className = 'loosecannon-scammer-warning';
    warning.innerHTML = `
      <span style="color: red; font-weight: bold;">⚠️ Potential Scammer Detected</span>
    `;
    warning.style.cssText = `
      background: #ffebee;
      padding: 5px 10px;
      border-radius: 5px;
      margin: 5px 0;
      font-size: 12px;
    `;

    node.appendChild(warning);
  }

  getCurrentChatId() {
    const headerElement = document.querySelector('header [data-testid="conversation-header"]');
    if (headerElement) {
      const titleElement = headerElement.querySelector('span[title]');
      return titleElement ? titleElement.title : 'unknown';
    }
    return 'unknown';
  }

  setupConversationTracking() {
    // Track when user switches chats
    const observer = new MutationObserver(() => {
      const newChatId = this.getCurrentChatId();
      if (newChatId !== this.currentChat) {
        this.currentChat = newChatId;
        console.log('[LooseCannon] Switched to chat:', newChatId);

        // Check if we should auto-activate based on scammer score
        const state = this.conversationState.get(newChatId);
        if (state && state.scammerScore > 0.8) {
          this.showScammerAlert();
        }
      }
    });

    const headerContainer = document.querySelector('[data-testid="conversation-header"]');
    if (headerContainer) {
      observer.observe(headerContainer, {
        childList: true,
        subtree: true
      });
    }
  }

  showScammerAlert() {
    const alert = document.createElement('div');
    alert.className = 'loosecannon-scammer-alert';
    alert.innerHTML = `
      <div style="padding: 15px; background: #ff4444; color: white; text-align: center;">
        <strong>⚠️ High Scammer Probability Detected!</strong><br>
        <small>Consider activating LooseCannon for this conversation</small>
      </div>
    `;
    alert.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      z-index: 10000;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(alert);

    setTimeout(() => {
      alert.remove();
    }, 5000);
  }

  // ... (include all the UI injection and control methods from the original file)
  injectControls() {
    const style = document.createElement('style');
    style.textContent = `
      .loosecannon-toggle {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        background: #ff4444;
        color: white;
        border: none;
        border-radius: 50px;
        padding: 12px 20px;
        cursor: pointer;
        font-weight: bold;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        transition: all 0.3s;
      }

      .loosecannon-toggle.active {
        background: #44ff44;
      }

      .loosecannon-toggle:hover {
        transform: scale(1.05);
      }

      .loosecannon-indicator {
        position: fixed;
        top: 70px;
        right: 20px;
        background: rgba(255, 68, 68, 0.9);
        color: white;
        padding: 8px 15px;
        border-radius: 20px;
        font-size: 12px;
        z-index: 9999;
        display: none;
      }

      .loosecannon-indicator.active {
        display: block;
        background: rgba(68, 255, 68, 0.9);
      }

      @keyframes slideIn {
        from { transform: translateX(100%); }
        to { transform: translateX(0); }
      }
    `;
    document.head.appendChild(style);

    const toggleButton = document.createElement('button');
    toggleButton.className = 'loosecannon-toggle';
    toggleButton.textContent = 'LC: OFF';
    toggleButton.onclick = () => this.toggleActive();
    document.body.appendChild(toggleButton);

    const indicator = document.createElement('div');
    indicator.className = 'loosecannon-indicator';
    indicator.textContent = 'LooseCannon Active';
    document.body.appendChild(indicator);
  }

  toggleActive() {
    this.isActive = !this.isActive;
    this.updateUI();

    const chatId = this.getCurrentChatId();
    console.log(`[LooseCannon] ${this.isActive ? 'Activated' : 'Deactivated'} for chat: ${chatId}`);

    // Notify background script
    browser.runtime.sendMessage({
      type: 'TOGGLE_ACTIVE',
      data: {
        isActive: this.isActive,
        chatId: chatId
      }
    });
  }

  updateUI() {
    const button = document.querySelector('.loosecannon-toggle');
    const indicator = document.querySelector('.loosecannon-indicator');

    if (this.isActive) {
      button?.classList.add('active');
      if (button) button.textContent = 'LC: ON';
      indicator?.classList.add('active');
      document.body.setAttribute('data-loosecannon-active', 'true');
    } else {
      button?.classList.remove('active');
      if (button) button.textContent = 'LC: OFF';
      indicator?.classList.remove('active');
      document.body.removeAttribute('data-loosecannon-active');
    }
  }

  listenForCommands() {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'GET_STATUS':
          sendResponse({
            isActive: this.isActive,
            currentChat: this.currentChat,
            conversationStats: this.getConversationStats()
          });
          break;
        case 'SET_ACTIVE':
          this.isActive = message.data.isActive;
          this.updateUI();
          break;
        case 'SEND_MESSAGE':
          this.simulateHumanResponse(message.data.text, message.data.delay);
          break;
        case 'GET_CONVERSATION_STATE':
          sendResponse({
            state: Object.fromEntries(this.conversationState)
          });
          break;
      }
    });
  }

  getConversationStats() {
    const stats = {};
    this.conversationState.forEach((state, chatId) => {
      stats[chatId] = {
        messageCount: state.messageCount,
        mediaCount: state.mediaCount,
        linkCount: state.linkCount,
        duration: new Date() - state.startTime
      };
    });
    return stats;
  }
}

// Initialize enhanced integration
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new EnhancedWhatsAppIntegration());
} else {
  new EnhancedWhatsAppIntegration();
}