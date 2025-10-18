// Conversation State Manager for LooseCannon (ES Module)
// Handles sophisticated conversation tracking and context management

export class ConversationManager {
  constructor() {
    this.conversations = new Map();
    this.scammerDatabase = new Map();
    this.responseHistory = new Map();
  }

  getConversation(chatId, platform = 'whatsapp') {
    const key = `${platform}:${chatId}`;

    if (!this.conversations.has(key)) {
      this.conversations.set(key, {
        id: key,
        platform,
        chatId,
        startTime: new Date(),
        messages: [],
        context: {
          scammerScore: 0,
          personality: 'default',
          responseCount: 0,
          lastResponse: null,
          detectedPatterns: [],
          extractedInfo: {
            phoneNumbers: [],
            emails: [],
            links: [],
            bankMentions: 0,
            moneyRequests: 0
          }
        },
        state: 'active',
        metadata: {}
      });
    }

    return this.conversations.get(key);
  }

  addMessage(chatId, message, platform = 'whatsapp') {
    const conversation = this.getConversation(chatId, platform);

    const enrichedMessage = {
      ...message,
      timestamp: new Date(),
      analysis: this.analyzeMessage(message),
      platform
    };

    conversation.messages.push(enrichedMessage);
    this.updateContext(conversation, enrichedMessage);

    if (conversation.messages.length > 50) {
      conversation.messages = conversation.messages.slice(-50);
    }

    return conversation;
  }

  analyzeMessage(message) {
    const analysis = {
      sentiment: 'neutral',
      urgency: 0,
      suspicion: 0,
      topics: [],
      entities: [],
      intent: 'unknown'
    };

    const content = (message.content || '').toLowerCase();

    // Urgency detection
    const urgencyWords = ['urgent', 'immediately', 'now', 'quick', 'fast', 'hurry', 'asap', 'expire'];
    urgencyWords.forEach(word => {
      if (content.includes(word)) analysis.urgency += 0.2;
    });

    // Suspicion detection
    const suspiciousWords = [
      'prize', 'winner', 'claim', 'verify', 'suspended', 'confirm',
      'bitcoin', 'gift card', 'wire', 'transfer', 'payment'
    ];
    suspiciousWords.forEach(word => {
      if (content.includes(word)) analysis.suspicion += 0.15;
    });

    // Topic extraction
    if (content.includes('tech') || content.includes('computer')) {
      analysis.topics.push('technology');
    }
    if (content.includes('money') || content.includes('payment') || content.includes('$')) {
      analysis.topics.push('financial');
    }
    if (content.includes('account') || content.includes('password')) {
      analysis.topics.push('account_security');
    }

    // Intent detection
    if (content.includes('?')) {
      analysis.intent = 'question';
    } else if (content.includes('please') || content.includes('need')) {
      analysis.intent = 'request';
    } else if (content.includes('!')) {
      analysis.intent = 'emphasis';
    }

    // Extract entities
    if (message.metadata) {
      if (message.metadata.phoneNumbers) {
        analysis.entities.push(...message.metadata.phoneNumbers.map(p => ({ type: 'phone', value: p })));
      }
      if (message.metadata.emails) {
        analysis.entities.push(...message.metadata.emails.map(e => ({ type: 'email', value: e })));
      }
    }

    return analysis;
  }

  updateContext(conversation, message) {
    const context = conversation.context;
    const analysis = message.analysis;

    context.scammerScore = Math.min(
      1.0,
      context.scammerScore + (analysis.suspicion * 0.3) + (analysis.urgency * 0.2)
    );

    if (analysis.suspicion > 0.5) {
      context.detectedPatterns.push({
        type: 'suspicious',
        timestamp: message.timestamp,
        confidence: analysis.suspicion
      });
    }

    if (analysis.entities.length > 0) {
      analysis.entities.forEach(entity => {
        if (entity.type === 'phone' && !context.extractedInfo.phoneNumbers.includes(entity.value)) {
          context.extractedInfo.phoneNumbers.push(entity.value);
        }
        if (entity.type === 'email' && !context.extractedInfo.emails.includes(entity.value)) {
          context.extractedInfo.emails.push(entity.value);
        }
      });
    }

    if (analysis.topics.includes('financial')) {
      context.extractedInfo.moneyRequests++;
    }

    if (context.scammerScore > 0.8) {
      this.addToScammerDatabase(conversation);
    }
  }

  generateContextSummary(chatId, platform = 'whatsapp') {
    const conversation = this.getConversation(chatId, platform);
    const context = conversation.context;
    const recentMessages = conversation.messages.slice(-10);

    return {
      conversationLength: conversation.messages.length,
      scammerScore: context.scammerScore,
      detectedPatterns: context.detectedPatterns.slice(-5),
      recentTopics: this.extractRecentTopics(recentMessages),
      extractedInfo: {
        hasPhoneNumbers: context.extractedInfo.phoneNumbers.length > 0,
        hasEmails: context.extractedInfo.emails.length > 0,
        hasLinks: context.extractedInfo.links.length > 0,
        financialMentions: context.extractedInfo.moneyRequests
      },
      conversationTone: this.determineConversationTone(recentMessages),
      suggestedStrategy: this.suggestStrategy(context)
    };
  }

