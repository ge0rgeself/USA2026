# Event Enrichment Design

Rich, researched details for itinerary events—context, history, and practical tips.

## Overview

Enhance how individual events appear on the timeline by adding curated details:
- **Specific venues** (restaurants, museums, clubs): history, what to order, hours, prices, pro tips
- **Walking routes** (exploratory activities): narrative description, waypoints, distance/duration, route link

Details are pre-researched and stored, then refreshed when the itinerary changes via editor or chat.

## Data Structure

### Specific Venues

```json
{
  "time": "11am",
  "description": "Katz's Delicatessen",
  "type": "food",
  "place": {
    "name": "Katz's Delicatessen",
    "hook": "1888 - The pastrami",
    "description": "New York's most famous deli, serving pastrami the same way since 1888. This is where Meg Ryan faked her orgasm in When Harry Met Sally—look for the sign above that table.",
    "tips": "Get a ticket at the door and DON'T lose it. Tip your cutter $2-5 cash for thicker slices. Expect a 15-20 min wait on weekends.",
    "hours": "8am-10:45pm daily",
    "price": "$$",
    "address": "205 E Houston St, New York, NY 10002",
    "neighborhood": "LES",
    "mapsUrl": "https://maps.google.com/?q=Katz's+Delicatessen",
    "website": "https://katzsdelicatessen.com"
  }
}
```

### Walking Routes

```json
{
  "time": "4pm",
  "description": "Central Park walk",
  "type": "activity",
  "place": {
    "name": "Central Park: The Mall to Bow Bridge",
    "hook": "1.2 mi - NYC's iconic stroll",
    "description": "The most beautiful walk in Manhattan. Start at the Literary Walk lined with statues of writers, emerge at Bethesda Terrace (the angel fountain from Angels in America), then cross to Bow Bridge for the park's most photographed view.",
    "waypoints": [
      "The Mall – grand elm-lined promenade, statues of Shakespeare & Burns",
      "Bethesda Terrace – Angel of the Waters fountain, great people-watching",
      "Bow Bridge – cast-iron beauty, views of the Ramble and skyline"
    ],
    "tips": "Late afternoon light is best for photos. Grab a hot chocolate from the nearby cafe if it's cold.",
    "distance": "1.2 miles",
    "duration": "45-60 min with stops",
    "routeUrl": "https://maps.google.com/..."
  }
}
```

## UI Presentation

### Collapsed Row

Shows at-a-glance info with new "hook" field:

```
● 11 AM   Katz's Delicatessen                    1888 - The pastrami   LES   ▼
```

Hook appears after name in muted style—gives excitement without clutter.

### Expanded View: Venues

```
┌─────────────────────────────────────────────────────────────────────┐
│ ● 11 AM   Katz's Delicatessen                1888 - The pastrami  LES  ▲ │
├─────────────────────────────────────────────────────────────────────┤
│  New York's most famous deli, serving pastrami the same way since   │
│  1888. This is where Meg Ryan faked her orgasm in When Harry Met    │
│  Sally—look for the sign above that table.                          │
│                                                                     │
│  Tips: Get a ticket at the door and DON'T lose it. Tip your cutter │
│  $2-5 cash for thicker slices. Expect 15-20 min wait weekends.     │
│                                                                     │
│  8am-10:45pm daily  •  $$                                          │
│                                                                     │
│  [Directions]  [Website]                                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Expanded View: Walking Routes

```
┌─────────────────────────────────────────────────────────────────────┐
│ ● 4 PM   Central Park walk              1.2 mi - NYC's iconic stroll  ▲ │
├─────────────────────────────────────────────────────────────────────┤
│  The most beautiful walk in Manhattan. Start at the Literary Walk   │
│  lined with statues of writers, emerge at Bethesda Terrace, then    │
│  cross to Bow Bridge for the park's most photographed view.         │
│                                                                     │
│  → The Mall – grand elm-lined promenade, statues of Shakespeare     │
│  → Bethesda Terrace – Angel of the Waters fountain, people-watching │
│  → Bow Bridge – cast-iron beauty, views of the Ramble and skyline   │
│                                                                     │
│  Tips: Late afternoon light is best. Grab hot chocolate if cold.   │
│                                                                     │
│  45-60 min  •  1.2 miles                                           │
│                                                                     │
│  [View Route]                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Enrichment Flow

### Trigger 1: Editor Save

1. User edits itinerary in Editor panel and saves
2. Frontend sends updated itinerary to `POST /api/enrich`
3. Server parses text, identifies new/changed events
4. Claude researches and generates `place` objects for changed events only
5. Server returns enriched `itinerary.json`
6. Calendar re-renders with rich details

### Trigger 2: Chat-Driven Changes

1. User says "let's swap Minetta for Balthazar" in chat
2. Claude updates itinerary AND generates enriched `place` data in one response
3. Server saves updated `itinerary.json`
4. Calendar re-renders

### What Claude Does During Enrichment

For each event, Claude:
- Identifies if venue or walking route
- Researches via web search for current info
- Writes hook (5-7 words, punchy)
- Writes description (2-3 sentences: context + history)
- Compiles practical tips
- Generates appropriate maps URLs

### Selective Enrichment

Only re-enriches changed events. Editing Central Park walk doesn't re-research Katz's.

## Edge Cases

### Unknown Places

If Claude can't find solid info (e.g., "coffee near hotel"):
```json
{
  "hook": "Morning caffeine",
  "description": "Grab coffee from one of the many spots around Freeman Alley—Cafe Grumpy and Abraco are nearby favorites.",
  "tips": null
}
```

No fake details. Honest and useful.

### Enrichment Failure

If API call fails, save raw itinerary anyway. Calendar works with basic info. User can re-trigger enrichment later.

### Stale Data

Hours/prices can change. Optional "last enriched" timestamp for visibility. Not critical for a 5-day trip.

## Implementation Components

1. **Data**: Update `itinerary.json` schema with enriched `place` objects
2. **UI**: Modify `renderEventRow()` to show hook in collapsed view, rich details in expanded
3. **Server**: Add `POST /api/enrich` endpoint that calls Claude for research
4. **Chat**: Update chat system prompt to generate enriched data when modifying itinerary
5. **Editor**: Hook save action to trigger enrichment for changed events
