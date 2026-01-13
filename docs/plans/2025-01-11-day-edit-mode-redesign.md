# Day-Level Edit Mode Redesign

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace per-event inline editing with a day-level edit mode where users can modify all events, add new ones, and delete items before saving everything at once, triggering enrichment and auto-sorting.

**Architecture:** Add an `isEditMode` flag to CalendarRenderer. When active, all events render as editable fields (time + name + optional/fallback toggles + delete button). A single "Done" button saves all pending changes via individual API calls, then re-fetches the full itinerary (with enriched data from server), and re-renders.

**Tech Stack:** Vanilla JS, existing API endpoints (PATCH /api/itinerary/item, POST, DELETE)

---

## Task 1: Add Edit Mode Styling & Header Button

**Files:**
- Modify: `index.html:1-1220` (CSS for edit mode styles + HTML for button)

**Step 1: Add CSS for edit mode**

In the `<style>` section (after line 870, before `/* ========== CHAT VIEW ========== */`), add:

```css
/* Edit mode indicator */
.event-list.edit-mode {
    background: rgba(201, 70, 61, 0.02);
}

/* Edit Day button in header */
.cal-header-edit-btn {
    padding: 10px 16px;
    background: transparent;
    border: 1px solid var(--timeline-line);
    border-radius: 10px;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
}

.cal-header-edit-btn:hover {
    background: var(--bg-elevated);
    border-color: var(--accent-dim);
    color: var(--text-primary);
}

.cal-header-edit-btn.active {
    background: var(--coral);
    border-color: var(--coral);
    color: var(--bg-deep);
}

/* Done button (save and exit edit mode) */
.cal-edit-done-btn {
    position: fixed;
    top: calc(var(--nav-height) + 16px);
    right: 24px;
    padding: 12px 24px;
    background: var(--coral);
    border: none;
    border-radius: 10px;
    color: var(--bg-deep);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    z-index: 100;
    box-shadow: var(--shadow-lg);
    transition: all 0.2s ease;
    display: none;
}

.cal-edit-done-btn.visible {
    display: block;
}

.cal-edit-done-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 40px rgba(201, 70, 61, 0.3);
}

.cal-edit-done-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
}

/* Mobile adjustments for edit buttons */
@media (max-width: 768px) {
    .cal-header-edit-btn {
        padding: 8px 12px;
        font-size: 12px;
    }

    .cal-edit-done-btn {
        padding: 10px 18px;
        font-size: 13px;
        right: 16px;
        top: 16px;
    }
}
```

**Step 2: Add Edit Day button to calendar header**

Find the line in HTML (around line 1250-1254):
```html
<header class="cal-header">
    <span class="cal-header-brand">NYC Jan 14-18</span>
    <span id="cal-current-day" class="cal-header-day">Tuesday, Jan 14</span>
</header>
```

Replace with:
```html
<header class="cal-header">
    <span class="cal-header-brand">NYC Jan 14-18</span>
    <span id="cal-current-day" class="cal-header-day">Tuesday, Jan 14</span>
    <button id="cal-edit-btn" class="cal-header-edit-btn" aria-label="Edit day">Edit</button>
</header>
```

Also add the Done button right after the toast container (around line 1247):
```html
<button id="cal-done-btn" class="cal-edit-done-btn">Done</button>
```

**Step 3: Verify styling looks right**

Visually check:
- "Edit" button appears in header, right-aligned
- "Done" button appears in fixed position top-right when in edit mode
- Edit mode background has subtle coral tint

**Step 4: Commit**

```bash
cd "C:\Users\George\nyc\.worktrees\edit-mode"
git add index.html
git commit -m "feat: add edit mode styling and header buttons"
```

---

## Task 2: Add Edit Mode State & Toggle Logic

**Files:**
- Modify: `index.html:1595-1605` (CalendarRenderer constructor and init)

**Step 1: Add state properties to CalendarRenderer constructor**

Find constructor (around line 1582-1594):
```javascript
constructor() {
    this.container = document.getElementById('event-list');
    this.pillsContainer = document.getElementById('day-pills');
    this.currentDayEl = document.getElementById('cal-current-day');
    this.data = null;
    this.selectedDay = 1;
    this.expandedEvent = null;
    this.editingEvent = null;
    this.editState = null;
    // Bind outside click handler once to prevent memory leak
    this.boundHandleOutsideClick = this.handleOutsideClick.bind(this);
    this.initPillHandlers();
}
```

Add these properties after `this.editState = null;`:
```javascript
this.isEditMode = false;
this.pendingChanges = { added: [], modified: {}, deleted: [] };
this.isSaving = false;
```

