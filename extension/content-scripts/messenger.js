// Facebook Messenger Content Script for LooseCannon
console.log('[LooseCannon] Messenger content script loaded');

class MessengerIntegration {
  constructor() {
    this.isActive = false;
    this.currentChat = null;
    this.messageObserver = null;
    this.platform = 'messenger';
    this.init();
  }

  init() {
    this.waitForMessenger().then(() => {
      console.log('[LooseCannon] Messenger detected and ready');
      this.setupMessageObserver();
      this.injectControls();
      this.listenForCommands();
    });
  }

  waitForMessenger() {
    return new Promise((resolve) => {
      const checkForApp = setInterval(() => {
        // Check for Messenger's main chat area
        const chatArea = document.querySelector('[role="main"]');
        const inputField = document.querySelector('[role="textbox"][aria-label*="Message"], [contenteditable="true"][data-lexical-editor]');

        if (chatArea && inputField) {
          clearInterval(checkForApp);
          console.log('[LooseCannon] Messenger interface detected');
          resolve();
        }
      }, 1000);
    });
  }

  setupMessageObserver() {
    // Find the messages container
    const messageContainer = document.querySelector('[role="main"], [aria-label*="Messages"]');

    if (!messageContainer) {
      console.error('[LooseCannon] Could not find Messenger message container');
      setTimeout(() => this.setupMessageObserver(), 2000);
      return;
    }

    const config = {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    };

    this.messageObserver = new MutationObserver((mutations) => {
      if (!this.isActive) return;

      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (this.isIncomingMessage(node)) {
              // Small delay to let DOM settle
              setTimeout(() => {
                this.handleIncomingMessage(node);
              }, 100);
            }
          });
        }
      });
    });

    this.messageObserver.observe(messageContainer, config);
    console.log('[LooseCannon] Messenger message observer setup complete');
  }

  isIncomingMessage(node) {
    if (!node || !node.querySelector) return false;

    // Look for message containers
    const messageSelectors = [
      '[role="row"]',
      '[data-scope="messages_table"]',
      'div[class*="__fb-light-mode"]'
    ];

    let messageElement = null;
    for (const selector of messageSelectors) {
      messageElement = node.querySelector(selector);
      if (messageElement) break;
    }

    if (!messageElement && node.matches) {
      for (const selector of messageSelectors) {
        if (node.matches(selector)) {
          messageElement = node;
          break;
        }
      }
    }

    if (!messageElement) return false;

    // Check if it's an incoming message by looking for specific patterns
    // Messenger uses different styling for sent vs received messages
    const messageText = messageElement.textContent || '';

    // Skip if it's empty or a status message
    if (!messageText || messageText.length < 2) return false;

    // Check if message is on the left side (incoming)
    const computedStyle = window.getComputedStyle(messageElement);
    const isLeftAligned = computedStyle.textAlign === 'left' ||
                         computedStyle.justifyContent === 'flex-start';

    // Additional check: sent messages usually have different background
    const backgroundColor = computedStyle.backgroundColor;
    const isSentMessage = backgroundColor && (
      backgroundColor.includes('rgb(0, 132, 255)') || // Blue for sent
      backgroundColor.includes('rgb(24, 119, 242)')    // Facebook blue
    );

    return isLeftAligned && !isSentMessage;
  }

  handleIncomingMessage(node) {
    const messageData = this.extractMessageData(node);

    if (!messageData.content && !messageData.media) {
      return; // Empty message, skip
    }

    const timestamp = new Date().toISOString();
    const chatId = this.getCurrentChatId();

    console.log('[LooseCannon] Messenger message detected:', messageData);

    // Send to background script
    browser.runtime.sendMessage({
      type: 'NEW_MESSAGE',
      data: {
        ...messageData,
        timestamp,
        chatId,
        platform: this.platform
      }
    }).then(response => {
      if (response && response.reply) {
        this.simulateTypingAndSend(response.reply, response.delay);
      }
    }).catch(error => {
      console.error('[LooseCannon] Error sending message to background:', error);
    });
  }

  extractMessageData(node) {
    const data = {
      type: 'text',
      content: '',
      media: null,
      metadata: {}
    };

    // Extract text content
    const textSelectors = [
      '[dir="auto"]',
      'span[class*="text"]',
      'div[class*="text"]'
    ];

    for (const selector of textSelectors) {
      const textElement = node.querySelector(selector);
      if (textElement && textElement.textContent) {
        data.content = textElement.textContent.trim();
        break;
      }
    }

    // Fallback to full text content
    if (!data.content) {
      data.content = node.textContent || node.innerText || '';
      data.content = data.content.trim();
    }

    // Check for images
    const imageElement = node.querySelector('img[src*="scontent"], img[src*="fbcdn"]');
    if (imageElement) {
      data.type = 'image';
      data.media = { type: 'image', src: imageElement.src };
      data.metadata.hasImage = true;
    }

    // Check for links
    const linkElements = node.querySelectorAll('a[href]');
    if (linkElements.length > 0) {
      data.metadata.links = Array.from(linkElements).map(a => a.href);
    }

    // Check for stickers or GIFs
    if (node.querySelector('[aria-label*="sticker"], [aria-label*="GIF"]')) {
      data.type = 'sticker';
      data.media = { type: 'sticker' };
    }

    // Check for voice messages
    if (node.querySelector('[aria-label*="Audio"], [aria-label*="Voice"]')) {
      data.type = 'audio';
      data.media = { type: 'audio' };
      data.metadata.hasAudio = true;
    }

    // Extract phone numbers and emails from content
    if (data.content) {
      const phoneRegex = /[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,5}[-\s\.]?[0-9]{1,5}/g;
      const phones = data.content.match(phoneRegex);
      if (phones) {
        data.metadata.phoneNumbers = phones;
      }

      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = data.content.match(emailRegex);
      if (emails) {
        data.metadata.emails = emails;
      }
    }

    return data;
  }

  getCurrentChatId() {
    // Try to get chat name from header
    const headerSelectors = [
      '[role="banner"] h1',
      'header span[dir="auto"]',
      '[aria-label*="Conversation with"]'
    ];

    for (const selector of headerSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent || element.getAttribute('aria-label') || '';
        if (text) {
          return text.replace('Conversation with ', '').trim();
        }
      }
    }

    return 'unknown';
  }

  simulateTypingAndSend(text, delay = 3000) {
    // Show typing indicator
    this.startTyping();

    // Calculate realistic delay
    const wordCount = text.split(' ').length;
    const typingDelay = Math.min(delay || (wordCount * 200 + 2000), 10000);

    setTimeout(() => {
      this.stopTyping();
      this.sendMessage(text);
    }, typingDelay);
  }

  startTyping() {
    const inputField = this.getInputField();
    if (!inputField) return;

    // Focus the input
    inputField.focus();

    // Add placeholder text to trigger typing indicator
    this.setInputText(inputField, '...');

    // Trigger input event
    const event = new Event('input', { bubbles: true });
    inputField.dispatchEvent(event);
  }

  stopTyping() {
    const inputField = this.getInputField();
    if (!inputField) return;

    // Clear the placeholder
    this.setInputText(inputField, '');
  }

  sendMessage(text) {
    const inputField = this.getInputField();

    if (!inputField) {
      console.error('[LooseCannon] Could not find Messenger input field');
      return;
    }

    // Set the message text
    this.setInputText(inputField, text);

    // Trigger input event
    const inputEvent = new Event('input', { bubbles: true });
    inputField.dispatchEvent(inputEvent);

    // Small delay then send
    setTimeout(() => {
      // Try to find and click send button
      const sendButtonSelectors = [
        '[aria-label="Send"]',
        '[aria-label="Press Enter to send"]',
        'div[role="button"][aria-label*="Send"]'
      ];

      let sendButton = null;
      for (const selector of sendButtonSelectors) {
        sendButton = document.querySelector(selector);
        if (sendButton) break;
      }

      if (sendButton) {
        sendButton.click();
        console.log('[LooseCannon] Messenger message sent via button');
      } else {
        // Fallback: simulate Enter key
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        });
        inputField.dispatchEvent(enterEvent);
        console.log('[LooseCannon] Messenger message sent via Enter key');
      }
    }, 100);
  }

  getInputField() {
    const selectors = [
      '[role="textbox"][aria-label*="Message"]',
      '[contenteditable="true"][data-lexical-editor]',
      '[role="textbox"][contenteditable="true"]',
      'div[contenteditable="true"][role="textbox"]'
    ];

    for (const selector of selectors) {
      const field = document.querySelector(selector);
      if (field) return field;
    }

    return null;
  }

  setInputText(inputField, text) {
    if (inputField.getAttribute('contenteditable') === 'true') {
      // For contenteditable elements (Messenger uses these)
      inputField.textContent = text;

      // Also try setting innerHTML for Lexical editor
      if (text) {
        inputField.innerHTML = `<p>${text}</p>`;
      } else {
        inputField.innerHTML = '';
      }

      // Move cursor to end
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(inputField);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      // For regular input/textarea
      inputField.value = text;
    }

    // Trigger various events that Messenger might listen to
    ['input', 'change', 'keyup'].forEach(eventType => {
      const event = new Event(eventType, { bubbles: true });
      inputField.dispatchEvent(event);
    });
  }

  injectControls() {
    const style = document.createElement('style');
    style.textContent = `
      .loosecannon-toggle-messenger {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        background: linear-gradient(135deg, #0084ff, #44bfff);
        color: white;
        border: none;
        border-radius: 50px;
        padding: 12px 20px;
        cursor: pointer;
        font-weight: bold;
        box-shadow: 0 2px 10px rgba(0,132,255,0.4);
        transition: all 0.3s;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }

      .loosecannon-toggle-messenger.active {
        background: linear-gradient(135deg, #44ff44, #66ff66);
      }

      .loosecannon-toggle-messenger:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 15px rgba(0,132,255,0.6);
      }

      .loosecannon-indicator-messenger {
        position: fixed;
        top: 70px;
        right: 20px;
        background: rgba(0, 132, 255, 0.9);
        color: white;
        padding: 8px 15px;
        border-radius: 20px;
        font-size: 12px;
        z-index: 9999;
        display: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }

      .loosecannon-indicator-messenger.active {
        display: block;
        background: rgba(68, 255, 68, 0.9);
      }
    `;
    document.head.appendChild(style);

    const toggleButton = document.createElement('button');
    toggleButton.className = 'loosecannon-toggle-messenger';
    toggleButton.textContent = 'LC: OFF';
    toggleButton.onclick = () => this.toggleActive();
    document.body.appendChild(toggleButton);

    const indicator = document.createElement('div');
    indicator.className = 'loosecannon-indicator-messenger';
    indicator.innerHTML = '🤖 LooseCannon Active<br><small>Messenger</small>';
    document.body.appendChild(indicator);
  }

  toggleActive() {
    this.isActive = !this.isActive;
    this.updateUI();

    const chatId = this.getCurrentChatId();
    console.log(`[LooseCannon] Messenger ${this.isActive ? 'activated' : 'deactivated'} for: ${chatId}`);

    // Notify background script
    browser.runtime.sendMessage({
      type: 'TOGGLE_ACTIVE',
      data: {
        isActive: this.isActive,
        chatId: chatId,
        platform: this.platform
      }
    });
  }

  updateUI() {
    const button = document.querySelector('.loosecannon-toggle-messenger');
    const indicator = document.querySelector('.loosecannon-indicator-messenger');

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

  listenForCommands() {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'GET_STATUS':
          sendResponse({
            isActive: this.isActive,
            platform: this.platform,
            currentChat: this.currentChat
          });
          break;

        case 'SET_ACTIVE':
          this.isActive = message.data.isActive;
          this.updateUI();
          break;

        case 'SEND_MESSAGE':
          this.simulateTypingAndSend(message.data.text, message.data.delay);
          break;

        case 'SCAMMER_DETECTED':
          this.showScammerAlert(message.data.score);
          break;
      }
    });
  }

  showScammerAlert(score) {
    const alert = document.createElement('div');
    alert.innerHTML = `
      <div style="
        position: fixed;
        top: 100px;
        right: 20px;
        background: linear-gradient(135deg, #ff4444, #ff6666);
        color: white;
        padding: 15px 20px;
        border-radius: 12px;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(255,68,68,0.4);
        animation: slideIn 0.3s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <strong>⚠️ Potential Scammer Detected!</strong><br>
        <small>Confidence: ${(score * 100).toFixed(0)}%</small><br>
        <small>LooseCannon ready to engage</small>
      </div>
    `;

    document.body.appendChild(alert);

    setTimeout(() => {
      alert.remove();
    }, 5000);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new MessengerIntegration());
} else {
  new MessengerIntegration();
}