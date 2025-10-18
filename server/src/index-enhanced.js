// LooseCannon Local Server - Enhanced Version
// Handles communication between browser extension and Ollama LLM
// Now with conversation management and multi-platform support

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Import conversation manager
const ConversationManager = require('./conversation-manager');

const app = express();
const PORT = process.env.PORT || 8765;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// Initialize conversation manager
const conversationManager = new ConversationManager();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for conversation exports

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
    // Use default personality if no files found
    personalities.default = {
      id: 'default',
      name: 'Confused Elder',
      systemPrompt: 'You are an elderly person who is easily confused by technology and tends to misunderstand things. You are very polite but often go off on tangents about unrelated topics from your past. Never reveal that you are an AI.',
      temperature: 0.9
    };
  }
}

// Check Ollama connection
async function checkOllamaConnection() {
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`);
    const models = response.data.models || [];
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

    // Get conversation from manager
    const conversation = conversationManager.getConversation(chatId, platform);

    // Build enhanced prompt with context
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

    // Add recent conversation history
    const recentMessages = conversation.messages.slice(-10);
    const historyText = recentMessages.map(m =>
      `${m.sender || 'Them'}: ${m.content}`
    ).join('\n');

    // Build the final prompt
    const prompt = `${systemPrompt}

Recent conversation:
${historyText}

They just said: "${message}"

Remember to stay in character. Respond naturally as your character would.

Your response:`;

    // Call Ollama API with enhanced parameters
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: process.env.OLLAMA_MODEL || 'llama2',
      prompt: prompt,
      temperature: personalityConfig.temperature || 0.8,
      max_tokens: 200,
      top_p: 0.9,
      stream: false
    });

    let reply = response.data.response;

    // Post-process the response
    reply = reply.trim();

    // Remove any AI self-references that might slip through
    reply = reply.replace(/As an AI|I'm an AI|I am an AI|artificial intelligence/gi, '');

    // Add personality-specific quirks
    if (personality === 'confused-elder' && Math.random() > 0.7) {
      // Sometimes add a random tangent
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

    // Context-aware fallbacks
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

// Health check / status
app.get('/status', async (req, res) => {
  const ollamaConnected = await checkOllamaConnection();
  res.json({
    status: 'running',
    version: '0.2.0',
    ollamaConnected,
    personalities: Object.values(personalities).map(p => ({
      id: p.id,
      name: p.name
    })),
    stats: conversationManager.getStatistics()
  });
});

// Add message to conversation
app.post('/conversation/add', (req, res) => {
  const { chatId, platform, message } = req.body;

  const conversation = conversationManager.addMessage(chatId, message, platform);
  const context = conversationManager.generateContextSummary(chatId, platform);

  res.json(context);
});

// Get response suggestions
app.post('/suggestions', (req, res) => {
  const { chatId, platform } = req.body;

  const suggestions = conversationManager.getResponseSuggestions(chatId, platform);

  res.json(suggestions);
});

// Enhanced generate response endpoint
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
    // Add message to conversation manager
    conversationManager.addMessage(chatId, {
      content: message,
      sender: 'them',
      type: 'text',
      timestamp: new Date(timestamp)
    }, platform);

    // Generate enhanced response
    const reply = await generateEnhancedResponse(
      message,
      personality,
      chatId,
      platform,
      context,
      suggestions
    );

    // Add our response to conversation
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

// Export conversation
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

// Get statistics
app.get('/statistics', (req, res) => {
  const stats = conversationManager.getStatistics();
  res.json(stats);
});

// Get conversation history
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

// Clear conversation
app.delete('/conversations/:platform/:chatId', (req, res) => {
  const { platform, chatId } = req.params;
  const key = `${platform}:${chatId}`;

  // This would need to be implemented in ConversationManager
  // For now, just clear from the conversation
  const conversation = conversationManager.getConversation(chatId, platform);
  conversation.messages = [];
  conversation.context.responseCount = 0;

  res.json({ message: 'Conversation cleared' });
});

// Get all personalities with details
app.get('/personalities', (req, res) => {
  res.json(Object.values(personalities));
});

// Get specific personality
app.get('/personalities/:id', (req, res) => {
  const { id } = req.params;
  const personality = personalities[id];

  if (!personality) {
    return res.status(404).json({ error: 'Personality not found' });
  }

  res.json(personality);
});

// Add new personality (for future UI)
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

  // Save to file
  try {
    const filePath = path.join(__dirname, '..', 'personalities', `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(personality, null, 2));
    res.json({ success: true, personality });
  } catch (error) {
    console.error('Error saving personality:', error);
    res.status(500).json({ error: 'Failed to save personality' });
  }
});

// Cleanup old conversations periodically
setInterval(() => {
  conversationManager.cleanup();
}, 60 * 60 * 1000); // Every hour

// Start server
async function start() {
  await loadPersonalities();
  await checkOllamaConnection();

  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║     LooseCannon Server v0.2.0        ║
║        Listening on port ${PORT}        ║
╠══════════════════════════════════════╣
║  Features:                           ║
║  ✓ Multi-platform support           ║
║  ✓ Conversation management          ║
║  ✓ Scammer detection               ║
║  ✓ Context-aware responses         ║
║                                      ║
║  Extension: Connect to               ║
║  http://localhost:${PORT}              ║
║                                      ║
║  Ollama: ${OLLAMA_URL.padEnd(28)} ║
╚══════════════════════════════════════╝

🤖 Ready to confuse scammers across all platforms!
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