# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

NYC trip planner for January 14-18, 2025. Features:
- **Calendar** - Day-by-day itinerary with expandable event details
- **Editor** - Edit itinerary.txt directly, auto-parses on save
- **Chat** - Oscar the bulldog assistant with conversation memory
- Google OAuth authentication (whitelist: self.gt@gmail.com, valmikh17@gmail.com)
- Gemini-powered place enrichment (addresses, tips, hours)
- Hosted on Google Cloud Run with CI/CD via GitHub Actions

**Live URL:** https://nyc-trip-522204863154.us-central1.run.app

## File Structure

| File | Purpose |
|------|---------|
| `index.html` | Main SPA (Calendar, Editor, Chat views) |
| `login.html` | Google Sign-In page |
| `server.js` | Express server with OAuth, Claude chat API, itinerary endpoints |
| `lib/parser.js` | Parses itinerary.txt into structured JSON |
| `lib/enricher.js` | Enriches places with Gemini Maps grounding |
| `itinerary.txt` | Source of truth for trip itinerary (editable) |
| `itinerary.json` | Parsed + enriched itinerary (auto-generated) |
| `Dockerfile` | Container config for Cloud Run |
| `.github/workflows/deploy.yml` | CI/CD - auto-deploys on push to main |

## Itinerary Format

The `itinerary.txt` file uses a specific format that the parser understands:

```
# Hotel
Hotel Name at Address, Neighborhood

# Reservations
- Reservation details

# Jan 14 (Tue) - Day Title
- 7:30pm: Restaurant Name, Neighborhood
- 4-6pm: Activity description
- 6-6:30pm: Time range with minutes
- fallback: Backup option
- 9:30pm (optional): Optional activity

# Notes
- General notes
```

**Time formats supported:**
- Simple: `7:30pm`, `11am`
- Ranges: `4-6pm`, `1:30-4pm`, `6-6:30pm`
- Keywords: `morning`, `afternoon`, `evening`, `dinner`, `late`

**Item modifiers:**
- `fallback:` prefix marks backup options
- `(optional)` suffix marks optional items

## Development

### Local Testing
```bash
npm install
npm start
# Open http://localhost:8080
# Note: OAuth won't work locally (callback URL mismatch)
```

### Deployment

**Automatic:** Push to `main` triggers GitHub Actions deploy to Cloud Run (~2 min).

```bash
git push                    # triggers auto-deploy
gh run watch               # watch deploy progress
```

**Manual (if needed):**
```bash
gcloud run deploy nyc-trip --source . --region us-central1
```

## Architecture

### App Sections
- **Calendar** - Timeline view of trip itinerary by day
- **Editor** - Markdown editor for itinerary notes
- **Chat** - Claude-powered Q&A about the trip

### Authentication Flow
1. Unauthenticated users → redirect to `/login`
2. Click "Sign in with Google" → Google OAuth consent
3. Callback validates email against whitelist
4. 7-day session cookie set on success

### Server Routes

**Authentication:**
- `GET /login` - Login page
- `GET /auth/google` - Initiate OAuth
- `GET /auth/google/callback` - OAuth callback
- `GET /logout` - Clear session

**App:**
- `GET /` - Main app (protected)

**Itinerary API:**
- `GET /api/itinerary` - Get itinerary (txt + json)
- `PUT /api/itinerary` - Update itinerary, triggers re-parse + enrichment
- `POST /api/itinerary/chat-update` - AI-powered itinerary update from chat

**Chat API:**
- `POST /api/chat` - Send message to Oscar (conversation memory via session)
- `POST /api/chat/clear` - Clear chat history

## Oscar (Chat Assistant)

Oscar is an English bulldog puppy persona for the trip chatbot.

**Features:**
- Conversation memory (persists in session, up to 20 messages)
- Can update itinerary via chat (uses `[UPDATE_AVAILABLE]` marker)
- Knows correct itinerary format for updates
- Friendly bulldog personality with occasional puns

**System prompt location:** `server.js:132-186` (`getSystemPrompt()`)

**Clear chat:** Users can reset conversation via Clear button or `POST /api/chat/clear`

## Parser & Enricher

### Parser (`lib/parser.js`)

Converts `itinerary.txt` → structured JSON:
- Extracts hotel, reservations, days, notes
- Parses time formats (ranges, keywords, optional suffix)
- Infers item types (food, culture, entertainment, transit, activity)

### Enricher (`lib/enricher.js`)

Enhances parsed data with real place info via Gemini:
- Uses Google Maps grounding for accurate addresses
- Adds: address, neighborhood, hours, price, tips, website
- Supports walking routes with waypoints
- Falls back gracefully if Gemini API unavailable

**Data flow:** `itinerary.txt` → parser → enricher → `itinerary.json` → Calendar UI

## Google Cloud Resources

**Project:** glexpenses-c46fb

| Service | Resource |
|---------|----------|
| Cloud Run | `nyc-trip` (us-central1) |
| Secret Manager | `anthropic-api-key`, `google-client-id`, `google-client-secret` |
| IAM | `github-deploy` service account (for CI/CD) |

## CI/CD

GitHub Actions workflow (`.github/workflows/deploy.yml`):
- Triggers on push to `main`
- Authenticates via `GCP_SA_KEY` secret (service account JSON)
- Deploys to Cloud Run using `google-github-actions/deploy-cloudrun`

## Design

**Theme:** Editorial (clean, magazine-style)
- Background: `#f8f6f3` (warm cream)
- Text: `#1a1a1a` (black)
- Accent: `#c9463d` (coral) for active states
- Typography: Playfair Display (serif headings), DM Sans (body)
