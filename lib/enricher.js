/**
 * Enriches parsed itinerary with real place data using Gemini with Maps grounding
 * RULE: Every item MUST have enriched content. No blanks, no exceptions.
 */

/**
 * Creates a default place object for items that couldn't be enriched
 * @param {string} description - Original item description
 * @returns {Object} Place object with needsDetails flag
 */
function createNeedsDetailsPlace(description) {
  return {
    name: description,
    hook: 'Add details...',
    needsDetails: true,
    description: '',
    tips: '',
    hours: '',
    price: '',
    address: '',
    neighborhood: '',
    mapsUrl: '',
    website: '',
    isWalkingRoute: false,
    waypoints: [],
    distance: '',
    duration: '',
    routeUrl: ''
  };
}

/**
 * Main enrichment function
 * Takes a parsed itinerary and enriches ALL items with details
 * @param {Object} parsed - Parsed itinerary from parser.js
 * @param {Object|null} genAI - Google Generative AI client (can be null if API key unavailable)
 * @returns {Promise<Object>} Enriched itinerary with place details
 */
async function enrichItinerary(parsed, genAI) {
  // Extract ALL items from the parsed itinerary (no filtering)
  const items = extractAllItems(parsed);

  if (items.length === 0) {
    return convertToDisplayFormat(parsed);
  }

  if (!genAI) {
    console.warn('Gemini API not available, using fallback enrichment');
    return convertToDisplayFormat(parsed);
  }

  try {
    // Batch enrich ALL items using Gemini
    const enrichedItems = await batchEnrichItems(items, genAI);

    // Merge enriched data back, guaranteeing every item has a place
    const enriched = mergeEnrichedData(parsed, enrichedItems);

    return enriched;
  } catch (error) {
    console.error('Enrichment error:', error.message);
    return convertToDisplayFormat(parsed);
  }
}

/**
 * Extracts ALL items from the itinerary - no filtering
 * Every item gets sent for enrichment
 * @param {Object} parsed - Parsed itinerary
 * @returns {Array} Array of {description, context, dayIndex, itemIndex} objects
 */
function extractAllItems(parsed) {
  const items = [];

  // Add hotel if present
  if (parsed.hotel) {
    items.push({
      description: parsed.hotel,
      context: 'hotel',
      isHotel: true
    });
  }

  // Extract ALL daily items
  for (let dayIndex = 0; dayIndex < parsed.days.length; dayIndex++) {
    const day = parsed.days[dayIndex];
    for (let itemIndex = 0; itemIndex < day.items.length; itemIndex++) {
      const item = day.items[itemIndex];
      items.push({
        description: item.description,
        context: `${day.date} ${day.title} (${item.type})`,
        dayIndex,
        itemIndex
      });
    }
  }

  // Extract reservations
  for (let i = 0; i < parsed.reservations.length; i++) {
    items.push({
      description: parsed.reservations[i],
      context: 'reservation',
      reservationIndex: i
    });
  }

  return items;
}

/**
 * Batches ALL items to Gemini for enrichment
 * @param {Array} items - Array of item objects
 * @param {Object} genAI - Google Generative AI client
 * @returns {Promise<Object>} Map of description -> enriched data
 */
async function batchEnrichItems(items, genAI) {
  if (items.length === 0) {
    return {};
  }

  const enrichedMap = {};

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      tools: [{ googleSearch: {} }]
    });

    const itemListing = items
      .map((p, i) => `${i + 1}. "${p.description}" (context: ${p.context})`)
      .join('\n');

    const prompt = `You are a NYC travel expert. For EACH item below, provide enrichment data.

IMPORTANT: Every item MUST get a response. If you cannot identify a specific place or activity, still return data with needsDetails: true.

Return a JSON array with one object per item:

FOR IDENTIFIABLE VENUES (restaurants, museums, bars, etc.):
{
  "name": "Official place name",
  "hook": "Punchy 5-7 word teaser (e.g., '1888 - The pastrami')",
  "needsDetails": false,
  "description": "2-3 sentences of interesting context/history",
  "tips": "Practical advice (what to order, reservations, etc.)",
  "hours": "Operating hours (e.g., '8am-10:45pm daily')",
  "price": "Price range ($, $$, $$$, or $$$$)",
  "address": "Street address in NYC",
  "neighborhood": "Abbreviated (LES, EV, WV, SoHo, etc.)",
  "mapsUrl": "Google Maps URL",
  "website": "Official website URL or empty string",
  "isWalkingRoute": false
}

FOR WALKING ROUTES (multi-stop explorations like "Brooklyn Bridge walk → DUMBO"):
{
  "name": "Descriptive route name",
  "hook": "Distance + brief teaser (e.g., '1.2 mi - NYC's iconic stroll')",
  "needsDetails": false,
  "description": "Narrative of what you'll see in order",
  "waypoints": ["Stop name - brief description", ...],
  "tips": "Practical advice (best time, what to bring)",
  "distance": "Estimated distance (e.g., '1.2 miles')",
  "duration": "Estimated time (e.g., '45-60 min with stops')",
  "routeUrl": "Google Maps directions URL with waypoints",
  "isWalkingRoute": true
}

FOR UNIDENTIFIABLE ITEMS (vague activities like "Sleep in" or "Check-in"):
{
  "name": "The original text",
  "hook": "A brief contextual note (e.g., 'Rest up for the day ahead')",
  "needsDetails": true,
  "description": "",
  "tips": "",
  "hours": "",
  "price": "",
  "address": "",
  "neighborhood": "",
  "mapsUrl": "",
  "website": "",
  "isWalkingRoute": false
}

Items to enrich:
${itemListing}

Return ONLY valid JSON array with exactly ${items.length} objects, no markdown.`;

    const response = await model.generateContent(prompt);
    const content = response.response.text();

    let parsedData = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        parsedData = JSON.parse(content);
      }
    } catch (parseError) {
      console.warn('Failed to parse Gemini response as JSON:', parseError.message);
      return {};
    }

    // Map results back to descriptions
    if (Array.isArray(parsedData)) {
      for (let i = 0; i < items.length; i++) {
        const original = items[i];
        const enriched = parsedData[i] || {};

        enrichedMap[original.description] = {
          name: enriched.name || original.description,
          hook: enriched.hook || 'Add details...',
          needsDetails: enriched.needsDetails !== false, // Default to true if not explicitly false
          description: enriched.description || '',
          tips: enriched.tips || '',
          hours: enriched.hours || '',
          price: enriched.price || '',
          address: enriched.address || '',
          neighborhood: enriched.neighborhood || '',
          mapsUrl: enriched.mapsUrl || '',
          website: enriched.website || '',
          isWalkingRoute: enriched.isWalkingRoute || false,
          waypoints: enriched.waypoints || [],
          distance: enriched.distance || '',
          duration: enriched.duration || '',
          routeUrl: enriched.routeUrl || ''
        };

        // If we got real data, mark as not needing details
        if (enriched.address || enriched.description || enriched.waypoints?.length) {
          enrichedMap[original.description].needsDetails = false;
        }
      }
    }
  } catch (error) {
    console.warn('Gemini enrichment failed:', error.message);
    return {};
  }

  return enrichedMap;
}

