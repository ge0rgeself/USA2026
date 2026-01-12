/**
 * Unified place enrichment service
 * Used by: background enricher, Oscar agent
 */

const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  model: 'gemini-2.5-flash',
  hotelLocation: { lat: 40.7223, lng: -73.9930 }, // Freeman Alley, LES
  maxBatchSize: 10,
  maxRetries: 3
};

/**
 * Load traveler preferences
 */
function loadPreferences() {
  const prefsPath = path.join(__dirname, '..', 'preferences.md');
  try {
    return fs.readFileSync(prefsPath, 'utf-8');
  } catch (err) {
    return '';
  }
}

/**
 * Build the enrichment prompt
 */
function buildEnrichmentPrompt(items) {
  const preferences = loadPreferences();

  const itemList = items
    .map((item, i) => `${i + 1}. "${item.description}" (${item.context || 'activity'})`)
    .join('\n');

  return `You are enriching places for a NYC trip (Jan 14-18, 2025).

TRAVELER PREFERENCES:
${preferences}

HOTEL LOCATION: Untitled at Freeman Alley, Lower East Side (use for walkingMins calculation)

For each item below, return a JSON array with enrichment objects.

ENRICHMENT SCHEMA:
{
  "name": "Official place name",
  "hook": "Punchy 5-8 words - memorable, Bourdain energy, not generic",
  "tip": "Insider practical advice (what to order, when to go, what to avoid)",
  "vibe": "Quick atmosphere read, 10 words max",
  "hours": "Operating hours with helpful context (e.g., 'Opens 8am - beat the line')",
  "price": "Contextual price info (e.g., '$25-30/person, worth it')",
  "address": "Full street address, New York, NY ZIP",
  "neighborhood": "Short code: LES, EV, WV, SoHo, NoHo, Chinatown, FiDi, etc.",
  "mapsUrl": "Google Maps URL for the place",
  "website": "Official website URL or null if none",
  "walkingMins": estimated minutes walking from Freeman Alley LES (number or null)
}

FOR WALKING ROUTES (multi-stop explorations), add:
{
  "isWalkingRoute": true,
  "waypoints": ["Stop 1 - brief description", "Stop 2 - brief description", ...],
  "distance": "1.2 miles",
  "duration": "45-60 min with stops",
  "routeUrl": "Google Maps directions URL with waypoints"
}

FOR NON-PLACES (like "Sleep in" or "Check-in"), return:
{
  "name": "original text",
  "hook": "Brief contextual note",
  "tip": null, "vibe": null, "hours": null, "price": null,
  "address": null, "neighborhood": null, "mapsUrl": null,
  "website": null, "walkingMins": null
}

ITEMS TO ENRICH:
${itemList}

Return ONLY a valid JSON array with exactly ${items.length} objects. No markdown, no explanation.`;
}

/**
 * Enrich a batch of items using Gemini with Maps grounding
 */
async function enrichBatch(genAI, items) {
  if (!items || items.length === 0) return [];

  const prompt = buildEnrichmentPrompt(items);

  const response = await genAI.models.generateContent({
    model: CONFIG.model,
    contents: prompt,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: CONFIG.hotelLocation
        }
      }
    }
  });

  // Parse JSON response
  const text = response.text;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('No JSON array in response');
  }

  return JSON.parse(jsonMatch[0]);
}

/**
 * Enrich with retry logic
 */
async function enrichBatchWithRetry(genAI, items, maxRetries = CONFIG.maxRetries) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await enrichBatch(genAI, items);
    } catch (err) {
      lastError = err;
      console.warn(`Enrichment attempt ${attempt} failed:`, err.message);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }

  throw lastError;
}

/**
 * Search for places (Oscar's tool)
 */
async function searchPlaces(genAI, query, neighborhood) {
  const preferences = loadPreferences();

  const prompt = `Find ${query}${neighborhood ? ` in/near ${neighborhood}` : ''} in New York City.

TRAVELER PREFERENCES:
${preferences}

Return top 3-5 options that match these preferences. For each include:
- Name and address
- Why it fits their style (Bourdain energy, no pretense)
- Hours, price range, what to order/do
- Google Maps link

Focus on places open in January 2025.`;

  const response = await genAI.models.generateContent({
    model: CONFIG.model,
    contents: prompt,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: CONFIG.hotelLocation
        }
      }
    }
  });

  return {
    success: true,
    query,
    neighborhood,
    results: response.text,
    grounded: true
  };
}

module.exports = {
  enrichBatch: enrichBatchWithRetry,
  searchPlaces,
  loadPreferences,
  CONFIG
};
