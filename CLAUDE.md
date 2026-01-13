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
| `lib/place-service.js` | Gemini enrichment pipeline with Maps grounding |
| `preferences.md` | Traveler preferences (dietary, budget, pace, etc.) |
| `itinerary.txt` | Source of truth for trip itinerary (editable) |
| `itinerary.json` | Parsed + enriched itinerary (auto-generated) |
| `tools/check_enrichment.js` | Audit utility to check enrichment coverage |
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
- Adds: address, neighborhood, hours, price, tip, website
- Supports walking routes with waypoints
- Falls back gracefully if Gemini API unavailable

**Data flow:** `itinerary.txt` → parser → enricher → `itinerary.json` → Calendar UI

### Data Structure

Each item in the itinerary has three main fields:

- **`description`** - Original text from itinerary.txt (preserved for reference)
- **`prompt`** - User input text used for enrichment (defaults to description)
- **`enrichment`** - Gemini-generated data with:
  - `name` - Place name
  - `hook` - Short descriptive tagline (1-2 sentences)
  - `tip` - Insider tip or recommendation (singular, not "tips")
  - `vibe` - Atmosphere description
  - `hours` - Operating hours
  - `price` - Price level (e.g., "$$")
  - `address` - Full street address
  - `neighborhood` - Area/district
  - `mapsUrl` - Google Maps link
  - `website` - Official website
  - `walkingMins` - Walking time (for routes)

**Migration:** On data load, items with `description` but no `prompt` are automatically migrated to use `description` as `prompt`.

**Display logic:** Activities without detailed place data still show the `hook` field for context.

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

## Development Tools

### Check Enrichment Coverage

Use `tools/check_enrichment.js` to audit which items lack enrichment data:

```bash
node tools/check_enrichment.js
```

Shows items without enrichment, helping identify gaps in the enrichment pipeline.

## Troubleshooting

### Enrichment not showing
- **Check Gemini API key:** Verify `google-gemini-api-key` secret is set in Cloud Run
- **Check field names:** Use singular `tip` (not `tips`) in enrichment object
- **Activities:** Should show `hook` text even without full place data
- **Context:** Enrichment receives only item type (e.g., "(activity)"), not full day context

### OAuth failing locally
- **Expected behavior:** OAuth won't work at `localhost:8080` due to callback URL mismatch
- **Workaround:** Test authentication only on production Cloud Run deployment
- **Alternative:** Use Cloud Run local emulator with proper callback configuration

### Parser errors
- **Time formats:** Use `7:30pm`, `4-6pm`, or keywords like `morning`
- **Item modifiers:** Prefix with `fallback:` or suffix with `(optional)`
- **Headers:** Days must start with `# Jan 14 (Tue) - Title` format
- **Reference:** See "Itinerary Format" section above for complete syntax

### Session issues
- **Session secret:** Currently hardcoded as `'your-secret-key'` in server.js
- **Cookie duration:** 7 days (configured in passport session)
- **Clear session:** Use `/logout` endpoint or clear browser cookies

### Deployment issues
- **Check GitHub Actions:** Run `gh run list` to see deployment status
- **View logs:** `gcloud run services logs read nyc-trip --region us-central1`
- **Manual deploy:** `gcloud run deploy nyc-trip --source . --region us-central1`
- **Secrets:** Ensure all 4 secrets are configured in Secret Manager