**Step 2: Initialize edit button handlers in render() method**

Find the end of the `render()` method (around line 1782), before the comment about "Click outside to save":

Add:
```javascript
// Edit mode button handler
const editBtn = document.getElementById('cal-edit-btn');
const doneBtn = document.getElementById('cal-done-btn');

editBtn.addEventListener('click', () => {
    this.toggleEditMode();
});

if (this.isEditMode && doneBtn) {
    doneBtn.classList.add('visible');
    doneBtn.disabled = this.isSaving;
    doneBtn.addEventListener('click', () => {
        this.saveAllChanges();
    });
} else if (doneBtn) {
    doneBtn.classList.remove('visible');
}

// Update edit button state
editBtn.classList.toggle('active', this.isEditMode);
editBtn.textContent = this.isEditMode ? 'Exit' : 'Edit';
```

**Step 3: Add toggleEditMode method**

Add this new method to CalendarRenderer class (before `render()` method):
```javascript
toggleEditMode() {
    if (this.isEditMode) {
        // Exiting edit mode - discard changes
        this.isEditMode = false;
        this.pendingChanges = { added: [], modified: {}, deleted: [] };
        this.editingEvent = null;
        this.editState = null;
        this.expandedEvent = null;
    } else {
        // Entering edit mode
        this.isEditMode = true;
        this.expandedEvent = null;
        this.editingEvent = null;
    }
    this.render();
}
```

**Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add edit mode state and toggle logic"
```

---

## Task 3: Render Events as Editable Forms in Edit Mode

**Files:**
- Modify: `index.html:1806-1832` (renderDayItems method)

**Step 1: Modify renderDayItems to use edit form when in edit mode**

Find the `renderDayItems()` method (around line 1806-1832):

Replace the rendering logic section:
```javascript
for (const item of items) {
    // Time divider (only show in view mode, not edit mode)
    if (!this.isEditMode) {
        const timeGroup = this.getTimeGroup(item.time);
        if (timeGroup && timeGroup !== lastTimeGroup) {
            html += `
            <div class="time-divider">
                <span class="time-divider-label">${timeGroup}</span>
                <div class="time-divider-line"></div>
            </div>`;
            lastTimeGroup = timeGroup;
        }
    }

    // Always use edit form in edit mode
    if (this.isEditMode) {
        html += this.renderEditForm(item, eventIndex);
    } else {
        html += this.renderEventRow(item, eventIndex);
    }
    eventIndex++;
}
```

**Step 2: Add event change handlers when in edit mode**

At the end of `renderDayItems()` (or in `render()` after events are attached), add handlers to track changes:

```javascript
// In edit mode, attach change handlers to track modifications
if (this.isEditMode) {
    this.container.querySelectorAll('.event-edit-form').forEach((form, idx) => {
        const inputs = form.querySelectorAll('[data-field]');
        inputs.forEach(input => {
            input.addEventListener('change', () => {
                this.markEventModified(idx);
            });
        });
    });
}
```

**Step 3: Add helper method to track modifications**

Add this method to CalendarRenderer:
```javascript
markEventModified(index) {
    const dayData = this.data.days[this.selectedDay - 1];
    const item = dayData.items[index];
    if (!item.isNew) {
        this.pendingChanges.modified[index] = true;
    }
}
```

**Step 4: Update renderEditForm to show all form fields clearly**

The existing `renderEditForm()` method (around line 1939-1972) already has the right structure. No changes needed - it already shows:
- Time input
- Description input
- Optional/Fallback checkboxes
- Delete button

**Step 5: Commit**

```bash
git add index.html
git commit -m "feat: render all events as editable forms in edit mode"
```

---

## Task 4: Modify Event Add/Delete to Work in Edit Mode

**Files:**
- Modify: `index.html:1656-1688` and `2246-2276` (Add event button rendering and addNewEvent method)

**Step 1: Update "Add Event" button rendering**

Find the section where add buttons are rendered (around line 1656-1688):

Replace with a single button:
```javascript
// In edit mode, show single "Add Event" button
// In view mode, show time-categorized buttons (existing behavior)
if (this.isEditMode) {
    html += `
    <div style="margin-top: 24px; padding: 0 16px;">
        <button class="add-event-btn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Event
        </button>
    </div>`;
} else {
    html += `
    <div style="margin-top: 24px; padding: 0 16px;">
        <button class="add-event-btn" data-time="morning">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Morning Event
        </button>
        <button class="add-event-btn" data-time="afternoon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Afternoon Event
        </button>
        <button class="add-event-btn" data-time="evening">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Evening Event
        </button>
        <button class="add-event-btn" data-time="night">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Night Event
        </button>
    </div>`;
}
```

**Step 2: Update addNewEvent to work in both modes**

Find `addNewEvent()` method (around line 2246-2276):

Modify it to accept optional time parameter:
```javascript
addNewEvent(time = null) {
    const dayData = this.data.days[this.selectedDay - 1];

    // If in edit mode and no time specified, add at end with default time
    if (this.isEditMode && !time) {
        time = 'evening'; // default time for new events in edit mode
    }

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

    const newItem = {
        time: time,
        description: '',
        type: 'activity',
        fallback: false,
        optional: false,
        place: null,
        isNew: true
    };

    dayData.items.splice(insertIndex, 0, newItem);

    if (this.isEditMode) {
        // Track new item
        this.pendingChanges.added.push(newItem);
        this.render();
    } else {
        // Original behavior: enter edit for this single item
        this.editingEvent = insertIndex;
        this.render();
    }
}
```

**Step 3: Update delete event handler for edit mode**

Find `deleteEvent()` method (around line 2172-2214):

Modify to work in edit mode:
```javascript
async deleteEvent(index) {
    const dayData = this.data.days[this.selectedDay - 1];
    const item = dayData.items[index];
    const itemName = item.place?.name || item.description;

    const deletedItem = { ...item };
    const deletedIndex = index;
    const deletedDay = this.selectedDay - 1;

    dayData.items.splice(index, 1);
    this.editingEvent = null;

    if (this.isEditMode) {
        // In edit mode, just track the deletion and re-render
        if (!item.isNew) {
            this.pendingChanges.deleted.push(item);
        }
        this.render();
    } else {
        // Original behavior: show undo toast and delete via API
        this.render();
        const undoToast = this.showUndoToast(`Deleted "${itemName}"`, async () => {
            dayData.items.splice(deletedIndex, 0, deletedItem);
            this.render();
        });

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
                dayData.items.splice(deletedIndex, 0, deletedItem);
                this.render();
                showToast('Failed to delete event', 'error');
            }
        }, 3000);
    }
}
```

**Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add event button and delete behavior work in edit mode"
```

