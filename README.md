# LooseCannon

Automated scambaiting for the terminally online. Weaponizes local LLMs against the forces of digital darkness.

## Legal Notice

This tool exists for educational purposes and defensive security research. Using it will probably violate some Terms of Service. Your accounts may get banned. You've been warned.

## What It Does

Turns your messaging apps into honeypots for scammers. When they message, an AI responds with maximum confusion and minimal coherence. Think of it as a Turing test in reverse.

## Current Victims

- WhatsApp Web (primary target)
- Telegram Web (all variants)
- Facebook Messenger (surprisingly easy)

## Architecture

```
LooseCannon/
├── extension/          # Browser hijacking code
├── server/            # LLM wrangling service
└── personalities/     # Digital personas of varying coherence
```

## Prerequisites

- Ollama (for the AI brain)
- Node.js 18+ (for the plumbing)
- Firefox (Chrome users can wait)
- A healthy disregard for platform guidelines

## Installation

```bash
# Get the code
cd ~/Documents/GithubOrgs/zeroed-some/LooseCannon

# Install dependencies
npm install

# Start the AI
ollama pull llama2
ollama serve

# Run the server
npm start

# Load extension
npm run dev:extension
```

Or if you prefer the manual approach: `about:debugging` > Load Temporary Add-on > Select manifest.json

## Operation

1. Open your chosen messaging platform
2. Find the LC button (you can't miss it)
3. Pick a personality (Confused Elder is a classic)
4. Toggle to ON
5. Watch the magic unfold

## Available Personalities

- **Confused Elder**: Can't find the any key
- **Tech Support Nightmare**: Knows everything, understands nothing
- **Conspiracy Theorist**: It's all connected, man

## Safety Mechanisms

- Manual activation only (no rogue AI here)
- Big red emergency stop button
- Conversation logs (for posterity)
- Rate limiting (to maintain plausible humanity)

## Phases of Development

**Phase 1**: Basic infrastructure [COMPLETE]
**Phase 2**: Multi-platform chaos [COMPLETE]
**Phase 3**: Chrome support (eventually)
**Phase 4**: World domination (pending)

## Technical Highlights

- Real-time scammer detection (70%+ confidence triggers alerts)
- Human-like typing delays (150ms per word, plus random jitter)
- Context-aware response strategies
- Conversation state management
- Platform-agnostic message handling

## Performance Notes

- Conversations auto-purge after 24 hours
- Message history capped at 50 (memory is expensive)
- Response queue prevents flooding
- Automatic reconnection on server hiccups

## Testing Your Setup

```javascript
// Browser console commands for the curious

// Check load status
console.log(window.LooseCannonLoaded);

// Trigger scammer alert
browser.runtime.sendMessage({
  type: 'SCAMMER_DETECTED',
  data: { score: 0.95 }
});
```

## Known Issues

- Platform DOM changes will break everything
- Too many responses = rate limiting
- Some assembly required
- Batteries not included

## Disclaimer

This software is provided "as is" without warranty of any kind. If you lose your WhatsApp account while trolling Nigerian princes, that's on you. The authors assume no responsibility for banned accounts, angry scammers, or existential crises caused by talking to AI-powered grandparents.

## Contributing

PRs welcome. Breaking changes preferred. Documentation optional.

## License

MIT - Do whatever you want, just don't blame us.

## Credits

Standing on the shoulders of giants in the scambaiting community. You know who you are.