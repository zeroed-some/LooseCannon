// LooseCannon Local Server
// Handles communication between browser extension and Ollama LLM

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8765;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// Middleware
app.use(cors());
app.use(express.json());

// In-memory conversation store (could be replaced with DB)
const conversations = new Map();

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
      temperature: 0.9,
      examples: [
        'Oh hello dear! Is this the Facebook? My grandson Jimmy set this up for me...',
        'I don\'t understand these computer things. Back in my day, we wrote letters!'
      ]
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

// Generate response using Ollama
async function generateResponse(message, personality, chatId) {
  try {
    const personalityConfig = personalities[personality] || personalities.default;

    // Get conversation history
    let conversationHistory = conversations.get(chatId) || [];

    // Build prompt with personality and history
    const systemMessage = personalityConfig.systemPrompt;
    const contextMessages = conversationHistory.slice(-10); // Last 10 messages for context

    // Create the prompt
    const prompt = `${systemMessage}\n\nConversation history:\n${contextMessages.map(m => `${m.role}: ${m.content}`).join('\n')}\n\nScammer: ${message}\nYou:`;

    // Call Ollama API
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: process.env.OLLAMA_MODEL || 'llama2',
      prompt: prompt,
      temperature: personalityConfig.temperature || 0.8,
      max_tokens: 150,
      stream: false
    });

    const reply = response.data.response;

    // Update conversation history
    conversationHistory.push(
      { role: 'scammer', content: message },
      { role: 'you', content: reply }
    );
    conversations.set(chatId, conversationHistory);

    return reply;
  } catch (error) {
    console.error('Error generating response:', error);

    // Fallback responses if Ollama fails
    const fallbacks = [
      "I'm sorry, what did you say? My hearing isn't what it used to be.",
      "Can you explain that again? These modern things confuse me.",
      "Oh dear, I think I clicked the wrong button. What were we talking about?",
      "That reminds me of a story from 1973... wait, what were you saying?"
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
    ollamaConnected,
    personalities: Object.values(personalities).map(p => ({
      id: p.id,
      name: p.name
    }))
  });
});

// Generate response
app.post('/generate', async (req, res) => {
  const { message, personality = 'default', chatId = 'unknown', timestamp } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  console.log(`[${new Date().toISOString()}] Generating response for chat ${chatId}`);
  console.log(`Incoming message: ${message}`);

  try {
    const reply = await generateResponse(message, personality, chatId);
    console.log(`Generated reply: ${reply}`);

    res.json({
      reply,
      personality,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in /generate:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// Get conversation history
app.get('/conversations/:chatId', (req, res) => {
  const { chatId } = req.params;
  const history = conversations.get(chatId) || [];
  res.json({ chatId, history });
});

// Clear conversation history
app.delete('/conversations/:chatId', (req, res) => {
  const { chatId } = req.params;
  conversations.delete(chatId);
  res.json({ message: 'Conversation cleared' });
});

// Get personalities
app.get('/personalities', (req, res) => {
  res.json(Object.values(personalities));
});

// Start server
async function start() {
  await loadPersonalities();
  await checkOllamaConnection();

  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║         LooseCannon Server           ║
║        Listening on port ${PORT}        ║
╠══════════════════════════════════════╣
║  Extension: Connect to               ║
║  http://localhost:${PORT}              ║
║                                      ║
║  Ollama: ${OLLAMA_URL.padEnd(28)} ║
╚══════════════════════════════════════╝

Ready to confuse scammers! 🤖
    `);
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down LooseCannon server...');
  process.exit(0);
});

start();