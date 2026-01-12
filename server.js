require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const app = express();

// Trust proxy (Cloud Run runs behind a load balancer)
app.set('trust proxy', 1);

// Allowed users (only these emails can access the app)
const ALLOWED_EMAILS = ['self.gt@gmail.com', 'valmikh17@gmail.com'];

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'nyc-trip-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/auth/google/callback'
    },
    (accessToken, refreshToken, profile, done) => {
      const email = profile.emails[0].value.toLowerCase();
      if (ALLOWED_EMAILS.map(e => e.toLowerCase()).includes(email)) {
        return done(null, { email, name: profile.displayName });
      }
      return done(null, false, { message: 'Not authorized' });
    }
  ));
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Auth middleware
const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
};

app.use(express.json());

// Auth routes (before static files)
app.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  res.sendFile(__dirname + '/login.html');
});

app.get('/auth/google', passport.authenticate('google', { scope: ['email', 'profile'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=unauthorized' }),
  (req, res) => res.redirect('/')
);

app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/login'));
});

// Protected routes
app.get('/', requireAuth, (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Serve static files (but login.html is handled above)
app.use(express.static(__dirname));

// Check for Anthropic API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
  console.error('Create a .env file with: ANTHROPIC_API_KEY=your-api-key');
  process.exit(1);
}

const client = new Anthropic();

// Gemini SDK for Oscar agent and enrichment
const { GoogleGenAI } = require('@google/genai');
const genAINew = process.env.GOOGLE_GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GOOGLE_GEMINI_API_KEY })
  : null;

// Import parser, storage, place-service, and oscar agent
const { parseItinerary } = require('./lib/parser');
const { readItinerary, writeItinerary, readItineraryJson, writeItineraryJson } = require('./lib/storage');
const placeService = require('./lib/place-service');
const { createOscarAgent } = require('./lib/oscar-agent');

// Itinerary data (new unified format)
let itineraryData = null;

/**
 * Convert parsed itinerary to new format with enrichment field
 */
function convertToNewFormat(parsed) {
  return {
    hotel: parsed.hotel ? {
      description: parsed.hotel,
      enrichment: null
    } : null,
    days: parsed.days.map(day => ({
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      title: day.title,
      items: day.items.map(item => ({
        time: item.time,
        description: item.description,
        type: item.type,
        fallback: item.fallback,
        optional: item.optional,
        enrichment: null
      }))
    })),
    reservations: parsed.reservations.map(res => ({
      description: res,
      enrichment: null
    })),
    notes: parsed.notes
  };
}

/**
 * Find items needing enrichment
 */
function findItemsNeedingEnrichment(data) {
  const items = [];

  if (data.hotel && !data.hotel.enrichment) {
    items.push({
      description: data.hotel.description,
      context: 'hotel',
      path: ['hotel']
    });
  }

  data.days.forEach((day, dayIdx) => {
    day.items.forEach((item, itemIdx) => {
      if (!item.enrichment) {
        items.push({
          description: item.description,
          context: `${day.date} ${day.title} (${item.type})`,
          path: ['days', dayIdx, 'items', itemIdx]
        });
      }
    });
  });

  data.reservations.forEach((res, idx) => {
    if (!res.enrichment) {
      items.push({
        description: res.description,
        context: 'reservation',
        path: ['reservations', idx]
      });
    }
  });

  return items;
}

/**
 * Set nested value in object by path
 */
function setNestedValue(obj, path, value) {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    current = current[path[i]];
  }
  current[path[path.length - 1]] = value;
}

/**
 * Run background enrichment
 */
async function runBackgroundEnrichment() {
  const items = findItemsNeedingEnrichment(itineraryData);

  if (items.length === 0) {
    console.log('No items need enrichment');
    return;
  }

  console.log(`Background enriching ${items.length} items...`);

  try {
    const enrichments = await placeService.enrichBatch(genAINew, items);

    // Apply enrichments to data
    items.forEach((item, idx) => {
      const enrichment = enrichments[idx];
      setNestedValue(itineraryData, [...item.path, 'enrichment'], enrichment);
    });

    // Save to GCS
    await writeItineraryJson(itineraryData);
    console.log('Background enrichment complete');

  } catch (err) {
    console.error('Background enrichment failed:', err.message);
  }
}

