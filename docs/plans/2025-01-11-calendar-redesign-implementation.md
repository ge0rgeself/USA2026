# Calendar View Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current all-days scrolling calendar with a mobile-first, single-day view featuring compact tap-to-expand event rows.

**Architecture:** Rewrite the calendar view HTML and CSS in `index.html`. Replace the `CalendarRenderer` class with a new version that manages `selectedDay` and `expandedEvent` state. Day selection via pills, event expansion via click handlers. Remove hero section entirely.

**Tech Stack:** Vanilla HTML/CSS/JS (no frameworks). CSS transitions for animations. Existing enriched JSON data structure unchanged.

---

### Task 1: Add New CSS Variables and Remove Old Calendar Styles

**Files:**
- Modify: `index.html:10-30` (CSS variables)
- Modify: `index.html:224-891` (remove old calendar CSS, add new)

**Step 1: Add new CSS custom properties**

Add after line 29 (after `--nav-height-mobile`):

```css
--event-row-height: 56px;
--event-expanded-height: auto;
--type-dot-size: 10px;
```

**Step 2: Delete old calendar CSS**

Remove the entire `/* ========== CALENDAR VIEW (existing styles) ========== */` section from line 224 through line 891 (hero, day-nav, calendar-main, reservations, day, timeline, event, all of it).

**Step 3: Add new compact calendar CSS**

Add this new CSS block where the old calendar CSS was:

```css
/* ========== CALENDAR VIEW (Compact Redesign) ========== */
.cal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--timeline-line);
}

.cal-header-brand {
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    letter-spacing: 0.5px;
}

.cal-header-day {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 16px;
    font-weight: 500;
    color: var(--text-primary);
}

/* Day Pills */
.day-pills {
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 12px 16px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--timeline-line);
    position: sticky;
    top: var(--nav-height);
    z-index: 50;
}

@media (max-width: 768px) {
    .day-pills {
        top: 0;
    }
}

.day-pill {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 12px;
    min-width: 56px;
    border: 1px solid var(--timeline-line);
    border-radius: 10px;
    background: transparent;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
}

.day-pill:hover {
    background: var(--bg-elevated);
}

.day-pill.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg-deep);
}

.day-pill-date {
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 18px;
    font-weight: 500;
    line-height: 1;
}

.day-pill-dow {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 2px;
    opacity: 0.7;
}

.day-pill.active .day-pill-dow {
    opacity: 1;
}

/* Event List */
.event-list {
    padding: 8px 16px 100px;
    max-width: 600px;
    margin: 0 auto;
}

/* Time Divider */
.time-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 0 8px;
}

.time-divider-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--text-secondary);
    font-weight: 500;
}

.time-divider-line {
    flex: 1;
    height: 1px;
    background: var(--timeline-line);
}

/* Event Row */
.event-row {
    background: var(--bg-card);
    border: 1px solid var(--timeline-line);
    border-radius: 12px;
    margin-bottom: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.2s ease;
}

.event-row:hover {
    border-color: var(--accent-dim);
}

.event-row.fallback,
.event-row.optional {
    border-style: dashed;
    opacity: 0.8;
}

.event-row-collapsed {
    display: flex;
    align-items: center;
    padding: 14px 16px;
    gap: 12px;
    min-height: var(--event-row-height);
}

.event-type-dot {
    width: var(--type-dot-size);
    height: var(--type-dot-size);
    border-radius: 50%;
    flex-shrink: 0;
}

.event-type-dot.food { background: var(--coral); }
.event-type-dot.culture { background: var(--teal); }
.event-type-dot.entertainment { background: var(--violet); }
.event-type-dot.activity { background: var(--sage); }
.event-type-dot.transit { background: var(--timeline-line); }
.event-type-dot.hotel { background: var(--accent); }

.event-time {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--text-secondary);
    min-width: 65px;
    flex-shrink: 0;
}

.event-name {
    flex: 1;
    font-size: 15px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.event-badge {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--bg-elevated);
    color: var(--text-secondary);
    flex-shrink: 0;
}

.event-neighborhood {
    font-size: 12px;
    color: var(--text-secondary);
    flex-shrink: 0;
}

.event-chevron {
    width: 16px;
    height: 16px;
    color: var(--text-secondary);
    transition: transform 0.2s ease;
    flex-shrink: 0;
}

.event-row.expanded .event-chevron {
    transform: rotate(180deg);
}

/* Event Expanded */
.event-row-expanded {
    display: none;
    padding: 0 16px 16px;
    padding-left: calc(16px + var(--type-dot-size) + 12px);
}

.event-row.expanded .event-row-expanded {
    display: block;
}

.event-address {
    font-size: 14px;
    color: var(--text-secondary);
    margin-bottom: 12px;
}

.event-address a {
    color: var(--text-secondary);
    text-decoration: none;
}

.event-address a:hover {
    color: var(--text-primary);
    text-decoration: underline;
}

.event-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 12px;
}

.event-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: 1px solid var(--timeline-line);
    border-radius: 8px;
    background: var(--bg-elevated);
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
    transition: all 0.15s ease;
}

.event-action-btn:hover {
    background: var(--bg-main);
    border-color: var(--accent-dim);
}

.event-action-btn svg {
    width: 14px;
    height: 14px;
}

.event-tips {
    background: var(--bg-main);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.5;
}

.event-tips::before {
    content: '💡 ';
}

/* Hotel Row (special styling) */
.event-row.hotel-row .event-type-dot {
    background: var(--accent);
}

/* Reservations Banner */
.reservations-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: rgba(201, 70, 61, 0.08);
    border-bottom: 1px solid rgba(201, 70, 61, 0.2);
    font-size: 13px;
    color: var(--coral);
    font-weight: 500;
}

.reservations-banner svg {
    width: 16px;
    height: 16px;
}

/* Day transition */
.event-list {
    opacity: 1;
    transition: opacity 0.15s ease;
}

.event-list.transitioning {
    opacity: 0;
}
```

