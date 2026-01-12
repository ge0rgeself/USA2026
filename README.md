# NYC Trip Guide

Personal travel guide and AI trip assistant for NYC, January 14-18, 2025.

## Live Site
https://nyc-trip-522204863154.us-central1.run.app

## Features
- **Calendar** - Day-by-day itinerary with timeline view
- **Editor** - Edit itinerary directly, auto-parses on save
- **Oscar** - Agentic AI assistant powered by Gemini 2.5 Flash
  - Google Maps grounding for real-time place data
  - Function calling: search places, update itinerary, check preferences
  - Personalized via `preferences.md`
- Google Sign-In authentication
- Auto-deploys on push to main

## Local Development
```bash
npm install
npm start
# Visit http://localhost:8080
```

Requires `.env` with:
- `GOOGLE_GEMINI_API_KEY` - Gemini API key
- `ANTHROPIC_API_KEY` - Claude API key (fallback)

## Deploy
Push to `main` triggers auto-deploy via GitHub Actions.

Manual deploy:
```bash
gcloud run deploy nyc-trip --source . --region us-central1
```

## Tech Stack
- Express.js + Passport.js (Google OAuth)
- Gemini 2.5 Flash (agentic function calling)
- Google Maps grounding
- Google Cloud Run
