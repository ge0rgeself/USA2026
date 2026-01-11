# Unified Itinerary System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Connect Editor, Calendar, and Chat so they share a single source of truth - edits in any section reflect everywhere.

**Architecture:** Human-editable `itinerary.txt` (simple format) is enriched via Gemini Maps grounding API into `itinerary.json` (structured data). Calendar renders from JSON. Chat can propose updates to the txt file with user approval. All three sections stay in sync.

**Tech Stack:** Express.js (server), Google Gemini API with Maps grounding (enrichment), Claude API (chat), vanilla JS (frontend)

---

## Task 1: Create Simple Itinerary Format

**Files:**
- Create: `itinerary.txt`
- Delete: `nyc_itinerary.md` (after migration)

**Step 1: Create the new simple format file**

Create `itinerary.txt` with this content:

```
# Hotel
Untitled at 3 Freeman Alley, Lower East Side

# Reservations
- Minetta Tavern (Resy, book 30 days ahead)
- Village Vanguard ($30+ cover, sets 9pm/11pm)
- 9/11 Museum ($38/person)

# Jan 14 (Tue) - Arrival
- evening: Check-in, walk Freeman Alley
- dinner: Cafe Mogador, East Village
- fallback: Russ & Daughters Cafe
- optional: McSorley's for one drink

# Jan 15 (Wed) - Katz's + Brooklyn
- 11am: Katz's Delicatessen
- 1pm: Subway to Brooklyn Bridge
- 1:30-4pm: Brooklyn Bridge walk → DUMBO → Brooklyn Heights Promenade
- dinner: Joe's Pizza, Fulton St

# Jan 16 (Thu) - SoHo & Hamilton
- morning: Sleep in, coffee near hotel
- 11am-3pm: SoHo → West Village wandering
- optional 2pm: Tenement Museum
- 5pm: Spicy Village, Chinatown
- fallback: Taiwan Pork Chop House
- 8pm: Hamilton at Richard Rodgers Theatre
- late: Ardesia Wine Bar

# Jan 17 (Fri) - WTC + Met + Jazz
- 10am: 9/11 Memorial & Museum
- 1pm: Light lunch near Met
- 1:30-4pm: Metropolitan Museum of Art
- 4pm: Central Park walk (The Mall → Bethesda Terrace → Bow Bridge)
- 6:30pm: Minetta Tavern
- fallback: Balthazar
- 9pm: Village Vanguard
- fallback: Smalls Jazz Club

# Jan 18 (Sat) - Departure
- morning: Abraco coffee
- fallback: Culture Espresso

# Notes
- Pack warm layers (30-40°F in January)
- Katz's: Get ticket at door, don't lose it, tip cutter $2-5 cash
- Met closed Wednesdays, 9/11 Museum closed Tuesdays
```

**Step 2: Verify file created**

Run: `cat C:/Users/George/nyc/itinerary.txt | head -20`
Expected: First 20 lines of the new format

**Step 3: Commit**

```bash
git add itinerary.txt
git commit -m "feat: add simple itinerary.txt format"
```

---

## Task 2: Add Gemini API Integration

**Files:**
- Modify: `server.js`
- Modify: `package.json` (add dependency)

**Step 1: Install Gemini SDK**

Run: `cd C:/Users/George/nyc && npm install @google/generative-ai`
Expected: Package added to node_modules

**Step 2: Add Gemini client setup to server.js**

Add after the Anthropic client setup (around line 94):

```javascript
// Gemini client for Maps grounding enrichment
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = process.env.GOOGLE_GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY)
  : null;
```

**Step 3: Commit**

```bash
git add package.json package-lock.json server.js
git commit -m "feat: add Gemini SDK for maps grounding"
```

---

## Task 3: Create Itinerary Parser

**Files:**
- Create: `lib/parser.js`

**Step 1: Create the parser module**

Create `lib/parser.js`:

```javascript
/**
 * Parses simple itinerary.txt format into structured data
 */

function parseItinerary(text) {
  const lines = text.split('\n');
  const result = {
    hotel: null,
    reservations: [],
    days: [],
    notes: []
  };

  let currentSection = null;
  let currentDay = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Section headers
    if (trimmed.startsWith('# Hotel')) {
      currentSection = 'hotel';
      currentDay = null;
      continue;
    }
    if (trimmed.startsWith('# Reservations')) {
      currentSection = 'reservations';
      currentDay = null;
      continue;
    }
    if (trimmed.startsWith('# Notes')) {
      currentSection = 'notes';
      currentDay = null;
      continue;
    }

    // Day headers: # Jan 14 (Tue) - Title
    const dayMatch = trimmed.match(/^# (Jan \d+) \((\w+)\)(?: - (.+))?$/);
    if (dayMatch) {
      currentSection = 'day';
      currentDay = {
        date: dayMatch[1],
        dayOfWeek: dayMatch[2],
        title: dayMatch[3] || '',
        items: []
      };
      result.days.push(currentDay);
      continue;
    }

    // Hotel content (non-list line after # Hotel)
    if (currentSection === 'hotel' && !trimmed.startsWith('-')) {
      result.hotel = trimmed;
      continue;
    }

    // List items
    if (trimmed.startsWith('- ')) {
      const content = trimmed.slice(2);

      if (currentSection === 'reservations') {
        result.reservations.push(content);
      } else if (currentSection === 'notes') {
        result.notes.push(content);
      } else if (currentSection === 'day' && currentDay) {
        const item = parseItem(content);
        currentDay.items.push(item);
      }
    }
  }

  return result;
}

function parseItem(content) {
  // Check for fallback/optional prefix
  let fallback = false;
  let optional = false;

  if (content.startsWith('fallback: ')) {
    fallback = true;
    content = content.slice(10);
  } else if (content.startsWith('optional ')) {
    optional = true;
    content = content.slice(9);
  } else if (content.startsWith('optional: ')) {
    optional = true;
    content = content.slice(10);
  }

  // Parse time: description
  const colonIndex = content.indexOf(': ');
  let time = null;
  let description = content;

  if (colonIndex > 0) {
    const beforeColon = content.slice(0, colonIndex).toLowerCase();
    // Check if it looks like a time
    if (isTimeLike(beforeColon)) {
      time = beforeColon;
      description = content.slice(colonIndex + 2);
    }
  }

  // Determine type from time/content
  const type = inferType(time, description);

  return {
    time,
    description,
    type,
    fallback,
    optional,
    place: null // Will be enriched by Gemini
  };
}

function isTimeLike(str) {
  const timePatterns = [
    /^\d{1,2}(am|pm)$/,           // 11am, 5pm
    /^\d{1,2}:\d{2}(am|pm)?$/,    // 11:00, 5:30pm
    /^\d{1,2}-\d{1,2}(am|pm)?$/,  // 1-4pm
    /^\d{1,2}(am|pm)?-\d{1,2}(am|pm)$/, // 1pm-4pm
    /^morning$/, /^afternoon$/, /^evening$/, /^night$/, /^late$/,
    /^breakfast$/, /^lunch$/, /^dinner$/, /^brunch$/
  ];
  return timePatterns.some(p => p.test(str));
}

function inferType(time, description) {
  const timeLower = (time || '').toLowerCase();
  const descLower = description.toLowerCase();

  // Food types
  if (['breakfast', 'lunch', 'dinner', 'brunch'].includes(timeLower)) {
    return 'food';
  }
  if (descLower.includes('coffee') || descLower.includes('pizza') ||
      descLower.includes('restaurant') || descLower.includes('delicatessen')) {
    return 'food';
  }

  // Entertainment
  if (descLower.includes('hamilton') || descLower.includes('theatre') ||
      descLower.includes('jazz') || descLower.includes('vanguard') ||
      descLower.includes('show')) {
    return 'entertainment';
  }

  // Culture
  if (descLower.includes('museum') || descLower.includes('memorial') ||
      descLower.includes('gallery')) {
    return 'culture';
  }

  // Transit
  if (descLower.includes('subway') || descLower.includes('train') ||
      descLower.includes('taxi') || descLower.includes('uber')) {
    return 'transit';
  }

  return 'activity';
}

module.exports = { parseItinerary, parseItem };
```