**Step 4: Commit**

```bash
git add index.html
git commit -m "refactor: replace old calendar CSS with compact redesign styles"
```

---

### Task 2: Replace Calendar View HTML Structure

**Files:**
- Modify: `index.html:1550-1590` (calendar view HTML)

**Step 1: Replace the calendar view HTML**

Find the `<!-- ========== CALENDAR VIEW ========== -->` section and replace from `<div id="view-calendar"` through its closing `</div>` with:

```html
<!-- ========== CALENDAR VIEW ========== -->
<div id="view-calendar" class="view active visible">
    <header class="cal-header">
        <span class="cal-header-brand">NYC Jan 14-18</span>
        <span id="cal-current-day" class="cal-header-day">Tuesday, Jan 14</span>
    </header>

    <nav class="day-pills" id="day-pills">
        <button class="day-pill active" data-day="1">
            <span class="day-pill-date">14</span>
            <span class="day-pill-dow">Tue</span>
        </button>
        <button class="day-pill" data-day="2">
            <span class="day-pill-date">15</span>
            <span class="day-pill-dow">Wed</span>
        </button>
        <button class="day-pill" data-day="3">
            <span class="day-pill-date">16</span>
            <span class="day-pill-dow">Thu</span>
        </button>
        <button class="day-pill" data-day="4">
            <span class="day-pill-date">17</span>
            <span class="day-pill-dow">Fri</span>
        </button>
        <button class="day-pill" data-day="5">
            <span class="day-pill-date">18</span>
            <span class="day-pill-dow">Sat</span>
        </button>
    </nav>

    <div id="reservations-banner" class="reservations-banner" style="display: none;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
        </svg>
        <span id="reservations-text"></span>
    </div>

    <main id="event-list" class="event-list">
        <!-- Dynamically rendered by CalendarRenderer -->
    </main>
</div>
```

**Step 2: Commit**

```bash
git add index.html
git commit -m "refactor: replace calendar view HTML with compact single-day structure"
```

---

### Task 3: Rewrite CalendarRenderer Class

**Files:**
- Modify: `index.html:2049-2224` (CalendarRenderer class)

**Step 1: Replace the entire CalendarRenderer class**

