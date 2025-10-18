// Chrome Service Worker for LooseCannon (Manifest V3)
console.log('[LooseCannon] Chrome Service Worker initialized');

// Import modules
import { UnifiedMessageHandler } from './unified-handler-v3.js';
import { ScreenshotManager } from './screenshot-manager.js';
import { PatternLearning } from './pattern-learning.js';

class LooseCannonServiceWorker {
  constructor() {
    this.messageHandler = new UnifiedMessageHandler();
    this.screenshotManager = new ScreenshotManager();
    this.patternLearning = new PatternLearning();
    this.serverUrl = 'http://localhost:8765';
    this.analytics = {
      sessionsStarted: 0,
      messagesProcessed: 0,
      scammersDetected: 0,
      screenshotsCaptured: 0
    };
    this.init();
  }

  init() {
    this.setupListeners();
    this.setupAlarms();
    this.connectToServer();
    this.loadAnalytics();
  }

  setupListeners() {
    // Message listener for content scripts and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[ServiceWorker] Received message:', message.type);

      // Handle async operations properly in Manifest V3
      this.handleMessage(message, sender).then(sendResponse);
      return true; // Keep channel open for async response
    });

    // Tab events for tracking
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete') {
        this.checkForSupportedSite(tab);
      }
    });

    // Extension install/update events
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        this.onFirstInstall();
      } else if (details.reason === 'update') {
        this.onUpdate(details.previousVersion);
      }
    });

    // Alarm listener for periodic tasks
    chrome.alarms.onAlarm.addListener((alarm) => {
      this.handleAlarm(alarm);
    });
  }

  async handleMessage(message, sender) {
    try {
      switch (message.type) {
        case 'NEW_MESSAGE':
          return await this.handleNewMessage(message.data, sender);

        case 'CAPTURE_SCREENSHOT':
          return await this.captureScreenshot(sender.tab);

        case 'GET_ANALYTICS':
          return await this.getAnalytics();

        case 'EXPORT_DATA':
          return await this.exportData(message.data);

        case 'LEARN_PATTERN':
          return await this.learnPattern(message.data);

        case 'GET_SERVER_STATUS':
          return await this.checkServerStatus();

        case 'TOGGLE_ACTIVE':
          return await this.handleToggleActive(message.data, sender);

        default:
          return { error: 'Unknown message type' };
      }
    } catch (error) {
      console.error('[ServiceWorker] Error handling message:', error);
      return { error: error.message };
    }
  }

  async handleNewMessage(data, sender) {
    this.analytics.messagesProcessed++;

    // Add Chrome-specific tab info
    data.tabId = sender.tab.id;
    data.url = sender.url;

    // Process through unified handler
    const response = await this.messageHandler.processMessage(data);

    // If scammer detected, capture screenshot
    if (response.scammerScore > 0.7) {
      this.analytics.scammersDetected++;

      // Capture evidence
      const screenshot = await this.captureScreenshot(sender.tab);
      if (screenshot.success) {
        response.evidenceId = screenshot.id;
      }

      // Learn from pattern
      await this.patternLearning.addPattern(data, response.scammerScore);
    }

    // Update analytics
    await this.saveAnalytics();

    return response;
  }

  async captureScreenshot(tab) {
    if (!tab) return { success: false, error: 'No tab provided' };

    try {
      // Chrome-specific screenshot API
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'png',
        quality: 90
      });

      // Store screenshot
      const screenshot = await this.screenshotManager.store({
        dataUrl,
        tabId: tab.id,
        url: tab.url,
        timestamp: new Date().toISOString()
      });

      this.analytics.screenshotsCaptured++;

      return {
        success: true,
        id: screenshot.id,
        size: screenshot.size
      };
    } catch (error) {
      console.error('[ServiceWorker] Screenshot error:', error);
      return { success: false, error: error.message };
    }
  }

  async checkForSupportedSite(tab) {
    const supportedSites = [
      'web.whatsapp.com',
      'web.telegram.org',
      'messenger.com'
    ];

    const isSupported = supportedSites.some(site => tab.url?.includes(site));

    if (isSupported) {
      // Show page action or badge
      chrome.action.setBadgeText({
        text: 'LC',
        tabId: tab.id
      });

      chrome.action.setBadgeBackgroundColor({
        color: '#4CAF50',
        tabId: tab.id
      });
    }
  }

  setupAlarms() {
    // Set up periodic tasks
    chrome.alarms.create('analyticsSync', { periodInMinutes: 5 });
    chrome.alarms.create('patternSync', { periodInMinutes: 30 });
    chrome.alarms.create('cleanup', { periodInMinutes: 60 });
  }

  async handleAlarm(alarm) {
    switch (alarm.name) {
      case 'analyticsSync':
        await this.syncAnalytics();
        break;

      case 'patternSync':
        await this.syncPatterns();
        break;

      case 'cleanup':
        await this.cleanup();
        break;
    }
  }

  async syncAnalytics() {
    try {
      // Send analytics to server
      const response = await fetch(`${this.serverUrl}/analytics/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analytics: this.analytics,
          timestamp: new Date().toISOString()
        })
      });

      if (response.ok) {
        console.log('[ServiceWorker] Analytics synced');
      }
    } catch (error) {
      console.error('[ServiceWorker] Analytics sync failed:', error);
    }
  }

  async syncPatterns() {
    try {
      const patterns = await this.patternLearning.getPatterns();

      // Send learned patterns to server
      const response = await fetch(`${this.serverUrl}/patterns/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patterns })
      });

      if (response.ok) {
        const serverPatterns = await response.json();
        await this.patternLearning.updateFromServer(serverPatterns);
        console.log('[ServiceWorker] Patterns synced');
      }
    } catch (error) {
      console.error('[ServiceWorker] Pattern sync failed:', error);
    }
  }

  async cleanup() {
    // Clean up old screenshots
    await this.screenshotManager.cleanup(24 * 60 * 60 * 1000); // 24 hours

    // Clean up old conversation data
    const storage = await chrome.storage.local.get();
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    for (const key in storage) {
      if (key.startsWith('conversation_')) {
        const data = storage[key];
        if (data.timestamp && (now - new Date(data.timestamp).getTime() > maxAge)) {
          await chrome.storage.local.remove(key);
        }
      }
    }

    console.log('[ServiceWorker] Cleanup completed');
  }

  async connectToServer() {
    try {
      const response = await fetch(`${this.serverUrl}/status`);
      if (response.ok) {
        console.log('[ServiceWorker] Server connected');
        chrome.action.setTitle({ title: 'LooseCannon - Connected' });
      } else {
        throw new Error('Server not responding');
      }
    } catch (error) {
      console.error('[ServiceWorker] Server connection failed:', error);
      chrome.action.setTitle({ title: 'LooseCannon - Server Offline' });

      // Retry in 30 seconds
      setTimeout(() => this.connectToServer(), 30000);
    }
  }

  async getAnalytics() {
    const stored = await chrome.storage.local.get('analytics');
    return {
      ...this.analytics,
      ...stored.analytics,
      uptime: Date.now() - this.startTime
    };
  }

  async saveAnalytics() {
    await chrome.storage.local.set({ analytics: this.analytics });
  }

  async loadAnalytics() {
    const stored = await chrome.storage.local.get('analytics');
    if (stored.analytics) {
      this.analytics = { ...this.analytics, ...stored.analytics };
    }
    this.startTime = Date.now();
  }

  async exportData(options = {}) {
    const data = {
      version: '0.3.0',
      timestamp: new Date().toISOString(),
      analytics: this.analytics,
      patterns: await this.patternLearning.getPatterns(),
      screenshots: await this.screenshotManager.getAll()
    };

    if (options.includeConversations) {
      const storage = await chrome.storage.local.get();
      data.conversations = Object.entries(storage)
        .filter(([key]) => key.startsWith('conversation_'))
        .map(([key, value]) => value);
    }

    // Create download
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const filename = `loosecannon-export-${Date.now()}.json`;

    await chrome.downloads.download({
      url,
      filename,
      saveAs: true
    });

    return { success: true, filename };
  }

  async handleToggleActive(data, sender) {
    this.analytics.sessionsStarted++;
    await this.saveAnalytics();

    // Notify dashboard if open
    chrome.runtime.sendMessage({
      type: 'DASHBOARD_UPDATE',
      data: {
        event: 'session_toggle',
        active: data.isActive,
        platform: data.platform,
        tabId: sender.tab?.id
      }
    }).catch(() => {
      // Dashboard might not be open
    });

    return { success: true };
  }

  async checkServerStatus() {
    try {
      const response = await fetch(`${this.serverUrl}/status`);
      const data = await response.json();
      return { connected: true, ...data };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  onFirstInstall() {
    // Open welcome page
    chrome.tabs.create({
      url: chrome.runtime.getURL('dashboard/welcome.html')
    });
  }

  onUpdate(previousVersion) {
    console.log(`[ServiceWorker] Updated from ${previousVersion} to 0.3.0`);

    // Show update notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'LooseCannon Updated',
      message: 'New features: Chrome support, Analytics Dashboard, and more!'
    });
  }
}

// Initialize service worker
const serviceWorker = new LooseCannonServiceWorker();

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LooseCannonServiceWorker;
}