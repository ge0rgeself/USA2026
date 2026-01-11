# Calendar UX Improvements

## Changes

### 1. Remove Reservations Banner
Delete the red reservations counter banner at the top of the calendar view. It provides little value.

**Files affected:**
- `index.html` - Remove HTML element, CSS styles, and JS logic

**Removals:**
- HTML: `#reservations-banner` element
- CSS: `.reservations-banner` styles
- JS: `updateReservationsBanner()` method and its call in `render()`

### 2. Add Persistent Hotel Card

Add a compact, always-visible hotel card at the top of every day's event list.

**Design:**
```
┌─────────────────────────────────────────────────────┐
│ ●  Untitled at 3 Freeman Alley    LES   Directions →│
└─────────────────────────────────────────────────────┘
```

**Behavior:**
- Appears between day pills and first time divider
- Shows on all 5 days (not just day 1)
- No expand/collapse - always shows full compact info
- Styled distinctly from timeline event rows

**Content:**
- Hotel type dot (black)
- Hotel name
- Neighborhood abbreviation (LES)
- Directions link (opens Google Maps)

**Implementation:**
- Add new `.hotel-card` CSS styles
- Modify `CalendarRenderer.render()` to always render hotel card
- Remove the day-1-only hotel row logic from `renderDayItems()`