Find `// ========== DYNAMIC CALENDAR ==========` and replace the entire `class CalendarRenderer` through its closing brace with:

```javascript
// ========== DYNAMIC CALENDAR ==========
class CalendarRenderer {
    constructor() {
        this.container = document.getElementById('event-list');
        this.pillsContainer = document.getElementById('day-pills');
        this.currentDayEl = document.getElementById('cal-current-day');
        this.reservationsBanner = document.getElementById('reservations-banner');
        this.reservationsText = document.getElementById('reservations-text');
        this.data = null;
        this.selectedDay = 1;
        this.expandedEvent = null;
        this.initPillHandlers();
    }

    initPillHandlers() {
        this.pillsContainer.addEventListener('click', (e) => {
            const pill = e.target.closest('.day-pill');
            if (pill) {
                const day = parseInt(pill.dataset.day);
                this.selectDay(day);
            }
        });
    }

    async load() {
        try {
            const response = await fetch('/api/itinerary');
            const { json } = await response.json();
            this.data = json;
            this.render();
        } catch (err) {
            console.error('Failed to load calendar data:', err);
        }
    }

    selectDay(day) {
        if (day === this.selectedDay) return;

        // Update pills
        this.pillsContainer.querySelectorAll('.day-pill').forEach(p => {
            p.classList.toggle('active', parseInt(p.dataset.day) === day);
        });

        // Fade transition
        this.container.classList.add('transitioning');
        setTimeout(() => {
            this.selectedDay = day;
            this.expandedEvent = null;
            this.render();
            this.container.classList.remove('transitioning');
        }, 150);
    }

    render() {
        if (!this.data) return;

        const dayData = this.data.days[this.selectedDay - 1];
        if (!dayData) return;

        // Update header
        const fullDayName = this.getFullDayName(dayData.dayOfWeek);
        this.currentDayEl.textContent = `${fullDayName}, ${dayData.date}`;

        // Check for reservations today
        this.updateReservationsBanner(dayData);

        // Render events
        let html = '';

        // Add hotel row on day 1
        if (this.selectedDay === 1 && this.data.hotel) {
            html += this.renderHotelRow();
        }

        // Render day items
        html += this.renderDayItems(dayData.items);

        this.container.innerHTML = html;

        // Attach click handlers
        this.container.querySelectorAll('.event-row').forEach((row, index) => {
            row.addEventListener('click', () => this.toggleEvent(index));
        });
    }

    renderHotelRow() {
        const hotel = this.data.hotel;
        const hotelData = typeof hotel === 'object' ? hotel : { name: hotel };
        const isExpanded = this.expandedEvent === 'hotel';

        return `
        <div class="event-row hotel-row ${isExpanded ? 'expanded' : ''}" data-event="hotel">
            <div class="event-row-collapsed">
                <span class="event-type-dot hotel"></span>
                <span class="event-time">Hotel</span>
                <span class="event-name">${this.escapeHtml(hotelData.name || hotel)}</span>
                <span class="event-neighborhood">LES</span>
                <svg class="event-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
            </div>
            <div class="event-row-expanded">
                ${hotelData.address ? `
                    <div class="event-address">
                        <a href="${this.escapeHtml(hotelData.mapsUrl || '#')}" target="_blank">${this.escapeHtml(hotelData.address)}</a>
                    </div>
                ` : ''}
                <div class="event-actions">
                    ${hotelData.address ? `
                        <a class="event-action-btn" href="https://maps.google.com/maps/dir/?api=1&destination=${encodeURIComponent(hotelData.address)}&travelmode=walking" target="_blank">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
                                <circle cx="12" cy="10" r="3"/>
                            </svg>
                            Directions
                        </a>
                    ` : ''}
                </div>
            </div>
        </div>`;
    }

    renderDayItems(items) {
        let html = '';
        let lastTimeGroup = null;
        let eventIndex = this.selectedDay === 1 && this.data.hotel ? 1 : 0;

        for (const item of items) {
            // Time divider
            const timeGroup = this.getTimeGroup(item.time);
            if (timeGroup && timeGroup !== lastTimeGroup) {
                html += `
                <div class="time-divider">
                    <span class="time-divider-label">${timeGroup}</span>
                    <div class="time-divider-line"></div>
                </div>`;
                lastTimeGroup = timeGroup;
            }

            html += this.renderEventRow(item, eventIndex);
            eventIndex++;
        }

        return html;
    }

    renderEventRow(item, index) {
        const isExpanded = this.expandedEvent === index;
        const place = item.place;
        const name = place?.name || item.description;
        const neighborhood = this.extractNeighborhood(place?.address);
        const typeClass = item.type || 'activity';

        let badgeHtml = '';
        if (item.fallback) badgeHtml = '<span class="event-badge">Backup</span>';
        else if (item.optional) badgeHtml = '<span class="event-badge">Optional</span>';

        const rowClasses = [
            'event-row',
            isExpanded ? 'expanded' : '',
            item.fallback ? 'fallback' : '',
            item.optional ? 'optional' : ''
        ].filter(Boolean).join(' ');

        return `
        <div class="${rowClasses}" data-event="${index}">
            <div class="event-row-collapsed">
                <span class="event-type-dot ${typeClass}"></span>
                <span class="event-time">${this.formatTime(item.time) || ''}</span>
                <span class="event-name">${this.escapeHtml(name)}</span>
                ${badgeHtml}
                ${neighborhood ? `<span class="event-neighborhood">${neighborhood}</span>` : ''}
                <svg class="event-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
            </div>
            <div class="event-row-expanded">
                ${place?.address ? `
                    <div class="event-address">
                        <a href="${this.escapeHtml(place.mapsUrl)}" target="_blank">${this.escapeHtml(place.address)}</a>
                    </div>
                ` : ''}
                <div class="event-actions">
                    ${place?.address ? `
                        <a class="event-action-btn" href="https://maps.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.address)}&travelmode=walking" target="_blank">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
                                <circle cx="12" cy="10" r="3"/>
                            </svg>
                            Directions
                        </a>
                    ` : ''}
                    ${place?.website ? `
                        <a class="event-action-btn" href="${this.escapeHtml(place.website)}" target="_blank">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="2" y1="12" x2="22" y2="12"/>
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                            </svg>
                            Website
                        </a>
                    ` : ''}
                </div>
                ${place?.tips ? `<div class="event-tips">${this.escapeHtml(place.tips)}</div>` : ''}
            </div>
        </div>`;
    }

    toggleEvent(index) {
        if (this.expandedEvent === index) {
            this.expandedEvent = null;
        } else {
            this.expandedEvent = index;
        }
        this.render();
    }

    updateReservationsBanner(dayData) {
        // Count items that are likely reservations (Hamilton, restaurants with reservations)
        const reservationKeywords = ['hamilton', 'minetta', 'vanguard', 'museum'];
        const reservationItems = dayData.items.filter(item => {
            const desc = (item.description || '').toLowerCase();
            return reservationKeywords.some(kw => desc.includes(kw));
        });

        if (reservationItems.length > 0) {
            this.reservationsBanner.style.display = 'flex';
            this.reservationsText.textContent = `${reservationItems.length} reservation${reservationItems.length > 1 ? 's' : ''} today`;
        } else {
            this.reservationsBanner.style.display = 'none';
        }
    }

    extractNeighborhood(address) {
        if (!address) return '';

        const neighborhoods = {
            'lower east side': 'LES',
            'east village': 'EV',
            'west village': 'WV',
            'soho': 'SoHo',
            'tribeca': 'TriBeCa',
            'chinatown': 'Chinatown',
            'dumbo': 'DUMBO',
            'brooklyn heights': 'Brooklyn',
            'midtown': 'Midtown',
            'upper east': 'UES',
            'upper west': 'UWS',
            'greenwich': 'WV',
            'fulton': 'FiDi',
            'houston': 'LES',
            'bowery': 'LES'
        };

        const lowerAddr = address.toLowerCase();
        for (const [key, abbrev] of Object.entries(neighborhoods)) {
            if (lowerAddr.includes(key)) return abbrev;
        }
        return '';
    }

    formatTime(time) {
        if (!time) return '';

        const timeMap = {
            'morning': '9 AM',
            'afternoon': '2 PM',
            'evening': '6 PM',
            'night': '9 PM',
            'late': '11 PM',
            'breakfast': '8 AM',
            'lunch': '12 PM',
            'dinner': '7 PM',
            'brunch': '10 AM'
        };

        const lower = time.toLowerCase();
        if (timeMap[lower]) return timeMap[lower];

        // Handle "11am" -> "11 AM"
        const match = time.match(/^(\d{1,2})(am|pm)$/i);
        if (match) {
            return `${match[1]} ${match[2].toUpperCase()}`;
        }

        // Handle ranges like "1:30-4pm"
        return time;
    }

    getTimeGroup(time) {
        if (!time) return null;
        const t = time.toLowerCase();
        if (t === 'morning' || t === 'breakfast' || /^([6-9]|10|11)(am|:)/i.test(t)) return 'Morning';
        if (t === 'afternoon' || t === 'lunch' || /^(12|1|2|3|4)(pm|:)/i.test(t)) return 'Afternoon';
        if (t === 'evening' || t === 'dinner' || /^(5|6|7)(pm|:)/i.test(t)) return 'Evening';
        if (t === 'night' || t === 'late' || /^(8|9|10|11)(pm|:)/i.test(t)) return 'Night';
        return null;
    }

    getFullDayName(abbrev) {
        const days = {
            'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday',
            'Thu': 'Thursday', 'Fri': 'Friday', 'Sat': 'Saturday', 'Sun': 'Sunday'
        };
        return days[abbrev] || abbrev;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
```

