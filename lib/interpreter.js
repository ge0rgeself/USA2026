// lib/interpreter.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

const TRIP_DATES = [
  { date: 'Jan 14', dayOfWeek: 'Wed', dayNum: 1 },
  { date: 'Jan 15', dayOfWeek: 'Thu', dayNum: 2 },
  { date: 'Jan 16', dayOfWeek: 'Fri', dayNum: 3 },
  { date: 'Jan 17', dayOfWeek: 'Sat', dayNum: 4 },
  { date: 'Jan 18', dayOfWeek: 'Sun', dayNum: 5 },
];

const SYSTEM_PROMPT = `You are an event parser for a NYC trip planner (Jan 14-18, 2026).

Convert free-form text into structured event data. Extract:
- day: Which day of the trip (Jan 14, Jan 15, Jan 16, Jan 17, or Jan 18)
- time: null, specific time (7:30pm), range (4-6pm), or vague (morning/afternoon/evening/late night)
- description: Place name and neighborhood if mentioned
- status: "primary" (default), "backup" (if they say backup/fallback/plan B), or "optional" (if they say optional/maybe/if time)

RULES:
- "tomorrow" means the day after the reference date provided
- "Wednesday/Thu/Friday/Saturday/Sunday" maps to Jan 14/15/16/17/18
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
Trip dates: Jan 14 (Wed), Jan 15 (Thu), Jan 16 (Fri), Jan 17 (Sat), Jan 18 (Sun)

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
