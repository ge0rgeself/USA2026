# Event CRUD Redesign

## Overview

Upgrade the event creation and management experience with free-form prompt input, simplified day view, and consistent backup/optional handling across all workflows.

## Goals

1. **Free-form input** — Type natural language prompts instead of structured titles
2. **Flexible times** — Support no time, specific time, time ranges, or vague times
3. **Clean day view** — Remove horizontal dividers, simple event list
4. **Consistent backup/optional** — First-class status manageable everywhere
5. **Airtight CRUD** — Clean, safe, error-proof inline editing

## Non-Goals

- Separate event management page (manage inline in day view)
- Changing the enrichment engine (works well as-is)

---

## Architecture

### New Component: Interpreter (`lib/interpreter.js`)

A Gemini-powered layer that converts free-form prompts into structured event data.

**Input examples:**
- "dinner at Carbone tomorrow evening"
- "backup: Joe's Pizza if Carbone doesn't work out"
- "optional afternoon walk across Brooklyn Bridge"
- "Museum of Modern Art on Thursday"
- "late night drinks"

**Output:**
```js
{
  day: "Jan 15",           // resolved from context
  time: "evening",         // null | "7:30pm" | "4-6pm" | "afternoon"
  timeType: "vague",       // "specific" | "range" | "vague" | "none"
  description: "Carbone, Greenwich Village",
  status: "primary"        // "primary" | "backup" | "optional"
}
```

**Context available to interpreter:**
- Trip dates (Jan 14-18, 2025)
- Current date for relative resolution ("tomorrow", "Thursday")
- Existing events for matching on update/remove

**Fallback:** If ambiguous, returns clarifying question rather than guessing.

---

## Day View Simplification

### Remove
- Horizontal time-of-day dividers (morning/afternoon/evening sections)

### New Layout
```
┌─────────────────────────────────────┐
│ Jan 15 (Wed) - Downtown Exploring   │
├─────────────────────────────────────┤
│ ○ 10am      MoMA                    │
│ ○ afternoon Chelsea Market          │
│ ○ 7:30pm    Carbone                 │
│ ○ evening   Comedy Cellar  OPTIONAL │
│ ○           Joe's Pizza     BACKUP  │
│                                     │
│ + Add event...                      │
└─────────────────────────────────────┘
```

### Sorting Logic
1. Events with specific times → chronological
2. Vague times → morning < afternoon < evening < late night
3. No time → end of list
4. Backup events → after related primary or at end

### Visual Treatment
- Primary: full opacity
- Optional: muted + "OPTIONAL" pill badge
- Backup: muted + "BACKUP" pill badge

---

## Inline CRUD Experience

### UX Principles
- Clear affordances — obvious what's clickable/editable
- Safe by default — no accidental deletions, easy undo
- Progressive disclosure — simple view, details on demand
- Instant feedback — loading states, success/error
- Keyboard-friendly — Enter to save, Escape to cancel

### Event Row States

**1. View mode (default):**
```
┌─────────────────────────────────────────────┐
│ 7:30pm    Carbone                     •••   │
│           Greenwich Village    [OPTIONAL]   │
└─────────────────────────────────────────────┘
```
- Click row → edit mode
- ••• menu → Edit, Delete
- Badge only if backup/optional

**2. Edit mode:**
```
┌─────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────┐ │
│ │ Carbone around 7:30pm                   │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│  Status:  ● Primary  ○ Backup  ○ Optional   │
│                                             │
│  ┌────────┐  ┌──────┐          ┌──────────┐ │
│  │ Cancel │  │ Save │          │ Delete...│ │
│  └────────┘  └──────┘          └──────────┘ │
└─────────────────────────────────────────────┘
```
- Pre-filled with description + time as natural text
- Radio buttons for status
- Delete separated, requires confirmation
- Enter saves, Escape cancels
- Click outside → prompt if unsaved changes

