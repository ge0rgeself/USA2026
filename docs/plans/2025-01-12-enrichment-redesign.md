# Enrichment System Redesign

**Date:** 2025-01-12
**Status:** Ready for implementation

## Problem Statement

The current enrichment system has several issues:

1. **Redundant storage** - Both `itinerary.txt` and `itinerary.json` exist, requiring sync
2. **No persistence** - `itinerary.json` is local-only, lost on Cloud Run restart
3. **Wrong grounding** - Enricher uses `googleSearch`, Oscar uses `googleMaps` (better)
4. **No preference awareness** - Enricher doesn't know traveler preferences
5. **Blocking enrichment** - Full re-enrichment on startup slows things down
6. **Silent failures** - Current enrichment often returns empty data

## Solution Overview

1. **Single source of truth** - One `itinerary.json` file in GCS
2. **Unified place service** - Shared enrichment for Oscar and background jobs
3. **Background enrichment** - Non-blocking, runs after edits
4. **Persistent enrichment** - Data survives restarts, only enrich new/changed items
5. **Google Maps grounding** - Same quality as Oscar's recommendations

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        GCS Bucket                           │
│              nyc-trip-data-glexpenses                       │
│                    itinerary.json                           │
└─────────────────────────────────────────────────────────────┘
                              ↑↓
┌─────────────────────────────────────────────────────────────┐
│                       server.js                             │
│  • Load JSON on startup (instant, enrichment included)      │
│  • On edit: save → respond → background enrich              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                 lib/place-service.js                        │
│  Gemini 2.5 Flash + Google Maps Grounding                   │
│  • enrichPlace(description) → single item                   │
│  • enrichBatch(items[]) → multiple items                    │
│  • searchPlaces(query, area) → Oscar's tool                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Oscar Agent                              │
│  Uses place-service.searchPlaces()                          │
└─────────────────────────────────────────────────────────────┘
```

## Data Model

### itinerary.json Structure

```json
{
  "hotel": {
    "description": "Untitled at 3 Freeman Alley, Lower East Side",
    "enrichment": {
      "name": "Untitled",
      "hook": "Hidden LES gem behind an unmarked door",
      "tip": "Check-in after 3pm, ask about Freeman Alley history",
      "vibe": "Boutique, artsy, discreet",
      "hours": "24/7 (hotel)",
      "price": "$$$",
      "address": "3 Freeman Alley, New York, NY 10002",
      "neighborhood": "LES",
      "mapsUrl": "https://maps.google.com/?q=...",
      "website": "https://untitledhotels.com",
      "walkingMins": null
    }
  },
  "days": [
    {
      "date": "Jan 14",
      "dayOfWeek": "Tue",
      "title": "Arrival",
      "items": [
        {
          "time": "7pm",
          "description": "Cafe Mogador, East Village",
          "type": "food",
          "fallback": false,
          "optional": false,
          "enrichment": {
            "name": "Cafe Mogador",
            "hook": "Moroccan soul since '83",
            "tip": "Tagine + mint tea, sit by window",
            "vibe": "Cozy, unpretentious, neighborhood staple",
            "hours": "9am-12am daily",
            "price": "$$ (~$25-35/person)",
            "address": "101 St Marks Pl, New York, NY 10009",
            "neighborhood": "EV",
            "mapsUrl": "https://maps.google.com/?q=...",
            "website": "https://cafemogador.com",
            "walkingMins": 8
          }
        },
        {
          "time": null,
          "description": "Russ & Daughters Cafe",
          "type": "food",
          "fallback": true,
          "optional": false,
          "enrichment": null
        }
      ]
    }
  ],
  "reservations": [
    {
      "description": "Minetta Tavern (Resy, book 30 days ahead)",
      "enrichment": { ... }
    }
  ],
  "notes": [
    "Pack warm layers (30-40°F in January)",
    "Katz's: Get ticket at door, don't lose it"
  ]
}
```

### Enrichment Schema

#### Standard Places

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Official place name |
| `hook` | string | Yes | Punchy 5-8 word teaser (Bourdain energy) |
| `tip` | string | Yes | Insider practical advice |
| `vibe` | string | Yes | Quick atmosphere read (10 words max) |
| `hours` | string | Yes | Operating hours with context |
| `price` | string | Yes | Contextual price ("$25-30, worth it") |
| `address` | string | Yes | Full street address |
| `neighborhood` | string | Yes | Short code (LES, EV, WV, SoHo, etc.) |
| `mapsUrl` | string | Yes | Google Maps link |
| `website` | string | No | Official website (nullable) |
| `walkingMins` | number | No | Minutes walk from hotel (nullable) |

#### Walking Routes (additional fields)

| Field | Type | Description |
|-------|------|-------------|
| `isWalkingRoute` | boolean | `true` for routes |
| `waypoints` | string[] | Ordered stops with brief descriptions |
| `distance` | string | "1.2 miles" |
| `duration` | string | "45-60 min with stops" |
| `routeUrl` | string | Google Maps directions URL |

## Data Flow

### Startup

```
Server starts
    ↓
