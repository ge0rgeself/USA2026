# Inline Calendar Editing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Editor tab with inline editing directly in the Calendar view - edit events in place with dropdown, text input, and label chips.

**Architecture:** The Calendar view gets edit icons on each event card. Clicking edit transforms the card into an inline form. New API endpoints handle individual item CRUD operations. The server reconstructs itinerary.txt from the JSON structure after each change.

**Tech Stack:** Vanilla JS (existing), Express.js, existing parser/enricher pipeline

---

## Task 1: Remove Editor Tab from Navigation

**Files:**
- Modify: `index.html:1274-1298` (navigation links)
- Modify: `index.html:1413-1416` (Router class)

**Step 1: Remove Editor nav link**

In `index.html`, find the navigation section (around line 1274) and remove the Editor link:

```html
<!-- REMOVE THIS ENTIRE BLOCK (lines 1284-1291) -->
<a href="#editor" class="nav-link" data-view="editor">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
    <span>Editor</span>
</a>
```

**Step 2: Update Router to remove 'editor' from views array**

In `index.html`, find the Router class (around line 1413) and update:

```javascript
// Change from:
this.views = ['calendar', 'editor', 'chat'];

// To:
this.views = ['calendar', 'chat'];
```

**Step 3: Verify change works**

Run: Open browser, verify only Calendar and Chat tabs appear.

**Step 4: Commit**

```bash
git add index.html
git commit -m "feat: remove Editor tab from navigation"
```

---

## Task 2: Remove Editor View HTML and CSS

**Files:**
- Modify: `index.html:1341-1374` (Editor view HTML)
- Modify: `index.html:649-918` (Editor CSS)
- Modify: `index.html:1489-1630` (MarkdownEditor class)

**Step 1: Remove Editor view HTML**

Delete the entire `#view-editor` div (lines 1341-1374):

```html
<!-- DELETE THIS ENTIRE BLOCK -->
<div id="view-editor" class="view">
    <div class="editor-container">
        <!-- ... all editor content ... -->
    </div>
</div>
```

**Step 2: Remove Editor CSS**

Delete the Editor CSS section (lines 649-918, from `/* ========== EDITOR VIEW ==========*/` to the end of Editor Mobile section).

**Step 3: Remove MarkdownEditor class**

Delete the MarkdownEditor class (lines 1489-1630) and its initialization:

```javascript
// DELETE: class MarkdownEditor { ... }

// Also update DOMContentLoaded init to remove:
// window.markdownEditor = new MarkdownEditor();
```

**Step 4: Clean up references**

In ChatAgent.confirmUpdate(), remove the markdownEditor updates (lines 1756-1761):

```javascript
// DELETE these lines:
if (window.markdownEditor) {
    window.markdownEditor.textarea.value = data.txt;
    window.markdownEditor.originalContent = data.txt;
    window.markdownEditor.hasChanges = false;
    window.markdownEditor.updateStatus();
}
```

**Step 5: Verify change works**

Run: Open browser, verify app loads without errors.

**Step 6: Commit**

```bash
git add index.html
git commit -m "feat: remove Editor view HTML, CSS, and JS"
```

---

## Task 3: Add Edit Mode CSS Styles

**Files:**
- Modify: `index.html` (add CSS after event styles, around line 580)

**Step 1: Add inline edit CSS**

Add these styles after the existing `.event-tips` styles (around line 580):

