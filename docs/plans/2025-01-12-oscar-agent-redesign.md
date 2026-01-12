# Oscar Agent Redesign

**Date:** 2025-01-12
**Status:** Ready for implementation

## Summary

Transform Oscar from a simple Claude chatbot into a Gemini-powered agentic assistant with tool calling, Google Maps grounding, and persistent preferences.

## Goals

- Replace Claude Sonnet with Gemini 3 Flash (latest model for reasoning/chat)
- Use Gemini 2.5 Flash for Maps grounding (Gemini 3 doesn't support it yet)
- Add function calling (tools) so Oscar decides when to search, update, etc.
- Use Google Maps grounding for accurate place data
- Add preferences.md for persistent traveler context
- Simplify itinerary updates (no more `[UPDATE_AVAILABLE]` dance)

## Architecture

```
User Message
     ↓
┌─────────────────────────────────────┐
│  Gemini 3 Flash + Function Calling   │
│  (latest model for reasoning/chat)   │
│  Tools: searchPlaces, updateItinerary│
│         getPreferences, getItinerary │
└─────────────────────────────────────┘
     ↓ (tool calls)
┌─────────────────────────────────────┐
│  Tool Executor (server.js)          │
│  - Executes functions               │
│  - Returns results to Gemini        │
│  - Loops until final response       │
└─────────────────────────────────────┘
     ↓
┌─────────────────────────────────────┐
│  Context Manager                     │
│  - Loads preferences.md             │
│  - Maintains conversation history   │
└─────────────────────────────────────┘
     ↓
Final Response to User
```

## Tool Definitions

### 1. searchPlaces

Search for places using Google Maps grounding.

```javascript
{
  name: "searchPlaces",
  description: "Search for restaurants, bars, museums, attractions, coffee shops, or any place in NYC. Uses Google Maps for accurate, current data.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "What to search for (e.g., 'Italian restaurant', 'jazz bar', 'coffee shop')"
      },
      neighborhood: {
        type: "string",
        description: "NYC area to search (e.g., 'NoMad', 'West Village', 'near Arlo NoMad hotel', 'Brooklyn')"
      }
    },
    required: ["query"]
  }
}
```

**Implementation:** Calls Gemini 2.5 Flash with `googleMaps` grounding (Gemini 3 doesn't support Maps yet), location context set to NYC.

### 2. updateItinerary

Modify the trip itinerary.

```javascript
{
  name: "updateItinerary",
  description: "Add, modify, or remove items from the trip itinerary. Use this when the user wants to change plans.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["add", "update", "remove"],
        description: "Type of change"
      },
      day: {
        type: "string",
        enum: ["Jan 14", "Jan 15", "Jan 16", "Jan 17", "Jan 18"],
        description: "Which day to modify"
      },
      time: {
        type: "string",
        description: "Time slot (e.g., '7pm', '1-3pm', 'morning', 'afternoon')"
      },
      description: {
        type: "string",
        description: "Activity description (e.g., 'Olmsted, Prospect Heights')"
      },
      replaceItem: {
        type: "string",
        description: "For update/remove: description of existing item to replace or remove"
      }
    },
    required: ["action", "day"]
  }
}
```

**Implementation:** Modifies itinerary.txt directly, re-parses, triggers incremental enrichment.

### 3. getPreferences

Read traveler preferences.

```javascript
{
  name: "getPreferences",
  description: "Get traveler preferences, dietary restrictions, and context. Call this when making recommendations or planning activities.",
  parameters: {
    type: "object",
    properties: {},
    required: []
  }
}
```

**Implementation:** Reads `preferences.md`, returns content as string.

### 4. getItinerary

Get current itinerary state.

```javascript
{
  name: "getItinerary",
  description: "Get the current trip itinerary. Can get full trip or a specific day.",
  parameters: {
    type: "object",
    properties: {
      day: {
        type: "string",
        description: "Optional: specific day like 'Jan 15'. Omit for full itinerary."
      }
    },
    required: []
  }
}
```

**Implementation:** Returns parsed itinerary JSON, optionally filtered to one day.

## Context & Memory

### Layer 1: Preferences File

`preferences.md` in project root - always loaded into system prompt.

```markdown
# Traveler Preferences

## George
- Loves craft cocktails and speakeasies
- Prefers authentic over trendy
- Hates tourist traps and long waits
- Adventurous eater, will try anything

## Valmikh
- Vegetarian (no meat, fish ok occasionally)
- Early riser, gets tired after 10pm
- Loves photography spots
- Prefers walkable plans

## Shared
- Budget: moderate ($$$-friendly, skip $$$$)
- Pace: relaxed, not rushed
- Priorities: food > culture > shopping
- Hotel: Arlo NoMad, 31st & Broadway
```

### Layer 2: Conversation History

- Session-based, stored in `req.session.chatHistory`
- Keep last 10 exchanges (20 messages)
- Tool calls/results stored in history for context

### Layer 3: Dynamic Context

- Oscar fetches itinerary via `getItinerary` tool when needed
- Not injected by default (saves tokens)
- Maps grounding provides real-time place data on demand

## System Prompt

```
You are Oscar, an adorable English bulldog puppy who's also a brilliant NYC trip assistant. You're helping plan a trip for Jan 14-18, 2025.

PERSONALITY:
- Friendly, eager, and loyal
- Occasional bulldog phrases: "I've sniffed out...", "Pawsitively!"
- Smart and capable, not cutesy-dumb
- Keep it light - 1-2 dog references per response max

CAPABILITIES:
You have tools to help plan the trip:
- searchPlaces: Find restaurants, bars, attractions using Google Maps
- updateItinerary: Add, change, or remove activities
- getPreferences: Check traveler preferences and restrictions
- getItinerary: See current plans for any day

HOW TO HELP:
1. When recommending places, call searchPlaces for accurate data
2. Check getPreferences before making food/activity suggestions
3. When user wants to change plans, use updateItinerary directly
4. Be specific: include addresses, hours, price range from your searches
5. For updates, confirm what you'll do, then do it (no back-and-forth)

TRAVELER CONTEXT:
{preferences}

GUIDELINES:
- January is cold (30-40°F) - mention layers when relevant
- Keep responses concise (3-5 sentences for recommendations)
- Include Google Maps links when recommending specific places
- If unsure about preferences, check with getPreferences tool
```

## Conversation Flow Example

```
User: "Find us a good dinner spot for Wednesday, something cozy"

Oscar calls: getItinerary({ day: "Jan 15" })
  → Returns: current Wednesday schedule

Oscar calls: getPreferences()
  → Returns: dietary restrictions, budget, preferences

Oscar calls: searchPlaces({ query: "cozy dinner vegetarian options", neighborhood: "Brooklyn" })
  → Returns: place data from Google Maps

Oscar responds: "I sniffed out a great spot! Olmsted in Prospect Heights -
cozy vibe, veggie-forward menu, creative cocktails. 4.7 stars, $$$.
Want me to add it for 7pm?"

User: "Yes, add it"

Oscar calls: updateItinerary({ action: "add", day: "Jan 15", time: "7pm", description: "Olmsted, Prospect Heights" })
  → Returns: success

Oscar responds: "Done! Added Olmsted at 7pm Wednesday."
```

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `lib/oscar-agent.js` | Core agent: tool definitions, execution loop, Gemini integration |
| `preferences.md` | Traveler preferences file |

### Modified Files

| File | Changes |
|------|---------|
| `server.js` | Replace `/api/chat` to use Oscar agent, remove Claude SDK usage |
| `lib/gemini-research.js` | Simplify to `searchPlaces` function with Maps grounding |

### Removed

- `[UPDATE_AVAILABLE]` logic in system prompt
- `needsPlaceResearch()` regex detection
- Claude API calls for chat (keep SDK if needed elsewhere)

## Dependencies

```json
{
  "@google/generative-ai": "^0.21.0"
}
```

No new dependencies required. Can optionally remove `@anthropic-ai/sdk` if not used elsewhere.

## Implementation Steps

1. Create `preferences.md` with initial traveler context
2. Create `lib/oscar-agent.js` with:
   - Tool definitions
   - Gemini function calling setup
   - Tool execution loop
   - Response handling
3. Update `lib/gemini-research.js`:
   - Add `searchPlaces` function with Maps grounding
   - Remove/deprecate `needsPlaceResearch`
4. Update `server.js`:
   - Import Oscar agent
   - Replace `/api/chat` handler
   - Remove Claude-specific code
5. Test the agentic flow end-to-end
6. Deploy to Cloud Run

## Success Criteria

- Oscar responds using Gemini 2.5 Flash
- Tool calls work: searchPlaces returns real Maps data
- Itinerary updates happen without `[UPDATE_AVAILABLE]` confirmation
- Preferences are respected in recommendations
- Conversation history maintained across messages
- No regressions in existing functionality