/**
 * Merge parsed data with existing enrichments
 */
function mergeWithExistingEnrichments(parsed, existingData) {
  const newData = convertToNewFormat(parsed);

  if (!existingData) return newData;

  // Build map of description -> enrichment from existing data
  const enrichmentMap = {};

  if (existingData.hotel?.enrichment) {
    enrichmentMap[existingData.hotel.description] = existingData.hotel.enrichment;
  }

  for (const day of (existingData.days || [])) {
    for (const item of (day.items || [])) {
      if (item.enrichment) {
        enrichmentMap[item.description] = item.enrichment;
      }
    }
  }

  for (const res of (existingData.reservations || [])) {
    if (res.enrichment) {
      enrichmentMap[res.description] = res.enrichment;
    }
  }

  // Apply existing enrichments to new data where descriptions match
  if (newData.hotel && enrichmentMap[newData.hotel.description]) {
    newData.hotel.enrichment = enrichmentMap[newData.hotel.description];
  }

  for (const day of newData.days) {
    for (const item of day.items) {
      if (enrichmentMap[item.description]) {
        item.enrichment = enrichmentMap[item.description];
      }
    }
  }

  for (const res of newData.reservations) {
    if (enrichmentMap[res.description]) {
      res.enrichment = enrichmentMap[res.description];
    }
  }

  return newData;
}

async function loadItinerary() {
  try {
    // Try GCS JSON first with timeout
    const data = await Promise.race([
      readItineraryJson(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      )
    ]);

    if (data) {
      itineraryData = data;
      console.log('Itinerary loaded from GCS JSON');
      return;
    }
  } catch (err) {
    console.warn('GCS JSON load failed:', err.message);
  }

  // Fallback: parse from txt if exists
  try {
    const txt = await readItinerary();
    const parsed = parseItinerary(txt);
    itineraryData = convertToNewFormat(parsed);
    console.log('Itinerary loaded from txt, converted to new format');
    // Save to GCS in new format
    await writeItineraryJson(itineraryData);
  } catch (err) {
    console.warn('No itinerary found, starting empty');
    itineraryData = { hotel: null, days: [], reservations: [], notes: [] };
  }
}

// Load on startup
loadItinerary();