```css
/* ========== INLINE EDIT MODE ========== */
.event-row.editing {
    border-color: var(--coral);
    border-width: 2px;
}

.event-edit-form {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.event-edit-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.event-edit-row-main {
    flex: 1;
}

.event-edit-select {
    padding: 8px 12px;
    border: 1px solid var(--timeline-line);
    border-radius: 8px;
    background: var(--bg-main);
    color: var(--text-primary);
    font-family: inherit;
    font-size: 13px;
    min-width: 120px;
    cursor: pointer;
}

.event-edit-select:focus {
    outline: none;
    border-color: var(--coral);
}

.event-edit-input {
    flex: 1;
    padding: 10px 14px;
    border: none;
    border-bottom: 2px solid var(--timeline-line);
    background: transparent;
    color: var(--text-primary);
    font-family: inherit;
    font-size: 15px;
}

.event-edit-input:focus {
    outline: none;
    border-bottom-color: var(--coral);
}

.event-edit-input::placeholder {
    color: var(--text-secondary);
}

.event-edit-labels {
    display: flex;
    gap: 8px;
}

.event-edit-chip {
    padding: 6px 12px;
    border: 1px solid var(--timeline-line);
    border-radius: 16px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
}

.event-edit-chip:hover {
    border-color: var(--accent-dim);
}

.event-edit-chip.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg-deep);
}

.event-edit-delete {
    padding: 8px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 6px;
    transition: all 0.15s ease;
}

.event-edit-delete:hover {
    background: var(--coral);
    color: var(--bg-deep);
}

.event-edit-delete svg {
    width: 18px;
    height: 18px;
}

/* Edit icon on event cards */
.event-edit-icon {
    padding: 6px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 6px;
    opacity: 0;
    transition: all 0.15s ease;
    margin-left: auto;
}

.event-row:hover .event-edit-icon {
    opacity: 1;
}

.event-edit-icon:hover {
    background: var(--bg-elevated);
    color: var(--text-primary);
}

.event-edit-icon svg {
    width: 16px;
    height: 16px;
}

/* Add event button */
.add-event-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px 16px;
    margin: 8px 0;
    border: 1px dashed var(--timeline-line);
    border-radius: 10px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s ease;
    width: 100%;
}

.add-event-btn:hover {
    border-color: var(--coral);
    color: var(--coral);
    background: rgba(201, 70, 61, 0.05);
}

.add-event-btn svg {
    width: 16px;
    height: 16px;
}

/* Undo toast */
.toast.undo {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg-deep);
}

.toast.undo .toast-undo-btn {
    padding: 4px 12px;
    margin-left: 12px;
    border: 1px solid var(--bg-deep);
    border-radius: 6px;
    background: transparent;
    color: var(--bg-deep);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
}

.toast.undo .toast-undo-btn:hover {
    background: var(--bg-deep);
    color: var(--accent);
}

/* Save indicator */
.save-indicator {
    position: fixed;
    top: calc(var(--nav-height) + 16px);
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 16px;
    background: var(--bg-card);
    border: 1px solid var(--timeline-line);
    border-radius: 20px;
    font-size: 13px;
    color: var(--text-secondary);
    box-shadow: var(--shadow);
    z-index: 1000;
    opacity: 0;
    transition: opacity 0.2s ease;
}

.save-indicator.visible {
    opacity: 1;
}

.save-indicator.success {
    color: var(--sage);
}

@media (max-width: 768px) {
    .event-edit-icon {
        opacity: 1;
    }

    .save-indicator {
        top: 16px;
    }
}
```

**Step 2: Verify styles don't break anything**

