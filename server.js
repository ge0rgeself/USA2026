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

// Itinerary loaded dynamically so it can be reloaded after edits
let itinerary = fs.readFileSync('./nyc_itinerary.md', 'utf-8');

function getSystemPrompt() {
  return `You are a concise NYC trip assistant for Jan 14-18, 2025. Your answers must be SHORT (1-3 sentences max).

Here is the full itinerary:
${itinerary}

Rules:
- Keep answers to 1-3 sentences MAX. Be direct.
- Always include clickable Google Maps links when mentioning locations: https://maps.google.com/?q=ADDRESS+encoded
- For walking directions: https://maps.google.com/maps/dir/?api=1&destination=ADDRESS&travelmode=walking
- Link to Resy/booking sites when discussing reservations
- January weather is 30-40°F - remind about layers if relevant
- If asked about something not in the itinerary, be helpful but brief`;
}

// Itinerary API endpoints
app.get('/api/itinerary', requireAuth, (req, res) => {
  try {
    const content = fs.readFileSync('./nyc_itinerary.md', 'utf-8');
    res.json({ content });
  } catch (err) {
    console.error('Error reading itinerary:', err);
    res.status(500).json({ error: 'Failed to read itinerary' });
  }
});

app.put('/api/itinerary', requireAuth, (req, res) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Content must be a string' });
    }
    fs.writeFileSync('./nyc_itinerary.md', content, 'utf-8');
    // Reload itinerary so Claude gets updated context
    itinerary = content;
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving itinerary:', err);
    res.status(500).json({ error: 'Failed to save itinerary' });
  }
});

app.post('/api/chat', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: getSystemPrompt(),
      messages: [{ role: 'user', content: message }]
    });

    res.json({ response: response.content[0].text });
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
