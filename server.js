require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY environment variable is not set.');
  console.error('Create a .env file with: ANTHROPIC_API_KEY=your-api-key');
  process.exit(1);
}

const client = new Anthropic();
const itinerary = fs.readFileSync('./nyc_itinerary.md', 'utf-8');

const SYSTEM_PROMPT = `You are a concise NYC trip assistant for Jan 14-18, 2025. Your answers must be SHORT (1-3 sentences max).

Here is the full itinerary:
${itinerary}

Rules:
- Keep answers to 1-3 sentences MAX. Be direct.
- Always include clickable Google Maps links when mentioning locations: https://maps.google.com/?q=ADDRESS+encoded
- For walking directions: https://maps.google.com/maps/dir/?api=1&destination=ADDRESS&travelmode=walking
- Link to Resy/booking sites when discussing reservations
- January weather is 30-40°F - remind about layers if relevant
- If asked about something not in the itinerary, be helpful but brief`;

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
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