Load itinerary.json from GCS (with timeout)
    ↓
If success: serve immediately (enrichment already there)
If timeout/fail: try local fallback, else empty state
    ↓
Ready to serve requests (no enrichment delay)
```

### Editor Save

```
User edits in Editor tab
    ↓
Frontend sends PUT /api/itinerary with txt content
    ↓
Server: parse txt → build JSON structure
    ↓
For each item: keep existing enrichment if description unchanged
               set enrichment: null if new or changed
    ↓
Save JSON to GCS
    ↓
Return success to user immediately
    ↓
Background: find items with enrichment: null
    ↓
Call place-service.enrichBatch(items)
    ↓
Update JSON with enrichment
    ↓
Save to GCS
```

### Oscar Update

```
User asks Oscar to update itinerary
    ↓
Oscar calls updateItinerary tool
    ↓
Modify JSON in memory
    ↓
Save to GCS
    ↓
Return success to Oscar (continues conversation)
    ↓
Background: enrich new/changed items
    ↓
Save to GCS
```

### Client Polling

```
Frontend loads itinerary
    ↓
Check if any item has enrichment: null
    ↓
If yes: poll /api/itinerary every 3 seconds
    ↓
When all items enriched: stop polling
    ↓
Update UI smoothly as enrichments arrive
```

## Implementation Details

### lib/place-service.js

```javascript
/**
 * Unified place enrichment service
 * Used by: background enricher, Oscar agent
 */

const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  model: 'gemini-2.5-flash',
  hotelLocation: { lat: 40.7223, lng: -73.9930 }, // Freeman Alley, LES
  maxBatchSize: 10,
  maxRetries: 3
};

/**
 * Load traveler preferences
 */
function loadPreferences() {
  const prefsPath = path.join(__dirname, '..', 'preferences.md');
  try {
    return fs.readFileSync(prefsPath, 'utf-8');
  } catch (err) {
    return '';
  }
}

/**
 * Build the enrichment prompt
 */
function buildEnrichmentPrompt(items) {
  const preferences = loadPreferences();

  const itemList = items
    .map((item, i) => `${i + 1}. "${item.description}" (${item.context || 'activity'})`)
    .join('\n');

  return `You are enriching places for a NYC trip (Jan 14-18, 2025).

TRAVELER PREFERENCES:
${preferences}

HOTEL LOCATION: Untitled at Freeman Alley, Lower East Side (use for walkingMins calculation)

For each item below, return a JSON array with enrichment objects.

ENRICHMENT SCHEMA:
{
  "name": "Official place name",
  "hook": "Punchy 5-8 words - memorable, Bourdain energy, not generic",
  "tip": "Insider practical advice (what to order, when to go, what to avoid)",
  "vibe": "Quick atmosphere read, 10 words max",
  "hours": "Operating hours with helpful context (e.g., 'Opens 8am - beat the line')",
  "price": "Contextual price info (e.g., '$25-30/person, worth it')",
  "address": "Full street address, New York, NY ZIP",
  "neighborhood": "Short code: LES, EV, WV, SoHo, NoHo, Chinatown, FiDi, etc.",
  "mapsUrl": "Google Maps URL for the place",
  "website": "Official website URL or null if none",
  "walkingMins": estimated minutes walking from Freeman Alley LES (number or null)
}

FOR WALKING ROUTES (multi-stop explorations), add:
{
  "isWalkingRoute": true,
  "waypoints": ["Stop 1 - brief description", "Stop 2 - brief description", ...],
  "distance": "1.2 miles",
  "duration": "45-60 min with stops",
  "routeUrl": "Google Maps directions URL with waypoints"
}

FOR NON-PLACES (like "Sleep in" or "Check-in"), return:
{
  "name": "original text",
  "hook": "Brief contextual note",
  "tip": null, "vibe": null, "hours": null, "price": null,
  "address": null, "neighborhood": null, "mapsUrl": null,
  "website": null, "walkingMins": null
}

ITEMS TO ENRICH:
${itemList}

Return ONLY a valid JSON array with exactly ${items.length} objects. No markdown, no explanation.`;
}

