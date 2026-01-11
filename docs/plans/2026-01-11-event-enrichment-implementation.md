# Event Enrichment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add rich, researched details (context, history, tips, walking routes) to itinerary events

**Architecture:** Extend existing Gemini enricher to generate richer data (hook, description, hours, waypoints). Update frontend to display new fields in collapsed/expanded views.

**Tech Stack:** Node.js, Gemini API (existing), vanilla JS frontend

---

## Task 1: Update Enricher Prompt for Rich Data

**Files:**
- Modify: `lib/enricher.js:177-189` (prompt)
- Modify: `lib/enricher.js:215-221` (response mapping)

**Step 1: Update the Gemini prompt to request richer data**

Replace the prompt in `batchEnrichPlaces` (lines 177-189) with:

```javascript
    const prompt = `You are a NYC travel expert. For each place below, determine if it's a VENUE (restaurant, museum, bar, etc.) or a WALKING ROUTE (multi-stop walk, exploration).

Return JSON array with these fields:

FOR VENUES:
- name: official place name
- hook: punchy 5-7 word teaser (e.g., "1888 - The pastrami")
- description: 2-3 sentences of interesting context/history
- tips: practical advice (what to order, reservations, etc.)
- hours: operating hours if known (e.g., "8am-10:45pm daily")
- price: price range ("$", "$$", "$$$", or "$$$$")
- address: street address in NYC
- neighborhood: abbreviated neighborhood (LES, EV, WV, SoHo, etc.)
- mapsUrl: Google Maps URL
- website: official website URL or empty string
- isWalkingRoute: false

FOR WALKING ROUTES (multi-stop explorations like "Brooklyn Bridge walk -> DUMBO"):
- name: descriptive route name
- hook: distance + brief teaser (e.g., "1.2 mi - NYC's iconic stroll")
- description: narrative of what you'll see in order
- waypoints: array of strings, each "Stop name - brief description"
- tips: practical advice (best time, what to bring)
- distance: estimated distance (e.g., "1.2 miles")
- duration: estimated time (e.g., "45-60 min with stops")
- routeUrl: Google Maps directions URL with waypoints
- isWalkingRoute: true

Places to look up:
${placeListing}

Return ONLY valid JSON array, no markdown.`;
```

**Step 2: Update response mapping to capture new fields**

Replace lines 215-221 with:

```javascript
        enrichedMap[original.description] = {
          name: enriched.name || original.description,
          hook: enriched.hook || '',
          description: enriched.description || '',
          tips: enriched.tips || '',
          hours: enriched.hours || '',
          price: enriched.price || '',
          address: enriched.address || '',
          neighborhood: enriched.neighborhood || '',
          mapsUrl: enriched.mapsUrl || `https://maps.google.com/?q=${encodeURIComponent(original.description + ' NYC')}`,
          website: enriched.website || '',
          isWalkingRoute: enriched.isWalkingRoute || false,
          waypoints: enriched.waypoints || [],
          distance: enriched.distance || '',
          duration: enriched.duration || '',
          routeUrl: enriched.routeUrl || ''
        };
```

**Step 3: Test enrichment locally**

Run: `npm start`
Then: Edit and save itinerary.txt via the Editor panel
Expected: Console shows "Itinerary loaded and enriched", itinerary.json contains new fields

**Step 4: Commit**

```bash
git add lib/enricher.js
git commit -m "feat(enricher): add rich event data (hook, description, waypoints)"
```

---

## Task 2: Add Hook to Collapsed View

**Files:**
- Modify: `index.html:1863-1874` (renderEventRow collapsed section)

**Step 1: Update collapsed row HTML to include hook**

Replace lines 1863-1874 in `renderEventRow()` with:

```javascript
            const hook = place?.hook || '';

            return `
            <div class="${rowClasses}" data-event="${index}">
                <div class="event-row-collapsed">
                    <span class="event-type-dot ${typeClass}"></span>
                    <span class="event-time">${this.formatTime(item.time) || ''}</span>
                    <span class="event-name">${this.escapeHtml(name)}</span>
                    ${hook ? `<span class="event-hook">${this.escapeHtml(hook)}</span>` : ''}
                    ${badgeHtml}
                    ${neighborhood ? `<span class="event-neighborhood">${neighborhood}</span>` : ''}
                    <svg class="event-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </div>
```

