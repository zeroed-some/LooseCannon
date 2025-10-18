// Pattern Learning System for Scammer Detection
// Uses machine learning-inspired techniques to identify and learn scammer patterns

export class PatternLearning {
  constructor() {
    this.patterns = new Map();
    this.weights = new Map();
    this.threshold = 0.7;
    this.learningRate = 0.1;
    this.decayRate = 0.95;
    this.minConfidence = 0.6;
    this.init();
  }

  async init() {
    await this.loadPatterns();
    await this.loadWeights();
    this.startPeriodicTraining();
  }

  async loadPatterns() {
    const stored = await chrome.storage.local.get('learned_patterns');
    if (stored.learned_patterns) {
      stored.learned_patterns.forEach(pattern => {
        this.patterns.set(pattern.id, pattern);
      });
    }

    // Load default patterns
    this.loadDefaultPatterns();
  }

  loadDefaultPatterns() {
    const defaults = [
      {
        id: 'urgent_action',
        type: 'keyword_cluster',
        features: ['urgent', 'immediate', 'act now', 'expire', 'limited time'],
        weight: 0.8,
        confidence: 0.9
      },
      {
        id: 'money_request',
        type: 'keyword_cluster',
        features: ['send money', 'wire transfer', 'gift card', 'payment', 'fee'],
        weight: 0.9,
        confidence: 0.95
      },
      {
        id: 'personal_info',
        type: 'keyword_cluster',
        features: ['social security', 'password', 'account number', 'pin', 'verification code'],
        weight: 0.85,
        confidence: 0.9
      },
      {
        id: 'suspicious_link',
        type: 'url_pattern',
        features: ['bit.ly', 'tinyurl', 'short.link', 'click.here'],
        weight: 0.75,
        confidence: 0.8
      },
      {
        id: 'impersonation',
        type: 'keyword_cluster',
        features: ['official', 'authorized', 'representative', 'department', 'agency'],
        weight: 0.7,
        confidence: 0.75
      },
      {
        id: 'threat_language',
        type: 'keyword_cluster',
        features: ['suspended', 'terminated', 'legal action', 'arrest', 'prosecution'],
        weight: 0.85,
        confidence: 0.85
      }
    ];

    defaults.forEach(pattern => {
      if (!this.patterns.has(pattern.id)) {
        this.patterns.set(pattern.id, pattern);
        this.weights.set(pattern.id, pattern.weight);
      }
    });
  }

  async loadWeights() {
    const stored = await chrome.storage.local.get('pattern_weights');
    if (stored.pattern_weights) {
      Object.entries(stored.pattern_weights).forEach(([id, weight]) => {
        this.weights.set(id, weight);
      });
    }
  }

  async savePatterns() {
    const patterns = Array.from(this.patterns.values());
    await chrome.storage.local.set({ learned_patterns: patterns });
  }

  async saveWeights() {
    const weights = Object.fromEntries(this.weights);
    await chrome.storage.local.set({ pattern_weights: weights });
  }

  analyzeMessage(message, metadata = {}) {
    const analysis = {
      score: 0,
      matchedPatterns: [],
      features: [],
      confidence: 0,
      recommendation: 'monitor'
    };

    // Extract features from message
    const features = this.extractFeatures(message, metadata);
    analysis.features = features;

    // Check against learned patterns
    this.patterns.forEach((pattern, patternId) => {
      const match = this.matchPattern(features, pattern);
      if (match.score > this.minConfidence) {
        analysis.matchedPatterns.push({
          id: patternId,
          type: pattern.type,
          score: match.score,
          weight: this.weights.get(patternId) || 0.5
        });
      }
    });

    // Calculate overall score
    if (analysis.matchedPatterns.length > 0) {
      const weightedSum = analysis.matchedPatterns.reduce((sum, pattern) =>
        sum + (pattern.score * pattern.weight), 0
      );
      const totalWeight = analysis.matchedPatterns.reduce((sum, pattern) =>
        sum + pattern.weight, 0
      );

      analysis.score = weightedSum / totalWeight;
      analysis.confidence = this.calculateConfidence(analysis.matchedPatterns);
    }

    // Determine recommendation
    if (analysis.score > 0.9) {
      analysis.recommendation = 'block';
    } else if (analysis.score > 0.7) {
      analysis.recommendation = 'warn';
    } else if (analysis.score > 0.5) {
      analysis.recommendation = 'monitor_closely';
    }

    return analysis;
  }

