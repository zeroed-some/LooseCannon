#!/bin/bash

# LooseCannon Full System Launch Script
# Because clicking buttons is for mortals

echo "========================================="
echo "    LooseCannon v0.3.0 Launch Sequence"
echo "========================================="
echo ""

# Check for dependencies
check_dependency() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ $1 is not installed"
        return 1
    else
        echo "✓ $1 found"
        return 0
    fi
}

echo "Checking dependencies..."
check_dependency node
NODE_OK=$?
check_dependency ollama
OLLAMA_OK=$?
check_dependency firefox
FIREFOX_OK=$?

echo ""

# Start Ollama if not running
if [ $OLLAMA_OK -eq 0 ]; then
    if ! pgrep -x "ollama" > /dev/null; then
        echo "Starting Ollama..."
        ollama serve &
        sleep 2
    else
        echo "Ollama already running"
    fi
else
    echo "⚠️  Ollama not found - AI responses will use fallbacks"
fi

# Start the server
if [ $NODE_OK -eq 0 ]; then
    echo "Starting LooseCannon server..."
    npm start &
    SERVER_PID=$!
    sleep 3
else
    echo "❌ Cannot start server without Node.js"
    exit 1
fi

# Open dashboard
echo "Opening analytics dashboard..."
if command -v open &> /dev/null; then
    open dashboard/index.html
elif command -v xdg-open &> /dev/null; then
    xdg-open dashboard/index.html
else
    echo "Open dashboard/index.html in your browser"
fi

# Launch Firefox with extension
if [ $FIREFOX_OK -eq 0 ]; then
    echo "Launching Firefox with LooseCannon extension..."
    npm run dev:extension &
    FIREFOX_PID=$!
else
    echo "⚠️  Firefox not found - manually load extension"
fi

echo ""
echo "========================================="
echo "    LooseCannon Systems Online"
echo "========================================="
echo ""
echo "Server:    http://localhost:8765"
echo "Dashboard: file://$(pwd)/dashboard/index.html"
echo "Extension: Load in Firefox/Chrome"
echo ""
echo "Targets:"
echo "  • WhatsApp Web: https://web.whatsapp.com"
echo "  • Telegram Web: https://web.telegram.org"
echo "  • Messenger:    https://messenger.com"
echo ""
echo "Press Ctrl+C to shutdown all systems"
echo ""
echo "Happy hunting! 🎯"
echo ""

# Wait for interrupt
wait

# Cleanup
echo "Shutting down..."
kill $SERVER_PID 2>/dev/null
kill $FIREFOX_PID 2>/dev/null
echo "Goodbye!"