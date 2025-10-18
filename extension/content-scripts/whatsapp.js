// WhatsApp Web Content Script for LooseCannon
console.log('[LooseCannon] WhatsApp content script loaded');

class WhatsAppIntegration {
  constructor() {
    this.isActive = false;
    this.currentChat = null;
    this.messageObserver = null;
    this.init();
  }

  init() {
    // Wait for WhatsApp to fully load
    this.waitForWhatsApp().then(() => {
      console.log('[LooseCannon] WhatsApp detected and ready');
      this.setupMessageObserver();
      this.injectControls();
      this.listenForCommands();
    });
  }

  waitForWhatsApp() {
    return new Promise((resolve) => {
      const checkForApp = setInterval(() => {
        // Look for WhatsApp's main app wrapper
        const mainWrapper = document.querySelector('[data-testid="conversation-panel-wrapper"]');
        if (mainWrapper) {
          clearInterval(checkForApp);
          resolve();
        }
      }, 1000);
    });
  }

  setupMessageObserver() {
    // Observe the message list for new messages
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
        // Check if new message nodes were added
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
    console.log('[LooseCannon] Message observer setup complete');
  }

  isIncomingMessage(node) {
    // Check if this is an incoming message element
    // WhatsApp uses specific classes for incoming vs outgoing messages
    if (!node.querySelector) return false;

    const messageElement = node.querySelector('[data-testid^="msg-"]');
    if (!messageElement) return false;

    // Incoming messages don't have the "message-out" class
    return !messageElement.classList.contains('message-out');
  }

  handleIncomingMessage(node) {
    const messageText = this.extractMessageText(node);
    const timestamp = new Date().toISOString();

    console.log('[LooseCannon] New message detected:', messageText);

    // Send to background script for processing
    browser.runtime.sendMessage({
      type: 'NEW_MESSAGE',
      data: {
        text: messageText,
        timestamp: timestamp,
        chatId: this.getCurrentChatId()
      }
    }).then(response => {
      if (response && response.reply) {
        this.sendMessage(response.reply);
      }
    });
  }

  extractMessageText(node) {
    // Extract text from WhatsApp message element
    const textElement = node.querySelector('[data-testid="msg-container"] .selectable-text');
    return textElement ? textElement.textContent : '';
  }

  getCurrentChatId() {
    // Get unique identifier for current chat
    const headerElement = document.querySelector('header [data-testid="conversation-header"]');
    if (headerElement) {
      const titleElement = headerElement.querySelector('span[title]');
      return titleElement ? titleElement.title : 'unknown';
    }
    return 'unknown';
  }

  sendMessage(text) {
    // Find the message input field
    const inputElement = document.querySelector('[data-testid="conversation-compose-box-input"]');

    if (!inputElement) {
      console.error('[LooseCannon] Could not find message input');
      return;
    }

    // Focus the input
    inputElement.focus();

    // Set the message text
    inputElement.textContent = text;

    // Trigger input event to update WhatsApp's state
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
      }
    }, 100);
  }

  injectControls() {
    // Add toggle button to WhatsApp interface
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
    const button = document.querySelector('.loosecannon-toggle');
    const indicator = document.querySelector('.loosecannon-indicator');

    if (this.isActive) {
      button.classList.add('active');
      button.textContent = 'LC: ON';
      indicator.classList.add('active');
      console.log('[LooseCannon] Activated for current chat');
    } else {
      button.classList.remove('active');
      button.textContent = 'LC: OFF';
      indicator.classList.remove('active');
      console.log('[LooseCannon] Deactivated');
    }

    // Notify background script
    browser.runtime.sendMessage({
      type: 'TOGGLE_ACTIVE',
      data: { isActive: this.isActive }
    });
  }

  listenForCommands() {
    // Listen for commands from popup or background script
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'GET_STATUS':
          sendResponse({ isActive: this.isActive });
          break;
        case 'SET_ACTIVE':
          this.isActive = message.data.isActive;
          this.updateUI();
          break;
        case 'SEND_MESSAGE':
          this.sendMessage(message.data.text);
          break;
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
    } else {
      button?.classList.remove('active');
      if (button) button.textContent = 'LC: OFF';
      indicator?.classList.remove('active');
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new WhatsAppIntegration());
} else {
  new WhatsAppIntegration();
}