# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

NYC trip chatbot and interactive travel guide for January 14-18, 2025. Features:
- Single-page HTML travel guide with timeline view
- Claude-powered chat assistant for trip questions
- Google OAuth authentication (whitelist: self.gt@gmail.com, valmikh17@gmail.com)
- Hosted on Google Cloud Run

**Live URL:** https://nyc-trip-522204863154.us-central1.run.app

## File Structure

| File | Purpose |
|------|---------|
| `server.js` | Express server with Google OAuth + Claude chat API |
| `nyc_itinerary.html` | Main trip guide (dark theme, timeline, chat widget) |
| `nyc_itinerary.md` | Itinerary data fed to Claude for context |
| `login.html` | Google Sign-In page |
| `Dockerfile` | Container config for Cloud Run |
| `.env` | Local dev secrets (gitignored) |

## Development

### Local Testing
```bash
npm install
npm start
# Open http://localhost:8080
# Note: OAuth won't work locally (callback URL mismatch)
```

### Deploy to Cloud Run
```bash
gcloud run deploy nyc-trip --source . --region us-central1
```

Full deploy with secrets:
```bash
gcloud run deploy nyc-trip --source . --region us-central1 \
  --allow-unauthenticated \
  --set-secrets=ANTHROPIC_API_KEY=anthropic-api-key:latest,GOOGLE_CLIENT_ID=google-client-id:latest,GOOGLE_CLIENT_SECRET=google-client-secret:latest \
  --set-env-vars=NODE_ENV=production --port 8080
```

## Architecture

### Authentication Flow
1. Unauthenticated users → redirect to `/login`
2. Click "Sign in with Google" → Google OAuth consent
3. Callback validates email against whitelist
4. 7-day session cookie set on success
5. Logout via `/logout`

### Server Routes
- `GET /` - Main itinerary (protected)
- `GET /login` - Login page
- `GET /auth/google` - Initiate OAuth
- `GET /auth/google/callback` - OAuth callback
- `GET /logout` - Clear session
- `POST /api/chat` - Claude chat endpoint (protected)

## Google Cloud Resources

**Project:** glexpenses-c46fb

| Service | Resource |
|---------|----------|
| Cloud Run | `nyc-trip` (us-central1) |
| Secret Manager | `anthropic-api-key`, `google-client-id`, `google-client-secret` |
| OAuth Credentials | `nyc-trip` web client |

## Environment Variables

### Local (.env)
```
ANTHROPIC_API_KEY=your-key
```

### Production (via Secret Manager)
- `ANTHROPIC_API_KEY` - Claude API key
- `GOOGLE_CLIENT_ID` - OAuth client ID
- `GOOGLE_CLIENT_SECRET` - OAuth client secret
- `NODE_ENV=production` - Enables secure cookies
