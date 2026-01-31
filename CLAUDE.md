# Tempo - RSVP Reader

## Project Overview
A web-based RSVP (Rapid Serial Visual Presentation) reader with ORP (Optimal Recognition Point) highlighting. Displays one word at a time with the optimal recognition point marked in red. Supports loading articles directly from URLs.

## Tech Stack
- Pure HTML, CSS, JavaScript (no build tools or frameworks)
- Python's built-in HTTP server for development
- External: Readability.js (loaded from CDN), allorigins.win CORS proxy

## Project Structure
```
tempo/
├── index.html          # Main application
├── css/style.css       # Styling
└── js/
    ├── app.js          # Main application logic
    ├── rsvp.js         # RSVP display engine
    ├── orp.js          # ORP calculation
    ├── url-loader.js   # URL extraction and fetching
    └── content-parser.js # HTML to content items (uses Readability.js)
```

## Development Commands
```bash
make dev      # Start server and open browser
make serve    # Start development server on port 8000
make open     # Open browser to localhost:8000
make help     # Show available commands
```

## Key Features
- **URL Loading**: Load any article URL
  - Development (hash): `/#https://...`, `/#www...`, `/#domain.com/...`
  - Production (path): `/https://...`, `/www...`, `/domain.com/...`
  - Anchor support: `/#url#section` (depends on source preserving element IDs)
- **ORP Highlighting**: Optimal recognition point letter shown in red
- **WPM Control**: 100-1000 in steps of 25, saved to localStorage
- **Ease-in**: Gradually ramps up to target speed when starting
- **Paragraph Breaks**: Visual break (¶) between paragraphs with 500ms pause
- **Special Content**: Images, code blocks, and tables display for 5 seconds with countdown
  - Pause during countdown: stops timer, content stays visible
  - Resume: skips remaining time, continues reading
- **Time Remaining**: Shows estimated time left (includes special content duration)
- **Navigation**:
  - Space: Play/Pause
  - Left/Right arrows: Previous/Next sentence
  - Up/Down arrows: Adjust WPM ±25
  - Horizontal scroll/swipe: Previous/Next word

## Content Items
The engine now supports content items beyond plain words:
```javascript
{ type: 'word', value: 'Hello' }
{ type: 'special', contentType: 'image'|'code'|'table', html: '...', alt: '...' }
{ type: 'paragraph-break' }
```

## Code Conventions
- ES6 modules
- Minimal external dependencies (Readability.js loaded dynamically)
- Event-driven architecture in RSVP engine
- Display state management for loading/error/playing/paused/special states
