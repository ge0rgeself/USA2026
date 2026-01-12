# Event CRUD Redesign - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade event creation/management with free-form prompt input, simplified day view, and consistent backup/optional handling.

**Architecture:** Add a Gemini-powered interpreter layer (`lib/interpreter.js`) that converts free-form text to structured event data. Update parser to use single `status` field. Simplify frontend day view to a flat list with inline CRUD.

**Tech Stack:** Node.js/Express backend, Gemini 2.5 Flash API, vanilla JS frontend, CSS variables for styling.

---

## Task 1: Create Interpreter Module

**Files:**
- Create: `lib/interpreter.js`

**Step 1: Create the interpreter module**

```javascript
// lib/interpreter.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

const TRIP_DATES = [
  { date: 'Jan 14', dayOfWeek: 'Tue', dayNum: 1 },
  { date: 'Jan 15', dayOfWeek: 'Wed', dayNum: 2 },
  { date: 'Jan 16', dayOfWeek: 'Thu', dayNum: 3 },
  { date: 'Jan 17', dayOfWeek: 'Fri', dayNum: 4 },
  { date: 'Jan 18', dayOfWeek: 'Sat', dayNum: 5 },
];

const SYSTEM_PROMPT = `You are an event parser for a NYC trip planner (Jan 14-18, 2025).

Convert free-form text into structured event data. Extract:
- day: Which day of the trip (Jan 14, Jan 15, Jan 16, Jan 17, or Jan 18)
- time: null, specific time (7:30pm), range (4-6pm), or vague (morning/afternoon/evening/late night)
- description: Place name and neighborhood if mentioned
- status: "primary" (default), "backup" (if they say backup/fallback/plan B), or "optional" (if they say optional/maybe/if time)

RULES:
- "tomorrow" means the day after the reference date provided
- "Tuesday/Wed/Thursday/Friday/Saturday" maps to Jan 14/15/16/17/18
- If no day specified, return day: null (caller will handle)
- If no time specified, return time: null
- Keep description concise: "Place Name, Neighborhood" format when possible
- Detect status from keywords: backup/fallback/plan B → "backup", optional/maybe/if we have time → "optional"

Respond with ONLY valid JSON, no markdown:
{"day": "Jan 15", "time": "7:30pm", "timeType": "specific", "description": "Carbone, Greenwich Village", "status": "primary"}

timeType must be one of: "specific", "range", "vague", "none"`;

async function interpretPrompt(prompt, context = {}) {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY not set');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const referenceDate = context.referenceDate || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const existingEvents = context.existingEvents || [];

  const userPrompt = `Reference date (today): ${referenceDate}
Trip dates: Jan 14 (Tue), Jan 15 (Wed), Jan 16 (Thu), Jan 17 (Fri), Jan 18 (Sat)

${existingEvents.length > 0 ? `Existing events for context:\n${existingEvents.map(e => `- ${e.day} ${e.time || ''}: ${e.description}`).join('\n')}\n` : ''}

Parse this into structured event data:
"${prompt}"`;

  try {
    const result = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
        { role: 'model', parts: [{ text: 'Understood. I will parse event prompts into structured JSON.' }] },
        { role: 'user', parts: [{ text: userPrompt }] }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 256,
      }
    });

    const text = result.response.text().trim();

    // Clean up potential markdown code blocks
    const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const parsed = JSON.parse(jsonText);

    // Validate required fields
    if (!parsed.description) {
      return { error: 'Could not extract event description', needsClarification: true };
    }

    // Normalize status
    if (!['primary', 'backup', 'optional'].includes(parsed.status)) {
      parsed.status = 'primary';
    }

    // Normalize timeType
    if (!['specific', 'range', 'vague', 'none'].includes(parsed.timeType)) {
      parsed.timeType = parsed.time ? 'vague' : 'none';
    }

    return parsed;
  } catch (error) {
    console.error('Interpreter error:', error);
    return { error: 'Failed to interpret prompt', needsClarification: true };
  }
}

// Match an event for update/remove operations
async function matchEvent(prompt, existingEvents, action) {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY not set');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const eventsWithIndex = existingEvents.map((e, i) => ({
    index: i,
    day: e.day,
    time: e.time,
    description: e.description,
    status: e.status || (e.fallback ? 'backup' : e.optional ? 'optional' : 'primary')
  }));

  const matchPrompt = `You are matching a user's description to an existing event.

Existing events:
${JSON.stringify(eventsWithIndex, null, 2)}

User wants to ${action}: "${prompt}"

Find the best matching event. Respond with ONLY valid JSON:
{"matchedIndex": 0, "day": "Jan 15", "confidence": "high"}