**Step 2: Test parser manually**

Run: `cd C:/Users/George/nyc && node -e "const {parseItinerary} = require('./lib/parser'); const fs = require('fs'); const txt = fs.readFileSync('itinerary.txt', 'utf-8'); console.log(JSON.stringify(parseItinerary(txt), null, 2));" | head -50`

Expected: JSON output with hotel, days array, items

**Step 3: Commit**

```bash
git add lib/parser.js
git commit -m "feat: add itinerary.txt parser"
```

---

## Task 4: Create Gemini Maps Enrichment

**Files:**
- Create: `lib/enricher.js`

**Step 1: Create the enricher module**

Create `lib/enricher.js`:

```javascript
/**
 * Enriches parsed itinerary with place data via Gemini Maps grounding
 */

async function enrichItinerary(parsed, genAI) {
  if (!genAI) {
    console.warn('Gemini API not configured, skipping enrichment');
    return convertToDisplayFormat(parsed);
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{
      googleSearch: {}
    }]
  });

  // Collect all place descriptions that need enrichment
  const placesToEnrich = [];

  // Hotel
  if (parsed.hotel) {
    placesToEnrich.push({
      id: 'hotel',
      query: parsed.hotel + ', New York City'
    });
  }

  // Day items
  for (let i = 0; i < parsed.days.length; i++) {
    const day = parsed.days[i];
    for (let j = 0; j < day.items.length; j++) {
      const item = day.items[j];
      if (looksLikePlace(item.description)) {
        placesToEnrich.push({
          id: `day-${i}-item-${j}`,
          query: item.description + ', New York City',
          description: item.description
        });
      }
    }
  }

  // Batch enrich places
  const enrichedPlaces = await batchEnrichPlaces(placesToEnrich, model);

  // Merge enriched data back
  return mergeEnrichedData(parsed, enrichedPlaces);
}

function looksLikePlace(description) {
  // Skip generic activities
  const skipPatterns = [
    /^check-?in/i,
    /^sleep/i,
    /^walk\s/i,
    /^subway/i,
    /^wandering/i,
    /coffee near/i
  ];
  if (skipPatterns.some(p => p.test(description))) {
    return false;
  }

  // Likely a place if it contains proper nouns or specific venue names
  return /[A-Z]/.test(description);
}

async function batchEnrichPlaces(places, model) {
  if (places.length === 0) return {};

  const prompt = `For each of these New York City locations, provide accurate information in JSON format.
Return ONLY valid JSON, no markdown or explanation.

Locations:
${places.map((p, i) => `${i + 1}. "${p.query}"`).join('\n')}

Return this exact JSON structure:
{
  "places": [
    {
      "index": 1,
      "name": "Official venue name",
      "address": "Full street address, New York, NY ZIP",
      "mapsUrl": "https://maps.google.com/?q=URL+encoded+address",
      "website": "https://official-website.com or null",
      "tips": "One helpful sentence about this place"
    }
  ]
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Extract JSON from response (may be wrapped in markdown)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in Gemini response');
      return {};
    }

    const data = JSON.parse(jsonMatch[0]);

    // Map back to place IDs
    const enriched = {};
    for (const place of data.places || []) {
      const original = places[place.index - 1];
      if (original) {
        enriched[original.id] = {
          name: place.name,
          address: place.address,
          mapsUrl: place.mapsUrl || `https://maps.google.com/?q=${encodeURIComponent(place.address)}`,
          website: place.website,
          tips: place.tips
        };
      }
    }

    return enriched;
  } catch (err) {
    console.error('Gemini enrichment error:', err);
    return {};
  }
}

