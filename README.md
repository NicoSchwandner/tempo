# Word Runner

A speed reading application using RSVP (Rapid Serial Visual Presentation) with ORP (Optimal Recognition Point) highlighting. Load any article from the web and read it at your optimal pace.

## What is RSVP?

Rapid Serial Visual Presentation displays one word at a time in a fixed position, eliminating eye movement and allowing you to read faster while maintaining comprehension.

## What is ORP?

The Optimal Recognition Point is the letter in each word where your eye naturally focuses for fastest recognition. Word Runner highlights this letter in red and centers it on the screen, reducing cognitive load.

## Features

- **RSVP Display**: One word at a time, centered on screen
- **ORP Highlighting**: Optimal letter marked in red
- **URL Loading**: Read any article by adding its URL to the path
- **Adjustable Speed**: 100-1000 WPM in steps of 25, saved to localStorage
- **Ease-in**: Gradually ramps up to target speed
- **Paragraph Breaks**: Visual break between paragraphs with brief pause
- **Special Content**: Images, code blocks, and tables pause for 5 seconds
- **Time Remaining**: Shows estimated time left based on WPM
- **Context View**: When paused, see surrounding words with gradient opacity
- **Custom Text**: Paste your own text to read

## URL Loading

Load any article by adding its URL to Word Runner.

### Development (hash-based)

Use `#` before the URL (works with Python's simple http server):

```
http://localhost:8000/#https://example.com/article
http://localhost:8000/#www.example.com/article
http://localhost:8000/#https://en.wikipedia.org/wiki/RSVP
```

### Production (path-based)

With a proper web server that routes all paths to index.html:

```
https://word-runner.com/https://example.com/article
https://word-runner.com/www.example.com/article
```

### With Anchor Links

Jump to a specific section by including the anchor:

```
http://localhost:8000/#https://en.wikipedia.org/wiki/RSVP#Peripheral_reading
```

Note: Anchor navigation depends on the source page preserving element IDs through article extraction.

### Supported Sites

Works best with article-style pages. Tested with:
- Wikipedia articles
- Blog posts (Medium, personal blogs)
- News articles
- Documentation pages

## Special Content

When the reader encounters images, code blocks, or tables:

1. Content displays in an overlay for 5 seconds
2. A countdown badge shows remaining time
3. Press Space to pause - countdown stops, content stays visible
4. Press Space again - continues immediately (skips remaining countdown)

## Controls

| Input | Action |
|-------|--------|
| Space | Play/Pause |
| ← | Previous sentence |
| → | Next sentence |
| ↑ | Increase WPM (+25) |
| ↓ | Decrease WPM (-25) |
| Horizontal scroll/swipe | Previous/Next word |

## Quick Start

```bash
make dev
```

This starts a local server and opens the app in your browser.

To load an article:
```bash
# Open browser to:
http://localhost:8000/https://en.wikipedia.org/wiki/Speed_reading
```

## Development

```bash
make serve    # Start server on port 8000
make open     # Open browser
make help     # Show all commands
```

## How It Works

1. Text is split into words (or fetched from URL via Readability.js)
2. Each word's ORP is calculated based on word length
3. Words are displayed one at a time at the target WPM
4. The ORP letter is centered and highlighted in red
5. Special content (images, code, tables) pauses for 5 seconds
6. When paused, surrounding words provide context

## Dependencies

**Runtime (loaded from CDN):**
- [Readability.js](https://github.com/mozilla/readability) - Article extraction
- [allorigins.win](https://allorigins.win/) - CORS proxy for fetching URLs

**Development:**
- Python 3 (for local server)

## License

MIT
