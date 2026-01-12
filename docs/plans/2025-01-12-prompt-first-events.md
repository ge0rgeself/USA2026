# Prompt-First Events Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create implementation plan from this design.

**Goal:** Restructure events so the user edits a "prompt" and all display content comes from enrichment.

**Architecture:** Prompt is source of truth, enrichment generates title/time/details. Mobile-first, nothing hidden.

---

## Data Model

```javascript
Event {
  prompt: string              // User's input, e.g., "dinner at Carbone around 7pm"
  status: "primary" | "backup" | "optional"

  enrichment: {
    title: string             // Display name, e.g., "Carbone"
    time: string              // Parsed time, e.g., "7pm"
    address: string
    neighborhood: string
    hours: string
    price: string
    tips: string
    mapsUrl: string
    website: string
  }
}
```

Migration: Rename existing `description` field to `prompt`. Existing enrichment data preserved.

---

## UI States

### Collapsed (default)
```
●  7pm    Carbone                           BACKUP   ›
```
- Simple dot (no type-based coloring)
- Time (from enrichment, or empty)
- Title (from enrichment)
- Status badge if backup/optional
- Chevron

### Expanded (tapped)
```
●  7pm    Carbone                           BACKUP   ›
─────────────────────────────────────────────────────────
  181 Thompson St, Greenwich Village
  Tue-Sun 5:30-11pm · $$$$

  💡 Book 30 days out on Resy. Get the spicy rigatoni.

  [Directions]                                    [Edit]
```
- Address + neighborhood
- Hours + price
- Tips
- Directions button (maps link)
- Edit button

### Edit Mode
```
●  7pm    Carbone                           BACKUP   ›
─────────────────────────────────────────────────────────
  ┌───────────────────────────────────────────────────┐
  │ dinner at Carbone around 7pm                      │
  └───────────────────────────────────────────────────┘

  ○ Primary   ○ Backup   ○ Optional

  [Cancel]  [Save]                            [Delete]
```
- Prompt input (editable)
- Status radio buttons
- Cancel, Save, Delete actions

---

## Enrichment Flow

1. **On save**: Show prompt as temporary title + "Enriching..." indicator
2. **Interpreter**: Parse prompt → extract time, detect if place
3. **Enrichment**:
   - Place → Google Maps grounding → full details
   - Activity → Clean title, null place fields
4. **UI update**: Swap in enriched content

**Re-enrichment triggers:**
- Prompt edited and saved
- Manual retry on failure

**No re-enrichment:**
- Status change only
- Viewing/expanding

---

## CSS Cleanup

Remove:
- `@media (max-width: 600px) { .event-hook { display: none; } }`
- All hook-related display styles
- Type-based dot coloring

Keep:
- Simple dot styling
- Responsive layout (but show all content on mobile)

---

## Not Included

- Hook display (removed entirely)
- Type-based dot colors
- Hidden content on mobile
