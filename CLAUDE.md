# Word Runner - RSVP Reader

## Project Overview
A web-based RSVP (Rapid Serial Visual Presentation) reader with ORP (Optimal Recognition Point) highlighting. Displays one word at a time with the optimal recognition point marked in red.

## Tech Stack
- Pure HTML, CSS, JavaScript (no build tools or frameworks)
- Python's built-in HTTP server for development

## Project Structure
```
word-runner/
├── index.html          # Main application
├── css/style.css       # Styling
└── js/
    ├── app.js          # Main application logic
    ├── rsvp.js         # RSVP display engine
    └── orp.js          # ORP calculation
```

## Development Commands
```bash
make dev      # Start server and open browser
make serve    # Start development server on port 8000
make open     # Open browser to localhost:8000
make help     # Show available commands
```

## Key Features
- **ORP Highlighting**: Optimal recognition point letter shown in red
- **WPM Control**: 100-1000 in steps of 25, saved to localStorage
- **Ease-in**: Gradually ramps up to target speed when starting
- **Paragraph Breaks**: Visual break (¶) between paragraphs with 500ms pause
- **Time Remaining**: Shows estimated time left based on WPM
- **Navigation**:
  - Space: Play/Pause
  - Left/Right arrows: Previous/Next sentence
  - Up/Down arrows: Adjust WPM ±25
  - Horizontal scroll/swipe: Previous/Next word

## Code Conventions
- ES6 modules
- No external dependencies
- Event-driven architecture in RSVP engine
