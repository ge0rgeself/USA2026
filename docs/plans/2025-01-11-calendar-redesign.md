# Calendar View Redesign

## Overview

Redesign the calendar view for mobile-first, on-the-go use. Show one day at a time with a compact, tap-to-expand event list.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Day display | One day at a time |
| Event list style | Compact scrollable, tap to expand |
| Day navigation | Horizontal date pills |
| Collapsed info | Time + name + type icon + neighborhood |
| Expanded info | Full address, directions, website, tips |
| Visual density | Comfortable compact (4-5 events visible) |

## Layout Structure

### Header (fixed, ~48px)
- "NYC Jan 14-18" branding left
- Current day displayed: "Thursday, Jan 16"

### Day Selector (sticky)
- 5 date pills: `14 Tue` | `15 Wed` | `16 Thu` | `17 Fri` | `18 Sat`
- Selected = filled background, others = outlined
- All 5 fit on screen without horizontal scroll

### Event List (scrollable)
- All events for selected day
- Collapsed by default, tap to expand
- Only one expanded at a time

### Bottom Nav
- Unchanged: Calendar / Editor / Chat

## Event Row Design

### Collapsed (~56px)

```
┌─────────────────────────────────────────────────┐
│  ●  11:00 AM   Katz's Delicatessen         LES │
└─────────────────────────────────────────────────┘
```

- Type dot (coral=food, teal=culture, violet=entertainment, sage=activity)
- Time (muted, left-aligned)
- Name (medium weight, truncates if needed)
- Neighborhood (right-aligned, extracted from address)

### Expanded (~160px)

```
┌─────────────────────────────────────────────────┐
│  ●  11:00 AM   Katz's Delicatessen              │
│                                                  │
│     205 E Houston St, Lower East Side           │
│                                                  │
│     [Directions]  [Website]                     │
│                                                  │
│     💡 Get ticket at door, tip cutter $2-5 cash │
└─────────────────────────────────────────────────┘
```

- Full address (tappable, opens Google Maps)
- Action buttons: Directions, Website (if available)
- Tips in subtle highlighted box

### Fallback/Optional Items
- Dashed left border instead of solid
- Small "Backup" or "Optional" badge
- Muted styling in collapsed state

## Special Elements

### Trip Info Row (Day 1 only)
- Hotel info as collapsible row at top
- House icon instead of type dot
- Expands to show address + directions

### Reservations Banner
- Shows below day selector if day has reservation items
- "2 reservations today" - tapping highlights those items

### Time Section Dividers
- Subtle dividers: Morning / Afternoon / Evening / Night
- Helps orient on busy days

## Removed Elements

- Hero section with large "New York" title
- Hotel card in hero
- Vertical timeline with connecting line
- All-days-visible scrolling layout

## Implementation Notes

### State Management
- `selectedDay`: Currently selected day (1-5)
- `expandedEvent`: Index of expanded event (null if none)

### Data Flow
- Same `/api/itinerary` endpoint
- Same JSON structure from enricher
- Extract neighborhood from address for collapsed display

### Animations
- Day switch: Fade transition (150ms)
- Event expand: Smooth height animation (200ms)
- Collapse previous when expanding new

### Mobile Considerations
- Touch targets minimum 44px
- Date pills ~60px wide to fit 5 across
- Comfortable spacing for walking-and-tapping