confidence: "high" if clear match, "low" if ambiguous, "none" if no match found
If no match, return: {"matchedIndex": null, "confidence": "none", "suggestion": "Did you mean X?"}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: matchPrompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 256 }
    });

    const text = result.response.text().trim();
    const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(jsonText);
  } catch (error) {
    console.error('Match error:', error);
    return { matchedIndex: null, confidence: 'none', error: 'Failed to match event' };
  }
}

module.exports = { interpretPrompt, matchEvent, TRIP_DATES };
```

**Step 2: Verify the module loads**

Run: `cd /c/Users/George/nyc/.worktrees/event-crud-redesign && node -e "const i = require('./lib/interpreter.js'); console.log('Interpreter loaded:', Object.keys(i))"`

Expected: `Interpreter loaded: [ 'interpretPrompt', 'matchEvent', 'TRIP_DATES' ]`

**Step 3: Commit**

```bash
git add lib/interpreter.js
git commit -m "feat: add interpreter module for free-form event parsing"
```

---

## Task 2: Update Parser for Status Field

**Files:**
- Modify: `lib/parser.js`

**Step 1: Read current parser implementation**

Review `lib/parser.js` to understand the current `parseItem()` function.

**Step 2: Update parseItem to use status field**

In `lib/parser.js`, find the `parseItem` function and update it to return `status` instead of separate `fallback`/`optional` booleans. Also add `timeType` field.

Find this pattern in the return statement and update:
```javascript
// OLD:
return {
  time: time || null,
  description: desc,
  type: this.inferType(desc),
  fallback: isFallback,
  optional: isOptional,
  place: null
};

// NEW:
return {
  time: time || null,
  timeType: this.getTimeType(time),
  description: desc,
  type: this.inferType(desc),
  status: isFallback ? 'backup' : isOptional ? 'optional' : 'primary',
  place: null
};
```

Add the `getTimeType` helper method to the Parser class:
```javascript
getTimeType(time) {
  if (!time) return 'none';
  // Vague times
  if (/^(morning|afternoon|evening|late\s*night|dinner|lunch|breakfast)$/i.test(time)) {
    return 'vague';
  }
  // Time ranges (4-6pm, 1:30-4pm, etc.)
  if (/\d+[:-]\d*\s*-\s*\d+/.test(time) || /\d+\s*-\s*\d+/.test(time)) {
    return 'range';
  }
  // Specific times (7:30pm, 11am)
  if (/\d+:\d+\s*(am|pm)/i.test(time) || /^\d+\s*(am|pm)$/i.test(time)) {
    return 'specific';
  }
  return 'vague';
}
```

**Step 3: Verify parser still works**

Run: `cd /c/Users/George/nyc/.worktrees/event-crud-redesign && node -e "const Parser = require('./lib/parser.js'); const p = new Parser(); const r = p.parseItem('- 7:30pm: Test Restaurant, SoHo'); console.log(r);"`

Expected: Object with `status: 'primary'` and `timeType: 'specific'`

**Step 4: Commit**

```bash
git add lib/parser.js
git commit -m "feat: update parser to use status field and timeType"
```

---

## Task 3: Update Server API Endpoints

**Files:**
- Modify: `server.js`

**Step 1: Add interpreter import at top of server.js**

After other requires, add:
```javascript
const { interpretPrompt, matchEvent, TRIP_DATES } = require('./lib/interpreter.js');
```

**Step 2: Create new interpret endpoint**

Add a new endpoint for interpreting free-form prompts (before the existing itinerary routes):

```javascript
// Interpret free-form event prompt
app.post('/api/interpret', requireAuth, async (req, res) => {
  try {
    const { prompt, referenceDay } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required' });
    }

    // Load existing events for context
    const itinerary = await loadItinerary();
    const existingEvents = [];
    if (itinerary.days) {
      itinerary.days.forEach(day => {
        day.items?.forEach(item => {
          existingEvents.push({
            day: day.date,
            time: item.time,
            description: item.description,
            status: item.status || 'primary'
          });
        });
      });
    }

    const result = await interpretPrompt(prompt, {
      referenceDate: referenceDay || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      existingEvents
    });

    res.json(result);
  } catch (error) {
    console.error('Interpret error:', error);
    res.status(500).json({ error: 'Failed to interpret prompt' });
  }
});
```

**Step 3: Update POST /api/itinerary/item to accept prompt**

Modify the existing POST handler to optionally accept a `prompt` field and use the interpreter:

Find the POST `/api/itinerary/item` handler and update it to handle both old format (day, item) and new format (prompt):

```javascript
// Add at the start of the POST handler, after const { day, item } = req.body;
let targetDay = day;
let targetItem = item;

