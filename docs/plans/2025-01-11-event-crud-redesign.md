# Event CRUD Redesign

> Stripe-level elegant UX for editing itinerary events

## Overview

Replace the global "Edit Mode" with inline-everywhere editing. Every event card is clickable → editable. Input is freeform text, enrichment handles the rest, raw text becomes invisible beneath the rich display.

## Core Interaction Model

### Two Card States

**Display State (default):**
- Clean card showing enriched content: venue name, hook line, time badge, neighborhood
- Subtle expand chevron for full details (hours, tips, directions)
- No visible edit affordances - the whole card IS the affordance

**Edit State (on click):**
- Card transforms into single-line text input
- Auto-focused, contains original raw text (e.g., "7:30pm Carbone, Greenwich Village")
- Placeholder if empty: `dinner at Carbone, 7pm`
- **Enter** or **click outside** → save
- **Escape** → cancel, revert to previous
- Trash icon appears at right edge for delete

### The Source/Display Split

Raw text is the "source code" - stored but never displayed after enrichment. The enriched card IS the UI. Clicking to edit reveals the source temporarily.

## Timeline Visual Hierarchy

Events range from definite to tentative. Visual weight communicates this instantly.

| Type | Example | Treatment |
|------|---------|-----------|
| **Locked time** | "7:30pm Carbone" | Full opacity, solid coral left border, prominent time badge |
| **Time range** | "2-4pm MoMA" | Full opacity, range badge with softer styling |
| **Vague/flexible** | "afternoon coffee" | 85-90% opacity, dashed left border, keyword time in softer type |
| **Fallback** | "fallback: Joe's Pizza" | 70-80% opacity, "Plan B" chip, slightly indented |
| **No time** | "Try the High Line" | Bottom "Ideas" section, dashed border all around |

## Save & Enrich Flow

The magic moment: type → Enter → watch text become a rich card.

**Immediate (0ms):**
- Input locks (subtle disabled state)
- Text stays visible but faded
- Shimmer animation begins

**Processing (0-2s):**
- Gradient shimmer moves left-to-right over text
- Card height may be slightly indeterminate

**Reveal (~2s):**
- Shimmer stops
- Text fades down, rich content fades up (morph animation, ~300ms)
- Height animates to fit enriched content
- Subtle scale pop (1.0 → 1.02 → 1.0) to celebrate

**Error/Offline:**
- Card saves with basic info
- Shows raw text as title, "Add details..." as hook
- Never blocks - graceful degradation

## Adding Events

**Ghost Cards:**
- Each time section (morning/afternoon/evening/night) has a ghost card at the end
- Faint dashed outline, placeholder: "Add something..."
- Click → transforms to input → type → Enter → real card
- Ghost reappears below, ready for next

**Smart Time Inference:**
- "7pm dinner at Lilia" in evening section → uses 7pm
- "coffee at Devoción" in morning section → infers "morning"
- Section provides context, explicit time always wins

**Empty Day:**
- Single centered ghost card
- Placeholder: "What's the plan?"

## Deleting Events

**Flow:**
- In edit mode, trash icon at right edge of input
- Click → card fades out + collapses (200ms)
- Toast: "Event deleted" with "Undo" (5 second window)
- Surrounding cards slide up smoothly

**Alternative:** Select all + Backspace triggers same flow

**Undo:**
- Card re-inflates in original position
- Other cards slide back
- Input focused for continued editing

**No confirmation dialogs** - undo is better UX.

## Animations

| Action | Animation | Duration |
|--------|-----------|----------|
| Click to edit | Card → input morph | 200ms ease-out |
| Save (processing) | Shimmer gradient | Until enriched |
| Save (reveal) | Text → card morph + scale pop | 300ms ease-out |
| Delete | Fade out + height collapse | 200ms ease-out |
| Undo | Fade in + height expand | 200ms ease-out |
| Reorder (drag) | Card follows cursor, gap opens | Real-time |

## What Gets Removed

- Global "Edit" / "Done" buttons in header
- Bulk edit mode (all cards as forms)
- Separate time picker field
- Multi-input inline form (time, description, toggles)
- Confirmation dialogs

## Files Affected

| File | Changes |
|------|---------|
| `index.html` | Card rendering, edit states, animations, ghost cards, toast system |
| `server.js` | Minimal - endpoints mostly unchanged |
| `lib/parser.js` | May need flexible time parsing tweaks |
| `lib/enricher.js` | Already solid, minimal changes |

## Success Criteria

- [ ] Click any event → single text input appears
- [ ] Enter saves, Escape cancels, click-outside saves
- [ ] Shimmer → morph animation on save
- [ ] Visual hierarchy distinguishes locked/ranged/vague/fallback times
- [ ] Ghost cards for adding events in each section
- [ ] Delete with undo toast, no confirmation dialog
- [ ] All transitions feel smooth and intentional (Stripe-level polish)