**Step 2: Test collapsed view**

Run: Open app in browser, view Calendar
Expected: Events show hook text after name in muted style

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat(ui): show hook in collapsed event row"
```

---

## Task 3: Add CSS for Hook

**Files:**
- Modify: `index.html:394-402` (after .event-name styles)

**Step 1: Add hook styling after .event-name block (around line 402)**

Insert after the `.event-name` CSS block:

```css
        .event-hook {
            font-size: 13px;
            color: var(--text-secondary);
            font-style: italic;
            flex-shrink: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 180px;
        }

        @media (max-width: 600px) {
            .event-hook {
                display: none;
            }
        }
```

**Step 2: Test responsive behavior**

Run: Resize browser window below 600px
Expected: Hook hides on mobile, visible on wider screens

**Step 3: Commit**

```bash
git add index.html
git commit -m "style: add hook styling with mobile hide"
```

---

## Task 4: Update Expanded View for Venues

**Files:**
- Modify: `index.html:1875-1903` (renderEventRow expanded section)

**Step 1: Replace expanded view HTML for venues**

Replace lines 1875-1903 with:

```javascript
                <div class="event-row-expanded">
                    ${place?.description ? `
                        <div class="event-description">${this.escapeHtml(place.description)}</div>
                    ` : ''}
                    ${place?.tips ? `
                        <div class="event-tips">
                            <span class="tips-icon">&#128161;</span>
                            ${this.escapeHtml(place.tips)}
                        </div>
                    ` : ''}
                    ${(place?.hours || place?.price) ? `
                        <div class="event-meta">
                            ${place.hours ? `<span class="event-hours">${this.escapeHtml(place.hours)}</span>` : ''}
                            ${place.hours && place.price ? '<span class="meta-sep">&#183;</span>' : ''}
                            ${place.price ? `<span class="event-price">${this.escapeHtml(place.price)}</span>` : ''}
                        </div>
                    ` : ''}
                    ${place?.waypoints && place.waypoints.length > 0 ? `
                        <div class="event-waypoints">
                            ${place.waypoints.map(wp => `<div class="waypoint">&#8594; ${this.escapeHtml(wp)}</div>`).join('')}
                        </div>
                        ${place.distance || place.duration ? `
                            <div class="event-route-meta">
                                ${place.duration ? `<span>${this.escapeHtml(place.duration)}</span>` : ''}
                                ${place.duration && place.distance ? '<span class="meta-sep">&#183;</span>' : ''}
                                ${place.distance ? `<span>${this.escapeHtml(place.distance)}</span>` : ''}
                            </div>
                        ` : ''}
                    ` : ''}
                    <div class="event-actions">
                        ${place?.routeUrl ? `
                            <a class="event-action-btn" href="${this.escapeHtml(place.routeUrl)}" target="_blank">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M9 20l-5.447-2.724A1 1 0 0 1 3 16.382V5.618a1 1 0 0 1 1.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0 0 21 18.382V7.618a1 1 0 0 0-.553-.894L15 4m0 13V4m0 0L9 7"/>
                                </svg>
                                View Route
                            </a>
                        ` : place?.address ? `
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
                    ${place?.address && !place?.isWalkingRoute ? `
                        <div class="event-address">
                            <a href="${this.escapeHtml(place.mapsUrl)}" target="_blank">${this.escapeHtml(place.address)}</a>
                        </div>
                    ` : ''}
                </div>`;
```

**Step 2: Test expanded view**

Run: Click an event to expand it
Expected: Shows description, tips with lightbulb, hours/price, waypoints for walks

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat(ui): rich expanded view with description, tips, waypoints"
```

---

## Task 5: Add CSS for Expanded View Elements

**Files:**
- Modify: `index.html:444-463` (after .event-address styles, around line 459)

**Step 1: Add CSS for new expanded view elements**

Insert after `.event-address a:hover` block:

```css
        .event-description {
            font-size: 14px;
            line-height: 1.6;
            color: var(--text-primary);
            margin-bottom: 12px;
        }

        .event-tips {
            font-size: 13px;
            color: var(--text-secondary);
            background: var(--bg-elevated);
            padding: 10px 12px;
            border-radius: 8px;
            margin-bottom: 12px;
            display: flex;
            gap: 8px;
            align-items: flex-start;
        }

        .tips-icon {
            flex-shrink: 0;
        }

        .event-meta {
            font-size: 13px;
            color: var(--text-secondary);
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .meta-sep {
            color: var(--timeline-line);
        }

        .event-waypoints {
            margin-bottom: 12px;
        }

        .waypoint {
            font-size: 13px;
            color: var(--text-secondary);
            padding: 6px 0;
            border-bottom: 1px solid var(--timeline-line);
        }

        .waypoint:last-child {
            border-bottom: none;
        }

        .event-route-meta {
            font-size: 12px;
            color: var(--text-secondary);
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
```

**Step 2: Move event-address to bottom styling**

Update existing `.event-address` to reduce visual weight when at bottom:

```css
        .event-address {
            font-size: 12px;
            color: var(--accent-dim);
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px solid var(--timeline-line);
        }
```

**Step 3: Test visual hierarchy**

Run: Expand various events (venue, walking route)
Expected: Clear visual hierarchy - description first, tips highlighted, address subtle at bottom

**Step 4: Commit**

```bash
git add index.html
git commit -m "style: add CSS for rich expanded view elements"
```

---

## Task 6: Update Walking Route Detection in Enricher

**Files:**
- Modify: `lib/enricher.js:96-145` (looksLikePlace function)

**Step 1: Update looksLikePlace to NOT exclude walking routes**

The current function excludes "walk" and "explore". Update the excluded list at line 109-115:

```javascript
  // Exclude common filler phrases (but keep walks/explorations for walking routes)
  const excluded = [
    'check-in', 'sleep', 'rest', 'break', 'arrive', 'depart',
    'pack', 'prepare', 'relax'
  ];
```

Remove 'walk', 'explore', 'wander', 'browse' from exclusions.

**Step 2: Test walking route enrichment**

Run: Restart server, check itinerary.json for "Brooklyn Bridge walk" and "Central Park walk"
Expected: These entries have isWalkingRoute: true, waypoints array populated

**Step 3: Commit**

```bash
git add lib/enricher.js
git commit -m "fix(enricher): include walking routes in place detection"
```

---

## Task 7: Test Full Flow End-to-End

**Step 1: Clear and re-enrich data**

```bash
rm itinerary.json
npm start
```

Wait for "Itinerary loaded and enriched" message.

**Step 2: Verify itinerary.json has rich data**

Open `itinerary.json` and verify:
- Venues have: hook, description, tips, hours, price
- Walking routes have: waypoints array, distance, duration, routeUrl

**Step 3: Test UI in browser**

- Open app, view Calendar
- Verify hooks show in collapsed view
- Expand a venue (Katz's) - verify description, tips, hours/price, address
- Expand a walk (Brooklyn Bridge) - verify waypoints list, duration/distance, View Route button

**Step 4: Test editor-triggered enrichment**

- Open Editor panel
- Make a small change (add space)
- Save
- Verify Calendar updates with enriched data

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete event enrichment with rich details and walking routes"
```

---

## Task 8: Deploy

**Step 1: Push to trigger deploy**

```bash
git push origin main
```

**Step 2: Watch deploy progress**

```bash
gh run watch
```

**Step 3: Verify production**

Open https://nyc-trip-522204863154.us-central1.run.app
Test the enriched events work correctly on production.
