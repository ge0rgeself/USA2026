/**
 * Enriches parsed itinerary with real place data using Gemini with Maps grounding
 */

/**
 * Main enrichment function
 * Takes a parsed itinerary and enriches place names with actual details
 * @param {Object} parsed - Parsed itinerary from parser.js
 * @param {Object|null} genAI - Google Generative AI client (can be null if API key unavailable)
 * @returns {Promise<Object>} Enriched itinerary with place details
 */
async function enrichItinerary(parsed, genAI) {
  // Extract all potential places from the parsed itinerary
  const places = extractPlaces(parsed);

  if (places.length === 0) {
    // No places found, return parsed data as-is with display formatting
    return convertToDisplayFormat(parsed);
  }

  if (!genAI) {
    // Gemini API unavailable, return fallback format
    console.warn('Gemini API not available, using fallback enrichment');
    return convertToDisplayFormat(parsed);
  }

  try {
    // Batch enrich places using Gemini with Maps grounding
    const enrichedPlaces = await batchEnrichPlaces(places, genAI);

    // Merge enriched data back into parsed structure
    const enriched = mergeEnrichedData(parsed, enrichedPlaces);

    return enriched;
  } catch (error) {
    console.error('Enrichment error:', error.message);
    // Fallback to non-enriched format on error
    return convertToDisplayFormat(parsed);
  }
}

/**
 * Extracts all potential place names from the itinerary
 * @param {Object} parsed - Parsed itinerary
 * @returns {Array} Array of {description, context} objects
 */
function extractPlaces(parsed) {
  const places = [];
  const seen = new Set();

  // Add hotel if present
  if (parsed.hotel && looksLikePlace(parsed.hotel)) {
    const key = parsed.hotel.toLowerCase();
    if (!seen.has(key)) {
      places.push({ description: parsed.hotel, context: 'hotel' });
      seen.add(key);
    }
  }

  // Extract from daily items
  for (const day of parsed.days) {
    for (const item of day.items) {
      if (looksLikePlace(item.description)) {
        const key = item.description.toLowerCase();
        if (!seen.has(key)) {
          places.push({
            description: item.description,
            context: `${day.date} (${item.type})`
          });
          seen.add(key);
        }
      }
    }
  }

  // Extract from reservations
  for (const reservation of parsed.reservations) {
    if (looksLikePlace(reservation)) {
      const key = reservation.toLowerCase();
      if (!seen.has(key)) {
        places.push({ description: reservation, context: 'reservation' });
        seen.add(key);
      }
    }
  }

  return places;
}

/**
 * Determines if a description looks like a place name
 * Heuristic: contains proper nouns, place-related keywords, or addresses
 * @param {string} description - Text to analyze
 * @returns {boolean}
 */
function looksLikePlace(description) {
  if (!description || typeof description !== 'string') {
    return false;
  }

  const text = description.trim();

  // Too short or vague
  if (text.length < 3) {
    return false;
  }

  // Exclude common filler phrases (but keep walks/explorations for walking routes)
  const excluded = [
    'check-in', 'sleep', 'rest', 'break', 'arrive', 'depart',
    'pack', 'prepare', 'relax'
  ];
  if (excluded.some(phrase => text.toLowerCase().includes(phrase))) {
    return false;
  }

  // Include if contains place-related keywords or proper nouns
  const placeKeywords = [
    'restaurant', 'cafe', 'coffee', 'bar', 'lounge', 'club',
    'museum', 'gallery', 'theatre', 'park', 'bridge', 'tower',
    'hotel', 'hostel', 'inn', 'motel',
    'street', 'avenue', 'plaza', 'square', 'alley',
    'delicatessen', 'pizza', 'vanguard', 'memorial'
  ];

  const lowerText = text.toLowerCase();
  if (placeKeywords.some(keyword => lowerText.includes(keyword))) {
    return true;
  }

  // Include if starts with capital letter (likely proper noun) and not a time/date
  if (text[0] === text[0].toUpperCase() && text[0] !== text[0].toLowerCase()) {
    // Exclude dates and times
    if (!/^\d+/.test(text) && !/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/.test(text)) {
      return true;
    }
  }

  // Include addresses (contains numbers and street identifiers)
  if (/\d+\s+(.*?(st|nd|rd|th|street|avenue|ave|road|rd|lane|ln|drive|dr|plaza|square))/i.test(text)) {
    return true;
  }

  return false;
}

/**
 * Batches place names to Gemini for Maps enrichment
 * Uses Gemini with Google Maps grounding to look up real place details
 * @param {Array} places - Array of {description, context} objects
 * @param {Object} genAI - Google Generative AI client
 * @returns {Promise<Object>} Map of place name -> enriched data
 */
