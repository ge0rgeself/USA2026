# Prompt-First Events Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure events so users edit a "prompt" and all display content comes from enrichment.

**Architecture:** Rename `description` → `prompt` in data model. Enrichment generates `title` field for display. UI shows enriched content in display mode, prompt in edit mode.

**Tech Stack:** Express/Node.js backend, vanilla JS frontend, Gemini API for enrichment

---

## Task 1: Update Enrichment to Generate Title

**Files:**
- Modify: `lib/place-service.js`

**Step 1: Update enrichment prompt to generate title**

In `buildEnrichmentPrompt()`, the schema already has `"name"` field. We need to ensure it's always populated, even for activities.

Find the prompt schema section (around line 50) and ensure `name` is described as:

```javascript
"name": "Display title - place name for places, clean activity name for activities (REQUIRED)",
```

**Step 2: Verify enrichment returns title for activities**

The current schema should work. Activities like "walk around the neighborhood" should get:
```json
{
  "name": "Lower East Side Walk",
  "hook": "...",
  "address": null,
  ...
}
```

**Step 3: Commit**

```bash
git add lib/place-service.js
git commit -m "feat: ensure enrichment always generates display title"
```

---

## Task 2: Rename description → prompt in Data Model

**Files:**
- Modify: `lib/interpreter.js`
- Modify: `server.js`

**Step 1: Update interpreter output field**

In `lib/interpreter.js`, line 17, change the SYSTEM_PROMPT:

```javascript
// Change this line:
- description: Place name and neighborhood if mentioned
// To:
- description: Clean place/activity description (this becomes the display title source)
```

The interpreter already outputs `description` which the enricher uses. We'll keep this internally but store as `prompt` on the event.

**Step 2: Update server.js event creation**

In `server.js`, find where events are created/stored. Update to store the original user input as `prompt`:

Find the `/api/events` POST handler (around line 450+) and ensure:
```javascript
const event = {
  prompt: req.body.prompt,           // User's original input
  status: parsed.status || 'primary',
  time: parsed.time,
  timeType: parsed.timeType,
  enrichment: null                   // Will be filled by enricher
};
```

**Step 3: Update event update endpoint**

Find the PUT handler for events and update similarly.

**Step 4: Commit**

```bash
git add lib/interpreter.js server.js
git commit -m "feat: store user input as prompt field"
```

---

## Task 3: Update Frontend Data Handling

**Files:**
- Modify: `index.html` (JavaScript section)

**Step 1: Update renderEventRow to use enrichment.title**

Find `renderEventRow()` (around line 2884). Change:

```javascript
// FROM:
const name = place?.name || item.description;

// TO:
const name = item.enrichment?.title || item.enrichment?.name || item.prompt || 'Untitled';
```

**Step 2: Update edit form to show prompt**

Find `renderEditForm()` or where the edit form is rendered. The input should show `item.prompt`:

```javascript
// Find the edit input and ensure value is:
value="${this.escapeHtml(item.prompt || '')}"
```

**Step 3: Update saveEdit to send prompt**

Find `saveEdit()` method. Ensure it sends the prompt field:

```javascript
const prompt = row.querySelector('[data-field="prompt"]').value;
// Send to API with prompt field
```

**Step 4: Commit**

```bash
git add index.html
git commit -m "feat: display enrichment title, edit prompt"
```

---

## Task 4: Remove Hook Display

**Files:**
- Modify: `index.html` (CSS and JavaScript)

**Step 1: Remove hook HTML generation**

In `renderEventRow()` (around line 2924-2931), remove or comment out the hookHtml generation:

```javascript
// REMOVE these lines:
let hookHtml = '';
if (isLoading) {
    hookHtml = '<span class="event-hook loading">...</span>';
} else if (hasError) {
    hookHtml = '<span class="event-hook error">...</span>';
} else if (place?.hook) {
    hookHtml = `<span class="event-hook">...</span>`;
}
```

Replace with simple loading indicator only:

```javascript
let loadingHtml = '';
if (isLoading) {
    loadingHtml = '<span class="event-loading">Enriching...</span>';
} else if (hasError) {
    loadingHtml = '<span class="event-error">⚠️</span>';
}
```

**Step 2: Update collapsed row template**

Remove `${hookHtml}` from the collapsed row template (around line 2939).

**Step 3: Remove hook CSS**

Find and remove these CSS blocks (lines 386-443):
- `.event-hook { ... }`
- `.event-hook.needs-details { ... }`
- `.event-hook.loading { ... }`
- `.event-hook.error { ... }`
- `@media (max-width: 600px) { .event-hook { display: none; } }`

**Step 4: Add simple loading/error styles**

```css
.event-loading {
    font-size: 12px;
    color: #888;
    font-style: italic;
}

.event-error {
    color: #d97706;
    cursor: pointer;
}
```