Run: Open browser, verify Calendar still displays correctly.

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add inline edit mode CSS styles"
```

---

## Task 4: Add Edit Icon to Event Cards

**Files:**
- Modify: `index.html` (CalendarRenderer.renderEventRow method, around line 1947)

**Step 1: Add edit icon to collapsed row**

Update the `renderEventRow` method to add an edit icon button. Find the chevron SVG in the collapsed row and add the edit icon before it:

```javascript
renderEventRow(item, index) {
    const isExpanded = this.expandedEvent === index;
    const isEditing = this.editingEvent === index;
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
        isEditing ? 'editing' : '',
        item.fallback ? 'fallback' : '',
        item.optional ? 'optional' : ''
    ].filter(Boolean).join(' ');

    const hook = place?.hook || '';

    // If editing, render edit form instead
    if (isEditing) {
        return this.renderEditForm(item, index);
    }

    return `
    <div class="${rowClasses}" data-event="${index}">
        <div class="event-row-collapsed">
            <span class="event-type-dot ${typeClass}"></span>
            <span class="event-time">${this.formatTime(item.time) || ''}</span>
            <span class="event-name">${this.escapeHtml(name)}</span>
            ${hook ? `<span class="event-hook">${this.escapeHtml(hook)}</span>` : ''}
            ${badgeHtml}
            ${neighborhood ? `<span class="event-neighborhood">${neighborhood}</span>` : ''}
            <button class="event-edit-icon" data-action="edit" data-index="${index}" aria-label="Edit event">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                </svg>
            </button>
            <svg class="event-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"/>
            </svg>
        </div>
        <div class="event-row-expanded">
            ${place?.description ? `
                <div class="event-description">${this.escapeHtml(place.description)}</div>
            ` : ''}
            ${place?.tips ? `
                <div class="event-tips">${this.escapeHtml(place.tips)}</div>
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
        </div>
    </div>`;
}
```

**Step 2: Add editingEvent state to constructor**

In the CalendarRenderer constructor (around line 1822), add:

```javascript
constructor() {
    this.container = document.getElementById('event-list');
    this.pillsContainer = document.getElementById('day-pills');
    this.currentDayEl = document.getElementById('cal-current-day');
    this.data = null;
    this.selectedDay = 1;
    this.expandedEvent = null;
    this.editingEvent = null;  // ADD THIS LINE
    this.initPillHandlers();
}
```

**Step 3: Update click handler to handle edit icon**

Update the render() method's click handler attachment (around line 1896):

```javascript
// Replace the existing click handler attachment with:
this.container.querySelectorAll('.event-row').forEach((row, index) => {
    // Edit icon click
    const editIcon = row.querySelector('.event-edit-icon');
    if (editIcon) {
        editIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            this.startEdit(index);
        });
    }
    // Row click to expand (only if not editing)
    row.addEventListener('click', (e) => {
        if (!e.target.closest('.event-edit-icon') && !row.classList.contains('editing')) {
            this.toggleEvent(index);
        }
    });
});
```

**Step 4: Add startEdit method**

Add this method to CalendarRenderer:

```javascript
startEdit(index) {
    this.editingEvent = index;
    this.expandedEvent = null;
    this.render();
}
```

**Step 5: Verify edit icon appears on hover**

Run: Open browser, hover over event cards, verify pencil icon appears.

**Step 6: Commit**

```bash
git add index.html
git commit -m "feat: add edit icon to calendar event cards"
```

---

## Task 5: Create Inline Edit Form

**Files:**
- Modify: `index.html` (CalendarRenderer class)

**Step 1: Add renderEditForm method**

Add this method to CalendarRenderer class:

```javascript
renderEditForm(item, index) {
    const timeValue = item.time || 'morning';
    const description = item.description || '';

    return `
    <div class="event-row editing" data-event="${index}">
        <div class="event-edit-form">
            <div class="event-edit-row">
                <span class="event-type-dot ${item.type || 'activity'}"></span>
                <select class="event-edit-select" data-field="time">
                    <option value="morning" ${timeValue === 'morning' ? 'selected' : ''}>Morning</option>
                    <option value="afternoon" ${timeValue === 'afternoon' ? 'selected' : ''}>Afternoon</option>
                    <option value="evening" ${timeValue === 'evening' ? 'selected' : ''}>Evening</option>
                    <option value="night" ${timeValue === 'night' ? 'selected' : ''}>Night</option>
                </select>
                <button class="event-edit-delete" data-action="delete" aria-label="Delete event">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
            <div class="event-edit-row event-edit-row-main">
                <input type="text" class="event-edit-input" data-field="description"
                       value="${this.escapeHtml(description)}"
                       placeholder="Event description...">
            </div>
            <div class="event-edit-labels">
                <button class="event-edit-chip ${item.fallback ? 'active' : ''}" data-field="fallback">
                    Backup
                </button>
                <button class="event-edit-chip ${item.optional ? 'active' : ''}" data-field="optional">
                    Optional
                </button>
            </div>
        </div>
    </div>`;
}
```