  extractFeatures(message, metadata) {
    const features = {
      keywords: [],
      urls: [],
      patterns: [],
      metrics: {},
      behavioral: []
    };

    const text = message.content || message.text || '';
    const lowerText = text.toLowerCase();

    // Extract keywords
    features.keywords = this.extractKeywords(lowerText);

    // Extract URLs
    features.urls = this.extractUrls(text);

    // Extract patterns
    features.patterns = this.extractPatterns(text);

    // Calculate metrics
    features.metrics = {
      length: text.length,
      wordCount: text.split(/\s+/).length,
      uppercaseRatio: (text.match(/[A-Z]/g) || []).length / text.length,
      punctuationCount: (text.match(/[!?]/g) || []).length,
      numberCount: (text.match(/\d+/g) || []).length,
      dollarSignCount: (text.match(/\$/g) || []).length
    };

    // Behavioral features
    if (metadata.responseTime) {
      features.behavioral.push({
        type: 'response_speed',
        value: metadata.responseTime < 1000 ? 'instant' : 'normal'
      });
    }

    if (metadata.messageCount) {
      features.behavioral.push({
        type: 'message_frequency',
        value: metadata.messageCount > 10 ? 'high' : 'normal'
      });
    }

    return features;
  }

  extractKeywords(text) {
    const keywords = [];
    const commonScamWords = [
      'urgent', 'verify', 'suspended', 'confirm', 'prize', 'winner',
      'congratulations', 'claim', 'refund', 'irs', 'tax', 'arrest',
      'legal', 'bitcoin', 'investment', 'guaranteed', 'risk free'
    ];

    commonScamWords.forEach(word => {
      if (text.includes(word)) {
        keywords.push(word);
      }
    });

    return keywords;
  }

  extractUrls(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex) || [];