---

## Task 5: Implement Save All Changes Logic

**Files:**
- Modify: `index.html:2110-2170` (saveEdit method and new saveAllChanges method)

**Step 1: Add saveAllChanges method**

Add this new method to CalendarRenderer (before `deleteEvent`):
```javascript
async saveAllChanges() {
    if (this.isSaving) return;

    this.isSaving = true;
    const doneBtn = document.getElementById('cal-done-btn');
    if (doneBtn) doneBtn.disabled = true;

    this.showSaveIndicator('Saving changes...');

    try {
        const dayData = this.data.days[this.selectedDay - 1];
        const errors = [];

        // Save all modifications and new items
        for (let index = 0; index < dayData.items.length; index++) {
            const item = dayData.items[index];
            const form = this.container.querySelector(`[data-event="${index}"] .event-edit-form`);

            if (!form) continue;

            const input = form.querySelector('[data-field="description"]');
            const timeInput = form.querySelector('[data-field="time"]');
            const description = input?.value?.trim();

            // Skip if empty and not newly added
            if (!description && !item.isNew) continue;

            const updatedItem = {
                time: timeInput?.value?.trim() || 'morning',
                description: description || '',
                fallback: form.querySelector('[data-field="fallback"]')?.classList.contains('active') || false,
                optional: form.querySelector('[data-field="optional"]')?.classList.contains('active') || false
            };

            try {
                const isNew = item.isNew;
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

                if (!response.ok) {
                    errors.push(`Failed to save event at index ${index}`);
                }
            } catch (err) {
                errors.push(`Error saving event: ${err.message}`);
            }
        }

        // If there were no major errors, re-fetch the full itinerary
        if (errors.length === 0) {
            const response = await fetch('/api/itinerary');
            const { json } = await response.json();
            this.data = json;
            this.showSaveIndicator('Saved ✓', true);
        } else {
            showToast(errors[0], 'error');
            this.showSaveIndicator('Some changes failed', false);
        }
    } catch (err) {
        console.error('Save error:', err);
        showToast('Failed to save changes', 'error');
        this.showSaveIndicator('Save failed', false);
    } finally {
        // Exit edit mode and re-render
        this.isSaving = false;
        this.isEditMode = false;
        this.pendingChanges = { added: [], modified: {}, deleted: [] };
        this.editingEvent = null;
        this.editState = null;

        const doneBtn = document.getElementById('cal-done-btn');
        if (doneBtn) {
            doneBtn.disabled = false;
            doneBtn.classList.remove('visible');
        }

        this.render();
    }
}
```

