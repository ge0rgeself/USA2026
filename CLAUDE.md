# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

NYC trip chatbot and interactive travel guide for January 14-18, 2025. Features:
- 3-section SPA (Calendar, Editor, Chat) with Editorial design theme
- Claude-powered chat assistant for trip questions
- Google OAuth authentication (whitelist: self.gt@gmail.com, valmikh17@gmail.com)
- Hosted on Google Cloud Run with CI/CD via GitHub Actions

**Live URL:** https://nyc-trip-522204863154.us-central1.run.app

## File Structure

| File | Purpose |
|------|---------|
| `index.html` | Main app (Editorial theme - white/cream, black serif typography) |
| `login.html` | Google Sign-In page |
| `server.js` | Express server with Google OAuth + Claude chat API |
| `nyc_itinerary.md` | Itinerary data fed to Claude for context |
| `Dockerfile` | Container config for Cloud Run |
| `.github/workflows/deploy.yml` | CI/CD - auto-deploys on push to main |

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
- `GET /` - Main app (protected)
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