**Step 2: Add event handlers for edit form**

Update the render() method to handle edit form interactions:

```javascript
// Add after the existing click handlers in render():

// Handle edit form interactions
this.container.querySelectorAll('.event-edit-form').forEach(form => {
    const index = parseInt(form.closest('.event-row').dataset.event);

    // Time dropdown change
    const select = form.querySelector('[data-field="time"]');
    if (select) {
        select.addEventListener('change', () => {
            this.updateEditField(index, 'time', select.value);
        });
    }

    // Description input blur
    const input = form.querySelector('[data-field="description"]');
    if (input) {
        input.addEventListener('blur', () => {
            this.saveEdit(index);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.saveEdit(index);
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                this.cancelEdit();
            }
        });
        // Auto-focus the input
        input.focus();
    }

    // Label chip toggles
    form.querySelectorAll('.event-edit-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            e.stopPropagation();
            const field = chip.dataset.field;
            chip.classList.toggle('active');
            this.updateEditField(index, field, chip.classList.contains('active'));
        });
    });

    // Delete button
    const deleteBtn = form.querySelector('[data-action="delete"]');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteEvent(index);
        });
    }
});

// Click outside to save
document.addEventListener('click', this.handleOutsideClick.bind(this), { once: true });
```

**Step 3: Add edit state tracking and methods**

Add these properties and methods to CalendarRenderer:

```javascript
// In constructor, add:
this.editState = null;

// Add these methods:
updateEditField(index, field, value) {
    if (!this.editState) {
        const dayData = this.data.days[this.selectedDay - 1];
        const item = dayData.items[index];
        this.editState = { ...item };
    }
    this.editState[field] = value;
}

async saveEdit(index) {
    if (this.editingEvent === null) return;

    const form = this.container.querySelector('.event-edit-form');
    if (!form) return;

    const input = form.querySelector('[data-field="description"]');
    const select = form.querySelector('[data-field="time"]');
    const description = input?.value?.trim();

    // If description is empty for a new event, cancel
    if (!description) {
        this.cancelEdit();
        return;
    }

    const updatedItem = {
        time: select?.value || 'morning',
        description: description,
        fallback: form.querySelector('[data-field="fallback"]')?.classList.contains('active') || false,
        optional: form.querySelector('[data-field="optional"]')?.classList.contains('active') || false
    };

    this.showSaveIndicator('Saving...');

    try {
        const response = await fetch('/api/itinerary/item', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                day: this.selectedDay - 1,
                index: index,
                item: updatedItem
            })
        });

        if (!response.ok) throw new Error('Save failed');

        const { json } = await response.json();
        this.data = json;
        this.showSaveIndicator('Saved ✓', true);
    } catch (err) {
        console.error('Save error:', err);
        showToast('Failed to save changes', 'error');
    }

    this.editingEvent = null;
    this.editState = null;
    this.render();
}

cancelEdit() {
    this.editingEvent = null;
    this.editState = null;
    this.render();
}

handleOutsideClick(e) {
    if (this.editingEvent === null) return;
    const editForm = this.container.querySelector('.event-edit-form');
    if (editForm && !editForm.contains(e.target)) {
        this.saveEdit(this.editingEvent);
    }
}

showSaveIndicator(text, success = false) {
    let indicator = document.querySelector('.save-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'save-indicator';
        document.body.appendChild(indicator);
    }
    indicator.textContent = text;
    indicator.classList.toggle('success', success);
    indicator.classList.add('visible');

    if (success) {
        setTimeout(() => indicator.classList.remove('visible'), 1500);
    }
}
```