**Step 2: Modify existing saveEdit to work only in non-edit-mode**

Find the `saveEdit()` method (around line 2110-2170) and add a guard at the top:

```javascript
async saveEdit(index) {
    // In edit mode, changes are saved via saveAllChanges
    if (this.isEditMode) return;

    // ... rest of existing method unchanged
}
```

**Step 3: Update renderEditForm to not trigger auto-save in edit mode**

Find the event form handler section in `render()` (around line 1709-1767) and wrap the auto-save logic:

```javascript
// Edit form event handlers
this.container.querySelectorAll('.event-edit-form').forEach(form => {
    const index = parseInt(form.closest('.event-row').dataset.event);

    // Only auto-save if NOT in edit mode
    if (!this.isEditMode) {
        // ... existing blur and keydown handlers for auto-save
    }
});
```

Actually, simpler approach: just prevent the auto-save blur event in edit mode. Modify the handler:

```javascript
input.addEventListener('blur', () => {
    if (!this.isEditMode) {
        this.saveEdit(index);
    }
});
```

**Step 4: Commit**

```bash
git add index.html
git commit -m "feat: implement save all changes logic for day edit mode"
```

---

## Task 6: Test Full End-to-End Flow

**Files:**
- Test in browser: navigate to app, test edit mode functionality

**Step 1: Start the dev server**

```bash
cd "C:\Users\George\nyc\.worktrees\edit-mode"
npm start
```

Open `http://localhost:8080` in browser.

**Step 2: Test entering edit mode**

- Click "Edit" button in calendar header
- Verify:
  - Button text changes to "Exit"
  - Button highlights in coral color
  - "Done" button appears fixed at top-right
  - All events render as editable forms (time + name fields visible)
  - Hotel card is visible
  - Time dividers disappear
  - Single "Add Event" button appears at bottom
  - Background has subtle coral tint

**Step 3: Test editing an event**

- Click on the time field for first event, change it (e.g., "7:30pm" → "7:45pm")
- Click on the description field, modify text
- Verify changes appear in form (no auto-save)

**Step 4: Test adding an event**

- Click "Add Event" button
- New event appears at bottom as empty editable form
- Fill in time and description
- Verify it's editable

**Step 5: Test deleting an event**

- Click delete (trash) icon on any event
- Verify event is removed from the list immediately

**Step 6: Test optional/fallback toggles**

- Click "Optional" chip on an event
- Verify it toggles highlighted state
- Click "Backup" chip
- Verify it toggles highlighted state

**Step 7: Test saving all changes**

- Make several edits (modify 1 event, add 1 event, delete 1 event, toggle 1 optional)
- Click "Done" button
- Verify:
  - Saving indicator shows
  - Done button is disabled
  - After ~1-2 seconds, edit mode exits
  - Calendar shows enriched data (enrichment happened on server)
  - Events are re-sorted by time (enricher re-sorted them)
  - Hotel card is visible again
  - Time dividers reappear
  - "Edit" button is back

**Step 8: Test canceling edit mode**

- Enter edit mode again
- Make some changes
- Click "Exit" button (was "Edit" button)
- Changes are discarded
- Normal view is restored

**Step 9: Test on mobile (responsive)**

- Resize browser to mobile width (<768px)
- Verify:
  - Edit button is still visible and clickable
  - Done button is positioned correctly
  - Forms are still usable

**Step 10: Commit test results**

If all tests pass:
```bash
git log --oneline -5
```

Should see the 4 feature commits from Tasks 1-5.

---

## Edge Cases to Verify (Optional Testing)

1. **Empty description:** Try to save an event with no description - should be skipped
2. **Invalid time format:** Enter nonsense time like "xyz" - should save as-is (server enricher handles it)
3. **Rapid clicking Done:** Click Done twice quickly - second click should be ignored (disabled state)
4. **Network error:** Turn off network, click Done - should show error toast
5. **All events deleted:** Delete all events, click Done, verify day shows just hotel

---

## Summary of Changes

**Before:**
- Inline per-event editing
- 4 "Add Event" buttons (morning/afternoon/evening/night)
- Auto-save on blur
- Undo toast for deletes

**After:**
- Day-level edit mode with single "Done" button
- All events editable simultaneously
- Single "Add Event" button (always at bottom, enricher sorts)
- Changes held in memory until "Done" is clicked
- Bulk save triggers enrichment and auto-sorting
- All changes save in one batch operation