// If prompt provided, interpret it first
if (req.body.prompt) {
  const interpreted = await interpretPrompt(req.body.prompt, {
    referenceDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  });

  if (interpreted.error || interpreted.needsClarification) {
    return res.status(400).json({ error: interpreted.error || 'Could not interpret prompt', needsClarification: true });
  }

  // Find day index from interpreted date
  const dayIndex = TRIP_DATES.findIndex(d => d.date === interpreted.day);
  if (dayIndex === -1 && interpreted.day) {
    return res.status(400).json({ error: `Invalid day: ${interpreted.day}` });
  }

  targetDay = dayIndex !== -1 ? dayIndex : (req.body.defaultDay ?? 0);
  targetItem = {
    time: interpreted.time,
    description: interpreted.description,
    status: interpreted.status || 'primary'
  };
}
```

**Step 4: Update item format handling throughout server**

In `regenerateItineraryTxt` function, update to handle the new `status` field format when writing back to itinerary.txt:

Find where items are written and update:
```javascript
// When writing item line:
let line = '- ';
if (item.time) {
  line += `${item.time}`;
  if (item.status === 'backup') {
    line += ' fallback';
  } else if (item.status === 'optional') {
    line += ' optional';
  }
  line += `: ${item.description}`;
} else {
  if (item.status === 'backup') {
    line += `fallback: ${item.description}`;
  } else if (item.status === 'optional') {
    line += `optional: ${item.description}`;
  } else {
    line += item.description;
  }
}
```

**Step 5: Commit**

```bash
git add server.js
git commit -m "feat: add interpret endpoint and update item API for free-form input"
```

---

## Task 4: Update Oscar Agent Tool

**Files:**
- Modify: `lib/oscar-agent.js`

**Step 1: Update updateItinerary tool definition**

Find the `updateItinerary` function declaration in the tools array and update its parameters:

```javascript
// Find the updateItinerary declaration and replace with:
{
  name: 'updateItinerary',
  description: 'Add, update, or remove items from the trip itinerary. Use free-form prompts.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['add', 'update', 'remove'],
        description: 'The action to perform'
      },
      prompt: {
        type: 'string',
        description: 'Free-form description like "dinner at Carbone Tuesday evening" or "backup pizza spot for Friday"'
      },
      options: {
        type: 'object',
        properties: {
          backup: { type: 'boolean', description: 'Mark as backup/fallback option' },
          optional: { type: 'boolean', description: 'Mark as optional activity' }
        }
      }
    },
    required: ['action', 'prompt']
  }
}
```

**Step 2: Update the updateItinerary handler**

Find where the tool is executed and update the handler:

```javascript
// In the tool execution section, update updateItinerary handler:
case 'updateItinerary': {
  const { action, prompt, options = {} } = args;

  // Import interpreter
  const { interpretPrompt, matchEvent, TRIP_DATES } = require('./interpreter.js');

  if (action === 'add') {
    const interpreted = await interpretPrompt(prompt);
    if (interpreted.error) {
      return { success: false, error: interpreted.error };
    }

    // Apply options overrides
    if (options.backup) interpreted.status = 'backup';
    if (options.optional) interpreted.status = 'optional';

    const dayIndex = TRIP_DATES.findIndex(d => d.date === interpreted.day);

    // Call the API to add the item
    // ... (keep existing API call logic but use interpreted data)
  }

  if (action === 'update' || action === 'remove') {
    // Load current itinerary and match the event
    const itinerary = await loadItinerary();
    const allEvents = [];
    itinerary.days?.forEach((day, dayIdx) => {
      day.items?.forEach((item, itemIdx) => {
        allEvents.push({ ...item, day: day.date, dayIndex: dayIdx, itemIndex: itemIdx });
      });
    });

    const match = await matchEvent(prompt, allEvents, action);

    if (match.confidence === 'none' || match.matchedIndex === null) {
      return { success: false, error: match.suggestion || 'Could not find matching event' };
    }

    // Perform update or remove using matched event
    // ... (implement based on existing patterns)
  }

  break;
}
```

**Step 3: Commit**

```bash
git add lib/oscar-agent.js
git commit -m "feat: update Oscar updateItinerary tool for free-form prompts"
```

---

## Task 5: Simplify Day View - Remove Dividers

**Files:**
- Modify: `js/app.js`
- Modify: `styles/main.css`

**Step 1: Find and remove time section dividers in app.js**

In `js/app.js`, find where time sections (morning/afternoon/evening) are rendered. Look for code that groups events by time of day and remove it.

Search for patterns like:
- `renderTimeSection`
- `morning`, `afternoon`, `evening` grouping
- `.time-section` or `.time-divider` classes

Replace with a flat list render:

```javascript
// In the day rendering section, replace grouped rendering with:
renderDayItems(day) {
  const items = day.items || [];

  // Sort items by time
  const sorted = [...items].sort((a, b) => this.compareEventTimes(a.time, b.time));

  return sorted.map((item, index) => this.renderEventRow(item, index)).join('');
}