function mergeEnrichedData(parsed, enrichedPlaces) {
  const result = {
    hotel: null,
    reservations: parsed.reservations,
    days: [],
    notes: parsed.notes
  };

  // Hotel
  if (enrichedPlaces.hotel) {
    result.hotel = enrichedPlaces.hotel;
  } else if (parsed.hotel) {
    result.hotel = { name: parsed.hotel, address: null, mapsUrl: null, website: null, tips: null };
  }

  // Days
  for (let i = 0; i < parsed.days.length; i++) {
    const day = parsed.days[i];
    const enrichedDay = {
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      title: day.title,
      items: []
    };

    for (let j = 0; j < day.items.length; j++) {
      const item = day.items[j];
      const placeData = enrichedPlaces[`day-${i}-item-${j}`];

      enrichedDay.items.push({
        time: item.time,
        timeDisplay: formatTimeDisplay(item.time),
        description: item.description,
        type: item.type,
        fallback: item.fallback,
        optional: item.optional,
        place: placeData || null
      });
    }

    result.days.push(enrichedDay);
  }

  return result;
}

function formatTimeDisplay(time) {
  if (!time) return '';

  const formats = {
    'morning': 'Morning',
    'afternoon': 'Afternoon',
    'evening': 'Evening',
    'night': 'Night',
    'late': 'Late Night',
    'breakfast': 'Breakfast',
    'lunch': 'Lunch',
    'dinner': 'Dinner',
    'brunch': 'Brunch'
  };

  if (formats[time.toLowerCase()]) {
    return formats[time.toLowerCase()];
  }

  // Format numeric times: 11am -> 11:00 AM
  return time.toUpperCase().replace(/(\d+)(AM|PM)/i, '$1:00 $2');
}

function convertToDisplayFormat(parsed) {
  return mergeEnrichedData(parsed, {});
}

module.exports = { enrichItinerary };
```

**Step 2: Commit**

```bash
git add lib/enricher.js
git commit -m "feat: add Gemini Maps enrichment module"
```

---

## Task 5: Update Server API Endpoints

**Files:**
- Modify: `server.js`

**Step 1: Add imports and new itinerary loading**

Replace the itinerary loading section (around line 97) with:

```javascript
const { parseItinerary } = require('./lib/parser');
const { enrichItinerary } = require('./lib/enricher');

// Load itinerary files
let itineraryTxt = '';
let itineraryJson = null;

async function loadItinerary() {
  try {
    itineraryTxt = fs.readFileSync('./itinerary.txt', 'utf-8');
    const parsed = parseItinerary(itineraryTxt);
    itineraryJson = await enrichItinerary(parsed, genAI);
    fs.writeFileSync('./itinerary.json', JSON.stringify(itineraryJson, null, 2));
    console.log('Itinerary loaded and enriched');
  } catch (err) {
    console.error('Error loading itinerary:', err);
    // Fallback to txt only
    try {
      itineraryTxt = fs.readFileSync('./itinerary.txt', 'utf-8');
      itineraryJson = parseItinerary(itineraryTxt);
    } catch (e) {
      console.error('Failed to load itinerary.txt:', e);
    }
  }
}

