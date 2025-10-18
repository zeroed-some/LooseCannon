// Screenshot Manager for Evidence Collection
// Captures and stores screenshots when scammers are detected

export class ScreenshotManager {
  constructor() {
    this.storage = 'screenshots';
    this.maxScreenshots = 100;
    this.compressionQuality = 0.8;
    this.init();
  }

  async init() {
    // Create storage structure if doesn't exist
    const stored = await chrome.storage.local.get(this.storage);
    if (!stored[this.storage]) {
      await chrome.storage.local.set({ [this.storage]: [] });
    }
  }

  async capture(tab, metadata = {}) {
    try {
      // Capture visible tab
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
        format: 'jpeg',
        quality: Math.round(this.compressionQuality * 100)
      });

      // Generate unique ID
      const id = `screenshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create screenshot object
      const screenshot = {
        id,
        timestamp: new Date().toISOString(),
        url: tab.url,
        title: tab.title,
        platform: this.detectPlatform(tab.url),
        dataUrl: await this.compressImage(dataUrl),
        thumbnail: await this.createThumbnail(dataUrl),
        metadata: {
          ...metadata,
          tabId: tab.id,
          windowId: tab.windowId,
          incognito: tab.incognito
        }
      };

      // Store screenshot
      await this.store(screenshot);

      // Notify dashboard
      this.notifyDashboard(screenshot);

      return {
        success: true,
        id: screenshot.id,
        size: this.calculateSize(screenshot.dataUrl)
      };
    } catch (error) {
      console.error('[ScreenshotManager] Capture error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  detectPlatform(url) {
    if (url.includes('whatsapp.com')) return 'whatsapp';
    if (url.includes('telegram.org')) return 'telegram';
    if (url.includes('messenger.com')) return 'messenger';
    return 'unknown';
  }

  async compressImage(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Set max dimensions
        const maxWidth = 1920;
        const maxHeight = 1080;

        let width = img.width;
        let height = img.height;

        // Calculate new dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', this.compressionQuality));
      };

      img.src = dataUrl;
    });
  }

  async createThumbnail(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Thumbnail dimensions
        const thumbWidth = 320;
        const thumbHeight = 180;

        canvas.width = thumbWidth;
        canvas.height = thumbHeight;

        // Draw thumbnail
        ctx.drawImage(img, 0, 0, thumbWidth, thumbHeight);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };

      img.src = dataUrl;
    });
  }

  calculateSize(dataUrl) {
    // Estimate size in bytes
    const base64Length = dataUrl.length - 'data:image/jpeg;base64,'.length;
    const sizeInBytes = base64Length * 0.75;
    return Math.round(sizeInBytes / 1024); // Return in KB
  }

  async store(screenshot) {
    const stored = await chrome.storage.local.get(this.storage);
    let screenshots = stored[this.storage] || [];

    // Add new screenshot
    screenshots.unshift(screenshot);

    // Enforce max limit
    if (screenshots.length > this.maxScreenshots) {
      screenshots = screenshots.slice(0, this.maxScreenshots);
    }

    // Update storage
    await chrome.storage.local.set({ [this.storage]: screenshots });

    // Also store metadata separately for quick access
    await this.storeMetadata(screenshot);

    return screenshot;
  }

  async storeMetadata(screenshot) {
    const metaKey = `${this.storage}_metadata`;
    const stored = await chrome.storage.local.get(metaKey);
    let metadata = stored[metaKey] || [];

    metadata.unshift({
      id: screenshot.id,
      timestamp: screenshot.timestamp,
      platform: screenshot.platform,
      url: screenshot.url,
      scammerScore: screenshot.metadata.scammerScore || 0
    });

    // Keep only last 500 metadata entries
    if (metadata.length > 500) {
      metadata = metadata.slice(0, 500);
    }

    await chrome.storage.local.set({ [metaKey]: metadata });
  }

  async get(id) {
    const stored = await chrome.storage.local.get(this.storage);
    const screenshots = stored[this.storage] || [];
    return screenshots.find(s => s.id === id);
  }

  async getAll(options = {}) {
    const stored = await chrome.storage.local.get(this.storage);
    let screenshots = stored[this.storage] || [];

    // Apply filters
    if (options.platform) {
      screenshots = screenshots.filter(s => s.platform === options.platform);
    }

    if (options.startDate) {
      screenshots = screenshots.filter(s =>
        new Date(s.timestamp) >= new Date(options.startDate)
      );
    }

    if (options.endDate) {
      screenshots = screenshots.filter(s =>
        new Date(s.timestamp) <= new Date(options.endDate)
      );
    }

    if (options.limit) {
      screenshots = screenshots.slice(0, options.limit);
    }

    return screenshots;
  }

  async getMetadata() {
    const metaKey = `${this.storage}_metadata`;
    const stored = await chrome.storage.local.get(metaKey);
    return stored[metaKey] || [];
  }

  async delete(id) {
    const stored = await chrome.storage.local.get(this.storage);
    let screenshots = stored[this.storage] || [];

    screenshots = screenshots.filter(s => s.id !== id);
    await chrome.storage.local.set({ [this.storage]: screenshots });

    // Also remove from metadata
    const metaKey = `${this.storage}_metadata`;
    const metaStored = await chrome.storage.local.get(metaKey);
    let metadata = metaStored[metaKey] || [];
    metadata = metadata.filter(m => m.id !== id);
    await chrome.storage.local.set({ [metaKey]: metadata });

    return { success: true };
  }

  async cleanup(maxAge = 24 * 60 * 60 * 1000) {
    const stored = await chrome.storage.local.get(this.storage);
    let screenshots = stored[this.storage] || [];

    const cutoff = Date.now() - maxAge;
    const before = screenshots.length;

    screenshots = screenshots.filter(s =>
      new Date(s.timestamp).getTime() > cutoff
    );

    await chrome.storage.local.set({ [this.storage]: screenshots });

    const deleted = before - screenshots.length;
    console.log(`[ScreenshotManager] Cleaned up ${deleted} old screenshots`);

    return { deleted };
  }

  async export(ids = null) {
    const stored = await chrome.storage.local.get(this.storage);
    let screenshots = stored[this.storage] || [];

    if (ids) {
      screenshots = screenshots.filter(s => ids.includes(s.id));
    }

    // Create export data
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      count: screenshots.length,
      screenshots: screenshots.map(s => ({
        id: s.id,
        timestamp: s.timestamp,
        platform: s.platform,
        url: s.url,
        metadata: s.metadata,
        thumbnail: s.thumbnail // Include thumbnail only
      }))
    };

    return exportData;
  }

  async getStatistics() {
    const stored = await chrome.storage.local.get(this.storage);
    const screenshots = stored[this.storage] || [];

    const stats = {
      total: screenshots.length,
      byPlatform: {},
      byDay: {},
      totalSize: 0,
      oldestTimestamp: null,
      newestTimestamp: null
    };

    screenshots.forEach(s => {
      // By platform
      stats.byPlatform[s.platform] = (stats.byPlatform[s.platform] || 0) + 1;

      // By day
      const day = new Date(s.timestamp).toDateString();
      stats.byDay[day] = (stats.byDay[day] || 0) + 1;

      // Size
      stats.totalSize += this.calculateSize(s.dataUrl);

      // Timestamps
      const timestamp = new Date(s.timestamp).getTime();
      if (!stats.oldestTimestamp || timestamp < stats.oldestTimestamp) {
        stats.oldestTimestamp = s.timestamp;
      }
      if (!stats.newestTimestamp || timestamp > stats.newestTimestamp) {
        stats.newestTimestamp = s.timestamp;
      }
    });

    return stats;
  }

  notifyDashboard(screenshot) {
    // Send to dashboard if open
    chrome.runtime.sendMessage({
      type: 'DASHBOARD_UPDATE',
      data: {
        event: 'screenshot_captured',
        screenshot: {
          id: screenshot.id,
          timestamp: screenshot.timestamp,
          platform: screenshot.platform,
          thumbnail: screenshot.thumbnail
        }
      }
    }).catch(() => {
      // Dashboard might not be open
    });
  }

  async annotate(id, annotations) {
    const screenshot = await this.get(id);
    if (!screenshot) {
      throw new Error('Screenshot not found');
    }

    // Add annotations
    screenshot.annotations = {
      ...screenshot.annotations,
      ...annotations,
      updatedAt: new Date().toISOString()
    };

    // Update storage
    const stored = await chrome.storage.local.get(this.storage);
    let screenshots = stored[this.storage] || [];

    const index = screenshots.findIndex(s => s.id === id);
    if (index !== -1) {
      screenshots[index] = screenshot;
      await chrome.storage.local.set({ [this.storage]: screenshots });
    }

    return screenshot;
  }

  async createEvidence Report(screenshotIds, conversationId) {
    const screenshots = await this.getAll();
    const selected = screenshots.filter(s => screenshotIds.includes(s.id));

    const report = {
      id: `report_${Date.now()}`,
      timestamp: new Date().toISOString(),
      conversationId,
      screenshots: selected.map(s => ({
        id: s.id,
        timestamp: s.timestamp,
        platform: s.platform,
        url: s.url,
        annotations: s.annotations
      })),
      summary: {
        totalScreenshots: selected.length,
        platforms: [...new Set(selected.map(s => s.platform))],
        timeRange: {
          start: selected[selected.length - 1]?.timestamp,
          end: selected[0]?.timestamp
        }
      }
    };

    // Store report
    const reportKey = 'evidence_reports';
    const stored = await chrome.storage.local.get(reportKey);
    let reports = stored[reportKey] || [];
    reports.unshift(report);

    // Keep only last 50 reports
    if (reports.length > 50) {
      reports = reports.slice(0, 50);
    }

    await chrome.storage.local.set({ [reportKey]: reports });

    return report;
  }
}

// Export for use in service worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ScreenshotManager;
}