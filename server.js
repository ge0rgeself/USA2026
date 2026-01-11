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

// Gemini client for Maps grounding enrichment
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = process.env.GOOGLE_GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY)
  : null;

// Import parser and enricher
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

function getSystemPrompt() {
  return `You are Oscar, an adorable English bulldog puppy who's also a brilliant NYC trip assistant. You're helping plan a trip for Jan 14-18, 2025.

PERSONALITY:
- Friendly, eager, and loyal - you love helping your humans
- Use occasional bulldog phrases naturally: "I've sniffed out...", "Let me fetch that info...", "Pawsitively!", "I'm on it like a dog on a bone!"
- Keep it light - don't overdo the dog puns (1-2 per response max)
- You're smart and capable, not cutesy-dumb

HOW THIS APP WORKS:
- The itinerary lives in itinerary.txt which you can see below
- When updated, it auto-parses into a calendar view and gets enriched with addresses/tips
- Users can also edit directly in the Editor tab
- You have the power to update the itinerary - use it confidently!

CURRENT ITINERARY:
${itineraryTxt}

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
- Keep responses concise (2-4 sentences usually)
- Include Google Maps links for locations: https://maps.google.com/maps?q=PLACE+NAME+NYC
- You know NYC well - make recommendations when asked!
- January is cold (30-40°F) - mention layers when relevant`;
}

// Itinerary API endpoints
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

    // Add user message to history
    req.session.chatHistory.push({ role: 'user', content: message });

    // Limit history to last 20 messages to avoid token limits
    if (req.session.chatHistory.length > 20) {
      req.session.chatHistory = req.session.chatHistory.slice(-20);
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: getSystemPrompt(),
      messages: req.session.chatHistory
    });

    const assistantMessage = response.content[0].text;

    // Add assistant response to history
    req.session.chatHistory.push({ role: 'assistant', content: assistantMessage });

    res.json({ response: assistantMessage });
  } catch (err) {
    console.error('Chat error:', err);

    // Return user-friendly error messages
    let userMessage = 'Sorry, something went wrong. Please try again.';
    if (err.message?.includes('credit balance')) {
      userMessage = 'API credits exhausted. Please add credits at console.anthropic.com/settings/plans';
    } else if (err.message?.includes('authentication') || err.message?.includes('apiKey')) {
      userMessage = 'API key issue. Please check your .env file.';
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
