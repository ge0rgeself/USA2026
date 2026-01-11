# NYC Trip Guide

Personal travel guide and chat assistant for NYC trip, January 14-18, 2025.

## Live Site
https://nyc-trip-522204863154.us-central1.run.app

## Features
- Day-by-day itinerary with timeline view
- Claude-powered chat assistant for trip questions
- Google Sign-In authentication
- Mobile-friendly dark theme

## Local Development
```bash
npm install
npm start
# Visit http://localhost:8080
```

## Deploy
```bash
gcloud run deploy nyc-trip --source . --region us-central1
```

## Tech Stack
- Express.js + Passport.js (Google OAuth)
- Claude API (Sonnet)
- Google Cloud Run