// Add time comparison helper:
compareEventTimes(timeA, timeB) {
  const order = { 'morning': 1, 'breakfast': 1, 'lunch': 2, 'afternoon': 2, 'evening': 3, 'dinner': 3, 'late night': 4 };

  const parseTime = (t) => {
    if (!t) return 999; // No time goes last
    if (order[t.toLowerCase()]) return order[t.toLowerCase()] * 100;
    // Parse specific time like "7:30pm"
    const match = t.match(/(\d+):?(\d*)\s*(am|pm)/i);
    if (match) {
      let hour = parseInt(match[1]);
      const min = parseInt(match[2]) || 0;
      const isPM = match[3].toLowerCase() === 'pm';
      if (isPM && hour !== 12) hour += 12;
      if (!isPM && hour === 12) hour = 0;
      return hour * 60 + min;
    }
    return 500; // Unknown format in middle
  };

  return parseTime(timeA) - parseTime(timeB);
}
```

**Step 2: Remove time divider CSS**

In `styles/main.css`, find and remove or comment out styles for:
- `.time-section`
- `.time-divider`
- `.time-header`
- Any morning/afternoon/evening specific styles

**Step 3: Commit**

```bash
git add js/app.js styles/main.css
git commit -m "refactor: remove time dividers, render flat event list"
```

---

## Task 6: Update Event Row Display

**Files:**
- Modify: `js/app.js`
- Modify: `styles/main.css`

**Step 1: Update renderEventRow for new layout**

Find `renderEventRow` in `js/app.js` and update to match new design:

```javascript
renderEventRow(item, index) {
  const isEditing = this.editingIndex === index;
  const status = item.status || (item.fallback ? 'backup' : item.optional ? 'optional' : 'primary');
  const isSecondary = status !== 'primary';

  if (isEditing) {
    return this.renderEditForm(item, index);
  }

  const enrichment = item.enrichment || {};
  const displayName = enrichment.name || item.description;
  const neighborhood = enrichment.neighborhood || '';
  const timeDisplay = item.time || '';

  const statusBadge = status === 'backup'
    ? '<span class="event-badge backup">BACKUP</span>'
    : status === 'optional'
    ? '<span class="event-badge optional">OPTIONAL</span>'
    : '';

  return `
    <div class="event-row ${isSecondary ? 'secondary' : ''}" data-index="${index}">
      <div class="event-row-content" onclick="calendar.startEdit(${index})">
        <div class="event-time">${timeDisplay}</div>
        <div class="event-details">
          <div class="event-name">${displayName} ${statusBadge}</div>
          ${neighborhood ? `<div class="event-neighborhood">${neighborhood}</div>` : ''}
        </div>
        <button class="event-menu-btn" onclick="event.stopPropagation(); calendar.showEventMenu(${index})">
          <span>•••</span>
        </button>
      </div>
    </div>
  `;
}
```

**Step 2: Add event row styles**

Add to `styles/main.css`:

```css
/* Event Row - View Mode */
.event-row {
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--border-light, #e5e5e5);
  transition: background-color 0.15s ease;
}