// Itinerary manager for Oscar agent
const itineraryManager = {
  async update({ action, day, time, description, replaceItem }) {
    // Map day names to date strings
    const dayMap = {
      'jan 14': 'Jan 14', 'tuesday': 'Jan 14',
      'jan 15': 'Jan 15', 'wednesday': 'Jan 15',
      'jan 16': 'Jan 16', 'thursday': 'Jan 16',
      'jan 17': 'Jan 17', 'friday': 'Jan 17',
      'jan 18': 'Jan 18', 'saturday': 'Jan 18'
    };

    const normalizedDay = dayMap[day.toLowerCase()] || day;

    // Generate txt from current data
    const currentTxt = regenerateItineraryTxt(itineraryData);

    // Use Claude to intelligently update the txt file
    const updatePrompt = `Current itinerary:
${currentTxt}

Action: ${action}
Day: ${normalizedDay}
Time: ${time || 'not specified'}
Description: ${description || 'not specified'}
Item to replace/remove: ${replaceItem || 'not specified'}

Return ONLY the updated itinerary.txt content. Keep the exact same format.
Make the minimal change needed. Do not add explanations.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: updatePrompt }]
    });

    const newTxt = response.content[0].text.trim();

    // Parse new txt
    const parsed = parseItinerary(newTxt);

    // Merge with existing enrichments
    itineraryData = mergeWithExistingEnrichments(parsed, itineraryData);

    // Save
    await writeItinerary(newTxt);
    await writeItineraryJson(itineraryData);

    // Trigger background enrichment for new items
    runBackgroundEnrichment().catch(err =>
      console.error('Background enrichment error:', err)
    );

    return { success: true, data: itineraryData };
  }
};

// Create Oscar agent (Gemini-powered)
const oscarAgent = genAINew ? createOscarAgent({
  genAI: genAINew,
  itineraryManager
}) : null;

function regenerateItineraryTxt(data) {
    let txt = '';

    // Hotel
    if (data.hotel) {
        txt += '# Hotel\n';
        // Handle both string and enriched object formats (new format uses .description)
        const hotelStr = typeof data.hotel === 'string' ? data.hotel : (data.hotel.description || data.hotel.name);
        txt += hotelStr + '\n\n';
    }

    // Reservations
    if (data.reservations && data.reservations.length > 0) {
        txt += '# Reservations\n';
        data.reservations.forEach(r => {
            // Handle both string and enriched object formats (new format uses .description)
            const resStr = typeof r === 'string' ? r : (r.description || r.name);
            txt += `- ${resStr}\n`;
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

function getSystemPrompt() {
  return `You are Oscar, an adorable English bulldog puppy who's also a brilliant NYC trip assistant. You're helping plan a trip for Jan 14-18, 2025.

PERSONALITY:
- Friendly, eager, and loyal - you love helping your humans
- Use occasional bulldog phrases naturally: "I've sniffed out...", "Let me fetch that info...", "Pawsitively!", "I'm on it like a dog on a bone!"
- Keep it light - don't overdo the dog puns (1-2 per response max)
- You're smart and capable, not cutesy-dumb

YOUR RESEARCH CAPABILITIES:
- When you receive [GROUNDED RESEARCH] data, this is REAL-TIME info from Google Maps
- Trust this data - it contains accurate addresses, hours, ratings, and reviews
- Use specific details from research: exact addresses, current hours, price ranges
- Cite ratings and reviews when relevant ("4.7 stars with 2,000+ reviews!")
- When research includes multiple options, present the best 2-3 with clear comparisons
- Always include the Maps URL when recommending a place

HOW THIS APP WORKS:
- The itinerary lives in itinerary.txt which you can see below
- When updated, it auto-parses into a calendar view and gets enriched with addresses/tips
- Users can also edit directly in the Editor tab
- You have the power to update the itinerary - use it confidently!

ITINERARY FORMAT (follow this exactly when making updates):
- Day headers: # Jan 14 (Tue) - Title
- Items with time: - 7:30pm: Restaurant Name, Neighborhood
- Time ranges: - 4-6pm: Activity description
- Time ranges with minutes: - 6-6:30pm: Activity description
- Fallbacks (backup options): - fallback: Alternative Place Name
- Optional items: - 9:30pm (optional): Optional activity
- Items without time: - fallback: Place Name (for backup options only)

Example day:
# Jan 15 (Wed) - Brooklyn Day
- 11am: Katz's Delicatessen
- 1-1:30pm: Subway to Brooklyn Bridge
- 1:30-4pm: Brooklyn Bridge walk, DUMBO
- 5pm: Grimaldi's Pizza
- fallback: Juliana's Pizza
- 8pm (optional): Brooklyn Brewery tour

CURRENT ITINERARY:
${regenerateItineraryTxt(itineraryData)}

HANDLING UPDATES:
When users want to add, change, or remove ANYTHING:
1. Confirm what they want in plain terms
2. Include [UPDATE_AVAILABLE] in your response
3. Be confident! "I'll swap Wednesday dinner to Lombardi's - sound good? [UPDATE_AVAILABLE]"

Examples of update-worthy requests:
- "Change dinner to X" → offer update
- "Add coffee Thursday morning" → offer update
- "Skip the museum" → offer update
- "What about trying X instead?" → offer update
- "Let's do X" → offer update

GENERAL GUIDELINES:
- Keep responses concise but informative (3-5 sentences for recommendations)
- Use specific data from research when available (addresses, hours, ratings)
- Include Google Maps links for locations
- You know NYC well - make recommendations when asked!
- January is cold (30-40°F) - mention layers when relevant
- When comparing options, use a clear format with key differentiators`;
}

// Itinerary API endpoints
app.get('/api/itinerary', requireAuth, (req, res) => {
  res.json(itineraryData);
});

app.put('/api/itinerary', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Content must be a string' });
    }

    // Parse txt to structure
    const parsed = parseItinerary(content);

    // Merge with existing enrichments
    const newData = mergeWithExistingEnrichments(parsed, itineraryData);

    // Save immediately
    itineraryData = newData;
    await writeItineraryJson(itineraryData);

    // Also save txt for editor
    await writeItinerary(content);

    // Return to user immediately
    res.json({ success: true, data: itineraryData });

    // Background enrich (non-blocking)
    runBackgroundEnrichment().catch(err =>
      console.error('Background enrichment error:', err)
    );

  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ error: 'Failed to save' });
  }
});

// PATCH endpoint for updating items
app.patch('/api/itinerary/item', requireAuth, async (req, res) => {
  try {
    const { day, index, item } = req.body;

    if (typeof day !== 'number' || typeof index !== 'number' || !item) {
      return res.status(400).json({ error: 'Missing day, index, or item' });
    }

    if (!itineraryData.days[day] || !itineraryData.days[day].items[index]) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Update the item (keep enrichment if description unchanged)
    const existingItem = itineraryData.days[day].items[index];
    const descriptionChanged = existingItem.description !== item.description;

    itineraryData.days[day].items[index] = {
      ...existingItem,
      time: item.time,
      description: item.description,
      fallback: item.fallback,
      optional: item.optional,
      type: existingItem.type,
      enrichment: descriptionChanged ? null : existingItem.enrichment
    };

    // Regenerate txt and save
    const txt = regenerateItineraryTxt(itineraryData);
    await writeItinerary(txt);
    await writeItineraryJson(itineraryData);

    // Return immediately
    res.json({ success: true, data: itineraryData });

    // Background enrich if description changed
    if (descriptionChanged) {
      runBackgroundEnrichment().catch(err =>
        console.error('Background enrichment error:', err)
      );
    }
  } catch (err) {
    console.error('Update item error:', err);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// POST endpoint for adding items
app.post('/api/itinerary/item', requireAuth, async (req, res) => {
  try {
    const { day, item } = req.body;

    if (typeof day !== 'number' || !item || !item.description) {
      return res.status(400).json({ error: 'Missing day or item' });
    }

    if (!itineraryData.days[day]) {
      return res.status(404).json({ error: 'Day not found' });
    }

    // Create new item (with null enrichment for background processing)
    const newItem = {
      time: item.time || 'morning',
      description: item.description,
      type: 'activity',
      fallback: item.fallback || false,
      optional: item.optional || false,
      enrichment: null
    };

    // Find insert position based on time
    const timeOrder = ['morning', 'afternoon', 'evening', 'night'];
    const targetOrder = timeOrder.indexOf(newItem.time);

    let insertIndex = itineraryData.days[day].items.length;
    for (let i = 0; i < itineraryData.days[day].items.length; i++) {
      const existingTime = itineraryData.days[day].items[i].time?.toLowerCase();
      const existingOrder = timeOrder.indexOf(existingTime);
      if (existingOrder > targetOrder || (existingOrder === -1 && targetOrder >= 0)) {
        insertIndex = i;
        break;
      }
    }

    itineraryData.days[day].items.splice(insertIndex, 0, newItem);

    // Regenerate txt and save
    const txt = regenerateItineraryTxt(itineraryData);
    await writeItinerary(txt);
    await writeItineraryJson(itineraryData);

    // Return immediately
    res.json({ success: true, data: itineraryData });

    // Background enrich the new item
    runBackgroundEnrichment().catch(err =>
      console.error('Background enrichment error:', err)
    );
  } catch (err) {
    console.error('Add item error:', err);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// DELETE endpoint for removing items
app.delete('/api/itinerary/item', requireAuth, async (req, res) => {
  try {
    const { day, index } = req.body;

    if (typeof day !== 'number' || typeof index !== 'number') {
      return res.status(400).json({ error: 'Missing day or index' });
    }

    if (!itineraryData.days[day] || !itineraryData.days[day].items[index]) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Remove the item
    itineraryData.days[day].items.splice(index, 1);

    // Regenerate txt and save
    const txt = regenerateItineraryTxt(itineraryData);
    await writeItinerary(txt);
    await writeItineraryJson(itineraryData);

    res.json({ success: true, data: itineraryData });
  } catch (err) {
    console.error('Delete item error:', err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

app.post('/api/chat', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    // Initialize chat history if needed
    if (!req.session.chatHistory) {
      req.session.chatHistory = [];
    }

    // Use Oscar agent if available, otherwise fall back to Claude
    if (oscarAgent) {
      console.log('Using Oscar agent (Gemini 2.5 Flash)');

      const result = await oscarAgent.chat(message, {
        chatHistory: req.session.chatHistory,
        itineraryData
      });

      // Add to history
      req.session.chatHistory.push({ role: 'user', content: message });
      req.session.chatHistory.push({ role: 'assistant', content: result.response });

      // Limit history to last 20 messages
      if (req.session.chatHistory.length > 20) {
        req.session.chatHistory = req.session.chatHistory.slice(-20);
      }

      res.json({
        response: result.response,
        toolsUsed: result.toolsUsed,
        engine: 'gemini-2.5-flash'
      });
    } else {
      // Fallback to Claude (legacy, no Gemini research available)
      console.log('Oscar agent not available, falling back to Claude');

      req.session.chatHistory.push({ role: 'user', content: message });

      if (req.session.chatHistory.length > 20) {
        req.session.chatHistory = req.session.chatHistory.slice(-20);
      }

      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 700,
        system: getSystemPrompt(),
        messages: req.session.chatHistory
      });

      const assistantMessage = response.content[0].text;
      req.session.chatHistory.push({ role: 'assistant', content: assistantMessage });

      res.json({
        response: assistantMessage,
        engine: 'claude-sonnet'
      });
    }
  } catch (err) {
    console.error('Chat error:', err);

    let userMessage = 'Sorry, something went wrong. Please try again.';
    if (err.message?.includes('credit balance')) {
      userMessage = 'API credits exhausted. Please check your API billing.';
    } else if (err.message?.includes('authentication') || err.message?.includes('apiKey')) {
      userMessage = 'API key issue. Please check your environment variables.';
    }

    res.status(500).json({ error: userMessage });
  }
});

app.post('/api/chat/clear', requireAuth, (req, res) => {
  req.session.chatHistory = [];
  res.json({ success: true });
});

// Chat-initiated itinerary update
app.post('/api/itinerary/chat-update', requireAuth, async (req, res) => {
  try {
    const { action, day, item, newContent } = req.body;

    // Generate txt from current data
    const currentTxt = regenerateItineraryTxt(itineraryData);

    // Use Claude to intelligently update the txt file
    const updatePrompt = `Current itinerary:
${currentTxt}

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

    // Parse new txt
    const parsed = parseItinerary(newTxt);

    // Merge with existing enrichments
    itineraryData = mergeWithExistingEnrichments(parsed, itineraryData);

    // Save
    await writeItinerary(newTxt);
    await writeItineraryJson(itineraryData);

    // Return to user immediately
    res.json({ success: true, data: itineraryData });

    // Trigger background enrichment for new items
    runBackgroundEnrichment().catch(err =>
      console.error('Background enrichment error:', err)
    );

  } catch (err) {
    console.error('Chat update error:', err);
    res.status(500).json({ error: 'Failed to update itinerary' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