// Load on startup
loadItinerary();
```

**Step 2: Update getSystemPrompt to use both formats**

Replace the getSystemPrompt function:

```javascript
function getSystemPrompt() {
  return `You are a concise NYC trip assistant for Jan 14-18, 2025. Your answers must be SHORT (1-3 sentences max).

Here is the itinerary:
${itineraryTxt}

Rules:
- Keep answers to 1-3 sentences MAX. Be direct.
- Always include clickable Google Maps links when mentioning locations
- For walking directions: https://maps.google.com/maps/dir/?api=1&destination=ADDRESS&travelmode=walking
- Link to Resy/booking sites when discussing reservations
- January weather is 30-40°F - remind about layers if relevant
- If asked about something not in the itinerary, be helpful but brief

IMPORTANT - Itinerary Updates:
- If the user wants to ADD, CHANGE, or REMOVE something from the itinerary, DO NOT do it directly
- Instead, confirm what they want and ask: "Want me to update the itinerary?"
- Include exactly this marker in your response: [UPDATE_AVAILABLE]
- Example: "Lombardi's is great! Want me to update Wednesday dinner to Lombardi's? [UPDATE_AVAILABLE]"`;
}
```

**Step 3: Update /api/itinerary GET endpoint**

Replace the existing endpoint:

```javascript
app.get('/api/itinerary', requireAuth, (req, res) => {
  try {
    res.json({
      txt: itineraryTxt,
      json: itineraryJson
    });
  } catch (err) {
    console.error('Error reading itinerary:', err);
    res.status(500).json({ error: 'Failed to read itinerary' });
  }
});
```

**Step 4: Update /api/itinerary PUT endpoint**

Replace the existing endpoint:

```javascript
app.put('/api/itinerary', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Content must be a string' });
    }

    // Save raw txt
    fs.writeFileSync('./itinerary.txt', content, 'utf-8');
    itineraryTxt = content;

    // Parse and enrich
    const parsed = parseItinerary(content);
    itineraryJson = await enrichItinerary(parsed, genAI);
    fs.writeFileSync('./itinerary.json', JSON.stringify(itineraryJson, null, 2));

    res.json({
      success: true,
      json: itineraryJson
    });
  } catch (err) {
    console.error('Error saving itinerary:', err);
    res.status(500).json({ error: 'Failed to save itinerary' });
  }
});
```

**Step 5: Add chat update endpoint**

Add new endpoint after /api/chat:

```javascript
// Chat-initiated itinerary update
app.post('/api/itinerary/chat-update', requireAuth, async (req, res) => {
  try {
    const { action, day, item, newContent } = req.body;

    // Use Claude to intelligently update the txt file
    const updatePrompt = `Current itinerary:
${itineraryTxt}

User wants to: ${action}
Day: ${day || 'not specified'}
Item: ${item || 'not specified'}
New content: ${newContent || 'not specified'}

Return ONLY the updated itinerary.txt content. Keep the exact same format.
Make the minimal change needed. Do not add explanations.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: updatePrompt }]
    });

    const newTxt = response.content[0].text.trim();

    // Save and enrich
    fs.writeFileSync('./itinerary.txt', newTxt, 'utf-8');
    itineraryTxt = newTxt;

    const parsed = parseItinerary(newTxt);
    itineraryJson = await enrichItinerary(parsed, genAI);
    fs.writeFileSync('./itinerary.json', JSON.stringify(itineraryJson, null, 2));

    res.json({
      success: true,
      txt: itineraryTxt,
      json: itineraryJson
    });
  } catch (err) {
    console.error('Chat update error:', err);
    res.status(500).json({ error: 'Failed to update itinerary' });
  }
});
```

**Step 6: Commit**

```bash
git add server.js
git commit -m "feat: update server with unified itinerary endpoints"
```

---

## Task 6: Update Editor UI

**Files:**
- Modify: `index.html` (editor section)

**Step 1: Update editor load function**

Find the MarkdownEditor class load() method and update it:

```javascript
async load() {
    try {
        this.textarea.placeholder = 'Loading...';
        const response = await fetch('/api/itinerary');
        const { txt } = await response.json();
        this.textarea.value = txt;
        this.originalContent = txt;
        this.hasChanges = false;
        this.updateStatus();
        this.updatePreview();
        window.editorLoaded = true;
    } catch (err) {
        console.error('Failed to load itinerary:', err);
        this.textarea.placeholder = 'Failed to load. Please refresh.';
        showToast('Failed to load itinerary', 'error');
    }
}
```

**Step 2: Update editor save function to receive and broadcast enriched data**

Update the save() method:

```javascript
async save() {
    if (!this.hasChanges) return;

    this.saveBtn.disabled = true;
    this.statusText.textContent = 'Saving & enriching...';

    try {
        const response = await fetch('/api/itinerary', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: this.textarea.value })
        });

        if (!response.ok) throw new Error('Save failed');

        const { json } = await response.json();

        this.originalContent = this.textarea.value;
        this.hasChanges = false;
        this.updateStatus();

        // Broadcast update to calendar
        window.dispatchEvent(new CustomEvent('itinerary-updated', { detail: json }));

        showToast('Itinerary saved and enriched');
    } catch (err) {
        console.error('Save error:', err);
        showToast('Failed to save. Please try again.', 'error');
    } finally {
        this.saveBtn.disabled = !this.hasChanges;
    }
}
```

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat: update editor to use unified API"
```

---

## Task 7: Create Dynamic Calendar Renderer

**Files:**
- Modify: `index.html` (calendar section + new render function)

**Step 1: Add calendar data store and renderer**

Add this new class after the MarkdownEditor class in the script section:

```javascript
// ========== DYNAMIC CALENDAR ==========
class CalendarRenderer {
    constructor() {
        this.container = document.querySelector('.calendar-main');
        this.data = null;
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

    render() {
        if (!this.data) return;

        const html = `
            ${this.renderReservations()}
            ${this.data.days.map((day, i) => this.renderDay(day, i + 1)).join('')}
            ${this.renderFooterNotes()}
        `;

        this.container.innerHTML = html;
        initCalendarNav(); // Reinitialize scroll observer
    }

    renderReservations() {
        if (!this.data.reservations || this.data.reservations.length === 0) return '';

        return `
        <div class="reservations">
            <div class="reservations-header">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <h2>Book Ahead</h2>
            </div>
            <div class="res-grid">
                ${this.data.reservations.map(r => `
                    <div class="res-item">
                        <div class="res-item-info">
                            <span class="res-item-name">${this.escapeHtml(r)}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }

    renderDay(day, dayNum) {
        const dateNum = day.date.replace('Jan ', '');

        return `
        <section class="day" id="day${dayNum}">
            <div class="day-header">
                <span class="day-number">${String(dayNum).padStart(2, '0')}</span>
                <div class="day-info">
                    <span class="day-date">${day.dayOfWeek}, January ${dateNum}</span>
                    <h2 class="day-title">${this.escapeHtml(day.title)}</h2>
                </div>
            </div>
            <div class="timeline">
                ${this.renderItems(day.items)}
            </div>
        </section>`;
    }

    renderItems(items) {
        let html = '';
        let lastTimeGroup = null;

        for (const item of items) {
            // Add time section divider for major time changes
            const timeGroup = this.getTimeGroup(item.time);
            if (timeGroup && timeGroup !== lastTimeGroup) {
                html += `
                <div class="time-section">
                    <span class="time-section-label">${timeGroup}</span>
                    <div class="time-section-line"></div>
                </div>`;
                lastTimeGroup = timeGroup;
            }

            html += this.renderEvent(item);
        }

        return html;
    }

    getTimeGroup(time) {
        if (!time) return null;
        const t = time.toLowerCase();
        if (t === 'morning' || t === 'breakfast' || t.match(/^([6-9]|10|11)(am|:00\s*am)/i)) return 'Morning';
        if (t === 'afternoon' || t === 'lunch' || t.match(/^(12|1|2|3|4)(pm|:00\s*pm)/i)) return 'Afternoon';
        if (t === 'evening' || t === 'dinner' || t.match(/^(5|6|7)(pm|:00\s*pm)/i)) return 'Evening';
        if (t === 'night' || t === 'late' || t.match(/^(8|9|10|11)(pm|:00\s*pm)/i)) return 'Night';
        return null;
    }

    renderEvent(item) {
        const typeClass = item.type || 'activity';
        const fallbackClass = item.fallback ? 'fallback' : '';
        const optionalClass = item.optional ? 'optional' : '';

        const place = item.place;
        const name = place?.name || item.description;
        const nameHtml = place?.website
            ? `<a href="${this.escapeHtml(place.website)}">${this.escapeHtml(name)}</a>`
            : this.escapeHtml(name);

        return `
        <div class="event ${fallbackClass} ${optionalClass}" data-type="${typeClass}">
            <span class="event-time">${item.timeDisplay || ''}</span>
            <div class="event-card">
                ${item.fallback ? '<div class="event-label">Fallback</div>' : ''}
                ${item.optional ? '<div class="event-label">Optional</div>' : ''}
                <div class="event-name">${nameHtml}</div>
                ${place?.address ? `
                    <div class="event-address">
                        <a href="${this.escapeHtml(place.mapsUrl)}" target="_blank">${this.escapeHtml(place.address)}</a>
                    </div>
                ` : ''}
                ${place?.address ? `
                    <div class="actions">
                        <a class="action" href="https://maps.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.address)}&travelmode=walking" target="_blank">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
                                <circle cx="12" cy="10" r="3"/>
                            </svg>
                            Directions
                        </a>
                    </div>
                ` : ''}
                ${place?.tips ? `
                    <div class="tips">${this.escapeHtml(place.tips)}</div>
                ` : ''}
            </div>
        </div>`;
    }

    renderFooterNotes() {
        if (!this.data.notes || this.data.notes.length === 0) return '';

        return `
        <div class="footer-notes">
            ${this.data.notes.map(note => `
                <div class="footer-note">
                    <div class="footer-note-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                        </svg>
                    </div>
                    <div>
                        <p>${this.escapeHtml(note)}</p>
                    </div>
                </div>
            `).join('')}
        </div>`;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
```

**Step 2: Initialize calendar renderer and listen for updates**

Update the DOMContentLoaded handler:

```javascript
document.addEventListener('DOMContentLoaded', () => {
    window.router = new Router();
    window.markdownEditor = new MarkdownEditor();
    window.chatAgent = new ChatAgent();
    window.calendarRenderer = new CalendarRenderer();

    // Load calendar data
    window.calendarRenderer.load();

    // Listen for itinerary updates
    window.addEventListener('itinerary-updated', (e) => {
        window.calendarRenderer.data = e.detail;
        window.calendarRenderer.render();
    });

    initCalendarNav();
});
```

**Step 3: Remove static calendar HTML**

Replace the static calendar content inside `<main class="calendar-main">` with just an empty container (the dynamic renderer will populate it):

```html
<main class="calendar-main">
    <!-- Dynamically rendered by CalendarRenderer -->
</main>
```

**Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add dynamic calendar renderer from JSON"
```

---

## Task 8: Add Chat Update Actions

**Files:**
- Modify: `index.html` (chat section)

**Step 1: Update ChatAgent to detect and handle update actions**

Update the addMessage method in ChatAgent class to detect [UPDATE_AVAILABLE] marker:

```javascript
addMessage(content, role) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message-full ${role}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-message-content-full';

    // Check for update available marker
    if (role === 'assistant' && content.includes('[UPDATE_AVAILABLE]')) {
        const cleanContent = content.replace('[UPDATE_AVAILABLE]', '').trim();
        contentDiv.innerHTML = this.linkify(cleanContent);

        // Add action buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'chat-actions';
        actionsDiv.style.cssText = 'margin-top: 12px; display: flex; gap: 8px;';

        const updateBtn = document.createElement('button');
        updateBtn.textContent = 'Update itinerary';
        updateBtn.className = 'chat-action-btn primary';
        updateBtn.onclick = () => this.confirmUpdate(cleanContent);

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'No thanks';
        cancelBtn.className = 'chat-action-btn';
        cancelBtn.onclick = () => {
            actionsDiv.remove();
            this.addMessage("No problem! Let me know if you change your mind.", 'assistant');
        };

        actionsDiv.appendChild(updateBtn);
        actionsDiv.appendChild(cancelBtn);
        contentDiv.appendChild(actionsDiv);
    } else {
        contentDiv.innerHTML = this.linkify(content);
    }

    messageDiv.appendChild(contentDiv);
    this.messagesEl.appendChild(messageDiv);
    this.scrollToBottom();

    return messageDiv;
}

async confirmUpdate(context) {
    this.showTyping();

    try {
        const response = await fetch('/api/itinerary/chat-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update based on conversation',
                newContent: context
            })
        });

        const data = await response.json();
        this.hideTyping();

        if (data.success) {
            // Update calendar and editor
            window.dispatchEvent(new CustomEvent('itinerary-updated', { detail: data.json }));
            if (window.markdownEditor) {
                window.markdownEditor.textarea.value = data.txt;
                window.markdownEditor.originalContent = data.txt;
                window.markdownEditor.hasChanges = false;
                window.markdownEditor.updateStatus();
            }

            this.addMessage("Done! I've updated the itinerary. You can see the changes in the Calendar and Editor.", 'assistant');
        } else {
            this.addMessage("Sorry, I couldn't update the itinerary. Please try again.", 'assistant');
        }
    } catch (err) {
        this.hideTyping();
        this.addMessage("Connection error. Please try again.", 'assistant');
    }
}
```

**Step 2: Add styles for chat action buttons**

Add to the style section:

```css
.chat-action-btn {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid var(--timeline-line);
    background: var(--bg-elevated);
    color: var(--text-primary);
}

.chat-action-btn:hover {
    background: var(--bg-main);
    border-color: var(--accent-dim);
}

.chat-action-btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--bg-deep);
}

.chat-action-btn.primary:hover {
    background: var(--accent-light);
}
```

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add chat update actions with confirmation"
```

---

## Task 9: Add Gemini API Key to Cloud Run

**Files:**
- Modify: `.github/workflows/deploy.yml`

**Step 1: Add secret to Cloud Run deployment**

Update the deploy step in `.github/workflows/deploy.yml` to include the Gemini API key:

```yaml
- name: Deploy to Cloud Run
  uses: google-github-actions/deploy-cloudrun@v2
  with:
    service: nyc-trip
    region: us-central1
    source: .
    secrets: |
      ANTHROPIC_API_KEY=anthropic-api-key:latest
      GOOGLE_CLIENT_ID=google-client-id:latest
      GOOGLE_CLIENT_SECRET=google-client-secret:latest
      GOOGLE_GEMINI_API_KEY=google-gemini-api-key:latest
```

**Step 2: Create secret in GCP (manual step)**

Run in terminal or GCP Console:
```bash
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create google-gemini-api-key --data-file=-
gcloud secrets add-iam-policy-binding google-gemini-api-key \
  --member="serviceAccount:522204863154-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

**Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat: add Gemini API key to Cloud Run deployment"
```

---

## Task 10: Clean Up Old Files

**Files:**
- Delete: `nyc_itinerary.md`

**Step 1: Remove old markdown file**

Run: `rm C:/Users/George/nyc/nyc_itinerary.md`

**Step 2: Update .gitignore to ignore generated JSON**

Add to `.gitignore`:
```
itinerary.json
```

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: remove old markdown format, add itinerary.json to gitignore"
```

---

## Task 11: Test Locally

**Step 1: Create local .env with Gemini key**

Add to `.env`:
```
GOOGLE_GEMINI_API_KEY=your-gemini-api-key-here
```

**Step 2: Start server**

Run: `cd C:/Users/George/nyc && npm start`

**Step 3: Test the flow**

1. Open http://localhost:8080
2. Go to Editor - should show simple txt format
3. Make a small change, click Save
4. Go to Calendar - should show enriched data with links
5. Go to Chat - ask to change something
6. Click "Update itinerary" when prompted
7. Verify Calendar and Editor both updated

---

## Summary

**10 tasks, ~45 minutes total implementation time**

| Task | What it does |
|------|--------------|
| 1 | Create simple itinerary.txt format |
| 2 | Add Gemini SDK |
| 3 | Create parser for txt format |
| 4 | Create Gemini Maps enricher |
| 5 | Update server API endpoints |
| 6 | Update Editor UI |
| 7 | Create dynamic Calendar renderer |
| 8 | Add Chat update actions |
| 9 | Add Gemini key to Cloud Run |
| 10 | Clean up old files |
| 11 | Test locally |