**3. Adding new:**
```
┌─────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────┐ │
│ │ What's the plan?                        │ │
│ └─────────────────────────────────────────┘ │
│  hint: "dinner at Carbone around 7pm"       │
│                                             │
│  ┌────────┐  ┌──────┐                       │
│  │ Cancel │  │ Add  │                       │
│  └────────┘  └──────┘                       │
└─────────────────────────────────────────────┘
```
- Defaults to Primary
- Empty submit blocked
- Placeholder + hint guides format

**4. Loading/enriching:**
```
┌─────────────────────────────────────────────┐
│ 7:30pm    Carbone                    ⟳      │
│           Enriching...                      │
└─────────────────────────────────────────────┘
```
- Not editable during enrichment

**5. Error state:**
```
┌─────────────────────────────────────────────┐
│ 7:30pm    Carbone                     ⚠️    │
│           Couldn't enrich – Retry?          │
└─────────────────────────────────────────────┘
```
- Retry link to re-attempt
- Event usable even without enrichment

### Delete Flow
1. Click Delete → inline confirmation: "Delete this event? [Yes, delete] [No, keep]"
2. Auto-cancels after 5 seconds
3. On delete → toast with "Undo" for 5 seconds

---

## Oscar Chatbot Integration

### Updated Tool Signature

**Before:**
```js
updateItinerary(action, day, time, description, replaceItem)
```

**After:**
```js
updateItinerary(action, prompt, options?)
// action: "add" | "update" | "remove"
// prompt: free-form text
// options: { backup?: boolean, optional?: boolean, replaceItem?: string }
```

### Example Usage

**User:** "Add a backup dinner option for Tuesday in case Carbone doesn't work"
**Oscar calls:**
```js
updateItinerary("add", "Joe's Pizza Tuesday evening", { backup: true })
```

**User:** "Make the Brooklyn Bridge walk optional"
**Oscar calls:**
```js
updateItinerary("update", "Brooklyn Bridge walk", { optional: true })
```

**User:** "Remove the comedy show"
**Oscar calls:**
```js
updateItinerary("remove", "Comedy Cellar")
```

### Error Handling
- Ambiguous prompts → interpreter returns clarifying question
- Oscar relays to user: "Which day did you mean — Tuesday or Wednesday?"

---

## Data Model

### itinerary.txt Format

```
# Jan 15 (Wed) - Downtown Day
- 10am: MoMA, Midtown
- afternoon: Chelsea Market
- 7:30pm: Carbone, Greenwich Village
- 7:30pm fallback: Joe's Pizza, West Village
- 9pm optional: Comedy Cellar
- Walk around SoHo
```

**Supported patterns:**
- `TIME: description` — specific/range/vague time
- `TIME fallback: description` — backup with time
- `TIME optional: description` — optional with time
- `fallback: description` — backup without time
- `optional: description` — optional without time
- `description` — no time, primary

### itinerary.json Structure (per item)

```js
{
  time: "7:30pm" | "afternoon" | null,
  timeType: "specific" | "range" | "vague" | "none",
  description: "Carbone, Greenwich Village",
  status: "primary" | "backup" | "optional",
  enrichment: {
    name: "Carbone",
    hook: "...",
    tip: "...",
    // ... rest of enrichment data
  }
}
```

**Key change:** Single `status` field replaces `backup` and `optional` booleans.

---

## Implementation Checklist

### Backend
- [ ] Create `lib/interpreter.js` with Gemini prompt for free-form parsing
- [ ] Update `lib/parser.js` to handle new time formats and status field
- [ ] Update `lib/oscar-agent.js` with new `updateItinerary` signature
- [ ] Update API endpoints to use interpreter for event creation/updates

### Frontend
- [ ] Remove horizontal time dividers from day view
- [ ] Implement new event list layout with sorting
- [ ] Build inline edit mode with status radio buttons
- [ ] Build add event flow with free-form input
- [ ] Add loading/enriching state
- [ ] Add error state with retry
- [ ] Implement delete confirmation flow
- [ ] Add undo toast for deletions
- [ ] Update badge display for backup/optional

### Data Migration
- [ ] Update existing itinerary.txt to new format (if needed)
- [ ] Migrate `backup`/`optional` booleans to `status` field in JSON

---

## Open Questions

None — design is complete and approved.
