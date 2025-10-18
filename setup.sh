#!/bin/bash

# LooseCannon Setup Script
# This script helps set up the development environment

echo "╔══════════════════════════════════════╗"
echo "║     LooseCannon Setup Script         ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Check for Node.js
echo "Checking for Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
else
    NODE_VERSION=$(node -v)
    echo "✅ Node.js found: $NODE_VERSION"
fi

# Check for npm
echo "Checking for npm..."
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed!"
    exit 1
else
    NPM_VERSION=$(npm -v)
    echo "✅ npm found: $NPM_VERSION"
fi

# Check for Ollama
echo ""
echo "Checking for Ollama..."
if ! command -v ollama &> /dev/null; then
    echo "⚠️  Ollama is not installed!"
    echo "Install from: https://ollama.ai"
    echo "After installing, run: ollama pull llama2"
    OLLAMA_MISSING=true
else
    echo "✅ Ollama found"
    echo "Available models:"
    ollama list 2>/dev/null || echo "  (Ollama service not running)"
fi

# Install npm dependencies
echo ""
echo "Installing npm dependencies..."
npm install

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo ""
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "✅ Created .env file (edit this to configure)"
fi

# Check Firefox
echo ""
echo "Checking for Firefox..."
if command -v firefox &> /dev/null; then
    echo "✅ Firefox found"
else
    echo "⚠️  Firefox not found - you'll need it to test the extension"
fi

# Instructions
echo ""
echo "╔══════════════════════════════════════╗"
echo "║         Setup Complete!              ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo ""

if [ "$OLLAMA_MISSING" = true ]; then
    echo "1. Install Ollama from https://ollama.ai"
    echo "2. Run: ollama pull llama2"
    echo "3. Run: ollama serve"
    echo ""
fi

echo "To start development:"
echo "  1. Terminal 1: npm run dev:server  (starts local server)"
echo "  2. Terminal 2: npm run dev:extension  (loads Firefox with extension)"
echo ""
echo "Or manually load the extension:"
echo "  1. Open Firefox"
echo "  2. Navigate to about:debugging"
echo "  3. Click 'This Firefox'"
echo "  4. Click 'Load Temporary Add-on'"
echo "  5. Select extension/manifest.json"
echo ""
echo "⚠️  Remember: This tool may violate platform ToS. Use responsibly!"
echo ""