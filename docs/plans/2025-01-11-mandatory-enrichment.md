# Mandatory Enrichment Design

**Goal:** Every event has enriched content. No blanks, no exceptions.

**Mental model:**
- User provides: title + time
- AI provides: everything else
- If AI fails: gentle "Add details..." prompt

---

## Data Structure

Every item always has a `place` object (never null):

```javascript
place: {
  name: "Cafe Mogador",              // from enrichment or original text
  hook: "1983 - Moroccan brunch icon", // or "Add details..." if unknown
  needsDetails: false,               // true when AI couldn't identify
  description: "...",
  tips: "...",
  hours: "...",
  price: "$$",
  address: "...",
  neighborhood: "EV",
  mapsUrl: "...",
  website: "..."
}
```

When `needsDetails: true`:
- `hook` = "Add details..."
- Other fields = empty strings
- UI renders with muted styling

---

## Enricher Changes

### 1. Remove looksLikePlace filter
Send ALL items to Gemini, not just "place-like" ones.

### 2. Update Gemini prompt
Ask Gemini to either:
- Return full enrichment if identifiable
- Return `{ needsDetails: true }` if not

### 3. Guarantee output
`mergeEnrichedData` ensures every item gets a `place` object, defaulting to needsDetails if Gemini returns nothing.

---

## UI Changes

Cards with `needsDetails: true`:
- Hook text: "Add details..." in muted/italic style
- No address, hours, or other fields
- Still fully functional (expandable, editable)
- Clicking edit allows user to refine description

---

## Files to Modify

1. `lib/enricher.js`
   - Remove `looksLikePlace` filter from `extractPlaces`
   - Update prompt in `batchEnrichPlaces` to handle unidentifiable items
   - Update `mergeEnrichedData` to guarantee place object on every item
   - Update `convertToDisplayFormat` fallback to include needsDetails

2. `index.html`
   - Add CSS for muted needsDetails styling
   - Update `renderEventRow` to handle needsDetails display