  extractRecentTopics(messages) {
    const topicCounts = {};

    messages.forEach(msg => {
      if (msg.analysis && msg.analysis.topics) {
        msg.analysis.topics.forEach(topic => {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        });
      }
    });

    return Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([topic]) => topic);
  }

  determineConversationTone(messages) {
    let urgencySum = 0;
    let suspicionSum = 0;
    let count = 0;

    messages.forEach(msg => {
      if (msg.analysis) {
        urgencySum += msg.analysis.urgency || 0;
        suspicionSum += msg.analysis.suspicion || 0;
        count++;
      }
    });

    if (count === 0) return 'neutral';

    const avgUrgency = urgencySum / count;
    const avgSuspicion = suspicionSum / count;

    if (avgUrgency > 0.6) return 'urgent';
    if (avgSuspicion > 0.6) return 'suspicious';
    if (avgUrgency > 0.3 && avgSuspicion > 0.3) return 'aggressive';

    return 'casual';
  }

  suggestStrategy(context) {
    if (context.scammerScore > 0.8) {
      return 'maximum_confusion';
    } else if (context.scammerScore > 0.6) {
      return 'waste_time';
    } else if (context.extractedInfo.moneyRequests > 0) {
      return 'play_poor';
    } else if (context.detectedPatterns.some(p => p.type === 'suspicious')) {
      return 'ask_questions';
    }

    return 'be_confused';
  }

  addToScammerDatabase(conversation) {
    const identifier = conversation.chatId;

    if (!this.scammerDatabase.has(identifier)) {
      this.scammerDatabase.set(identifier, {
        firstSeen: new Date(),
        lastSeen: new Date(),
        platforms: new Set([conversation.platform]),
        encounters: 1,
        patterns: [],
        extractedInfo: { ...conversation.context.extractedInfo }
      });
    } else {
      const entry = this.scammerDatabase.get(identifier);
      entry.lastSeen = new Date();
      entry.encounters++;
      entry.platforms.add(conversation.platform);

      conversation.context.extractedInfo.phoneNumbers.forEach(phone => {
        if (!entry.extractedInfo.phoneNumbers.includes(phone)) {
          entry.extractedInfo.phoneNumbers.push(phone);
        }
      });
    }
  }

  getResponseSuggestions(chatId, platform = 'whatsapp') {
    const conversation = this.getConversation(chatId, platform);
    const context = conversation.context;
    const lastMessages = conversation.messages.slice(-3);

    const suggestions = [];

    if (lastMessages.some(m => m.analysis && m.analysis.topics.includes('account_security'))) {
      suggestions.push({
        strategy: 'deflect',
        response: "Oh dear, I always forget these things. Let me ask my grandson...",
        delay: 5000
      });
    }

    if (context.conversationTone === 'urgent') {
      suggestions.push({
        strategy: 'slow_down',
        response: "Hold on, I need to find my glasses first. Everything is so blurry...",
        delay: 8000
      });
    }

    if (context.extractedInfo.moneyRequests > 0) {
      suggestions.push({
        strategy: 'confusion',
        response: "Money? Is this about the church fundraiser? I already donated last week.",
        delay: 4000
      });
    }

    return suggestions;
  }

  exportConversation(chatId, platform = 'whatsapp') {
    const conversation = this.getConversation(chatId, platform);

    return {
      id: conversation.id,
      platform: conversation.platform,
      startTime: conversation.startTime,
      endTime: new Date(),
      messageCount: conversation.messages.length,
      scammerScore: conversation.context.scammerScore,
      detectedPatterns: conversation.context.detectedPatterns,
      extractedInfo: conversation.context.extractedInfo,
      messages: conversation.messages.map(m => ({
        timestamp: m.timestamp,
        sender: m.sender || 'unknown',
        content: m.content,
        type: m.type,
        analysis: m.analysis
      }))
    };
  }

  getStatistics() {
    const stats = {
      totalConversations: this.conversations.size,
      activeConversations: 0,
      suspiciousConversations: 0,
      confirmedScammers: this.scammerDatabase.size,
      platformBreakdown: {},
      totalMessages: 0
    };

    this.conversations.forEach(conv => {
      if (conv.state === 'active') stats.activeConversations++;
      if (conv.context.scammerScore > 0.6) stats.suspiciousConversations++;

      stats.platformBreakdown[conv.platform] =
        (stats.platformBreakdown[conv.platform] || 0) + 1;

      stats.totalMessages += conv.messages.length;
    });

    return stats;
  }

  cleanup(maxAge = 24 * 60 * 60 * 1000) {
    const now = new Date();
    const toDelete = [];

    this.conversations.forEach((conv, key) => {
      const age = now - conv.startTime;
      if (age > maxAge && conv.state !== 'active') {
        toDelete.push(key);
      }
    });

    toDelete.forEach(key => {
      this.conversations.delete(key);
    });

    console.log(`[ConversationManager] Cleaned up ${toDelete.length} old conversations`);
  }
}