.event-row:hover {
  background-color: var(--bg-hover, #f5f5f5);
}

.event-row.secondary {
  opacity: 0.7;
}

.event-row-content {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  cursor: pointer;
  flex: 1;
}

.event-time {
  min-width: 80px;
  font-size: 0.875rem;
  color: var(--text-muted, #666);
  font-variant-numeric: tabular-nums;
}

.event-details {
  flex: 1;
}

.event-name {
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.event-neighborhood {
  font-size: 0.8125rem;
  color: var(--text-muted, #666);
  margin-top: 0.125rem;
}

.event-badge {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.125rem 0.375rem;
  border-radius: 2px;
}

.event-badge.backup {
  background-color: var(--badge-backup-bg, #fef3c7);
  color: var(--badge-backup-text, #92400e);
}

.event-badge.optional {
  background-color: var(--badge-optional-bg, #e0e7ff);
  color: var(--badge-optional-text, #3730a3);
}

.event-menu-btn {
  background: none;
  border: none;
  padding: 0.5rem;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  color: var(--text-muted, #666);
}

.event-row:hover .event-menu-btn {
  opacity: 1;
}
```

**Step 3: Commit**

```bash
git add js/app.js styles/main.css
git commit -m "feat: update event row display with new layout and badges"
```

---

## Task 7: Build Inline Edit Mode

**Files:**
- Modify: `js/app.js`
- Modify: `styles/main.css`

**Step 1: Update renderEditForm**

Find `renderEditForm` in `js/app.js` and replace with new design:

```javascript
renderEditForm(item, index) {
  const status = item.status || (item.fallback ? 'backup' : item.optional ? 'optional' : 'primary');
  const timeAndDesc = item.time ? `${item.description} around ${item.time}` : item.description;

  return `
    <div class="event-row editing" data-index="${index}">
      <div class="event-edit-form">
        <input
          type="text"
          class="event-edit-input"
          value="${this.escapeHtml(timeAndDesc)}"
          placeholder="What's the plan?"
          data-field="prompt"
          onkeydown="calendar.handleEditKeydown(event, ${index})"
        />
        <div class="event-edit-hint">e.g., "dinner at Carbone around 7pm"</div>

        <div class="event-edit-status">
          <span class="status-label">Status:</span>
          <label class="status-option">
            <input type="radio" name="status-${index}" value="primary" ${status === 'primary' ? 'checked' : ''}>
            <span>Primary</span>
          </label>
          <label class="status-option">
            <input type="radio" name="status-${index}" value="backup" ${status === 'backup' ? 'checked' : ''}>
            <span>Backup</span>
          </label>
          <label class="status-option">
            <input type="radio" name="status-${index}" value="optional" ${status === 'optional' ? 'checked' : ''}>
            <span>Optional</span>
          </label>
        </div>

        <div class="event-edit-actions">
          <button class="btn-cancel" onclick="calendar.cancelEdit()">Cancel</button>
          <button class="btn-save" onclick="calendar.saveEdit(${index})">Save</button>
          <button class="btn-delete" onclick="calendar.confirmDelete(${index})">Delete...</button>
        </div>
      </div>
    </div>
  `;
}

handleEditKeydown(event, index) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    this.saveEdit(index);
  } else if (event.key === 'Escape') {
    this.cancelEdit();
  }
}
```

**Step 2: Add edit form styles**

Add to `styles/main.css`:

```css
/* Event Row - Edit Mode */
.event-row.editing {
  background-color: var(--bg-edit, #fff);
  border: 2px solid var(--coral, #c9463d);
  border-radius: 4px;
  margin: 0.5rem 0;
}

.event-edit-form {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.event-edit-input {
  width: 100%;
  padding: 0.625rem 0.75rem;
  font-size: 1rem;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 4px;
  font-family: inherit;
}

.event-edit-input:focus {
  outline: none;
  border-color: var(--coral, #c9463d);
  box-shadow: 0 0 0 2px rgba(201, 70, 61, 0.1);
}

.event-edit-hint {
  font-size: 0.75rem;
  color: var(--text-muted, #666);
}

.event-edit-status {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.status-label {
  font-size: 0.875rem;
  color: var(--text-muted, #666);
}

.status-option {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
}

.status-option input[type="radio"] {
  cursor: pointer;
}

.event-edit-actions {
  display: flex;
  gap: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border-light, #e5e5e5);
}

.event-edit-actions .btn-cancel,
.event-edit-actions .btn-save,
.event-edit-actions .btn-delete {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  transition: background-color 0.15s, opacity 0.15s;
}

.btn-cancel {
  background: none;
  border: 1px solid var(--border, #d1d5db);
  color: var(--text, #1a1a1a);
}

.btn-cancel:hover {
  background-color: var(--bg-hover, #f5f5f5);
}

.btn-save {
  background-color: var(--coral, #c9463d);
  border: none;
  color: white;
}

.btn-save:hover {
  opacity: 0.9;
}

.btn-delete {
  background: none;
  border: none;
  color: var(--text-muted, #666);
  margin-left: auto;
}

.btn-delete:hover {
  color: var(--error, #dc2626);
}
```

**Step 3: Commit**

```bash
git add js/app.js styles/main.css
git commit -m "feat: implement inline edit mode with status radio buttons"
```

---

## Task 8: Build Add Event Flow

**Files:**
- Modify: `js/app.js`
- Modify: `styles/main.css`

**Step 1: Add "Add event" UI at end of day**

Find where day items are rendered and add the "Add event" ghost card at the end:

```javascript
renderAddEventCard() {
  if (this.isAddingEvent) {
    return `
      <div class="event-row adding">
        <div class="event-edit-form">
          <input
            type="text"
            class="event-edit-input"
            placeholder="What's the plan?"
            data-field="new-prompt"
            onkeydown="calendar.handleAddKeydown(event)"
            autofocus
          />
          <div class="event-edit-hint">e.g., "dinner at Carbone around 7pm"</div>

          <div class="event-edit-actions">
            <button class="btn-cancel" onclick="calendar.cancelAdd()">Cancel</button>
            <button class="btn-save" onclick="calendar.saveNewEvent()">Add</button>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="event-add-trigger" onclick="calendar.startAddEvent()">
      <span class="add-icon">+</span>
      <span>Add event...</span>
    </div>
  `;
}

startAddEvent() {
  this.isAddingEvent = true;
  this.editingIndex = null;
  this.render();
  // Focus the input after render
  setTimeout(() => {
    const input = document.querySelector('[data-field="new-prompt"]');
    if (input) input.focus();
  }, 0);
}

cancelAdd() {
  this.isAddingEvent = false;
  this.render();
}

handleAddKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    this.saveNewEvent();
  } else if (event.key === 'Escape') {
    this.cancelAdd();
  }
}

async saveNewEvent() {
  const input = document.querySelector('[data-field="new-prompt"]');
  const prompt = input?.value?.trim();

  if (!prompt) {
    this.showToast('Please enter an event description', 'error');
    return;
  }

  // Show loading state
  input.disabled = true;

  try {
    const response = await fetch('/api/itinerary/item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        defaultDay: this.selectedDayIndex
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add event');
    }

    this.isAddingEvent = false;
    this.showToast('Event added', 'success');
    await this.load(); // Refresh data
  } catch (error) {
    this.showToast(error.message, 'error');
    input.disabled = false;
  }
}
```

**Step 2: Add styles for add event trigger**

Add to `styles/main.css`:

```css
/* Add Event Trigger */
.event-add-trigger {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  color: var(--text-muted, #666);
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s;
  border-radius: 4px;
  margin: 0.5rem 0;
}

.event-add-trigger:hover {
  color: var(--coral, #c9463d);
  background-color: var(--bg-hover, #f5f5f5);
}

.add-icon {
  font-size: 1.25rem;
  font-weight: 300;
}

.event-row.adding {
  background-color: var(--bg-edit, #fff);
  border: 2px dashed var(--border, #d1d5db);
  border-radius: 4px;
  margin: 0.5rem 0;
}

.event-row.adding:focus-within {
  border-color: var(--coral, #c9463d);
}
```

**Step 3: Commit**

```bash
git add js/app.js styles/main.css
git commit -m "feat: implement add event flow with free-form input"
```

---

## Task 9: Implement Delete Confirmation & Undo

**Files:**
- Modify: `js/app.js`
- Modify: `styles/main.css`

**Step 1: Add delete confirmation flow**

Add to `js/app.js`:

```javascript
confirmDelete(index) {
  this.deletingIndex = index;
  this.render();

  // Auto-cancel after 5 seconds
  this.deleteTimeout = setTimeout(() => {
    this.deletingIndex = null;
    this.render();
  }, 5000);
}

cancelDelete() {
  clearTimeout(this.deleteTimeout);
  this.deletingIndex = null;
  this.render();
}

async executeDelete(index) {
  clearTimeout(this.deleteTimeout);

  const item = this.currentDay.items[index];
  const dayIndex = this.selectedDayIndex;

  try {
    const response = await fetch('/api/itinerary/item', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day: dayIndex, index })
    });

    if (!response.ok) throw new Error('Failed to delete');

    // Store for undo
    this.lastDeleted = { item, dayIndex, itemIndex: index };
    this.deletingIndex = null;
    this.editingIndex = null;

    await this.load();
    this.showUndoToast();
  } catch (error) {
    this.showToast('Failed to delete event', 'error');
  }
}

showUndoToast() {
  const toast = document.createElement('div');
  toast.className = 'toast undo-toast';
  toast.innerHTML = `
    <span>Event deleted</span>
    <button onclick="calendar.undoDelete()">Undo</button>
  `;
  document.body.appendChild(toast);

  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
    this.lastDeleted = null;
  }, 5000);
}

async undoDelete() {
  if (!this.lastDeleted) return;

  const { item, dayIndex } = this.lastDeleted;

  try {
    await fetch('/api/itinerary/item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ day: dayIndex, item })
    });

    this.lastDeleted = null;
    document.querySelector('.undo-toast')?.remove();
    await this.load();
    this.showToast('Event restored', 'success');
  } catch (error) {
    this.showToast('Failed to restore event', 'error');
  }
}
```

**Step 2: Update renderEditForm to show delete confirmation**

In the edit form, when `this.deletingIndex === index`, show confirmation:

```javascript
// In renderEditForm, replace delete button section:
${this.deletingIndex === index ? `
  <div class="delete-confirm">
    <span>Delete this event?</span>
    <button class="btn-confirm-delete" onclick="calendar.executeDelete(${index})">Yes, delete</button>
    <button class="btn-cancel-delete" onclick="calendar.cancelDelete()">No, keep</button>
  </div>
` : `
  <button class="btn-delete" onclick="calendar.confirmDelete(${index})">Delete...</button>
`}
```

**Step 3: Add delete confirmation and toast styles**

Add to `styles/main.css`:

```css
/* Delete Confirmation */
.delete-confirm {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-left: auto;
  font-size: 0.875rem;
}

.delete-confirm span {
  color: var(--error, #dc2626);
}

.btn-confirm-delete {
  background-color: var(--error, #dc2626);
  color: white;
  border: none;
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

.btn-cancel-delete {
  background: none;
  border: 1px solid var(--border, #d1d5db);
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
}

/* Undo Toast */
.undo-toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  background-color: var(--text, #1a1a1a);
  color: white;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  animation: slideUp 0.3s ease;
}

.undo-toast button {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.undo-toast button:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.undo-toast.fade-out {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
  transition: opacity 0.3s, transform 0.3s;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}
```

**Step 4: Commit**

```bash
git add js/app.js styles/main.css
git commit -m "feat: implement delete confirmation with undo toast"
```

---

## Task 10: Add Loading and Error States

**Files:**
- Modify: `js/app.js`
- Modify: `styles/main.css`

**Step 1: Add loading state to event row**

Update `renderEventRow` to handle enriching state:

```javascript
renderEventRow(item, index) {
  // ... existing code ...

  const isEnriching = item.enrichment === null;
  const hasError = item.enrichmentError;

  // Add to the row:
  const statusIndicator = isEnriching
    ? '<span class="enriching-indicator">⟳</span>'
    : hasError
    ? '<span class="error-indicator" onclick="calendar.retryEnrichment(${index})">⚠️</span>'
    : '';

  // Update the template to include statusIndicator
}

async retryEnrichment(index) {
  const item = this.currentDay.items[index];
  // Trigger re-enrichment by "updating" with same description
  try {
    await fetch('/api/itinerary/item', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        day: this.selectedDayIndex,
        index,
        item: { ...item, enrichment: null }
      })
    });
    await this.load();
  } catch (error) {
    this.showToast('Failed to retry enrichment', 'error');
  }
}
```

**Step 2: Add loading/error styles**

Add to `styles/main.css`:

```css
/* Loading & Error States */
.enriching-indicator {
  animation: spin 1s linear infinite;
  display: inline-block;
  color: var(--text-muted, #666);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error-indicator {
  cursor: pointer;
  color: var(--warning, #f59e0b);
}

.error-indicator:hover {
  opacity: 0.8;
}

.event-row.enriching {
  opacity: 0.7;
}

.event-row.enriching .event-name::after {
  content: 'Enriching...';
  font-size: 0.75rem;
  color: var(--text-muted, #666);
  margin-left: 0.5rem;
}

.event-row.error .event-neighborhood {
  color: var(--warning, #f59e0b);
}

.event-row.error .event-neighborhood::before {
  content: "Couldn't enrich – ";
}

.event-row.error .event-neighborhood::after {
  content: ' Retry?';
  text-decoration: underline;
  cursor: pointer;
}
```

**Step 3: Commit**

```bash
git add js/app.js styles/main.css
git commit -m "feat: add loading and error states for enrichment"
```

---

## Task 11: Update Save Logic for Interpreter

**Files:**
- Modify: `js/app.js`

**Step 1: Update saveEdit to use interpreter endpoint**

```javascript
async saveEdit(index) {
  const form = document.querySelector('.event-row.editing');
  const input = form.querySelector('[data-field="prompt"]');
  const prompt = input?.value?.trim();

  if (!prompt) {
    this.showToast('Please enter an event description', 'error');
    return;
  }

  // Get selected status
  const statusRadio = form.querySelector('input[name^="status-"]:checked');
  const status = statusRadio?.value || 'primary';

  const originalItem = this.currentDay.items[index];

  // Show processing state
  form.classList.add('processing');
  input.disabled = true;

  try {
    // First, interpret the prompt to get structured data
    const interpretResponse = await fetch('/api/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, referenceDay: this.currentDay.date })
    });

    const interpreted = await interpretResponse.json();

    if (interpreted.error || interpreted.needsClarification) {
      throw new Error(interpreted.error || 'Could not interpret prompt');
    }

    // Apply manual status override
    interpreted.status = status;

    // Check if day changed
    if (interpreted.day && interpreted.day !== this.currentDay.date) {
      // Day changed - delete from current, add to new
      await this.moveEventToDay(index, interpreted);
    } else {
      // Same day - update in place
      await fetch('/api/itinerary/item', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day: this.selectedDayIndex,
          index,
          item: {
            time: interpreted.time,
            description: interpreted.description,
            status: interpreted.status
          }
        })
      });
    }

    this.editingIndex = null;
    this.showToast('Event updated', 'success');
    await this.load();
  } catch (error) {
    this.showToast(error.message, 'error');
    form.classList.remove('processing');
    input.disabled = false;
  }
}

async moveEventToDay(fromIndex, interpreted) {
  // Delete from current day
  await fetch('/api/itinerary/item', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ day: this.selectedDayIndex, index: fromIndex })
  });

  // Add to new day
  const newDayIndex = this.data.days.findIndex(d => d.date === interpreted.day);
  if (newDayIndex === -1) throw new Error(`Day not found: ${interpreted.day}`);

  await fetch('/api/itinerary/item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      day: newDayIndex,
      item: {
        time: interpreted.time,
        description: interpreted.description,
        status: interpreted.status
      }
    })
  });
}
```

**Step 2: Commit**

```bash
git add js/app.js
git commit -m "feat: integrate interpreter in save flow, support day changes"
```

---

## Task 12: Data Migration - Update Existing Data

**Files:**
- Modify: `server.js` (or run migration script)

**Step 1: Add migration helper in server startup**

Add a function that migrates old `fallback`/`optional` booleans to `status` field on server startup:

```javascript
// Add after loadItinerary function:
function migrateToStatusField(itinerary) {
  if (!itinerary.days) return itinerary;

  itinerary.days.forEach(day => {
    if (!day.items) return;
    day.items.forEach(item => {
      // Skip if already has status
      if (item.status) return;

      // Migrate from boolean flags
      if (item.fallback) {
        item.status = 'backup';
      } else if (item.optional) {
        item.status = 'optional';
      } else {
        item.status = 'primary';
      }

      // Clean up old flags
      delete item.fallback;
      delete item.optional;
    });
  });

  return itinerary;
}

// In loadItinerary, after parsing:
itinerary = migrateToStatusField(itinerary);
```

**Step 2: Update itinerary.txt to new format**

Review current `itinerary.txt` and update any items using old format to new format.

**Step 3: Commit**

```bash
git add server.js itinerary.txt
git commit -m "chore: add migration helper for status field"
```

---

## Task 13: Integration Testing

**Step 1: Manual test checklist**

Test each flow manually:

1. **Add event with free-form prompt**
   - Click "+ Add event..."
   - Type "dinner at Carbone tomorrow evening"
   - Verify it interprets correctly and adds to right day

2. **Edit event**
   - Click an existing event
   - Change description to include new time
   - Toggle status to "optional"
   - Save and verify changes persist

3. **Delete event**
   - Click event, click Delete
   - Verify confirmation appears
   - Click "Yes, delete"
   - Verify undo toast appears
   - Click Undo and verify event restores

4. **Oscar integration**
   - Ask Oscar to "add a backup dinner option for Tuesday"
   - Verify event appears with BACKUP badge
   - Ask Oscar to "make the walk optional"
   - Verify status changes

5. **Enrichment**
   - Add a new event
   - Verify loading indicator shows
   - Wait for enrichment
   - Verify place data appears

**Step 2: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes"
```

---

## Task 14: Final Cleanup and PR

**Step 1: Review all changes**

```bash
git log --oneline main..HEAD
git diff main --stat
```

**Step 2: Squash/rebase if needed for clean history**

**Step 3: Push and create PR**

```bash
git push -u origin feature/event-crud-redesign
gh pr create --title "Event CRUD Redesign" --body "$(cat <<'EOF'
## Summary
- Free-form prompt input for creating/editing events
- Gemini-powered interpreter for natural language parsing
- Simplified day view (removed time dividers)
- Consistent backup/optional status handling
- Inline CRUD with proper UX states
- Delete confirmation with undo

## Test Plan
- [ ] Add event with free-form prompt
- [ ] Edit event with day/time change
- [ ] Toggle backup/optional status
- [ ] Delete with undo
- [ ] Oscar chatbot integration
- [ ] Enrichment loading states

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create interpreter module | `lib/interpreter.js` |
| 2 | Update parser for status field | `lib/parser.js` |
| 3 | Update server API endpoints | `server.js` |
| 4 | Update Oscar agent tool | `lib/oscar-agent.js` |
| 5 | Remove time dividers | `js/app.js`, `styles/main.css` |
| 6 | Update event row display | `js/app.js`, `styles/main.css` |
| 7 | Build inline edit mode | `js/app.js`, `styles/main.css` |
| 8 | Build add event flow | `js/app.js`, `styles/main.css` |
| 9 | Delete confirmation & undo | `js/app.js`, `styles/main.css` |
| 10 | Loading and error states | `js/app.js`, `styles/main.css` |
| 11 | Update save logic | `js/app.js` |
| 12 | Data migration | `server.js` |
| 13 | Integration testing | - |
| 14 | Final cleanup and PR | - |
