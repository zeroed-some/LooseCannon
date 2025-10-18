// Popup script for LooseCannon

class LooseCannonPopup {
  constructor() {
    this.isActive = false;
    this.messageCount = 0;
    this.sessionStartTime = null;
    this.init();
  }

  init() {
    this.setupElements();
    this.checkServerStatus();
    this.loadCurrentStatus();
    this.loadStats();
    this.setupEventListeners();
    this.startSessionTimer();
  }

  setupElements() {
    this.elements = {
      serverStatus: document.getElementById('serverStatus'),
      serverStatusText: document.getElementById('serverStatusText'),
      personalitySelect: document.getElementById('personalitySelect'),
      mainToggle: document.getElementById('mainToggle'),
      toggleStatus: document.getElementById('toggleStatus'),
      messageCount: document.getElementById('messageCount'),
      sessionTime: document.getElementById('sessionTime'),
      emergencyStop: document.getElementById('emergencyStop'),
      settingsLink: document.getElementById('settingsLink'),
      logsLink: document.getElementById('logsLink'),
      helpLink: document.getElementById('helpLink')
    };
  }

  setupEventListeners() {
    // Main toggle
    this.elements.mainToggle.addEventListener('click', () => {
      this.toggleActive();
    });

    // Personality selector
    this.elements.personalitySelect.addEventListener('change', (e) => {
      browser.runtime.sendMessage({
        type: 'SET_PERSONALITY',
        data: { personality: e.target.value }
      });
    });

    // Emergency stop
    this.elements.emergencyStop.addEventListener('click', () => {
      this.emergencyStop();
    });

    // Footer links
    this.elements.settingsLink.addEventListener('click', (e) => {
      e.preventDefault();
      // Open settings page (to be implemented)
      console.log('Settings clicked');
    });

    this.elements.logsLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.showLogs();
    });

    this.elements.helpLink.addEventListener('click', (e) => {
      e.preventDefault();
      browser.tabs.create({
        url: 'https://github.com/zeroed-some/LooseCannon/wiki'
      });
    });
  }

  async checkServerStatus() {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'GET_SERVER_STATUS'
      });

      if (response.connected) {
        this.elements.serverStatus.classList.remove('disconnected');
        this.elements.serverStatus.classList.add('connected');
        this.elements.serverStatusText.textContent = 'Connected';

        // Load personalities if connected
        this.loadPersonalities();
      } else {
        this.elements.serverStatus.classList.remove('connected');
        this.elements.serverStatus.classList.add('disconnected');
        this.elements.serverStatusText.textContent = 'Disconnected';
      }
    } catch (error) {
      console.error('Error checking server status:', error);
    }
  }

  async loadCurrentStatus() {
    try {
      // Get status from active tab
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        const response = await browser.tabs.sendMessage(tabs[0].id, {
          type: 'GET_STATUS'
        });

        if (response && response.isActive) {
          this.setActive(true);
        }
      }
    } catch (error) {
      console.log('No WhatsApp tab active or content script not loaded');
    }
  }

  async loadPersonalities() {
    try {
      const response = await browser.runtime.sendMessage({
        type: 'GET_PERSONALITIES'
      });

      if (response.personalities && response.personalities.length > 0) {
        // Update personality dropdown with server personalities
        this.elements.personalitySelect.innerHTML = '';
        response.personalities.forEach(personality => {
          const option = document.createElement('option');
          option.value = personality.id;
          option.textContent = personality.name;
          this.elements.personalitySelect.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Error loading personalities:', error);
    }
  }

  async loadStats() {
    try {
      const result = await browser.storage.local.get(['conversationLogs']);
      if (result.conversationLogs) {
        this.messageCount = result.conversationLogs.length;
        this.elements.messageCount.textContent = this.messageCount;
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  toggleActive() {
    this.isActive = !this.isActive;
    this.setActive(this.isActive);

    // Send to active tab
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs[0]) {
        browser.tabs.sendMessage(tabs[0].id, {
          type: 'SET_ACTIVE',
          data: { isActive: this.isActive }
        });
      }
    });
  }

  setActive(active) {
    this.isActive = active;

    if (active) {
      this.elements.mainToggle.classList.add('active');
      this.elements.toggleStatus.textContent = 'Currently Active';
      if (!this.sessionStartTime) {
        this.sessionStartTime = Date.now();
      }
    } else {
      this.elements.mainToggle.classList.remove('active');
      this.elements.toggleStatus.textContent = 'Currently Inactive';
      this.sessionStartTime = null;
    }
  }

  emergencyStop() {
    // Deactivate everything immediately
    this.setActive(false);

    // Send stop to all tabs
    browser.tabs.query({}).then(tabs => {
      tabs.forEach(tab => {
        browser.tabs.sendMessage(tab.id, {
          type: 'SET_ACTIVE',
          data: { isActive: false }
        }).catch(() => {
          // Ignore errors for tabs without content script
        });
      });
    });

    // Clear all stored data
    if (confirm('Emergency stop activated. Clear all conversation logs?')) {
      browser.storage.local.remove('conversationLogs');
      this.messageCount = 0;
      this.elements.messageCount.textContent = '0';
    }

    // Show confirmation
    this.elements.emergencyStop.textContent = 'STOPPED';
    setTimeout(() => {
      this.elements.emergencyStop.textContent = 'EMERGENCY STOP ALL';
    }, 2000);
  }

  startSessionTimer() {
    setInterval(() => {
      if (this.sessionStartTime) {
        const elapsed = Date.now() - this.sessionStartTime;
        const minutes = Math.floor(elapsed / 60000);
        this.elements.sessionTime.textContent = `${minutes}m`;
      }
    }, 1000);
  }

  async showLogs() {
    try {
      const result = await browser.storage.local.get(['conversationLogs']);
      if (result.conversationLogs && result.conversationLogs.length > 0) {
        // Create a simple log viewer (could be expanded to a new page)
        const logs = result.conversationLogs.slice(-10); // Last 10 logs
        const logText = logs.map(log =>
          `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.chatId}:\nUser: ${log.userMessage}\nBot: ${log.botReply}\n`
        ).join('\n---\n');

        console.log('=== Conversation Logs ===');
        console.log(logText);
        alert('Last 10 conversation logs printed to console (F12)');
      } else {
        alert('No conversation logs available');
      }
    } catch (error) {
      console.error('Error showing logs:', error);
    }
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new LooseCannonPopup();
});