**Step 5: Commit**

```bash
git add index.html
git commit -m "feat: remove hook display, simplify loading state"
```

---

## Task 5: Simplify Collapsed Row

**Files:**
- Modify: `index.html` (CSS and JavaScript)

**Step 1: Update collapsed row to show: dot, time, title, badge, chevron**

In `renderEventRow()`, simplify the collapsed content template:

```javascript
return `
<div class="${rowClasses}" data-event="${index}">
    <div class="event-row-collapsed">
        <span class="event-dot"></span>
        <span class="event-time">${this.formatTime(item.time) || ''}</span>
        <span class="event-name">${this.escapeHtml(name)}</span>
        ${loadingHtml}
        ${badgeHtml}
        <svg class="event-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
        </svg>
    </div>
    ...
</div>`;
```

**Step 2: Remove type-based dot coloring**

Find CSS for `.event-type-dot` and type classes (`.food`, `.activity`, etc.). Replace with single simple dot:

```css
.event-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-secondary);
    flex-shrink: 0;
}
```

Remove type-specific color classes.

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat: simplify collapsed row - dot, time, title, badge"
```

---

## Task 6: Update Expanded View

**Files:**
- Modify: `index.html`

**Step 1: Update expanded content to show full details**

In `renderEventRow()`, update the expanded section to show:
- Address + neighborhood
- Hours + price
- Tips
- Directions + Edit buttons

```javascript
<div class="event-row-expanded">
    ${place?.address ? `
        <div class="event-address">${this.escapeHtml(place.address)}</div>
    ` : ''}
    ${(place?.hours || place?.price) ? `
        <div class="event-meta">
            ${place.hours ? `<span>${this.escapeHtml(place.hours)}</span>` : ''}
            ${place.hours && place.price ? ' · ' : ''}
            ${place.price ? `<span>${this.escapeHtml(place.price)}</span>` : ''}
        </div>
    ` : ''}
    ${place?.tips ? `
        <div class="event-tips">💡 ${this.escapeHtml(place.tips)}</div>
    ` : ''}
    <div class="event-actions">
        ${place?.mapsUrl ? `
            <a href="${place.mapsUrl}" target="_blank" class="btn-directions">Directions</a>
        ` : ''}
        <button class="btn-edit">Edit</button>
    </div>
</div>
```

**Step 2: Add/update CSS for expanded view**

```css
.event-address {
    color: var(--text-secondary);
    font-size: 14px;
    margin-bottom: 0.5rem;
}

.event-meta {
    color: var(--text-secondary);
    font-size: 13px;
    margin-bottom: 0.5rem;
}

.event-tips {
    font-size: 14px;
    color: var(--text-primary);
    margin-bottom: 1rem;
    line-height: 1.4;
}

.event-actions {
    display: flex;
    gap: 0.75rem;
}

.btn-directions, .btn-edit {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-size: 14px;
    cursor: pointer;
}

.btn-directions {
    background: var(--bg-card);
    border: 1px solid var(--timeline-line);
    color: var(--text-primary);
    text-decoration: none;
}

.btn-edit {
    background: var(--coral);
    border: none;
    color: white;
}
```

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat: expanded view shows address, hours, tips, actions"
```

---

## Task 7: Migration - Rename existing description to prompt

**Files:**
- Modify: `server.js`

**Step 1: Add migration in data loading**

In the data loading section of server.js, add a migration step:

```javascript
// After loading itinerary data, migrate description -> prompt
function migrateData(data) {
  if (!data) return data;

  // Migrate days
  if (data.days) {
    data.days.forEach(day => {
      day.items?.forEach(item => {
        if (item.description && !item.prompt) {
          item.prompt = item.description;
          delete item.description;
        }
      });
    });
  }

  return data;
}
```

**Step 2: Apply migration on load**

Call `migrateData()` after loading JSON data.

**Step 3: Commit**

```bash
git add server.js
git commit -m "feat: migrate description to prompt on data load"
```

---

## Task 8: Test and Deploy

**Step 1: Test locally**

```bash
npm start
# Open http://localhost:8080
# Test: view events, expand, edit prompt, save, verify enrichment
```

**Step 2: Merge to main**

```bash
git checkout main
git merge feature/prompt-first-events
git push
```

**Step 3: Verify deployment**

```bash
gh run watch
# Test production at https://nyc-trip-522204863154.us-central1.run.app
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Update enrichment to always generate title |
| 2 | Rename description → prompt in data model |
| 3 | Update frontend to display title, edit prompt |
| 4 | Remove hook display entirely |
| 5 | Simplify collapsed row (dot, time, title, badge) |
| 6 | Update expanded view with full details |
| 7 | Add migration for existing data |
| 8 | Test and deploy |