    return urls.map(url => ({
      url,
      shortened: this.isShortened(url),
      suspicious: this.isSuspiciousUrl(url)
    }));
  }

  isShortened(url) {
    const shorteners = ['bit.ly', 'tinyurl.com', 'short.link', 'ow.ly', 'goo.gl'];
    return shorteners.some(shortener => url.includes(shortener));
  }

  isSuspiciousUrl(url) {
    // Check for typosquatting and suspicious patterns
    const suspicious = [
      'amaz0n', 'payp4l', 'mircosoft', 'goggle',
      'faceb00k', 'app1e', 'netf1ix'
    ];

    return suspicious.some(pattern => url.toLowerCase().includes(pattern));
  }

  extractPatterns(text) {
    const patterns = [];

    // Phone number pattern
    if (/[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,5}[-\s\.]?[0-9]{1,5}/.test(text)) {
      patterns.push('phone_number');
    }

    // Email pattern
    if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text)) {
      patterns.push('email_address');
    }

    // Money amount pattern
    if (/\$[\d,]+(\.\d{2})?/.test(text)) {
      patterns.push('money_amount');
    }

    // Verification code pattern
    if (/\b\d{4,6}\b/.test(text) && text.includes('code')) {
      patterns.push('verification_code');
    }

    return patterns;
  }

  matchPattern(features, pattern) {
    let score = 0;
    let matches = 0;

    if (pattern.type === 'keyword_cluster') {
      // Check how many keywords from the pattern are in the message
      pattern.features.forEach(keyword => {
        if (features.keywords.includes(keyword.toLowerCase())) {
          matches++;
        }
      });

      score = matches / pattern.features.length;
    } else if (pattern.type === 'url_pattern') {
      // Check URLs
      features.urls.forEach(urlInfo => {
        pattern.features.forEach(urlPattern => {
          if (urlInfo.url.includes(urlPattern)) {
            matches++;
          }
        });
      });

      score = matches > 0 ? 1 : 0;
    } else if (pattern.type === 'behavioral') {
      // Check behavioral patterns
      features.behavioral.forEach(behavior => {
        if (pattern.features.includes(behavior.type)) {
          matches++;
        }
      });

      score = matches / pattern.features.length;
    }

    return { score, matches };
  }

  calculateConfidence(matchedPatterns) {
    if (matchedPatterns.length === 0) return 0;

    // Confidence increases with more pattern matches
    const baseConfidence = matchedPatterns.reduce((sum, p) => sum + p.score, 0) / matchedPatterns.length;
    const diversityBonus = Math.min(matchedPatterns.length * 0.1, 0.3);

    return Math.min(baseConfidence + diversityBonus, 1);
  }

  async addPattern(messageData, scammerScore) {
    const features = this.extractFeatures(messageData);

    // Only learn from high-confidence scammer messages
    if (scammerScore < this.threshold) return;

    // Update weights for matched patterns (reinforcement)
    const analysis = this.analyzeMessage(messageData);
    analysis.matchedPatterns.forEach(pattern => {
      const currentWeight = this.weights.get(pattern.id) || 0.5;
      const newWeight = currentWeight + (this.learningRate * (scammerScore - currentWeight));
      this.weights.set(pattern.id, Math.min(newWeight, 1));
    });

    // Check if this represents a new pattern
    const novelty = this.calculateNovelty(features);
    if (novelty > 0.3) {
      await this.createNewPattern(features, scammerScore);
    }

    // Save updated weights
    await this.saveWeights();

    // Notify dashboard
    this.notifyLearning(features, scammerScore);
  }

  calculateNovelty(features) {
    // Check how different these features are from existing patterns
    let maxSimilarity = 0;

    this.patterns.forEach(pattern => {
      const match = this.matchPattern(features, pattern);
      maxSimilarity = Math.max(maxSimilarity, match.score);
    });

    return 1 - maxSimilarity;
  }

  async createNewPattern(features, confidence) {
    const id = `learned_${Date.now()}`;

    const newPattern = {
      id,
      type: 'learned',
      features: {
        keywords: features.keywords.slice(0, 10),
        patterns: features.patterns,
        metrics: features.metrics
      },
      weight: confidence * 0.7, // Start with lower weight
      confidence,
      learnedAt: new Date().toISOString(),
      occurrences: 1
    };

    this.patterns.set(id, newPattern);
    this.weights.set(id, newPattern.weight);

    await this.savePatterns();

    console.log('[PatternLearning] New pattern learned:', id);

    return newPattern;
  }

  async updateFromServer(serverPatterns) {
    let updated = 0;

    serverPatterns.forEach(serverPattern => {
      const existing = this.patterns.get(serverPattern.id);

      if (!existing || serverPattern.confidence > existing.confidence) {
        this.patterns.set(serverPattern.id, serverPattern);
        this.weights.set(serverPattern.id, serverPattern.weight);
        updated++;
      }
    });

    if (updated > 0) {
      await this.savePatterns();
      await this.saveWeights();
      console.log(`[PatternLearning] Updated ${updated} patterns from server`);
    }

    return updated;
  }

  async getPatterns() {
    return Array.from(this.patterns.values()).map(pattern => ({
      ...pattern,
      weight: this.weights.get(pattern.id) || 0.5,
      effectiveness: this.calculateEffectiveness(pattern.id)
    }));
  }

  calculateEffectiveness(patternId) {
    // Track how effective each pattern is at detecting scammers
    // This would be based on true/false positive rates in production
    const weight = this.weights.get(patternId) || 0.5;
    const pattern = this.patterns.get(patternId);

    if (!pattern) return 0;

    // Simple effectiveness score based on weight and confidence
    return (weight * 0.7 + (pattern.confidence || 0.5) * 0.3);
  }

  startPeriodicTraining() {
    // Decay weights periodically to adapt to changing patterns
    setInterval(() => {
      this.decayWeights();
    }, 6 * 60 * 60 * 1000); // Every 6 hours
  }

  async decayWeights() {
    let decayed = 0;

    this.weights.forEach((weight, patternId) => {
      // Don't decay core patterns below minimum
      const pattern = this.patterns.get(patternId);
      const minWeight = pattern && pattern.type !== 'learned' ? 0.5 : 0.1;

      const newWeight = Math.max(weight * this.decayRate, minWeight);
      if (newWeight !== weight) {
        this.weights.set(patternId, newWeight);
        decayed++;
      }
    });

    if (decayed > 0) {
      await this.saveWeights();
      console.log(`[PatternLearning] Decayed ${decayed} pattern weights`);
    }
  }

  async exportPatterns() {
    const patterns = await this.getPatterns();

    return {
      version: '1.0',
      timestamp: new Date().toISOString(),
      patterns: patterns.sort((a, b) => b.effectiveness - a.effectiveness),
      statistics: {
        total: patterns.length,
        learned: patterns.filter(p => p.type === 'learned').length,
        averageConfidence: patterns.reduce((sum, p) => sum + (p.confidence || 0), 0) / patterns.length
      }
    };
  }

  notifyLearning(features, score) {
    // Notify dashboard about learning event
    chrome.runtime.sendMessage({
      type: 'DASHBOARD_UPDATE',
      data: {
        event: 'pattern_learned',
        features: features.keywords.slice(0, 5),
        score,
        timestamp: new Date().toISOString()
      }
    }).catch(() => {
      // Dashboard might not be open
    });
  }

  async resetLearning() {
    // Reset to default patterns only
    this.patterns.clear();
    this.weights.clear();
    this.loadDefaultPatterns();

    await this.savePatterns();
    await this.saveWeights();

    console.log('[PatternLearning] Reset to default patterns');
  }
}

// Export for use in service worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PatternLearning;
}