/**
 * Merges enriched data back into parsed itinerary
 * GUARANTEES every item has a place object
 * @param {Object} parsed - Original parsed itinerary
 * @param {Object} enrichedItems - Map of description -> enriched data
 * @returns {Object} Merged itinerary with enrichment
 */
function mergeEnrichedData(parsed, enrichedItems) {
  const merged = JSON.parse(JSON.stringify(parsed));

  // Enrich hotel (always has place)
  if (merged.hotel) {
    const hotelData = enrichedItems[merged.hotel];
    merged.hotel = {
      name: merged.hotel,
      ...(hotelData || createNeedsDetailsPlace(merged.hotel))
    };
  }

  // Enrich daily items (every item MUST have place)
  for (const day of merged.days) {
    for (const item of day.items) {
      const enriched = enrichedItems[item.description];
      item.place = enriched || createNeedsDetailsPlace(item.description);
    }
  }

  // Enrich reservations
  for (let i = 0; i < merged.reservations.length; i++) {
    const reservation = merged.reservations[i];
    const enriched = enrichedItems[reservation];
    merged.reservations[i] = {
      name: reservation,
      ...(enriched || createNeedsDetailsPlace(reservation))
    };
  }

  return merged;
}

/**
 * Formats time strings for display
 * @param {string} time - Raw time string
 * @returns {string} Formatted time for display
 */
function formatTimeDisplay(time) {
  if (!time) return '';

  const lowerTime = time.toLowerCase().trim();

  const timeMap = {
    'breakfast': '8 AM',
    'brunch': '10 AM',
    'lunch': '12 PM',
    'dinner': '7 PM',
    'evening': '6 PM',
    'afternoon': '2 PM',
    'morning': '9 AM',
    'night': '10 PM',
    'late': '11 PM'
  };

  if (timeMap[lowerTime]) return timeMap[lowerTime];

  // Convert am/pm format
  if (/^\d{1,2}(:\d{2})?(am|pm)$/i.test(lowerTime)) {
    const match = lowerTime.match(/^(\d{1,2})(:\d{2})?(am|pm)$/i);
    if (match) {
      const hour = match[1];
      const minutes = match[2] || '';
      const period = match[3].toUpperCase();
      return minutes ? `${hour}${minutes} ${period}` : `${hour} ${period}`;
    }
  }

  return time;
}

/**
 * Converts parsed itinerary to display format (fallback when Gemini unavailable)
 * Every item gets a needsDetails place object
 * @param {Object} parsed - Parsed itinerary
 * @returns {Object} Display-formatted itinerary
 */
function convertToDisplayFormat(parsed) {
  const display = {
    hotel: parsed.hotel ? {
      name: parsed.hotel,
      ...createNeedsDetailsPlace(parsed.hotel)
    } : null,
    reservations: parsed.reservations.map(r => ({
      name: r,
      ...createNeedsDetailsPlace(r)
    })),
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
        place: createNeedsDetailsPlace(item.description)
      }))
    };
    display.days.push(displayDay);
  }

  return display;
}

// Legacy export for backwards compatibility
function looksLikePlace(description) {
  return description && typeof description === 'string' && description.trim().length >= 3;
}

module.exports = {
  enrichItinerary,
  looksLikePlace,
  batchEnrichItems,
  mergeEnrichedData,
  formatTimeDisplay,
  convertToDisplayFormat,
  createNeedsDetailsPlace
};
