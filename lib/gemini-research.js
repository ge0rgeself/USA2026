/**
 * Gemini Research Service
 * Uses Gemini with Google Maps + Search grounding for sophisticated place research
 */

/**
 * Determines if a user message needs place/venue research
 * @param {string} message - User's chat message
 * @returns {boolean} Whether the message needs grounded research
 */
function needsPlaceResearch(message) {
  const lowerMessage = message.toLowerCase();

  // Keywords that indicate place-related queries
  const placeKeywords = [
    // Venues
    'restaurant', 'bar', 'cafe', 'coffee', 'pizza', 'food', 'eat', 'dining',
    'museum', 'gallery', 'theater', 'theatre', 'show', 'broadway',
    'hotel', 'stay', 'accommodation',
    'shop', 'store', 'shopping', 'buy',
    'park', 'attraction', 'landmark', 'see', 'visit', 'tour',
    // Actions
    'recommend', 'suggestion', 'best', 'top', 'good', 'great',
    'where', 'find', 'looking for', 'want to', 'should we', 'should i',
    'near', 'close to', 'around', 'in the area',
    'alternative', 'instead', 'other', 'another', 'backup', 'fallback',
    // Specifics
    'address', 'hours', 'open', 'closed', 'reservation', 'book',
    'price', 'cost', 'expensive', 'cheap', 'affordable',
    'review', 'rating', 'popular', 'famous', 'known for',
    // NYC specific
    'manhattan', 'brooklyn', 'queens', 'bronx', 'staten island',
    'times square', 'central park', 'soho', 'tribeca', 'chelsea',
    'east village', 'west village', 'lower east side', 'les', 'uws', 'ues',
    'dumbo', 'williamsburg', 'greenpoint', 'bushwick'
  ];

  return placeKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Performs grounded research using Gemini with Maps + Search grounding
 * @param {string} query - The research query
 * @param {Object} genAI - Google Generative AI client
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Research results with places and context
 */
async function researchPlaces(query, genAI, options = {}) {
  if (!genAI) {
    console.warn('Gemini API not available for research');
    return { success: false, error: 'Gemini API not available' };
  }

  try {
    // Use Gemini 2.5 Flash with both grounding tools
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [
        { googleSearch: {} },
        {
          googleMaps: options.location ? {
            latitude: options.location.lat,
            longitude: options.location.lng
          } : {}
        }
      ]
    });

    const systemContext = `You are a NYC travel research assistant. The user is planning a trip to NYC for January 14-18, 2025.

RESEARCH GUIDELINES:
- Focus on accurate, up-to-date information about NYC venues
- Prioritize places that are open in January (cold weather considerations)
- Include specific addresses, hours, and practical tips
- Note reservation requirements or walk-in policies
- Mention price ranges when relevant
- Consider proximity to other activities

RESPONSE FORMAT:
Return a JSON object with this structure:
{
  "places": [
    {
      "name": "Official venue name",
      "type": "restaurant|bar|museum|attraction|activity",
      "address": "Full street address, NYC",
      "neighborhood": "Neighborhood abbreviation (LES, SoHo, etc.)",
      "hours": "Operating hours (especially for January)",
      "price": "$|$$|$$$|$$$$",
      "description": "2-3 sentences about what makes it special",
      "tips": "Practical advice (reservations, what to order, best time to visit)",
      "website": "Official website URL",
      "mapsUrl": "Google Maps URL",
      "rating": "X.X/5 based on reviews",
      "bestFor": "What this place is best for"
    }
  ],
  "summary": "Brief summary answering the user's question",
  "considerations": "Any weather, timing, or practical considerations for January visit"
}

Return ONLY valid JSON, no markdown formatting.`;

    const prompt = `${systemContext}

USER QUERY: ${query}

${options.currentItinerary ? `CURRENT ITINERARY CONTEXT:\n${options.currentItinerary}\n` : ''}

Research this query and return detailed, grounded information about relevant NYC venues.`;

    const response = await model.generateContent(prompt);
    const content = response.response.text();

    // Extract grounding metadata if available
    const groundingMetadata = response.response.candidates?.[0]?.groundingMetadata;

    // Parse the JSON response
    let researchData;
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        researchData = JSON.parse(jsonMatch[0]);
      } else {
        researchData = JSON.parse(content);
      }
    } catch (parseError) {
      console.warn('Failed to parse research response as JSON:', parseError.message);
      // Return raw content as summary
      return {
        success: true,
        places: [],
        summary: content,
        considerations: '',
        groundingMetadata,
        rawResponse: true
      };
    }

    return {
      success: true,
      places: researchData.places || [],
      summary: researchData.summary || '',
      considerations: researchData.considerations || '',
      groundingMetadata,
      rawResponse: false
    };

  } catch (error) {
    console.error('Gemini research error:', error.message);
    return {
      success: false,
      error: error.message,
      places: [],
      summary: ''
    };
  }
}

/**
 * Formats research results for inclusion in chat context
 * @param {Object} research - Results from researchPlaces
 * @returns {string} Formatted context string for Claude
 */
function formatResearchForChat(research) {
  if (!research.success || research.rawResponse) {
    return research.summary || '';
  }

  let context = '';

  if (research.summary) {
    context += `RESEARCH SUMMARY: ${research.summary}\n\n`;
  }

  if (research.places && research.places.length > 0) {
    context += 'RESEARCHED PLACES:\n';
    research.places.forEach((place, i) => {
      context += `\n${i + 1}. ${place.name}`;
      if (place.neighborhood) context += ` (${place.neighborhood})`;
      context += '\n';
      if (place.address) context += `   Address: ${place.address}\n`;
      if (place.hours) context += `   Hours: ${place.hours}\n`;
      if (place.price) context += `   Price: ${place.price}\n`;
      if (place.rating) context += `   Rating: ${place.rating}\n`;
      if (place.description) context += `   About: ${place.description}\n`;
      if (place.tips) context += `   Tips: ${place.tips}\n`;
      if (place.mapsUrl) context += `   Maps: ${place.mapsUrl}\n`;
      if (place.website) context += `   Website: ${place.website}\n`;
    });
  }

  if (research.considerations) {
    context += `\nCONSIDERATIONS: ${research.considerations}\n`;
  }

  return context;
}

/**
 * Performs a quick venue lookup for a specific place name
 * @param {string} placeName - Name of the place to look up
 * @param {Object} genAI - Google Generative AI client
 * @returns {Promise<Object>} Place details
 */
async function lookupVenue(placeName, genAI) {
  if (!genAI) {
    return { success: false, error: 'Gemini API not available' };
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [{ googleMaps: {} }]
    });

    const prompt = `Look up this NYC venue and return accurate details as JSON:
"${placeName}"

Return:
{
  "name": "Official name",
  "address": "Full address",
  "neighborhood": "Neighborhood",
  "hours": "Operating hours",
  "phone": "Phone number",
  "website": "Website URL",
  "mapsUrl": "Google Maps URL",
  "description": "Brief description",
  "tips": "Practical tips"
}

Return ONLY valid JSON.`;

    const response = await model.generateContent(prompt);
    const content = response.response.text();

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return {
        success: true,
        place: JSON.parse(jsonMatch[0])
      };
    }

    return { success: false, error: 'Could not parse response' };
  } catch (error) {
    console.error('Venue lookup error:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  needsPlaceResearch,
  researchPlaces,
  formatResearchForChat,
  lookupVenue
};
