# Word Runner

A speed reading application using RSVP (Rapid Serial Visual Presentation) with ORP (Optimal Recognition Point) highlighting.

## What is RSVP?

Rapid Serial Visual Presentation displays one word at a time in a fixed position, eliminating eye movement and allowing you to read faster while maintaining comprehension.

## What is ORP?

The Optimal Recognition Point is the letter in each word where your eye naturally focuses for fastest recognition. Word Runner highlights this letter in red and centers it on the screen, reducing cognitive load.

## Features

- **RSVP Display**: One word at a time, centered on screen
- **ORP Highlighting**: Optimal letter marked in red
- **Adjustable Speed**: 100-1000 WPM in steps of 25
- **Ease-in**: Gradually ramps up to target speed
- **Context View**: When paused, see surrounding words with gradient opacity
- **Custom Text**: Paste your own text to read

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play/Pause |
| ← | Previous sentence |
| → | Next sentence |
| ↑ | Increase WPM (+25) |
| ↓ | Decrease WPM (-25) |

## Quick Start

```bash
make dev
```

This starts a local server and opens the app in your browser.

## Development

```bash
make serve    # Start server on port 8000
make open     # Open browser
make help     # Show all commands
```

## How It Works

1. Text is split into words
2. Each word's ORP is calculated based on word length
3. Words are displayed one at a time at the target WPM
4. The ORP letter is centered and highlighted in red
5. When paused, surrounding words provide context

## License

MIT