/**
 * Enrich a batch of items using Gemini with Maps grounding
 */
async function enrichBatch(genAI, items) {
  if (!items || items.length === 0) return [];

  const prompt = buildEnrichmentPrompt(items);

  const response = await genAI.models.generateContent({
    model: CONFIG.model,
    contents: prompt,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: CONFIG.hotelLocation
        }
      }
    }
  });

  // Parse JSON response
  const text = response.text;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('No JSON array in response');
  }

  return JSON.parse(jsonMatch[0]);
}

/**
 * Enrich with retry logic
 */
async function enrichBatchWithRetry(genAI, items, maxRetries = CONFIG.maxRetries) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await enrichBatch(genAI, items);
    } catch (err) {
      lastError = err;
      console.warn(`Enrichment attempt ${attempt} failed:`, err.message);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw lastError;
}

/**
 * Search for places (Oscar's tool)
 */
async function searchPlaces(genAI, query, neighborhood) {
  const preferences = loadPreferences();

  const prompt = `Find ${query}${neighborhood ? ` in/near ${neighborhood}` : ''} in New York City.

TRAVELER PREFERENCES:
${preferences}

Return top 3-5 options that match these preferences. For each include:
- Name and address
- Why it fits their style (Bourdain energy, no pretense)
- Hours, price range, what to order/do
- Google Maps link

Focus on places open in January 2025.`;

  const response = await genAI.models.generateContent({
    model: CONFIG.model,
    contents: prompt,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: CONFIG.hotelLocation
        }
      }
    }
  });

  return {
    success: true,
    query,
    neighborhood,
    results: response.text,
    grounded: true
  };
}

module.exports = {
  enrichBatch: enrichBatchWithRetry,
  searchPlaces,
  loadPreferences,
  CONFIG
};
```

### lib/storage.js Updates

```javascript
// Add these functions:

const ITINERARY_JSON_FILE = 'itinerary.json';

/**
 * Read itinerary.json from GCS
 */
async function readItineraryJson() {
  if (isGcsEnabled()) {
    try {
      const [contents] = await getGcsBucket().file(ITINERARY_JSON_FILE).download();
      console.log('Loaded itinerary.json from GCS');
      return JSON.parse(contents.toString('utf-8'));
    } catch (err) {
      console.error('GCS JSON read failed:', err.message);
    }
  }

  // Local fallback
  try {
    const local = fs.readFileSync('./itinerary.json', 'utf-8');
    return JSON.parse(local);
  } catch (err) {
    return null;
  }
}

/**
 * Write itinerary.json to GCS (and local)
 */
async function writeItineraryJson(json) {
  const content = JSON.stringify(json, null, 2);

  // Always write locally
  fs.writeFileSync('./itinerary.json', content, 'utf-8');

  if (isGcsEnabled()) {
    try {
      await getGcsBucket().file(ITINERARY_JSON_FILE).save(content, {
        contentType: 'application/json',
        metadata: { cacheControl: 'no-cache' }
      });
      console.log('Saved itinerary.json to GCS');
    } catch (err) {
      console.error('GCS JSON write failed:', err.message);
    }
  }
}

module.exports = {
  readItinerary,      // Keep for migration/editor
  writeItinerary,     // Remove after migration
  readItineraryJson,  // New
  writeItineraryJson, // Updated
  isGcsEnabled
};
```

### server.js Changes

#### Startup

```javascript
let itineraryData = null;