**Step 4: Verify edit form appears and functions**

Run: Open browser, click edit icon, verify form appears with dropdown, input, and chips.

**Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add inline edit form to calendar events"
```

---

## Task 6: Add Delete Functionality with Undo Toast

**Files:**
- Modify: `index.html` (CalendarRenderer class)

**Step 1: Add deleteEvent method**

Add to CalendarRenderer:

```javascript
async deleteEvent(index) {
    const dayData = this.data.days[this.selectedDay - 1];
    const item = dayData.items[index];
    const itemName = item.place?.name || item.description;

    // Store for undo
    const deletedItem = { ...item };
    const deletedIndex = index;
    const deletedDay = this.selectedDay - 1;

    // Optimistically remove from UI
    dayData.items.splice(index, 1);
    this.editingEvent = null;
    this.render();

    // Show undo toast
    const undoToast = this.showUndoToast(`Deleted "${itemName}"`, async () => {
        // Undo - re-insert item
        dayData.items.splice(deletedIndex, 0, deletedItem);
        this.render();
    });

    // Wait for undo period, then actually delete on server
    setTimeout(async () => {
        if (undoToast.undone) return;

        try {
            const response = await fetch('/api/itinerary/item', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    day: deletedDay,
                    index: deletedIndex
                })
            });

            if (!response.ok) throw new Error('Delete failed');

            const { json } = await response.json();
            this.data = json;
        } catch (err) {
            console.error('Delete error:', err);
            // Restore item on error
            dayData.items.splice(deletedIndex, 0, deletedItem);
            this.render();
            showToast('Failed to delete event', 'error');
        }
    }, 3000);
}

showUndoToast(message, onUndo) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast undo';

    const state = { undone: false };

    toast.innerHTML = `
        <span>${message}</span>
        <button class="toast-undo-btn">Undo</button>
    `;

    toast.querySelector('.toast-undo-btn').addEventListener('click', () => {
        state.undone = true;
        onUndo();
        toast.remove();
    });

    container.appendChild(toast);

    setTimeout(() => {
        if (!state.undone) {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }
    }, 3000);

    return state;
}
```

**Step 2: Verify delete works with undo**

Run: Open browser, click edit icon, click delete, verify undo toast appears and works.

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add delete event with undo toast"
```

---

## Task 7: Add "+" Add Event Button

**Files:**
- Modify: `index.html` (CalendarRenderer class)

**Step 1: Update renderDayItems to add "Add event" buttons**

Modify the renderDayItems method:

```javascript
renderDayItems(items) {
    let html = '';
    let lastTimeGroup = null;
    let eventIndex = 0;
    const timeGroups = ['Morning', 'Afternoon', 'Evening', 'Night'];
    const renderedGroups = new Set();

    for (const item of items) {
        const timeGroup = this.getTimeGroup(item.time);
        if (timeGroup && timeGroup !== lastTimeGroup) {
            // Add "Add event" button for previous group
            if (lastTimeGroup) {
                html += this.renderAddButton(lastTimeGroup);
            }
            html += `
            <div class="time-divider">
                <span class="time-divider-label">${timeGroup}</span>
                <div class="time-divider-line"></div>
            </div>`;
            lastTimeGroup = timeGroup;
            renderedGroups.add(timeGroup);
        }

        html += this.renderEventRow(item, eventIndex);
        eventIndex++;
    }

    // Add button for last group
    if (lastTimeGroup) {
        html += this.renderAddButton(lastTimeGroup);
    }

    // Add empty time groups that have no events
    for (const group of timeGroups) {
        if (!renderedGroups.has(group)) {
            html += `
            <div class="time-divider">
                <span class="time-divider-label">${group}</span>
                <div class="time-divider-line"></div>
            </div>`;
            html += this.renderAddButton(group);
        }
    }

    return html;
}

renderAddButton(timeGroup) {
    const timeValue = timeGroup.toLowerCase();
    return `
    <button class="add-event-btn" data-action="add" data-time="${timeValue}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Add event
    </button>`;
}
```