**Step 2: Commit**

```bash
git add index.html
git commit -m "feat: rewrite CalendarRenderer with single-day view and tap-to-expand"
```

---

### Task 4: Remove Old Calendar Nav Function

**Files:**
- Modify: `index.html:2226-2246` (initCalendarNav function)

**Step 1: Remove the initCalendarNav function**

Find the `// ========== CALENDAR DAY NAV ==========` section and delete the entire `initCalendarNav` function (it's no longer needed since we're not using scroll-based day detection).

**Step 2: Remove initCalendarNav call from DOMContentLoaded**

In the init block, remove the line:
```javascript
initCalendarNav();
```

**Step 3: Commit**

```bash
git add index.html
git commit -m "chore: remove obsolete scroll-based calendar nav"
```

---

### Task 5: Manual Browser Test

**Step 1: Start the dev server**

Run: `npm start`

**Step 2: Open browser and verify**

Navigate to `http://localhost:8080` (or deployed URL) and check:

1. Calendar shows slim header with "NYC Jan 14-18" and current day name
2. Five date pills visible, all fitting on screen
3. Clicking a pill switches to that day with fade transition
4. Events appear as compact rows with type dot, time, name, neighborhood
5. Clicking an event expands to show address, directions, website, tips
6. Clicking again collapses it
7. Only one event expanded at a time
8. Day 1 shows hotel as first row
9. Fallback/optional items show dashed border and badge
10. Time dividers appear (Morning/Afternoon/Evening/Night)

**Step 3: Test on mobile viewport**

Use browser devtools to simulate mobile (375px width):
- Pills still fit
- Touch targets are comfortable (~56px rows)
- Bottom nav doesn't overlap content

---

### Task 6: Final Commit and Summary

**Step 1: Verify no linting/console errors**

Open browser console and check for JavaScript errors.

**Step 2: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address any issues found in testing"
```

**Step 3: Summary of changes**

Files modified:
- `index.html` - Complete calendar view rewrite (CSS + HTML + JS)

Removed:
- Hero section with large "New York" title
- Vertical timeline with dots and connecting lines
- All-days scrolling layout
- Scroll-based day detection

Added:
- Slim header with branding + current day
- Horizontal date pills for day selection
- Single-day view with fade transitions
- Compact event rows with tap-to-expand
- Type indicator dots (food/culture/entertainment/activity)
- Neighborhood abbreviations in collapsed state
- Directions and Website action buttons in expanded state
- Tips display with lightbulb icon
- Reservations banner when day has bookable items
- Hotel row on Day 1
