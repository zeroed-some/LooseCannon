// LooseCannon Local Server - Enhanced Version (ES Modules)
// Handles communication between browser extension and Ollama LLM
// Now with conversation management and multi-platform support

import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { ConversationManager } from './conversation-manager.mjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8765;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// Initialize conversation manager
const conversationManager = new ConversationManager();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Load personalities from files
let personalities = {};

async function loadPersonalities() {
  try {
    const personalitiesDir = path.join(__dirname, '..', 'personalities');
    const files = await fs.readdir(personalitiesDir);

    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await fs.readFile(path.join(personalitiesDir, file), 'utf8');
        const personality = JSON.parse(content);
        personalities[personality.id] = personality;
        console.log(`Loaded personality: ${personality.name}`);
      }
    }
  } catch (error) {
    console.warn('Could not load personalities:', error);
    personalities.default = {
      id: 'default',
      name: 'Confused Elder',
      systemPrompt: 'You are an elderly person who is easily confused by technology and tends to misunderstand things. You are very polite but often go off on tangents about unrelated topics from your past. Never reveal that you are an AI.',
      temperature: 0.9
    };
  }
}

// Fetch wrapper for Ollama API with better error handling
async function fetchOllama(endpoint, options = {}) {
  try {
    const response = await fetch(`${OLLAMA_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Ollama fetch error:', error);
    throw error;
  }
}

// Check Ollama connection
async function checkOllamaConnection() {
  try {
    const data = await fetchOllama('/api/tags');
    const models = data.models || [];
    console.log('Connected to Ollama. Available models:', models.map(m => m.name).join(', '));
    return true;
  } catch (error) {
    console.error('Failed to connect to Ollama:', error.message);
    console.log('Make sure Ollama is running: ollama serve');
    return false;
  }
}

// Enhanced response generation with context awareness
async function generateEnhancedResponse(message, personality, chatId, platform, context, suggestions) {
  try {
    const personalityConfig = personalities[personality] || personalities.default;
    const conversation = conversationManager.getConversation(chatId, platform);

    let systemPrompt = personalityConfig.systemPrompt;

    // Add strategy modifiers based on context
    if (context && context.suggestedStrategy) {
      switch (context.suggestedStrategy) {
        case 'maximum_confusion':
          systemPrompt += '\n\nBe EXTREMELY confused and misunderstand everything. Mix up basic concepts.';
          break;
        case 'waste_time':
          systemPrompt += '\n\nAsk lots of clarifying questions. Pretend to not understand simple instructions.';
          break;
        case 'play_poor':
          systemPrompt += '\n\nMention that you have no money and are struggling financially.';
          break;
        case 'ask_questions':
          systemPrompt += '\n\nBe very curious and ask lots of questions about everything they say.';
          break;
      }
    }

    const recentMessages = conversation.messages.slice(-10);
    const historyText = recentMessages.map(m =>
      `${m.sender || 'Them'}: ${m.content}`
    ).join('\n');

    const prompt = `${systemPrompt}

Recent conversation:
${historyText}

They just said: "${message}"

Remember to stay in character. Respond naturally as your character would.

Your response:`;

    const response = await fetchOllama('/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'llama2',
        prompt: prompt,
        temperature: personalityConfig.temperature || 0.8,
        options: {
          num_predict: 200,
          top_p: 0.9,
          stop: ["\n\n", "Them:", "They said:"]
        },
        stream: false
      })
    });

    let reply = response.response;
    reply = reply.trim();
    reply = reply.replace(/As an AI|I'm an AI|I am an AI|artificial intelligence/gi, '');

    // Add personality quirks
    if (personality === 'confused-elder' && Math.random() > 0.7) {
      const tangents = [
        ' Wait, this reminds me of something that happened in 1987...',
        ' Oh, my cat is meowing. One second dear.',
        ' Where did I put my glasses?'
      ];
      reply += tangents[Math.floor(Math.random() * tangents.length)];
    }

    return reply;
  } catch (error) {
    console.error('Error generating enhanced response:', error);

    const fallbacks = suggestions && suggestions.length > 0
      ? suggestions.map(s => s.response)
      : [
          "I'm sorry, what did you say? I'm having trouble with this computer.",
          "Can you explain that again? These modern things confuse me.",
          "Oh dear, I think I clicked the wrong button. What were we talking about?"
        ];

    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}

// Routes

app.get('/status', async (req, res) => {
  const ollamaConnected = await checkOllamaConnection();
  res.json({
    status: 'running',
    version: '0.3.1',
    ollamaConnected,
    personalities: Object.values(personalities).map(p => ({
      id: p.id,
      name: p.name
    })),
    stats: conversationManager.getStatistics()
  });
});

app.post('/conversation/add', (req, res) => {
  const { chatId, platform, message } = req.body;
  const conversation = conversationManager.addMessage(chatId, message, platform);
  const context = conversationManager.generateContextSummary(chatId, platform);
  res.json(context);
});

app.post('/suggestions', (req, res) => {
  const { chatId, platform } = req.body;
  const suggestions = conversationManager.getResponseSuggestions(chatId, platform);
  res.json(suggestions);
});

app.post('/generate', async (req, res) => {
  const {
    message,
    personality = 'default',
    chatId = 'unknown',
    platform = 'whatsapp',
    context,
    suggestions,
    timestamp
  } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  console.log(`[${new Date().toISOString()}] Generating response for ${platform}:${chatId}`);

  try {
    conversationManager.addMessage(chatId, {
      content: message,
      sender: 'them',
      type: 'text',
      timestamp: new Date(timestamp)
    }, platform);

    const reply = await generateEnhancedResponse(
      message,
      personality,
      chatId,
      platform,
      context,
      suggestions
    );

    conversationManager.addMessage(chatId, {
      content: reply,
      sender: 'us',
      type: 'text',
      timestamp: new Date()
    }, platform);

    console.log(`Generated reply: ${reply}`);

    res.json({
      reply,
      personality,
      timestamp: new Date().toISOString(),
      context: conversationManager.generateContextSummary(chatId, platform)
    });
  } catch (error) {
    console.error('Error in /generate:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

app.post('/conversation/export', (req, res) => {
  const { chatId, platform = 'whatsapp' } = req.body;

  try {
    const exportData = conversationManager.exportConversation(chatId, platform);
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting conversation:', error);
    res.status(500).json({ error: 'Failed to export conversation' });
  }
});

app.get('/statistics', (req, res) => {
  const stats = conversationManager.getStatistics();
  res.json(stats);
});

app.get('/conversations/:platform/:chatId', (req, res) => {
  const { platform, chatId } = req.params;
  const conversation = conversationManager.getConversation(chatId, platform);

  res.json({
    chatId,
    platform,
    messages: conversation.messages,
    context: conversation.context,
    state: conversation.state
  });
});

app.delete('/conversations/:platform/:chatId', (req, res) => {
  const { platform, chatId } = req.params;
  const conversation = conversationManager.getConversation(chatId, platform);
  conversation.messages = [];
  conversation.context.responseCount = 0;
  res.json({ message: 'Conversation cleared' });
});

app.get('/personalities', (req, res) => {
  res.json(Object.values(personalities));
});

app.get('/personalities/:id', (req, res) => {
  const { id } = req.params;
  const personality = personalities[id];

  if (!personality) {
    return res.status(404).json({ error: 'Personality not found' });
  }

  res.json(personality);
});

app.post('/personalities', async (req, res) => {
  const { id, name, systemPrompt, temperature } = req.body;

  if (!id || !name || !systemPrompt) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const personality = {
    id,
    name,
    systemPrompt,
    temperature: temperature || 0.8
  };

  personalities[id] = personality;

  try {
    const filePath = path.join(__dirname, '..', 'personalities', `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(personality, null, 2));
    res.json({ success: true, personality });
  } catch (error) {
    console.error('Error saving personality:', error);
    res.status(500).json({ error: 'Failed to save personality' });
  }
});