async function loadItinerary() {
  try {
    // Try GCS first with timeout
    const data = await Promise.race([
      storage.readItineraryJson(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      )
    ]);

    if (data) {
      itineraryData = data;
      console.log('Itinerary loaded from GCS');
      return;
    }
  } catch (err) {
    console.warn('GCS load failed:', err.message);
  }

  // Fallback: parse from txt if exists
  try {
    const txt = fs.readFileSync('./itinerary.txt', 'utf-8');
    const parsed = parseItinerary(txt);
    itineraryData = convertToNewFormat(parsed);
    console.log('Itinerary loaded from local txt');
  } catch (err) {
    console.warn('No itinerary found, starting empty');
    itineraryData = { hotel: null, days: [], reservations: [], notes: [] };
  }
}
```

#### Background Enrichment

```javascript
/**
 * Find items needing enrichment
 */
function findItemsNeedingEnrichment(data) {
  const items = [];

  if (data.hotel && !data.hotel.enrichment) {
    items.push({
      description: data.hotel.description,
      context: 'hotel',
      path: ['hotel']
    });
  }

  data.days.forEach((day, dayIdx) => {
    day.items.forEach((item, itemIdx) => {
      if (!item.enrichment) {
        items.push({
          description: item.description,
          context: `${day.date} ${day.title} (${item.type})`,
          path: ['days', dayIdx, 'items', itemIdx]
        });
      }
    });
  });

  data.reservations.forEach((res, idx) => {
    if (!res.enrichment) {
      items.push({
        description: res.description,
        context: 'reservation',
        path: ['reservations', idx]
      });
    }
  });

  return items;
}

/**
 * Run background enrichment
 */
async function runBackgroundEnrichment() {
  const items = findItemsNeedingEnrichment(itineraryData);

  if (items.length === 0) {
    console.log('No items need enrichment');
    return;
  }

  console.log(`Background enriching ${items.length} items...`);

  try {
    const enrichments = await placeService.enrichBatch(genAI, items);

    // Apply enrichments to data
    items.forEach((item, idx) => {
      const enrichment = enrichments[idx];
      setNestedValue(itineraryData, [...item.path, 'enrichment'], enrichment);
    });

    // Save to GCS
    await storage.writeItineraryJson(itineraryData);
    console.log('Background enrichment complete');

  } catch (err) {
    console.error('Background enrichment failed:', err.message);
  }
}

// Helper to set nested object value
function setNestedValue(obj, path, value) {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]];
  }
  current[path[path.length - 1]] = value;
}
```

#### API Endpoints

```javascript
// GET /api/itinerary
app.get('/api/itinerary', requireAuth, (req, res) => {
  res.json(itineraryData);
});

// PUT /api/itinerary (editor save)
app.put('/api/itinerary', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;

    // Parse txt to structure
    const parsed = parseItinerary(content);

    // Merge with existing enrichments
    const newData = mergeWithExistingEnrichments(parsed, itineraryData);

    // Save immediately
    itineraryData = newData;
    await storage.writeItineraryJson(itineraryData);

    // Return to user immediately
    res.json({ success: true, data: itineraryData });

    // Background enrich (non-blocking)
    runBackgroundEnrichment().catch(err =>
      console.error('Background enrichment error:', err)
    );

  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ error: 'Failed to save' });
  }
});
```

### oscar-agent.js Changes

```javascript
// Replace executeSearchPlaces with:
const placeService = require('./place-service');

async function executeSearchPlaces(genAI, args) {
  const { query, neighborhood } = args;
  return await placeService.searchPlaces(genAI, query, neighborhood);
}
```

### index.html Changes

#### Loading State for Null Enrichment

```javascript
renderEventRow(item, index) {
  const enrichment = item.enrichment;
  const isLoading = enrichment === null;

  // Show loading indicator if enrichment pending
  const hookHtml = isLoading
    ? '<span class="event-hook loading">Loading...</span>'
    : enrichment?.hook
      ? `<span class="event-hook">${this.escapeHtml(enrichment.hook)}</span>`
      : '';

  // ... rest of render
}
```

#### Polling for Updates

```javascript
class ItineraryView {
  constructor() {
    this.pollingInterval = null;
  }

