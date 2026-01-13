# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

Life planner application, currently used for NYC trip (January 14-18, 2025). Built as a day-centric calendar with PostgreSQL backend.

**Features:**
- **Calendar** - Day-by-day itinerary with expandable event details
- **Editor** - Edit itinerary.txt directly, auto-parses on save
- **Chat** - Oscar the bulldog assistant with conversation memory
- **Database** - PostgreSQL on Cloud SQL (source of truth)
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
| `lib/db.js` | PostgreSQL client with connection pooling and queries |
| `lib/oscar-agent.js` | Oscar chatbot - Gemini with agentic function calling |
| `lib/parser.js` | Parses itinerary.txt into structured JSON |
| `lib/enricher.js` | Enriches places with Gemini Maps grounding |
| `lib/place-service.js` | Gemini enrichment pipeline with Maps grounding |
| `db/migrations/` | SQL schema migrations (auto-run on deploy) |
| `db/migrate.js` | Migration runner utility |
| `db/seed-from-json.js` | One-time data migration from JSON to Postgres |
| `preferences.md` | Traveler preferences (dietary, budget, pace, etc.) |
| `itinerary.txt` | Legacy text format (still supported for editing) |
| `Dockerfile` | Container config for Cloud Run |
| `.github/workflows/deploy.yml` | CI/CD - auto-deploys on push to main |

## Database Schema

PostgreSQL on Cloud SQL (`nyc-planner-db` instance, `nyc_trip` database).

### Tables

**users**
- `id` (UUID, PK)
- `email` (unique)
- `name`
- `preferences` (JSONB)
- `created_at`

**days** - Core entity, one per date per user
- `id` (UUID, PK)
- `user_id` (FK → users)
- `date` (unique per user)
- `title`
- `notes`
- `created_at`, `updated_at`

**items** - Events within a day
- `id` (UUID, PK)
- `day_id` (FK → days, CASCADE)
- `prompt` - User input for enrichment
- `description` - Display text
- `time_start`, `time_end` (TIME)
- `type` (food/activity/transit/culture/entertainment)
- `status` (primary/optional/backup)
- `sort_order`
- `enrichment` (JSONB)
- `created_at`, `updated_at`

**accommodations**
- `id` (UUID, PK)
- `user_id` (FK → users)
- `name`, `address`, `neighborhood`
- `check_in`, `check_out` (DATE)
- `enrichment` (JSONB)

**trips** - Lightweight date-range grouping
- `id` (UUID, PK)
- `user_id` (FK → users)
- `name`
- `start_date`, `end_date`

### Common Queries

```sql
-- Get days with items for a date range
SELECT d.*, json_agg(i.*) as items
FROM days d
LEFT JOIN items i ON i.day_id = d.id
WHERE d.user_id = $1 AND d.date BETWEEN $2 AND $3
GROUP BY d.id ORDER BY d.date;

-- Items needing enrichment
SELECT i.* FROM items i
JOIN days d ON i.day_id = d.id
WHERE d.user_id = $1 AND i.enrichment IS NULL;

-- Current accommodation
SELECT * FROM accommodations
WHERE user_id = $1 AND check_in <= $2 AND check_out > $2;
```

### Database Access

**Cloud SQL Studio:** https://console.cloud.google.com/sql/instances/nyc-planner-db/studio
- Select database: `nyc_trip` (not `postgres`)

**Local connection:**
```bash
# Get connection string
gcloud secrets versions access latest --secret=database-url --project=glexpenses-c46fb

# Authorize your IP (valid 5 min)
gcloud sql connect nyc-planner-db --project=glexpenses-c46fb --user=postgres
```

## Development

### Local Testing
```bash
npm install
npm start
# Open http://localhost:8080
# Note: OAuth and database won't work locally without additional setup
```

### Database Migrations

Migrations run automatically on deploy. To run manually:
```bash
DATABASE_URL=... node db/migrate.js
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

### Data Flow

```
User action (Calendar/Editor/Chat)
    ↓
API endpoint (server.js)
    ↓
Database query (lib/db.js)
    ↓
PostgreSQL (Cloud SQL)
    ↓
