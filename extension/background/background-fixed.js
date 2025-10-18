// Background script for LooseCannon - Fixed Connection Issues
console.log('[LooseCannon Background] Initialized');

class LooseCannonBackground {
  constructor() {
    this.serverUrl = 'http://localhost:8765';  // Local server URL
    this.isConnected = false;
    this.activeTabs = new Map();
    this.personalities = [];
    this.currentPersonality = 'default';
    this.init();
  }

  init() {
    this.setupMessageListeners();
    this.checkServerConnection();
    this.loadSettings();
  }

  setupMessageListeners() {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[LooseCannon Background] Received message:', message.type);

      switch (message.type) {
        case 'NEW_MESSAGE':
          this.handleNewMessage(message.data, sender.tab.id)
            .then(sendResponse)
            .catch(error => {
              console.error('Error handling message:', error);
              sendResponse({ error: error.message });
            });
          return true; // Keep channel open for async response

        case 'TOGGLE_ACTIVE':
          this.handleToggleActive(sender.tab.id, message.data.isActive);
          sendResponse({ success: true });
          break;

        case 'GET_SERVER_STATUS':
          // Check connection immediately when asked
          this.checkServerConnection().then(() => {
            sendResponse({ connected: this.isConnected });
          });
          return true; // Keep channel open for async response

        case 'GET_PERSONALITIES':
          sendResponse({ personalities: this.personalities });
          break;

        case 'SET_PERSONALITY':
          this.currentPersonality = message.data.personality;
          this.saveSettings();
          sendResponse({ success: true });
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }
    });
  }

  async handleNewMessage(data, tabId) {
    if (!this.isConnected) {
      console.warn('[LooseCannon] Server not connected, cannot process message');
      return { error: 'Server not connected' };
    }

    try {
      // Send message to local server for LLM processing
      const response = await fetch(`${this.serverUrl}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: data.text,
          personality: this.currentPersonality,
          chatId: data.chatId,
          timestamp: data.timestamp
        })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      console.log('[LooseCannon] Generated response:', result.reply);

      // Log conversation for debugging
      this.logConversation(data.chatId, data.text, result.reply);

      return { reply: result.reply };
    } catch (error) {
      console.error('[LooseCannon] Error generating response:', error);
      return { error: error.message };
    }
  }

  handleToggleActive(tabId, isActive) {
    if (isActive) {
      this.activeTabs.set(tabId, {
        activated: new Date().toISOString(),
        messageCount: 0
      });
      console.log(`[LooseCannon] Activated for tab ${tabId}`);
    } else {
      this.activeTabs.delete(tabId);
      console.log(`[LooseCannon] Deactivated for tab ${tabId}`);
    }
  }

  async checkServerConnection() {
    try {
      console.log('[LooseCannon] Checking server connection...');
      const response = await fetch(`${this.serverUrl}/status`);

      if (response.ok) {
        const data = await response.json();
        this.isConnected = true;
        this.personalities = data.personalities || [];
        console.log('[LooseCannon] Server connected successfully');
        console.log('[LooseCannon] Available personalities:', this.personalities);
        return true;
      } else {
        this.isConnected = false;
        console.warn('[LooseCannon] Server responded with error:', response.status);
        return false;
      }
    } catch (error) {
      this.isConnected = false;
      console.error('[LooseCannon] Could not connect to server:', error.message);

      // Retry in 5 seconds
      setTimeout(() => this.checkServerConnection(), 5000);
      return false;
    }
  }

  async loadSettings() {
    try {
      const settings = await browser.storage.local.get(['personality', 'serverUrl']);
      if (settings.personality) {
        this.currentPersonality = settings.personality;
      }
      if (settings.serverUrl) {
        this.serverUrl = settings.serverUrl;
      }
      console.log('[LooseCannon] Settings loaded:', settings);
    } catch (error) {
      console.error('[LooseCannon] Error loading settings:', error);
    }
  }

  async saveSettings() {
    try {
      await browser.storage.local.set({
        personality: this.currentPersonality,
        serverUrl: this.serverUrl
      });
      console.log('[LooseCannon] Settings saved');
    } catch (error) {
      console.error('[LooseCannon] Error saving settings:', error);
    }
  }

  logConversation(chatId, userMessage, botReply) {
    const log = {
      timestamp: new Date().toISOString(),
      chatId,
      userMessage,
      botReply
    };

    // Store conversation logs (with limit to prevent storage overflow)
    browser.storage.local.get('conversationLogs').then(result => {
      let logs = result.conversationLogs || [];
      logs.push(log);

      // Keep only last 100 messages
      if (logs.length > 100) {
        logs = logs.slice(-100);
      }

      browser.storage.local.set({ conversationLogs: logs });
    });
  }
}

// Initialize background script
const looseCannonBg = new LooseCannonBackground();