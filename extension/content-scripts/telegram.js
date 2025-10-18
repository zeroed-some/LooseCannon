// Telegram Web Content Script for LooseCannon
console.log('[LooseCannon] Telegram content script loaded');

class TelegramIntegration {
  constructor() {
    this.isActive = false;
    this.currentChat = null;
    this.messageObserver = null;
    this.platform = 'telegram';
    this.init();
  }

  init() {
    this.waitForTelegram().then(() => {
      console.log('[LooseCannon] Telegram Web detected and ready');
      this.setupMessageObserver();
      this.injectControls();
      this.listenForCommands();
    });
  }

  waitForTelegram() {
    return new Promise((resolve) => {
      const checkForApp = setInterval(() => {
        // Check for Telegram's main chat area
        const chatArea = document.querySelector('.im_history_wrap, .messages-container, [class*="Message"]');
        const inputField = document.querySelector('.composer_rich_textarea, [class*="ComposerInput"]');

        if (chatArea && inputField) {
          clearInterval(checkForApp);
          console.log('[LooseCannon] Telegram interface detected');
          resolve();
        }
      }, 1000);
    });
  }

  setupMessageObserver() {
    // Find the messages container
    const messageContainer = document.querySelector('.im_history_wrap, .messages-container, [class*="MessagesScroller"]');

    if (!messageContainer) {
      console.error('[LooseCannon] Could not find Telegram message container');
      setTimeout(() => this.setupMessageObserver(), 2000);
      return;
    }

    const config = {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class']
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
    console.log('[LooseCannon] Telegram message observer setup complete');
  }

  isIncomingMessage(node) {
    if (!node || !node.classList) return false;

    // Check for Telegram message classes
    const messageClasses = ['im_message', 'message', 'Message'];
    const hasMessageClass = messageClasses.some(cls =>
      node.classList.contains(cls) ||
      Array.from(node.classList).some(c => c.includes('Message'))
    );

    if (!hasMessageClass) return false;

    // Check if it's an incoming message (not sent by us)
    const isOutgoing = node.classList.contains('im_message_out') ||
                      node.classList.contains('own') ||
                      Array.from(node.classList).some(c => c.includes('own') || c.includes('Out'));

    return !isOutgoing;
  }

  handleIncomingMessage(node) {
    const messageData = this.extractMessageData(node);

    if (!messageData.content && !messageData.media) {
      return; // Empty message, skip
    }

    const timestamp = new Date().toISOString();
    const chatId = this.getCurrentChatId();

    console.log('[LooseCannon] Telegram message detected:', messageData);

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
    const textElement = node.querySelector('.im_message_text, [class*="text-content"], [class*="MessageText"]');
    if (textElement) {
      data.content = textElement.textContent || textElement.innerText || '';

      // Extract links
      const links = textElement.querySelectorAll('a');
      if (links.length > 0) {
        data.metadata.links = Array.from(links).map(a => a.href);
      }
    }

    // Check for media
    const photoElement = node.querySelector('.im_message_photo_thumb, [class*="Photo"], img[class*="media"]');
    if (photoElement) {
      data.type = 'image';
      data.media = { type: 'image' };
      data.metadata.hasImage = true;
    }

    // Check for audio/voice
    const audioElement = node.querySelector('.im_message_audio, .audio, [class*="Audio"], [class*="Voice"]');
    if (audioElement) {
      data.type = 'audio';
      data.media = { type: 'audio' };
      data.metadata.hasAudio = true;
    }

    // Check for documents
    const docElement = node.querySelector('.im_message_document, [class*="Document"]');
    if (docElement) {
      data.type = 'document';
      data.media = { type: 'document' };
      data.metadata.hasDocument = true;
    }

    // Check for stickers
    const stickerElement = node.querySelector('.im_message_sticker, [class*="Sticker"]');
    if (stickerElement) {
      data.type = 'sticker';
      data.media = { type: 'sticker' };
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
    // Try to get chat title from header
    const headerTitle = document.querySelector('.tg_head_peer_title, .chat-title, [class*="ChatTitle"], [class*="HeaderTitle"]');
    if (headerTitle) {
      return headerTitle.textContent || 'unknown';
    }

    // Try to get from active dialog
    const activeDialog = document.querySelector('.im_dialog_wrap.active, .dialog.active, [class*="ChatItem"][class*="active"]');
    if (activeDialog) {
      const title = activeDialog.querySelector('.im_dialog_peer span, [class*="ChatTitle"]');
      if (title) {
        return title.textContent || 'unknown';
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

    // Add placeholder to trigger typing indicator
    if (inputField.contentEditable === 'true') {
      inputField.textContent = '...';
    } else {
      inputField.value = '...';
    }

    // Trigger input event
    const event = new Event('input', { bubbles: true });
    inputField.dispatchEvent(event);
  }

  stopTyping() {
    const inputField = this.getInputField();
    if (!inputField) return;

    // Clear the placeholder
    if (inputField.contentEditable === 'true') {
      inputField.textContent = '';
    } else {
      inputField.value = '';
    }
  }

  sendMessage(text) {
    const inputField = this.getInputField();

    if (!inputField) {
      console.error('[LooseCannon] Could not find Telegram input field');
      return;
    }

    // Set the message text
    if (inputField.contentEditable === 'true') {
      // For contenteditable divs
      inputField.textContent = text;
      inputField.innerHTML = text;

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

    // Trigger input event to update Telegram's state
    const inputEvent = new Event('input', { bubbles: true });
    inputField.dispatchEvent(inputEvent);

    // Try multiple methods to send
    setTimeout(() => {
      // Method 1: Click send button
      const sendButton = document.querySelector('.im_submit, .compose-button-send, [class*="SendButton"], [class*="ComposeButton"][class*="send"]');
      if (sendButton) {
        sendButton.click();
        console.log('[LooseCannon] Telegram message sent via button');
        return;
      }

      // Method 2: Simulate Enter key
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true
      });
      inputField.dispatchEvent(enterEvent);
      console.log('[LooseCannon] Telegram message sent via Enter key');
    }, 100);
  }

  getInputField() {
    // Try multiple selectors for Telegram's input field
    const selectors = [
      '.composer_rich_textarea',
      '[contenteditable="true"][class*="input"]',
      '[class*="ComposerInput"]',
      '.im_message_field',
      '[class*="MessageInput"]'
    ];

    for (const selector of selectors) {
      const field = document.querySelector(selector);
      if (field) return field;
    }

    return null;
  }

  injectControls() {
    const style = document.createElement('style');
    style.textContent = `
      .loosecannon-toggle-telegram {
        position: fixed;
        bottom: 20px;
        left: 20px;
        z-index: 9999;
        background: #0088cc;
        color: white;
        border: none;
        border-radius: 50px;
        padding: 12px 20px;
        cursor: pointer;
        font-weight: bold;
        box-shadow: 0 2px 10px rgba(0,136,204,0.3);
        transition: all 0.3s;
      }

      .loosecannon-toggle-telegram.active {
        background: #44ff44;
      }

      .loosecannon-toggle-telegram:hover {
        transform: scale(1.05);
      }

      .loosecannon-indicator-telegram {
        position: fixed;
        top: 20px;
        left: 20px;
        background: rgba(0, 136, 204, 0.9);
        color: white;
        padding: 8px 15px;
        border-radius: 20px;
        font-size: 12px;
        z-index: 9999;
        display: none;
      }

      .loosecannon-indicator-telegram.active {
        display: block;
        background: rgba(68, 255, 68, 0.9);
      }
    `;
    document.head.appendChild(style);

    const toggleButton = document.createElement('button');
    toggleButton.className = 'loosecannon-toggle-telegram';
    toggleButton.textContent = 'LC: OFF';
    toggleButton.onclick = () => this.toggleActive();
    document.body.appendChild(toggleButton);

    const indicator = document.createElement('div');
    indicator.className = 'loosecannon-indicator-telegram';
    indicator.innerHTML = '🤖 LooseCannon Active<br><small>Telegram</small>';
    document.body.appendChild(indicator);
  }

  toggleActive() {
    this.isActive = !this.isActive;
    this.updateUI();

    const chatId = this.getCurrentChatId();
    console.log(`[LooseCannon] Telegram ${this.isActive ? 'activated' : 'deactivated'} for: ${chatId}`);

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
    const button = document.querySelector('.loosecannon-toggle-telegram');
    const indicator = document.querySelector('.loosecannon-indicator-telegram');

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
        top: 60px;
        left: 20px;
        background: linear-gradient(135deg, #ff4444, #ff6666);
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(255,68,68,0.4);
        animation: slideIn 0.3s ease;
      ">
        <strong>⚠️ Scammer Detected!</strong><br>
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
  document.addEventListener('DOMContentLoaded', () => new TelegramIntegration());
} else {
  new TelegramIntegration();
}