Response → In-memory cache → UI
```

**Source of truth:** PostgreSQL database
**Legacy support:** itinerary.txt still works for bulk editing (parsed → synced to DB)

### App Sections
- **Calendar** - Timeline view of trip itinerary by day
- **Editor** - Markdown editor for itinerary notes
- **Chat** - Gemini-powered agentic assistant (Oscar)

### Authentication Flow
1. Unauthenticated users → redirect to `/login`
2. Click "Sign in with Google" → Google OAuth consent
3. Callback validates email against whitelist
4. User record created/retrieved from database
5. 7-day session cookie set on success

### Server Routes

**Authentication:**
- `GET /login` - Login page
- `GET /auth/google` - Initiate OAuth
- `GET /auth/google/callback` - OAuth callback
- `GET /logout` - Clear session

**App:**
- `GET /` - Main app (protected)

**Itinerary API:**
- `GET /api/itinerary` - Get itinerary (from database)
- `PUT /api/itinerary` - Update itinerary, syncs to database
- `PATCH /api/itinerary/item` - Update single item
- `POST /api/itinerary/item` - Add item
- `DELETE /api/itinerary/item` - Remove item
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
| `getPreferences` | Read traveler preferences from database or preferences.md |
| `getItinerary` | Query current schedule for any day (from database) |

**How it works:**
1. User sends a message
2. Oscar (Gemini) decides which tools to call
3. Tools execute and return results (querying/updating database)
4. Oscar generates a natural response using the data

**Features:**
- Agentic: Oscar autonomously decides when to search, check preferences, or update itinerary
- Google Maps grounding: Real-time place data (addresses, hours, ratings)
- Conversation memory: Up to 20 messages per session
- Personalized: Reads preferences for dietary restrictions, budget, pace
- Friendly bulldog personality with occasional puns

## Enrichment

### How it works

Items with `enrichment: null` are automatically enriched in the background:
1. `findItemsNeedingEnrichment()` identifies items without enrichment
2. `placeService.enrichBatch()` calls Gemini with Google Maps grounding
3. Results saved to database via `db.updateItemEnrichment()`

### Enrichment Data Structure

```json
{
  "name": "Display name",
  "hook": "5-8 word memorable tagline",
  "tip": "Insider practical advice",
  "vibe": "Atmosphere description",
  "hours": "Operating hours",
  "price": "Price level ($$)",
  "address": "Full street address",
  "neighborhood": "Area abbreviation",
  "mapsUrl": "Google Maps URL",
  "website": "Official website",
  "walkingMins": "Minutes from accommodation"
}
```

## Google Cloud Resources

**Project:** glexpenses-c46fb

| Service | Resource |
|---------|----------|
| Cloud Run | `nyc-trip` (us-central1) |
| Cloud SQL | `nyc-planner-db` (PostgreSQL 15, db-f1-micro) |
| Secret Manager | `database-url`, `anthropic-api-key`, `google-client-id`, `google-client-secret`, `google-gemini-api-key`, `session-secret` |
| IAM | `github-deploy` service account (for CI/CD) |

## CI/CD

GitHub Actions workflow (`.github/workflows/deploy.yml`):
- Triggers on push to `main`
- Authenticates via `GCP_SA_KEY` secret (service account JSON)
- Deploys to Cloud Run with Cloud SQL connection
- Migrations run automatically on container startup

## Design

**Theme:** Editorial (clean, magazine-style)
- Background: `#f8f6f3` (warm cream)
- Text: `#1a1a1a` (black)
- Accent: `#c9463d` (coral) for active states
- Typography: Playfair Display (serif headings), DM Sans (body)

## Troubleshooting

### Database issues
- **Can't see tables:** In Cloud SQL Studio, select `nyc_trip` database (not `postgres`)
- **Connection timeout:** IP authorization expires after 5 minutes, re-run `gcloud sql connect`
- **UUID errors:** Old sessions may have invalid user IDs, clear cookies and re-login

### Enrichment not showing
- **Check Gemini API key:** Verify `google-gemini-api-key` secret is set in Cloud Run
- **Check field names:** Use singular `tip` (not `tips`) in enrichment object
- **Activities:** Should show `hook` text even without full place data

### OAuth failing locally
- **Expected behavior:** OAuth won't work at `localhost:8080` due to callback URL mismatch
- **Workaround:** Test authentication only on production Cloud Run deployment

### Parser errors (itinerary.txt)
- **Time formats:** Use `7:30pm`, `4-6pm`, or keywords like `morning`
- **Item modifiers:** Prefix with `fallback:` or suffix with `(optional)`
- **Headers:** Days must start with `# Jan 14 (Tue) - Title` format

### Deployment issues
- **Check GitHub Actions:** Run `gh run list` to see deployment status
- **View logs:** `gcloud run services logs read nyc-trip --region us-central1`
- **Manual deploy:** `gcloud run deploy nyc-trip --source . --region us-central1`
- **Secrets:** Ensure all secrets are configured in Secret Manager

### Session issues
- **Cookie duration:** 7 days (configured in passport session)
- **Clear session:** Use `/logout` endpoint or clear browser cookies
