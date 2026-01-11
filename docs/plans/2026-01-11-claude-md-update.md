# CLAUDE.md Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update CLAUDE.md to accurately reflect the current codebase architecture and features.

**Architecture:** Single file update with comprehensive documentation of all current features including Oscar chatbot, parser/enricher system, and API endpoints.

**Tech Stack:** Markdown documentation

---

## Task 1: Update File Structure Section

**Files:**
- Modify: `CLAUDE.md:15-25`

**Step 1: Replace the file structure table**

The current table references `nyc_itinerary.md` which doesn't exist. Update to:

```markdown
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
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update file structure in CLAUDE.md"
```

---

## Task 2: Add Itinerary Format Section

**Files:**
- Modify: `CLAUDE.md` (add after File Structure section)

**Step 1: Add new section documenting itinerary format**

```markdown
## Itinerary Format

The `itinerary.txt` file uses a specific markdown-like format that the parser understands:

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
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add itinerary format documentation"
```

---

## Task 3: Update Server Routes Section

**Files:**
- Modify: `CLAUDE.md:63-70` (Server Routes section)

**Step 1: Replace with complete API documentation**

```markdown
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
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update server routes with all API endpoints"
```

---

## Task 4: Add Oscar Chatbot Section

**Files:**
- Modify: `CLAUDE.md` (add after Architecture section)

**Step 1: Add Oscar documentation**

```markdown
## Oscar (Chat Assistant)

Oscar is an English bulldog puppy persona for the trip chatbot.

**Features:**
- Conversation memory (persists in session, up to 20 messages)
- Can update itinerary via chat (uses `[UPDATE_AVAILABLE]` marker)
- Knows correct itinerary format for updates
- Friendly bulldog personality with occasional puns

**System prompt location:** `server.js:132-186` (`getSystemPrompt()`)

**Clear chat:** Users can reset conversation via Clear button or `POST /api/chat/clear`
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add Oscar chatbot documentation"
```

---

## Task 5: Add Parser/Enricher Section

**Files:**
- Modify: `CLAUDE.md` (add new section)

**Step 1: Add technical documentation for parser and enricher**

```markdown
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
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add parser and enricher documentation"
```

---

## Task 6: Update Project Overview

**Files:**
- Modify: `CLAUDE.md:5-13` (Project Overview section)

**Step 1: Update overview with current features**

```markdown
## Project Overview

NYC trip planner for January 14-18, 2025. Features:
- **Calendar** - Day-by-day itinerary with expandable event details
- **Editor** - Edit itinerary.txt directly, auto-parses on save
- **Chat** - Oscar the bulldog assistant with conversation memory
- Google OAuth authentication (whitelist: self.gt@gmail.com, valmikh17@gmail.com)
- Gemini-powered place enrichment (addresses, tips, hours)
- Hosted on Google Cloud Run with CI/CD via GitHub Actions

**Live URL:** https://nyc-trip-522204863154.us-central1.run.app
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update project overview"
```

---

## Task 7: Final Review and Push

**Step 1: Review the complete CLAUDE.md**

Read the file and verify all sections are accurate.

**Step 2: Push to remote**

```bash
git push origin main
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Update file structure table |
| 2 | Add itinerary format documentation |
| 3 | Update server routes with all APIs |
| 4 | Add Oscar chatbot documentation |
| 5 | Add parser/enricher documentation |
| 6 | Update project overview |
| 7 | Final review and push |