**Step 2: Add click handlers for add buttons**

In the render() method, add handlers for add buttons:

```javascript
// Add event buttons
this.container.querySelectorAll('.add-event-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const time = btn.dataset.time;
        this.addNewEvent(time);
    });
});
```

**Step 3: Add addNewEvent method**

```javascript
addNewEvent(time) {
    const dayData = this.data.days[this.selectedDay - 1];

    // Find insert position based on time group
    const timeOrder = ['morning', 'afternoon', 'evening', 'night'];
    const targetOrder = timeOrder.indexOf(time);

    let insertIndex = dayData.items.length;
    for (let i = 0; i < dayData.items.length; i++) {
        const itemGroup = this.getTimeGroup(dayData.items[i].time)?.toLowerCase();
        const itemOrder = timeOrder.indexOf(itemGroup);
        if (itemOrder > targetOrder) {
            insertIndex = i;
            break;
        }
    }

    // Create new empty item
    const newItem = {
        time: time,
        description: '',
        type: 'activity',
        fallback: false,
        optional: false,
        place: null,
        isNew: true
    };

    // Insert into items
    dayData.items.splice(insertIndex, 0, newItem);

    // Enter edit mode for new item
    this.editingEvent = insertIndex;
    this.render();
}
```

**Step 4: Update saveEdit to handle new items**

Update the saveEdit method to use POST for new items:

```javascript
async saveEdit(index) {
    if (this.editingEvent === null) return;

    const form = this.container.querySelector('.event-edit-form');
    if (!form) return;

    const input = form.querySelector('[data-field="description"]');
    const select = form.querySelector('[data-field="time"]');
    const description = input?.value?.trim();

    const dayData = this.data.days[this.selectedDay - 1];
    const item = dayData.items[index];
    const isNew = item?.isNew;

    // If description is empty, cancel/remove
    if (!description) {
        if (isNew) {
            dayData.items.splice(index, 1);
        }
        this.cancelEdit();
        return;
    }

    const updatedItem = {
        time: select?.value || 'morning',
        description: description,
        fallback: form.querySelector('[data-field="fallback"]')?.classList.contains('active') || false,
        optional: form.querySelector('[data-field="optional"]')?.classList.contains('active') || false
    };

    this.showSaveIndicator('Saving...');

    try {
        const endpoint = '/api/itinerary/item';
        const method = isNew ? 'POST' : 'PATCH';
        const body = isNew
            ? { day: this.selectedDay - 1, item: updatedItem }
            : { day: this.selectedDay - 1, index: index, item: updatedItem };

        const response = await fetch(endpoint, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) throw new Error('Save failed');

        const { json } = await response.json();
        this.data = json;
        this.showSaveIndicator('Saved ✓', true);
    } catch (err) {
        console.error('Save error:', err);
        if (isNew) {
            dayData.items.splice(index, 1);
        }
        showToast('Failed to save changes', 'error');
    }

    this.editingEvent = null;
    this.editState = null;
    this.render();
}
```

**Step 5: Verify add event works**

Run: Open browser, click "+ Add event", verify new item appears in edit mode.

**Step 6: Commit**

```bash
git add index.html
git commit -m "feat: add '+ Add event' button to time periods"
```

---

## Task 8: Create Backend API Endpoints

**Files:**
- Modify: `server.js` (add new routes after existing itinerary routes)

**Step 1: Add helper function to regenerate itinerary.txt from JSON**

Add this function before the routes:

```javascript
function regenerateItineraryTxt(data) {
    let txt = '';

    // Hotel
    if (data.hotel) {
        txt += '# Hotel\n';
        txt += data.hotel + '\n\n';
    }

    // Reservations
    if (data.reservations && data.reservations.length > 0) {
        txt += '# Reservations\n';
        data.reservations.forEach(r => {
            txt += `- ${r}\n`;
        });
        txt += '\n';
    }

    // Days
    data.days.forEach(day => {
        txt += `# ${day.date} (${day.dayOfWeek})${day.title ? ' - ' + day.title : ''}\n`;
        day.items.forEach(item => {
            let line = '- ';
            if (item.fallback) {
                line += 'fallback: ';
            }
            if (item.time && !item.fallback) {
                line += item.time + ': ';
            }
            line += item.description;
            if (item.optional && !item.fallback) {
                // Add (optional) suffix to time if there's a time, otherwise to description
                if (item.time) {
                    line = line.replace(item.time + ':', item.time + ' (optional):');
                } else {
                    line += ' (optional)';
                }
            }
            txt += line + '\n';
        });
        txt += '\n';
    });

    // Notes
    if (data.notes && data.notes.length > 0) {
        txt += '# Notes\n';
        data.notes.forEach(n => {
            txt += `- ${n}\n`;
        });
    }

    return txt.trim() + '\n';
}
```

**Step 2: Add PATCH endpoint for updating items**

Add after the existing `/api/itinerary` routes:

```javascript
// Update a single item
app.patch('/api/itinerary/item', requireAuth, async (req, res) => {
    try {
        const { day, index, item } = req.body;

        if (typeof day !== 'number' || typeof index !== 'number' || !item) {
            return res.status(400).json({ error: 'Missing day, index, or item' });
        }

        if (!itineraryJson.days[day] || !itineraryJson.days[day].items[index]) {
            return res.status(404).json({ error: 'Item not found' });
        }

        // Update the item (keep place data if description unchanged)
        const existingItem = itineraryJson.days[day].items[index];
        const descriptionChanged = existingItem.description !== item.description;

        itineraryJson.days[day].items[index] = {
            ...existingItem,
            time: item.time,
            description: item.description,
            fallback: item.fallback,
            optional: item.optional,
            type: existingItem.type,
            place: descriptionChanged ? null : existingItem.place
        };

        // Regenerate txt
        itineraryTxt = regenerateItineraryTxt(itineraryJson);
        fs.writeFileSync('./itinerary.txt', itineraryTxt, 'utf-8');

        // Re-enrich if description changed
        if (descriptionChanged) {
            const parsed = parseItinerary(itineraryTxt);
            itineraryJson = await enrichItinerary(parsed, genAI);
            fs.writeFileSync('./itinerary.json', JSON.stringify(itineraryJson, null, 2));
        } else {
            fs.writeFileSync('./itinerary.json', JSON.stringify(itineraryJson, null, 2));
        }

        res.json({ success: true, json: itineraryJson });
    } catch (err) {
        console.error('Update item error:', err);
        res.status(500).json({ error: 'Failed to update item' });
    }
});
```

**Step 3: Add POST endpoint for adding items**

```javascript
// Add a new item
app.post('/api/itinerary/item', requireAuth, async (req, res) => {
    try {
        const { day, item } = req.body;

        if (typeof day !== 'number' || !item || !item.description) {
            return res.status(400).json({ error: 'Missing day or item' });
        }

        if (!itineraryJson.days[day]) {
            return res.status(404).json({ error: 'Day not found' });
        }

        // Create new item
        const newItem = {
            time: item.time || 'morning',
            description: item.description,
            type: 'activity',
            fallback: item.fallback || false,
            optional: item.optional || false,
            place: null
        };

        // Find insert position based on time
        const timeOrder = ['morning', 'afternoon', 'evening', 'night'];
        const targetOrder = timeOrder.indexOf(newItem.time);

        let insertIndex = itineraryJson.days[day].items.length;
        for (let i = 0; i < itineraryJson.days[day].items.length; i++) {
            const existingTime = itineraryJson.days[day].items[i].time?.toLowerCase();
            const existingOrder = timeOrder.indexOf(existingTime);
            if (existingOrder > targetOrder || (existingOrder === -1 && targetOrder >= 0)) {
                insertIndex = i;
                break;
            }
        }

        itineraryJson.days[day].items.splice(insertIndex, 0, newItem);

        // Regenerate txt
        itineraryTxt = regenerateItineraryTxt(itineraryJson);
        fs.writeFileSync('./itinerary.txt', itineraryTxt, 'utf-8');

        // Enrich the new item
        const parsed = parseItinerary(itineraryTxt);
        itineraryJson = await enrichItinerary(parsed, genAI);
        fs.writeFileSync('./itinerary.json', JSON.stringify(itineraryJson, null, 2));

        res.json({ success: true, json: itineraryJson });
    } catch (err) {
        console.error('Add item error:', err);
        res.status(500).json({ error: 'Failed to add item' });
    }
});
```

**Step 4: Add DELETE endpoint for removing items**

```javascript
// Delete an item
app.delete('/api/itinerary/item', requireAuth, async (req, res) => {
    try {
        const { day, index } = req.body;

        if (typeof day !== 'number' || typeof index !== 'number') {
            return res.status(400).json({ error: 'Missing day or index' });
        }

        if (!itineraryJson.days[day] || !itineraryJson.days[day].items[index]) {
            return res.status(404).json({ error: 'Item not found' });
        }

        // Remove the item
        itineraryJson.days[day].items.splice(index, 1);

        // Regenerate txt
        itineraryTxt = regenerateItineraryTxt(itineraryJson);
        fs.writeFileSync('./itinerary.txt', itineraryTxt, 'utf-8');
        fs.writeFileSync('./itinerary.json', JSON.stringify(itineraryJson, null, 2));

        res.json({ success: true, json: itineraryJson });
    } catch (err) {
        console.error('Delete item error:', err);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});
```

**Step 5: Verify endpoints work**

Run: `npm start`, test with curl or browser devtools:
```bash
# Test PATCH
curl -X PATCH http://localhost:8080/api/itinerary/item \
  -H "Content-Type: application/json" \
  -d '{"day":0,"index":0,"item":{"time":"evening","description":"Test"}}'
```

**Step 6: Commit**

```bash
git add server.js
git commit -m "feat: add CRUD API endpoints for itinerary items"
```

---

## Task 9: Final Integration and Testing

**Files:**
- All files from previous tasks

**Step 1: Test full edit flow**

1. Open browser to http://localhost:8080
2. Click pencil icon on any event
3. Change time category dropdown
4. Edit description
5. Toggle Backup/Optional chips
6. Click outside to save
7. Verify "Saving..." → "Saved ✓" indicator
8. Verify event updates with new enrichment

**Step 2: Test add flow**

1. Click "+ Add event" button
2. Enter description
3. Press Enter or click outside
4. Verify new event appears with enrichment

**Step 3: Test delete flow**

1. Click pencil icon
2. Click trash icon
3. Verify undo toast appears
4. Test both: letting it delete AND clicking undo

**Step 4: Test edge cases**

- Empty description on new event → should cancel
- Escape key → should cancel edit
- Rapid edits → should debounce correctly
- Oscar chat updates → should still work

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete inline calendar editing implementation"
```

---

## Summary

This implementation:
1. Removes Editor tab (navigation, HTML, CSS, JS)
2. Adds pencil edit icon to event cards
3. Transforms cards into inline edit form (dropdown, input, chips)
4. Adds "+ Add event" buttons to time periods
5. Implements delete with 3-second undo toast
6. Creates PATCH/POST/DELETE API endpoints
7. Regenerates itinerary.txt from JSON after changes
8. Re-enriches only when description changes

The user can now edit the entire itinerary directly from the Calendar view with a clean, minimal UI.
