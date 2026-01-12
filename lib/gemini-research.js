/**
 * Gemini Research Service
 * Uses Gemini with Google Search grounding for real-time place research
 *
 * Note: googleMaps is NOT a valid Gemini grounding tool. Only googleSearch exists.
 * For accurate place data, we use Google Search grounding which can find
 * current business info, hours, reviews, etc.
 */

/**
 * Determines if a user message likely needs real-time place research
 * More selective to avoid unnecessary API calls
 * @param {string} message - User's chat message
 * @returns {boolean} Whether the message needs grounded research
 */
function needsPlaceResearch(message) {
  const lowerMessage = message.toLowerCase();

  // Skip very short messages
  if (message.length < 10) return false;

  // Skip common greetings and simple messages
  const skipPatterns = [
    /^(hi|hey|hello|thanks|thank you|ok|okay|yes|no|sure|got it)/i,
    /^(what time|when do we|what's the plan)/i,  // These are itinerary questions, not research
  ];
  if (skipPatterns.some(p => p.test(message.trim()))) return false;

  // Strong indicators - definitely need research
  const strongIndicators = [
    /recommend\w*\s+(a |some |any )?(restaurant|bar|cafe|place|spot)/i,
    /looking for\s+(a |some |any )?(restaurant|bar|cafe|place|spot)/i,
    /find\s+(me |us )?(a |some |any )?(restaurant|bar|cafe|place|spot)/i,
    /suggest\s+(a |some |any )?(restaurant|bar|cafe|place|spot)/i,
    /alternative\s+(to|for|restaurant|bar|place)/i,
    /backup\s+(option|plan|restaurant|place)/i,
    /what('s| is) the address/i,
    /where is .+ located/i,
    /is .+ open/i,
    /hours for/i,
    /reservation at/i,
    /reviews (for|of|about)/i,
    /how (much|expensive) is/i,
  ];
  if (strongIndicators.some(p => p.test(message))) return true;

  // Medium indicators - need at least 2 to trigger
  const mediumIndicators = [
    'restaurant', 'bar', 'cafe', 'coffee shop', 'pizza', 'dining',
    'museum', 'gallery', 'theater', 'theatre', 'broadway', 'show',
    'recommend', 'suggestion', 'alternative', 'instead',
    'address', 'hours', 'open', 'closed', 'reservation',
    'price', 'expensive', 'cheap', 'affordable',
    'review', 'rating', 'popular',
  ];
  const mediumMatches = mediumIndicators.filter(k => lowerMessage.includes(k));
  if (mediumMatches.length >= 2) return true;

  // Question about specific NYC neighborhoods + venue type
  const neighborhoods = [
    'manhattan', 'brooklyn', 'queens', 'soho', 'tribeca', 'chelsea',
    'east village', 'west village', 'lower east side', 'les', 'dumbo',
    'williamsburg', 'greenpoint', 'bushwick', 'harlem', 'midtown',
    'times square', 'central park', 'ues', 'uws', 'flatiron', 'nolita'
  ];
  const venueTypes = ['restaurant', 'bar', 'cafe', 'food', 'eat', 'drink', 'shop', 'see', 'visit'];
  const hasNeighborhood = neighborhoods.some(n => lowerMessage.includes(n));
  const hasVenueType = venueTypes.some(v => lowerMessage.includes(v));
  if (hasNeighborhood && hasVenueType) return true;

  return false;
}

/**
 * Performs grounded research using Gemini with Google Search
 * @param {string} query - The research query
 * @param {Object} genAI - Google Generative AI client
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Research results with places and grounding info
 */
async function researchPlaces(query, genAI, options = {}) {
  if (!genAI) {
    console.warn('Gemini API not available for research');
    return { success: false, grounded: false, error: 'Gemini API not available' };
  }

  try {
    // Use Gemini with Google Search grounding (the only valid grounding tool)
    // Note: googleMaps is NOT a real Gemini tool - only googleSearch exists
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      tools: [{ googleSearch: {} }],
      generationConfig: {
        temperature: 1.0,  // Recommended for grounding
      }
    });

    const prompt = `You are a NYC travel research assistant helping plan a trip for January 2025.

TASK: Research this query and provide accurate, current information about NYC venues.
"${query}"

${options.currentItinerary ? `CONTEXT - Current itinerary:\n${options.currentItinerary}\n` : ''}

RESEARCH GUIDELINES:
- Search for current, accurate information about NYC venues
- Prioritize places that are open in January (consider winter hours)
- Include specific addresses and current operating hours
- Note if reservations are needed
- Include price ranges when available
- Mention ratings/reviews if found

RESPONSE FORMAT - Return valid JSON:
{
  "places": [
    {
      "name": "Official venue name from search results",
      "type": "restaurant|bar|museum|attraction|cafe|shop",
      "address": "Full street address from search",
      "neighborhood": "NYC neighborhood",
      "hours": "Current operating hours if found",
      "price": "$|$$|$$$|$$$$",
      "description": "2-3 sentences about what makes it special",
      "tips": "Practical advice based on reviews",
      "website": "Official website if found",
      "rating": "Rating if found (e.g., 4.5/5)",
      "source": "Where this info came from"
    }
  ],
  "summary": "Direct answer to the user's question",
  "searchQueries": ["What searches were performed"]
}

Return ONLY valid JSON. Include only places you found real information about.`;

    console.log('Calling Gemini with Google Search grounding...');
    const result = await model.generateContent(prompt);
    const response = result.response;
    const content = response.text();

    // Extract grounding metadata to verify search was actually used
    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;

    // Check if grounding actually happened
    const wasGrounded = !!(
      groundingMetadata?.groundingChunks?.length > 0 ||
      groundingMetadata?.webSearchQueries?.length > 0 ||
      groundingMetadata?.searchEntryPoint
    );

    if (wasGrounded) {
      console.log('Grounding verified - search queries:', groundingMetadata?.webSearchQueries);
    } else {
      console.log('Warning: Response may not be grounded (no grounding metadata found)');
    }

    // Parse the JSON response
    let researchData;
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1] || jsonMatch[0];
      }
      researchData = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.warn('Failed to parse research response as JSON:', parseError.message);
      console.warn('Raw response:', content.substring(0, 500));

      // Return raw content but mark as unstructured
      return {
        success: true,
        grounded: wasGrounded,
        places: [],
        summary: content,
        rawResponse: true,
        groundingMetadata: wasGrounded ? {
          queries: groundingMetadata?.webSearchQueries || [],
          sources: groundingMetadata?.groundingChunks?.map(c => c.web?.uri).filter(Boolean) || []
        } : null
      };
    }

    return {
      success: true,
      grounded: wasGrounded,
      places: researchData.places || [],
      summary: researchData.summary || '',
      searchQueries: researchData.searchQueries || groundingMetadata?.webSearchQueries || [],
      groundingMetadata: wasGrounded ? {
        queries: groundingMetadata?.webSearchQueries || [],
        sources: groundingMetadata?.groundingChunks?.map(c => c.web?.uri).filter(Boolean) || [],
        searchEntryPoint: groundingMetadata?.searchEntryPoint
      } : null,
      rawResponse: false
    };

  } catch (error) {
    console.error('Gemini research error:', error.message);

    // Log more details for debugging
    if (error.message?.includes('API key')) {
      console.error('Check GOOGLE_GEMINI_API_KEY environment variable');
    }

    return {
      success: false,
      grounded: false,
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
  if (!research.success) {
    return '';
  }

  // If raw/unstructured response, return as-is
  if (research.rawResponse) {
    return research.summary || '';
  }

  let context = '';

  // Add grounding verification
  if (research.grounded) {
    context += 'VERIFICATION: This information was retrieved via Google Search grounding.\n';
    if (research.searchQueries?.length > 0) {
      context += `Search queries used: ${research.searchQueries.join(', ')}\n`;
    }
    context += '\n';
  }

  if (research.summary) {
    context += `SUMMARY: ${research.summary}\n\n`;
  }

  if (research.places && research.places.length > 0) {
    context += 'RESEARCHED PLACES:\n';
    research.places.forEach((place, i) => {
      context += `\n${i + 1}. ${place.name}`;
      if (place.neighborhood) context += ` (${place.neighborhood})`;
      if (place.type) context += ` [${place.type}]`;
      context += '\n';
      if (place.address) context += `   Address: ${place.address}\n`;
      if (place.hours) context += `   Hours: ${place.hours}\n`;
      if (place.price) context += `   Price: ${place.price}\n`;
      if (place.rating) context += `   Rating: ${place.rating}\n`;
      if (place.description) context += `   About: ${place.description}\n`;
      if (place.tips) context += `   Tips: ${place.tips}\n`;
      if (place.website) context += `   Website: ${place.website}\n`;
      if (place.source) context += `   Source: ${place.source}\n`;
    });
  }

  // Add source URLs if available
  if (research.groundingMetadata?.sources?.length > 0) {
    context += '\nSOURCES:\n';
    research.groundingMetadata.sources.slice(0, 5).forEach(url => {
      context += `- ${url}\n`;
    });
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
    return { success: false, grounded: false, error: 'Gemini API not available' };
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 1.0 }
    });

    const prompt = `Search for accurate, current information about this NYC venue:
"${placeName}"

Return ONLY valid JSON with this structure:
{
  "name": "Official name from search",
  "address": "Full street address",
  "neighborhood": "NYC neighborhood",
  "hours": "Current operating hours",
  "phone": "Phone number if found",
  "website": "Official website",
  "description": "Brief description",
  "tips": "Practical tips from reviews",
  "rating": "Rating if found"
}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const content = response.text();

    // Check grounding
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const wasGrounded = !!(groundingMetadata?.groundingChunks?.length > 0);

    // Parse JSON
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1] || jsonMatch[0];
    }

    return {
      success: true,
      grounded: wasGrounded,
      place: JSON.parse(jsonStr.trim())
    };
  } catch (error) {
    console.error('Venue lookup error:', error.message);
    return { success: false, grounded: false, error: error.message };
  }
}

module.exports = {
  needsPlaceResearch,
  researchPlaces,
  formatResearchForChat,
  lookupVenue
};
