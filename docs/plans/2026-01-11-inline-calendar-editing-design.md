# Inline Calendar Editing

**Date:** 2026-01-11
**Status:** Approved

## Summary

Replace the split-pane markdown Editor with inline editing directly in the Calendar view. Users edit events in place with minimal UI: a dropdown for time category, text input for description, and toggleable chips for labels. Enrichment handles the rest automatically.

## Changes Overview

**Removing:**
- Editor tab and split-pane markdown interface
- "Editor" navigation button

**Keeping:**
- Calendar view (becomes primary view for viewing AND editing)
- Chat with Oscar (unchanged)
- `itinerary.txt` → parser → enricher → JSON pipeline

**Adding:**
- Inline edit mode for event cards
- Add/delete event functionality
- New API endpoints for item-level CRUD

## Edit Mode Interaction

### Entering Edit Mode
- Pencil icon on right side of each collapsed event card
- Visible on hover (desktop) or always visible (mobile)
- Click pencil → card transforms into edit mode

### Edit Mode UI

| Field | Control |
|-------|---------|
| Time/Category | Dropdown: morning, afternoon, evening, night, or custom time |
| Description | Single-line text input |
| Labels | Toggleable chips: `Backup`, `Optional` |

### Saving & Exiting
- **Auto-save on blur** (click outside card)
- **Escape** to cancel without saving
- **Enter** to save and exit
- Subtle "Saving..." → "Saved ✓" indicator

## Add & Delete Events

### Adding
- `+ Add event` button at bottom of each time period section
- Click → new card in edit mode with empty fields
- Category pre-filled based on section clicked
- Empty description on blur → card removed (not saved)

### Deleting
- Trash icon appears in edit mode
- Click → card fades out with 3-second undo toast
- No confirmation modal

## Data Flow & Backend

### New API Endpoints

```
PATCH /api/itinerary/item   - Update single item
POST /api/itinerary/item    - Add new item
DELETE /api/itinerary/item  - Remove item
```

### Processing
1. Frontend sends changed item(s) to new endpoint
2. Server updates `itinerary.txt` programmatically
3. Enrichment runs only on changed/new items
4. Returns updated item with enriched place data

### Why Keep itinerary.txt
- Source of truth for backup/version control
- Oscar chat can still read/reference it
- Git history shows changes

## Visual Design

### Edit Mode Styling
- Subtle coral border (`#c9463d`) when in edit mode
- Borderless inputs with underline (editorial theme)
- Type dot (●) stays visible but not editable (inferred from enrichment)

### Layout
```
┌─────────────────────────────────────────────────────┐
│ ● [Dropdown: Evening ▾]                        🗑️  │
│   [Event description text input_______________]    │
│   [Backup] [Optional]  ← toggleable chips          │
└─────────────────────────────────────────────────────┘
```

### Add Button
- Muted gray text: `+ Add event`
- Coral on hover
- Appears on hover (desktop) or always visible (mobile)

## Out of Scope (YAGNI)

- Drag-and-drop reordering
- Bulk edit/delete
- Undo history beyond single-action toast
- Editing hotel or reservations inline
- Rich text or markdown in descriptions

## Edge Cases

- Empty description on new event → removed, not saved
- Enrichment fails → saves with raw description only
- Rapid edits → debounced, last state wins

## Navigation

Final navigation structure:
- **Calendar** | **Chat**
- Calendar is primary view for both viewing and editing