async function batchEnrichPlaces(places, genAI) {
  if (places.length === 0) {
    return {};
  }

  const enrichedMap = {};

  // Process places with Gemini using Maps grounding
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      tools: [
        {
          googleSearch: {}
        }
      ]
    });

    // Prepare the prompt for Gemini
    const placeListing = places
      .map((p, i) => `${i + 1}. "${p.description}" (context: ${p.context})`)
      .join('\n');

    const prompt = `You are a NYC travel expert. For each place below, determine if it's a VENUE (restaurant, museum, bar, etc.) or a WALKING ROUTE (multi-stop walk, exploration).

Return JSON array with these fields:

FOR VENUES:
- name: official place name
- hook: punchy 5-7 word teaser (e.g., "1888 - The pastrami")
- description: 2-3 sentences of interesting context/history
- tips: practical advice (what to order, reservations, etc.)
- hours: operating hours if known (e.g., "8am-10:45pm daily")
- price: price range ("$", "$$", "$$$", or "$$$$")
- address: street address in NYC
- neighborhood: abbreviated neighborhood (LES, EV, WV, SoHo, etc.)
- mapsUrl: Google Maps URL
- website: official website URL or empty string
- isWalkingRoute: false

FOR WALKING ROUTES (multi-stop explorations like "Brooklyn Bridge walk -> DUMBO"):
- name: descriptive route name
- hook: distance + brief teaser (e.g., "1.2 mi - NYC's iconic stroll")
- description: narrative of what you'll see in order
- waypoints: array of strings, each "Stop name - brief description"
- tips: practical advice (best time, what to bring)
- distance: estimated distance (e.g., "1.2 miles")
- duration: estimated time (e.g., "45-60 min with stops")
- routeUrl: Google Maps directions URL with waypoints
- isWalkingRoute: true

Places to look up:
${placeListing}

Return ONLY valid JSON array, no markdown.`;

    const response = await model.generateContent(prompt);
    const content = response.response.text();

    // Parse the JSON response
    let parsedData = [];
    try {
      // Extract JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        parsedData = JSON.parse(content);
      }
    } catch (parseError) {
      console.warn('Failed to parse Gemini response as JSON:', parseError.message);
      // Return empty enrichment on parse error
      return {};
    }

    // Map results back to place descriptions
    if (Array.isArray(parsedData)) {
      for (let i = 0; i < Math.min(parsedData.length, places.length); i++) {
        const original = places[i];
        const enriched = parsedData[i] || {};
        enrichedMap[original.description] = {
          name: enriched.name || original.description,
          hook: enriched.hook || '',
          description: enriched.description || '',
          tips: enriched.tips || '',
          hours: enriched.hours || '',
          price: enriched.price || '',
          address: enriched.address || '',
          neighborhood: enriched.neighborhood || '',
          mapsUrl: enriched.mapsUrl || `https://maps.google.com/?q=${encodeURIComponent(original.description + ' NYC')}`,
          website: enriched.website || '',
          isWalkingRoute: enriched.isWalkingRoute || false,
          waypoints: enriched.waypoints || [],
          distance: enriched.distance || '',
          duration: enriched.duration || '',
          routeUrl: enriched.routeUrl || ''
        };
      }
    }
  } catch (error) {
    console.warn('Gemini enrichment failed:', error.message);
    // Return empty enrichment on API error
    return {};
  }

  return enrichedMap;
}

/**
 * Merges enriched place data back into the parsed itinerary
 * @param {Object} parsed - Original parsed itinerary
 * @param {Object} enrichedPlaces - Map of place name -> enriched data
 * @returns {Object} Merged itinerary with enrichment
 */
function mergeEnrichedData(parsed, enrichedPlaces) {
  const merged = JSON.parse(JSON.stringify(parsed)); // Deep copy

  // Enrich hotel
  if (merged.hotel && enrichedPlaces[merged.hotel]) {
    merged.hotel = {
      name: merged.hotel,
      ...enrichedPlaces[merged.hotel]
    };
  }

  // Enrich daily items
  for (const day of merged.days) {
    for (const item of day.items) {
      if (enrichedPlaces[item.description]) {
        item.place = enrichedPlaces[item.description];
      }
    }
  }

  // Enrich reservations
  for (let i = 0; i < merged.reservations.length; i++) {
    const reservation = merged.reservations[i];
    if (enrichedPlaces[reservation]) {
      merged.reservations[i] = {
        name: reservation,
        ...enrichedPlaces[reservation]
      };
    }
  }

  return merged;
}

/**
 * Formats time strings for display
 * @param {string} time - Raw time string (e.g., '11am', '1:30-4pm', 'dinner')
 * @returns {string} Formatted time for display
 */
function formatTimeDisplay(time) {
  if (!time) {
    return '';
  }

  const lowerTime = time.toLowerCase().trim();

  // Convert shorthand to display format
  const timeMap = {
    'breakfast': '8:00 AM',
    'brunch': '10:00 AM',
    'lunch': '12:00 PM',
    'dinner': '7:00 PM',
    'evening': '5:00 PM',
    'afternoon': '2:00 PM',
    'morning': '9:00 AM',
    'night': '10:00 PM',
    'late': '11:00 PM'
  };

  if (timeMap[lowerTime]) {
    return timeMap[lowerTime];
  }

  // Convert am/pm format to standard 12-hour
  if (/^\d{1,2}(am|pm)$/.test(lowerTime)) {
    const match = lowerTime.match(/^(\d{1,2})(am|pm)$/);
    if (match) {
      const hour = match[1];
      const period = match[2].toUpperCase();
      return `${hour}:00 ${period}`;
    }
  }

  // Keep range format as-is (e.g., "1:30-4pm")
  return time;
}

/**
 * Converts parsed itinerary to display format (fallback when Gemini unavailable)
 * Adds formatted times and basic structure but no place enrichment
 * @param {Object} parsed - Parsed itinerary
 * @returns {Object} Display-formatted itinerary
 */
function convertToDisplayFormat(parsed) {
  const display = {
    hotel: parsed.hotel,
    reservations: parsed.reservations.map(r => ({ name: r })),
    days: [],
    notes: parsed.notes.map(n => ({ text: n }))
  };

  for (const day of parsed.days) {
    const displayDay = {
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      title: day.title,
      items: day.items.map(item => ({
        time: formatTimeDisplay(item.time),
        description: item.description,
        type: item.type,
        fallback: item.fallback,
        optional: item.optional,
        place: item.place || null
      }))
    };
    display.days.push(displayDay);
  }

  return display;
}

module.exports = {
  enrichItinerary,
  looksLikePlace,
  batchEnrichPlaces,
  mergeEnrichedData,
  formatTimeDisplay,
  convertToDisplayFormat
};
