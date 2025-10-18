// LooseCannon Analytics Dashboard JavaScript
// Real-time monitoring and control interface

class LooseCannonDashboard {
  constructor() {
    this.serverUrl = 'http://localhost:8765';
    this.ws = null;
    this.charts = {};
    this.updateInterval = null;
    this.startTime = Date.now();
    this.data = {
      messages: [],
      scammers: [],
      conversations: new Map(),
      patterns: [],
      screenshots: []
    };
    this.init();
  }

  async init() {
    await this.checkServerConnection();
    this.initializeCharts();
    this.setupEventListeners();
    this.connectWebSocket();
    this.startRealtimeUpdates();
    this.loadInitialData();
  }

  async checkServerConnection() {
    const statusElement = document.getElementById('serverStatus');

    try {
      const response = await fetch(`${this.serverUrl}/status`);
      if (response.ok) {
        statusElement.classList.add('connected');
        console.log('Server connected');
      } else {
        throw new Error('Server not responding');
      }
    } catch (error) {
      console.error('Server connection failed:', error);
      statusElement.classList.remove('connected');
      this.showNotification('Server offline - some features unavailable', 'error');
    }
  }

  connectWebSocket() {
    // WebSocket for real-time updates
    this.ws = new WebSocket('ws://localhost:8766');

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.showNotification('Connected to real-time feed', 'success');
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleRealtimeUpdate(data);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...');
      setTimeout(() => this.connectWebSocket(), 5000);
    };
  }

  handleRealtimeUpdate(data) {
    switch (data.type) {
      case 'MESSAGE':
        this.addActivityItem(data);
        this.updateMessageStats(data);
        break;

      case 'SCAMMER_DETECTED':
        this.handleScammerDetection(data);
        break;

      case 'SESSION_UPDATE':
        this.updateActiveSessions(data);
        break;

      case 'SCREENSHOT':
        this.addScreenshot(data);
        break;

      case 'PATTERN_LEARNED':
        this.addPattern(data);
        break;
    }

    this.updateCharts();
  }

  initializeCharts() {
    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#e0e0e0'
          }
        }
      },
      scales: {
        y: {
          grid: {
            color: '#333'
          },
          ticks: {
            color: '#888'
          }
        },
        x: {
          grid: {
            color: '#333'
          },
          ticks: {
            color: '#888'
          }
        }
      }
    };

    // Volume Chart
    this.charts.volume = new Chart(document.getElementById('volumeChart'), {
      type: 'line',
      data: {
        labels: this.generateTimeLabels(24),
        datasets: [{
          label: 'Messages',
          data: new Array(24).fill(0),
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          tension: 0.4
        }]
      },
      options: chartOptions
    });

    // Detection Chart
    this.charts.detection = new Chart(document.getElementById('detectionChart'), {
      type: 'bar',
      data: {
        labels: ['Low', 'Medium', 'High', 'Critical'],
        datasets: [{
          label: 'Detections',
          data: [0, 0, 0, 0],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#7c3aed']
        }]
      },
      options: chartOptions
    });

    // Platform Chart
    this.charts.platform = new Chart(document.getElementById('platformChart'), {
      type: 'doughnut',
      data: {
        labels: ['WhatsApp', 'Telegram', 'Messenger'],
        datasets: [{
          data: [0, 0, 0],
          backgroundColor: ['#25d366', '#0088cc', '#0084ff']
        }]
      },
      options: {
        ...chartOptions,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#e0e0e0'
            }
          }
        }
      }
    });

    // Response Time Chart
    this.charts.response = new Chart(document.getElementById('responseChart'), {
      type: 'line',
      data: {
        labels: this.generateTimeLabels(60, 'minutes'),
        datasets: [{
          label: 'Response Time (ms)',
          data: new Array(60).fill(0),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.4
        }]
      },
      options: chartOptions
    });
  }

  generateTimeLabels(count, unit = 'hours') {
    const labels = [];
    for (let i = count - 1; i >= 0; i--) {
      if (unit === 'hours') {
        labels.push(`${i}h`);
      } else {
        labels.push(`${i}m`);
      }
    }
    return labels;
  }

  updateCharts() {
    // Update volume chart with message counts
    const volumeData = this.calculateVolumeData();
    this.charts.volume.data.datasets[0].data = volumeData;
    this.charts.volume.update();

    // Update detection chart
    const detectionData = this.calculateDetectionData();
    this.charts.detection.data.datasets[0].data = detectionData;
    this.charts.detection.update();

    // Update platform distribution
    const platformData = this.calculatePlatformData();
    this.charts.platform.data.datasets[0].data = platformData;
    this.charts.platform.update();

    // Update response times
    const responseData = this.calculateResponseData();
    this.charts.response.data.datasets[0].data = responseData;
    this.charts.response.update();
  }

  calculateVolumeData() {
    // Group messages by hour
    const hourCounts = new Array(24).fill(0);
    const now = Date.now();

    this.data.messages.forEach(msg => {
      const age = (now - msg.timestamp) / (1000 * 60 * 60);
      if (age < 24) {
        const hour = Math.floor(age);
        hourCounts[23 - hour]++;
      }
    });

    return hourCounts;
  }

  calculateDetectionData() {
    const counts = [0, 0, 0, 0]; // Low, Medium, High, Critical

    this.data.scammers.forEach(scammer => {
      if (scammer.score < 0.3) counts[0]++;
      else if (scammer.score < 0.6) counts[1]++;
      else if (scammer.score < 0.9) counts[2]++;
      else counts[3]++;
    });

    return counts;
  }

  calculatePlatformData() {
    const counts = { whatsapp: 0, telegram: 0, messenger: 0 };

    this.data.conversations.forEach(conv => {
      counts[conv.platform] = (counts[conv.platform] || 0) + 1;
    });

    return [counts.whatsapp, counts.telegram, counts.messenger];
  }

  calculateResponseData() {
    // Return last 60 response time measurements
    return this.data.messages
      .slice(-60)
      .map(msg => msg.responseTime || 0);
  }

  addActivityItem(data) {
    const feed = document.getElementById('activityFeed');
    const item = document.createElement('div');
    item.className = 'activity-item';

    if (data.scammerScore > 0.7) {
      item.classList.add('scammer');
    }

    const time = new Date(data.timestamp).toLocaleTimeString();

    item.innerHTML = `
      <span class="activity-time">${time}</span>
      <span class="activity-message">${data.message || 'New activity'}</span>
    `;

    feed.insertBefore(item, feed.firstChild);

    // Keep only last 50 items
    while (feed.children.length > 50) {
      feed.removeChild(feed.lastChild);
    }
  }

  updateMessageStats(data) {
    this.data.messages.push(data);

    // Update counters
    document.getElementById('totalMessages').textContent = this.data.messages.length;

    // Calculate and show trend
    const trend = this.calculateTrend('messages');
    const trendElement = document.getElementById('messageTrend');
    trendElement.textContent = `${trend > 0 ? '+' : ''}${trend}%`;
    trendElement.className = trend >= 0 ? 'stat-trend' : 'stat-trend negative';
  }

  handleScammerDetection(data) {
    this.data.scammers.push(data);

    // Update counter
    document.getElementById('scammersDetected').textContent = this.data.scammers.length;

    // Add special notification
    this.showNotification(`Scammer detected! Confidence: ${(data.score * 100).toFixed(0)}%`, 'warning');

    // Flash the stat card
    const card = document.querySelector('.stat-card.danger');
    card.style.animation = 'pulse 0.5s';
    setTimeout(() => {
      card.style.animation = '';
    }, 500);

    // Add to activity feed
    this.addActivityItem({
      ...data,
      message: `Scammer detected on ${data.platform} (${(data.score * 100).toFixed(0)}% confidence)`
    });
  }

  updateActiveSessions(data) {
    document.getElementById('activeSessions').textContent = data.count || 0;
  }

  addScreenshot(data) {
    const grid = document.getElementById('evidenceGrid');

    // Remove placeholder if exists
    const placeholder = grid.querySelector('.evidence-placeholder');
    if (placeholder) {
      placeholder.remove();
    }

    const item = document.createElement('div');
    item.className = 'evidence-item';
    item.innerHTML = `
      <img src="${data.thumbnail}" alt="Evidence">
      <div class="evidence-meta">
        ${data.platform} - ${new Date(data.timestamp).toLocaleString()}
      </div>
    `;

    grid.insertBefore(item, grid.firstChild);

    // Keep only last 12 screenshots
    while (grid.children.length > 12) {
      grid.removeChild(grid.lastChild);
    }

    this.data.screenshots.push(data);
  }

  addPattern(data) {
    this.data.patterns.push(data);

    // Update pattern stats
    document.getElementById('totalPatterns').textContent = this.data.patterns.length;
    document.getElementById('patternAccuracy').textContent =
      `${(this.calculatePatternAccuracy() * 100).toFixed(0)}%`;

    // Update patterns list
    const list = document.getElementById('patternsList');
    const item = document.createElement('div');
    item.className = 'pattern-item';
    item.innerHTML = `
      <span class="pattern-type">${data.type}</span>
      <span class="pattern-count">${data.occurrences} occurrences</span>
    `;

    list.insertBefore(item, list.firstChild);

    // Keep only last 10 patterns
    while (list.children.length > 10) {
      list.removeChild(list.lastChild);
    }
  }

  calculatePatternAccuracy() {
    if (this.data.patterns.length === 0) return 0;

    const correct = this.data.patterns.filter(p => p.verified).length;
    return correct / this.data.patterns.length;
  }

  calculateTrend(metric) {
    // Simple trend calculation (current hour vs previous hour)
    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000);

    let current = 0;
    let previous = 0;

    if (metric === 'messages') {
      this.data.messages.forEach(msg => {
        if (msg.timestamp > hourAgo) current++;
        else if (msg.timestamp > (hourAgo - 60 * 60 * 1000)) previous++;
      });
    }

    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  setupEventListeners() {
    // Export button
    document.getElementById('exportBtn').addEventListener('click', () => {
      this.exportData();
    });

    // Emergency stop
    document.getElementById('emergencyStop').addEventListener('click', () => {
      this.emergencyStop();
    });

    // Clear data
    document.getElementById('clearDataBtn').addEventListener('click', () => {
      this.clearOldData();
    });

    // Sync patterns
    document.getElementById('syncBtn').addEventListener('click', () => {
      this.syncPatterns();
    });

    // Personality builder
    document.getElementById('personalityBtn').addEventListener('click', () => {
      this.openPersonalityBuilder();
    });

    // Conversation replay
    document.getElementById('replayBtn').addEventListener('click', () => {
      this.openConversationReplay();
    });

    // Modal controls
    document.getElementById('modalClose').addEventListener('click', () => {
      document.getElementById('personalityModal').classList.remove('active');
    });

    document.getElementById('replayClose').addEventListener('click', () => {
      document.getElementById('replayModal').classList.remove('active');
    });

    // Personality form
    document.getElementById('personalityForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.savePersonality();
    });

    // Test personality
    document.getElementById('testPersonality').addEventListener('click', () => {
      this.testPersonality();
    });

    // Temperature slider
    document.getElementById('temperature').addEventListener('input', (e) => {
      document.getElementById('tempValue').textContent = e.target.value;
    });
  }

  async exportData() {
    try {
      const data = {
        timestamp: new Date().toISOString(),
        messages: this.data.messages,
        scammers: this.data.scammers,
        patterns: this.data.patterns,
        screenshots: this.data.screenshots.map(s => s.id),
        conversations: Array.from(this.data.conversations.values())
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json'
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `loosecannon-export-${Date.now()}.json`;
      a.click();

      this.showNotification('Data exported successfully', 'success');
    } catch (error) {
      console.error('Export error:', error);
      this.showNotification('Export failed', 'error');
    }
  }

  async emergencyStop() {
    if (!confirm('This will stop ALL active LooseCannon sessions. Continue?')) {
      return;
    }

    try {
      const response = await fetch(`${this.serverUrl}/emergency-stop`, {
        method: 'POST'
      });

      if (response.ok) {
        this.showNotification('Emergency stop activated', 'warning');

        // Clear active sessions display
        document.getElementById('activeSessions').textContent = '0';

        // Send stop command via WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'EMERGENCY_STOP' }));
        }
      }
    } catch (error) {
      console.error('Emergency stop error:', error);
    }
  }

  async clearOldData() {
    if (!confirm('Clear data older than 24 hours?')) {
      return;
    }

    const cutoff = Date.now() - (24 * 60 * 60 * 1000);

    // Filter data
    this.data.messages = this.data.messages.filter(m => m.timestamp > cutoff);
    this.data.scammers = this.data.scammers.filter(s => s.timestamp > cutoff);
    this.data.screenshots = this.data.screenshots.filter(s => s.timestamp > cutoff);

    // Update displays
    this.updateCharts();
    this.showNotification('Old data cleared', 'success');
  }

  async syncPatterns() {
    try {
      const response = await fetch(`${this.serverUrl}/patterns/sync`, {
        method: 'GET'
      });

      if (response.ok) {
        const patterns = await response.json();

        // Merge with local patterns
        patterns.forEach(pattern => {
          if (!this.data.patterns.find(p => p.id === pattern.id)) {
            this.addPattern(pattern);
          }
        });

        this.showNotification(`Synced ${patterns.length} patterns`, 'success');
      }
    } catch (error) {
      console.error('Pattern sync error:', error);
      this.showNotification('Pattern sync failed', 'error');
    }
  }

  openPersonalityBuilder() {
    document.getElementById('personalityModal').classList.add('active');
  }

  async savePersonality() {
    const personality = {
      id: document.getElementById('personalityName').value.toLowerCase().replace(/\s+/g, '-'),
      name: document.getElementById('personalityName').value,
      systemPrompt: document.getElementById('systemPrompt').value,
      temperature: parseFloat(document.getElementById('temperature').value),
      examples: document.getElementById('examples').value.split('\n').filter(e => e.trim())
    };

    try {
      const response = await fetch(`${this.serverUrl}/personalities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(personality)
      });

      if (response.ok) {
        this.showNotification('Personality saved successfully', 'success');
        document.getElementById('personalityModal').classList.remove('active');
        document.getElementById('personalityForm').reset();
      }
    } catch (error) {
      console.error('Save personality error:', error);
      this.showNotification('Failed to save personality', 'error');
    }
  }

  async testPersonality() {
    const testPrompt = "Hello, I have an important message about your account.";
    const systemPrompt = document.getElementById('systemPrompt').value;
    const temperature = parseFloat(document.getElementById('temperature').value);

    try {
      const response = await fetch(`${this.serverUrl}/test-personality`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt,
          temperature,
          message: testPrompt
        })
      });

      if (response.ok) {
        const result = await response.json();
        document.getElementById('testOutput').innerHTML = `
          <strong>Test Input:</strong> "${testPrompt}"<br>
          <strong>Response:</strong> "${result.response}"
        `;
      }
    } catch (error) {
      console.error('Test personality error:', error);
      document.getElementById('testOutput').innerHTML = 'Test failed';
    }
  }

  openConversationReplay() {
    document.getElementById('replayModal').classList.add('active');
    this.loadConversations();
  }

  async loadConversations() {
    const select = document.getElementById('conversationSelect');
    select.innerHTML = '<option>Select a conversation...</option>';

    this.data.conversations.forEach((conv, id) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = `${conv.platform} - ${conv.chatId} (${conv.messages.length} messages)`;
      select.appendChild(option);
    });
  }

  startRealtimeUpdates() {
    // Update uptime
    setInterval(() => {
      const uptime = Date.now() - this.startTime;
      const hours = Math.floor(uptime / (1000 * 60 * 60));
      const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
      document.getElementById('uptime').textContent = `${hours}h ${minutes}m`;
    }, 60000);

    // Update last updated
    setInterval(() => {
      document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();
    }, 1000);

    // Update response time
    setInterval(() => {
      const avgResponse = this.calculateAverageResponseTime();
      document.getElementById('responseTime').textContent = `${avgResponse}ms`;
    }, 5000);
  }

  calculateAverageResponseTime() {
    if (this.data.messages.length === 0) return 0;

    const recent = this.data.messages.slice(-20);
    const sum = recent.reduce((acc, msg) => acc + (msg.responseTime || 0), 0);
    return Math.round(sum / recent.length);
  }

  async loadInitialData() {
    try {
      // Load analytics
      const analyticsResponse = await fetch(`${this.serverUrl}/analytics`);
      if (analyticsResponse.ok) {
        const analytics = await analyticsResponse.json();
        document.getElementById('totalMessages').textContent = analytics.totalMessages || 0;
        document.getElementById('scammersDetected').textContent = analytics.scammersDetected || 0;
      }

      // Load active conversations
      const conversationsResponse = await fetch(`${this.serverUrl}/conversations/active`);
      if (conversationsResponse.ok) {
        const conversations = await conversationsResponse.json();
        this.updateConversationCards(conversations);
      }

      // Load patterns
      const patternsResponse = await fetch(`${this.serverUrl}/patterns`);
      if (patternsResponse.ok) {
        const patterns = await patternsResponse.json();
        patterns.forEach(pattern => this.addPattern(pattern));
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  }

  updateConversationCards(conversations) {
    const grid = document.getElementById('conversationsGrid');
    grid.innerHTML = '';

    if (conversations.length === 0) {
      grid.innerHTML = `
        <div class="conversation-card">
          <div class="conversation-header">
            <span class="conversation-id">No active conversations</span>
          </div>
        </div>
      `;
      return;
    }

    conversations.forEach(conv => {
      this.data.conversations.set(conv.id, conv);

      const card = document.createElement('div');
      card.className = 'conversation-card';
      card.innerHTML = `
        <div class="conversation-header">
          <span class="platform-badge ${conv.platform}">${conv.platform}</span>
          <span class="conversation-id">${conv.chatId}</span>
        </div>
        <div class="conversation-stats">
          <span>Messages: ${conv.messageCount}</span>
          <span>Score: ${conv.scammerScore.toFixed(2)}</span>
          <span>Duration: ${Math.round(conv.duration / 60000)}m</span>
        </div>
      `;

      card.addEventListener('click', () => {
        this.viewConversation(conv.id);
      });

      grid.appendChild(card);
    });

    document.getElementById('activeSessions').textContent = conversations.length;
  }

  viewConversation(conversationId) {
    const conv = this.data.conversations.get(conversationId);
    if (!conv) return;

    // Open replay modal with this conversation
    document.getElementById('replayModal').classList.add('active');
    document.getElementById('conversationSelect').value = conversationId;
    this.loadConversationMessages(conversationId);
  }

  loadConversationMessages(conversationId) {
    const conv = this.data.conversations.get(conversationId);
    if (!conv) return;

    const container = document.getElementById('replayMessages');
    container.innerHTML = '';

    conv.messages.forEach(msg => {
      const msgDiv = document.createElement('div');
      msgDiv.className = `replay-message ${msg.sender}`;
      msgDiv.innerHTML = `
        <div class="message-time">${new Date(msg.timestamp).toLocaleTimeString()}</div>
        <div class="message-content">${msg.content}</div>
      `;
      container.appendChild(msgDiv);
    });

    // Update stats
    document.getElementById('replayStats').innerHTML = `
      <span>Messages: ${conv.messages.length}</span>
      <span>Duration: ${Math.round(conv.duration / 60000)}m</span>
      <span>Scammer Score: ${conv.scammerScore.toFixed(2)}</span>
    `;
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      z-index: 2000;
      animation: slideIn 0.3s ease;
    `;

    // Style based on type
    const colors = {
      info: '#3b82f6',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444'
    };

    notification.style.background = colors[type] || colors.info;
    notification.style.color = 'white';

    document.body.appendChild(notification);

    // Auto remove after 5 seconds
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 5000);
  }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new LooseCannonDashboard();
});