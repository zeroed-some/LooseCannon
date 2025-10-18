# LooseCannon 🤖

Automated scambaiting assistant that integrates with messaging platforms to waste scammers' time using local LLMs.

## ⚠️ Legal Disclaimer

This tool is for educational and defensive security purposes only. Use responsibly and be aware that automation may violate platform Terms of Service. Your account could be banned.

## Features

- 🦊 Firefox browser extension
- 💬 WhatsApp Web integration (more platforms coming)
- 🤖 Local LLM support via Ollama
- 🎭 Multiple scambaiter personalities
- 🛑 Emergency stop functionality
- 📊 Conversation logging

## Project Structure

```
LooseCannon/
├── extension/          # Firefox browser extension
│   ├── manifest.json
│   ├── content-scripts/
│   ├── background/
│   └── popup/
├── server/            # Local server for LLM integration
│   ├── src/
│   └── personalities/
└── package.json
```

## Quick Start

### Prerequisites

1. **Ollama** - Install from https://ollama.ai
2. **Node.js** - Version 18+ recommended
3. **Firefox Developer Edition** (recommended for extension development)

### Installation

1. Clone the repository:
```bash
cd ~/Documents/GithubOrgs/zeroed-some/LooseCannon
```

2. Install dependencies:
```bash
npm install
```

3. Start Ollama with a model:
```bash
ollama pull llama2
ollama serve
```

4. Start the local server:
```bash
npm run dev:server
```

5. Load the extension in Firefox:
```bash
npm run dev:extension
```

Or manually:
- Open Firefox and navigate to `about:debugging`
- Click "This Firefox"
- Click "Load Temporary Add-on"
- Select `extension/manifest.json`

## Usage

1. Navigate to WhatsApp Web (https://web.whatsapp.com)
2. Click the LooseCannon button in the bottom right
3. Select a personality from the popup
4. Toggle "LC: ON" to activate
5. The bot will automatically respond to incoming messages in the current chat

## Development Roadmap

### Phase 1: Foundation ✅
- Firefox extension skeleton
- Basic WhatsApp Web integration

### Phase 2: Message Interception (Current)
- DOM manipulation for reading messages
- Message injection system

### Phase 3: LLM Integration
- Ollama server connection
- Response generation

### Phase 4: Scambaiter Logic
- Personality system
- Conversation strategies

### Phase 5: Polish
- Chrome support
- Additional platforms
- Advanced features

## Safety Features

- Manual activation per chat (no automatic activation)
- Visual indicators when active
- Emergency stop button
- Conversation logging for review
- Rate limiting to avoid detection

## Contributing

This project is in active development. Issues and PRs welcome!

## License

MIT - See LICENSE file for details

## Acknowledgments

Inspired by the scambaiting community and projects like Kitboga's work.