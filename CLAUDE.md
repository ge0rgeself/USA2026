# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NYC trip chatbot and interactive HTML travel guide for a January 14-18, 2025 NYC trip. The project has two main components:

1. **Static HTML Guide** (`nyc_itinerary.html`) - A single-page, mobile-friendly travel guide with deep links to venues, maps, and booking sites
2. **Chat Assistant** (`server.js`) - Express server with Claude API integration providing a conversational trip assistant embedded in the HTML

## Development Commands

```bash
# Install dependencies
npm install

# Run development server (requires ANTHROPIC_API_KEY in .env)
npm start

# Build Docker image
docker build -t nyc-trip-chatbot .

# Run Docker container
docker run -p 8080:8080 -e ANTHROPIC_API_KEY=your-key nyc-trip-chatbot
```

## Architecture

- `server.js` - Express server that:
  - Serves static files from root directory
  - Exposes `/api/chat` endpoint for Claude-powered trip assistant
  - Injects `nyc_itinerary.md` into Claude's system prompt for context
  - Uses `claude-sonnet-4-20250514` model with 500 max tokens

- `nyc_itinerary.html` - Self-contained HTML with:
  - Embedded CSS (dark theme with gold accents)
  - Timeline-based day view with color-coded event types
  - Sticky day navigation with scroll-based active state
  - Chat widget (bottom-right) that calls `/api/chat`
  - Mobile-responsive design

- `nyc_itinerary.md` - Source itinerary data (5 days of activities, reservations, tips)

## Environment

Requires `.env` file with:
```
ANTHROPIC_API_KEY=your-api-key
```

Server runs on port 8080 (configurable via `PORT` env var).