app.post('/test-personality', async (req, res) => {
  const { systemPrompt, temperature, message } = req.body;

  try {
    const testPersonality = {
      systemPrompt,
      temperature: temperature || 0.8
    };

    personalities.test = testPersonality;

    const reply = await generateEnhancedResponse(
      message,
      'test',
      'test-chat',
      'test',
      {},
      []
    );

    res.json({ response: reply });
  } catch (error) {
    console.error('Error testing personality:', error);
    res.status(500).json({ error: 'Test failed' });
  }
});

app.post('/emergency-stop', (req, res) => {
  console.log('EMERGENCY STOP ACTIVATED');
  conversationManager.conversations.clear();
  res.json({ message: 'All sessions stopped' });
});

app.get('/analytics', (req, res) => {
  const stats = conversationManager.getStatistics();
  res.json({
    totalMessages: stats.totalMessages,
    scammersDetected: stats.confirmedScammers,
    ...stats
  });
});

app.get('/conversations/active', (req, res) => {
  const conversations = Array.from(conversationManager.conversations.values())
    .filter(conv => conv.state === 'active')
    .map(conv => ({
      id: conv.id,
      platform: conv.platform,
      chatId: conv.chatId,
      messageCount: conv.messages.length,
      scammerScore: conv.context.scammerScore,
      duration: Date.now() - new Date(conv.startTime).getTime()
    }));

  res.json(conversations);
});

app.get('/patterns', (req, res) => {
  // Return some example patterns for now
  res.json([
    { id: 'urgent', type: 'keyword', occurrences: 42, verified: true },
    { id: 'money_request', type: 'pattern', occurrences: 31, verified: true },
    { id: 'verification', type: 'keyword', occurrences: 28, verified: false }
  ]);
});

app.post('/patterns/sync', (req, res) => {
  // Placeholder for pattern sync
  res.json([]);
});

app.post('/analytics/sync', (req, res) => {
  // Placeholder for analytics sync
  res.json({ success: true });
});

// Cleanup old conversations periodically
setInterval(() => {
  conversationManager.cleanup();
}, 60 * 60 * 1000);

// Start server
async function start() {
  await loadPersonalities();
  await checkOllamaConnection();

  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║     LooseCannon Server v0.3.1        ║
║        Listening on port ${PORT}        ║
╠══════════════════════════════════════╣
║  Features:                           ║
║  ✓ Multi-platform support           ║
║  ✓ Conversation management          ║
║  ✓ Scammer detection               ║
║  ✓ Context-aware responses         ║
║  ✓ Modern dependencies             ║
║                                      ║
║  Extension: Connect to               ║
║  http://localhost:${PORT}              ║
║                                      ║
║  Ollama: ${OLLAMA_URL.padEnd(28)} ║
╚══════════════════════════════════════╝

Ready to confuse scammers across all platforms!
    `);
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down LooseCannon server...');
  console.log('Statistics:', conversationManager.getStatistics());
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

start();