  checkForPendingEnrichments() {
    if (!this.data) return false;

    // Check if any item has null enrichment
    for (const day of this.data.days) {
      for (const item of day.items) {
        if (item.enrichment === null) return true;
      }
    }
    return false;
  }

  startPolling() {
    if (this.pollingInterval) return;

    this.pollingInterval = setInterval(async () => {
      if (!this.checkForPendingEnrichments()) {
        this.stopPolling();
        return;
      }

      const response = await fetch('/api/itinerary');
      const data = await response.json();

      if (JSON.stringify(data) !== JSON.stringify(this.data)) {
        this.data = data;
        this.render();
      }
    }, 3000);
  }

  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}
```

## Error Handling

### Failure Recovery Table

| Failure | Impact | Recovery |
|---------|--------|----------|
| GCS read timeout | Startup delayed | Fall back to local JSON or empty state after 5s |
| GCS write fail | Data not persisted | Retry 3x, keep in memory, log error |
| Gemini API fail | Enrichment missing | Leave null, retry on next trigger |
| Bad JSON from Gemini | Can't parse | Log error, skip batch, items stay null |
| Partial batch fail | Some items enriched | Save successful ones, retry failed later |

### Graceful Degradation

When `enrichment: null`:
- Card shows `description` as name
- No hook, tip, vibe displayed
- "Directions" button searches by description text
- Item is fully functional, just less rich

## Migration Plan

### Step 1: Create place-service.js

New file with unified enrichment logic.

### Step 2: Update storage.js

Add `readItineraryJson()` and update `writeItineraryJson()` to use GCS.

### Step 3: Update server.js

- New startup flow (load JSON from GCS)
- Background enrichment function
- Updated API endpoints

### Step 4: Update oscar-agent.js

Use `placeService.searchPlaces()` instead of inline implementation.

### Step 5: Update index.html

- Loading states for null enrichment
- Polling logic

### Step 6: Data Migration

Convert existing data to new format:

```javascript
// One-time migration script
async function migrateData() {
  // Load old format
  const txt = fs.readFileSync('./itinerary.txt', 'utf-8');
  const oldJson = JSON.parse(fs.readFileSync('./itinerary.json', 'utf-8'));

  // Parse txt
  const parsed = parseItinerary(txt);

  // Build new format, preserving any existing enrichment
  const newData = {
    hotel: {
      description: parsed.hotel,
      enrichment: oldJson.hotel?.address ? extractEnrichment(oldJson.hotel) : null
    },
    days: parsed.days.map((day, dayIdx) => ({
      ...day,
      items: day.items.map((item, itemIdx) => ({
        ...item,
        enrichment: extractExistingEnrichment(oldJson, dayIdx, itemIdx)
      }))
    })),
    reservations: parsed.reservations.map((res, idx) => ({
      description: res,
      enrichment: extractReservationEnrichment(oldJson, idx)
    })),
    notes: parsed.notes
  };

  // Save new format
  await storage.writeItineraryJson(newData);

  // Trigger enrichment for null items
  await runBackgroundEnrichment();
}
```

### Step 7: Cleanup

After migration verified:
- Remove `lib/enricher.js`
- Remove `lib/gemini-research.js` (if unused)
- Remove `itinerary.txt` from GCS (keep local for backup)

## Testing Checklist

- [ ] Server starts and loads JSON from GCS
- [ ] Server starts with local fallback if GCS unavailable
- [ ] Editor save triggers background enrichment
- [ ] Oscar's searchPlaces uses place-service
- [ ] Oscar updates trigger background enrichment
- [ ] UI shows loading state for null enrichment
- [ ] UI polls and updates when enrichment arrives
- [ ] Enrichment persists across server restart
- [ ] Gemini failure doesn't break the app
- [ ] GCS failure doesn't break the app

## Success Metrics

- **Startup time:** < 2 seconds (no enrichment blocking)
- **Enrichment quality:** Maps-grounded, preferences-aware
- **Persistence:** Data survives Cloud Run restarts
- **API calls:** Only enrich new/changed items
