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
| `server.js` | Express server with OAuth, chat API, itinerary endpoints |
| `lib/oscar-agent.js` | Oscar chatbot - Gemini with agentic function calling |
| `lib/parser.js` | Parses itinerary.txt into structured JSON |
| `lib/enricher.js` | Enriches places with Gemini Maps grounding |
| `preferences.md` | Traveler preferences (dietary, budget, pace, etc.) |
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
- **Chat** - Gemini-powered agentic assistant (Oscar)

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

Oscar is an English bulldog puppy persona powered by Gemini 2.5 Flash with agentic function calling.

**Engine:** Gemini 2.5 Flash with function calling + Google Maps grounding

**Tools Oscar can use:**
| Tool | Purpose |
|------|---------|
| `searchPlaces` | Search restaurants, bars, attractions via Google Maps |
| `updateItinerary` | Add, modify, or remove items from the trip |
| `getPreferences` | Read traveler preferences from `preferences.md` |
| `getItinerary` | Query current schedule for any day |

**How it works:**
1. User sends a message
2. Oscar (Gemini) decides which tools to call
3. Tools execute and return results
4. Oscar generates a natural response using the data

**Features:**
- Agentic: Oscar autonomously decides when to search, check preferences, or update itinerary
- Google Maps grounding: Real-time place data (addresses, hours, ratings)
- Conversation memory: Up to 20 messages per session
- Personalized: Reads `preferences.md` for dietary restrictions, budget, pace
- Friendly bulldog personality with occasional puns

**Key files:**
- `lib/oscar-agent.js` - Tool definitions and agentic loop
- `preferences.md` - Traveler preferences (edit to customize)

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
| Secret Manager | `anthropic-api-key`, `google-client-id`, `google-client-secret`, `google-gemini-api-key` |
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
