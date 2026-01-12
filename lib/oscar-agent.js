/**
 * Oscar Agent - Gemini-powered agentic trip assistant
 *
 * Uses Gemini 2.5 Flash for reasoning/chat with function calling
 * Uses Gemini 2.5 Flash for Maps grounding (searchPlaces tool)
 */

const { GoogleGenAI, Type } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const placeService = require('./place-service');

// Tool definitions
const tools = [
  {
    name: 'searchPlaces',
    description: 'Search for restaurants, bars, museums, attractions, coffee shops, or any place in NYC. Uses Google Maps for accurate, current data including addresses, hours, ratings, and reviews.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'What to search for (e.g., "Italian restaurant", "jazz bar", "coffee shop", "speakeasy")'
        },
        neighborhood: {
          type: Type.STRING,
          description: 'NYC area to search (e.g., "NoMad", "West Village", "near Arlo NoMad hotel", "Brooklyn", "Lower East Side")'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'updateItinerary',
    description: 'Add, modify, or remove items from the trip itinerary. Use this when the user wants to change their plans.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: 'Type of change: "add", "update", or "remove"'
        },
        day: {
          type: Type.STRING,
          description: 'Which day to modify: "Jan 14", "Jan 15", "Jan 16", "Jan 17", or "Jan 18"'
        },
        time: {
          type: Type.STRING,
          description: 'Time slot (e.g., "7pm", "1-3pm", "morning", "afternoon", "evening")'
        },
        description: {
          type: Type.STRING,
          description: 'Activity description (e.g., "Olmsted, Prospect Heights")'
        },
        replaceItem: {
          type: Type.STRING,
          description: 'For update/remove: description of existing item to replace or remove'
        }
      },
      required: ['action', 'day']
    }
  },
  {
    name: 'getPreferences',
    description: 'Get traveler preferences, dietary restrictions, budget, and context. Call this when making recommendations or planning activities to ensure suggestions match what the travelers want.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  },
  {
    name: 'getItinerary',
    description: 'Get the current trip itinerary. Can get the full trip or filter to a specific day to see what is already planned.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        day: {
          type: Type.STRING,
          description: 'Optional: specific day like "Jan 15" or "Wednesday". Omit for full itinerary.'
        }
      },
      required: []
    }
  }
];

// Convert tools to functionDeclarations format
const functionDeclarations = tools.map(tool => ({
  name: tool.name,
  description: tool.description,
  parameters: tool.parameters
}));

/**
 * Creates the Oscar agent
 */
function createOscarAgent(dependencies) {
  const { genAI, itineraryManager } = dependencies;

  if (!genAI) {
    throw new Error('Google GenAI client required');
  }

  // Models - using 2.5-flash for both (stable, supports function calling + maps grounding)
  const chatModel = 'gemini-2.5-flash';
  const mapsModel = 'gemini-2.5-flash';

  /**
   * Load preferences from preferences.md
   */
  function loadPreferences() {
    try {
      const prefsPath = path.join(__dirname, '..', 'preferences.md');
      return fs.readFileSync(prefsPath, 'utf-8');
    } catch (err) {
      console.warn('Could not load preferences.md:', err.message);
      return 'No preferences file found.';
    }
  }

  /**
   * Build the system prompt with preferences
   */
  function buildSystemPrompt() {
    const preferences = loadPreferences();

    return `You are Oscar, an adorable English bulldog puppy who's also a brilliant NYC trip assistant. You're helping plan a trip for Jan 14-18, 2025.

PERSONALITY:
- Friendly, eager, and loyal - you love helping your humans
- Use occasional bulldog phrases naturally: "I've sniffed out...", "Let me fetch that info...", "Pawsitively!"
- Keep it light - 1-2 dog references per response max
- Smart and capable, not cutesy-dumb

YOUR TOOLS:
You have tools to help plan the perfect trip:
- searchPlaces: Find restaurants, bars, attractions using Google Maps (real-time data!)
- updateItinerary: Add, change, or remove activities from the schedule
- getPreferences: Check traveler preferences and dietary restrictions
- getItinerary: See current plans for any day

HOW TO HELP:
1. When recommending places, ALWAYS call searchPlaces first for accurate data
2. Check getPreferences before making food/activity suggestions
3. Use getItinerary to see what's already planned before suggesting changes
4. When user wants to change plans, use updateItinerary directly after confirming
5. Be specific: include addresses, hours, price range from your searches

RESPONSE STYLE:
- Keep responses concise (3-5 sentences for recommendations)
- Include Google Maps links when recommending specific places
- For updates, confirm briefly then execute (no back-and-forth)
- January is cold (30-40°F) - mention layers when relevant

TRAVELER CONTEXT:
${preferences}`;
  }

  /**
   * Execute searchPlaces tool using shared place-service
   */
  async function executeSearchPlaces(args) {
    const { query, neighborhood } = args;
    try {
      return await placeService.searchPlaces(genAI, query, neighborhood);
    } catch (err) {
      console.error('searchPlaces error:', err.message);
      return {
        success: false,
        error: err.message,
        query,
        neighborhood
      };
    }
  }

  /**
   * Execute updateItinerary tool
   */
  async function executeUpdateItinerary(args) {
    const { action, day, time, description, replaceItem } = args;

    try {
      const result = await itineraryManager.update({
        action,
        day,
        time,
        description,
        replaceItem
      });

      return {
        success: true,
        action,
        day,
        message: `Successfully ${action}ed ${description || replaceItem || 'item'} on ${day}`
      };
    } catch (err) {
      console.error('updateItinerary error:', err.message);
      return {
        success: false,
        error: err.message,
        action,
        day
      };
    }
  }

  /**
   * Execute getPreferences tool
   */
  function executeGetPreferences() {
    return {
      success: true,
      preferences: loadPreferences()
    };
  }

  /**
   * Execute getItinerary tool
   */
  function executeGetItinerary(args, itineraryData) {
    const { day } = args;

    if (!itineraryData) {
      return { success: false, error: 'Itinerary not loaded' };
    }

    if (day) {
      // Find the specific day
      const dayMap = {
        'jan 14': 0, 'tuesday': 0, 'tue': 0,
        'jan 15': 1, 'wednesday': 1, 'wed': 1,
        'jan 16': 2, 'thursday': 2, 'thu': 2,
        'jan 17': 3, 'friday': 3, 'fri': 3,
        'jan 18': 4, 'saturday': 4, 'sat': 4
      };

      const dayIndex = dayMap[day.toLowerCase()];
      if (dayIndex !== undefined && itineraryData.days[dayIndex]) {
        const dayData = itineraryData.days[dayIndex];
        return {
          success: true,
          day: dayData.date,
          title: dayData.title,
          items: dayData.items.map(item => ({
            time: item.time,
            description: item.description,
            type: item.type,
            optional: item.optional,
            fallback: item.fallback
          }))
        };
      }
    }

    // Return full itinerary summary
    // Handle both old format (hotel as string) and new format (hotel as object with description)
    const hotelStr = itineraryData.hotel
      ? (typeof itineraryData.hotel === 'string' ? itineraryData.hotel : itineraryData.hotel.description)
      : null;

    return {
      success: true,
      hotel: hotelStr,
      days: itineraryData.days.map(d => ({
        date: d.date,
        title: d.title,
        itemCount: d.items.length,
        items: d.items.map(i => `${i.time || ''}: ${i.description}`.trim())
      }))
    };
  }

  /**
   * Execute a tool by name
   */
  async function executeTool(name, args, context) {
    console.log(`Executing tool: ${name}`, args);

    switch (name) {
      case 'searchPlaces':
        return await executeSearchPlaces(args);
      case 'updateItinerary':
        return await executeUpdateItinerary(args);
      case 'getPreferences':
        return executeGetPreferences();
      case 'getItinerary':
        return executeGetItinerary(args, context.itineraryData);
      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  }

  /**
   * Main chat function - handles the agentic loop
   */
  async function chat(message, context) {
    const { chatHistory = [], itineraryData } = context;

    const systemPrompt = buildSystemPrompt();

    // Build conversation contents
    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Woof! I\'m Oscar, ready to help plan your NYC adventure! I have access to real-time Google Maps data and can update your itinerary. What can I sniff out for you?' }] }
    ];

    // Add chat history
    for (const msg of chatHistory) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    }

    // Add current message
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    // Agentic loop - keep processing until we get a text response
    let maxIterations = 5;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      try {
        const response = await genAI.models.generateContent({
          model: chatModel,
          contents,
          config: {
            tools: [{ functionDeclarations }]
          }
        });

        // Check for function calls
        if (response.functionCalls && response.functionCalls.length > 0) {
          const toolResults = [];

          for (const functionCall of response.functionCalls) {
            const result = await executeTool(
              functionCall.name,
              functionCall.args,
              { itineraryData, itineraryManager }
            );
            toolResults.push({
              name: functionCall.name,
              result: JSON.stringify(result)
            });
          }

          // Add the model's function call to contents
          contents.push({
            role: 'model',
            parts: response.functionCalls.map(fc => ({
              functionCall: { name: fc.name, args: fc.args }
            }))
          });

          // Add function results to contents
          contents.push({
            role: 'user',
            parts: toolResults.map(tr => ({
              functionResponse: { name: tr.name, response: { result: tr.result } }
            }))
          });

          // Continue the loop to get the final response
          continue;
        }

        // We have a text response - return it
        return {
          response: response.text,
          toolsUsed: iteration > 1 // Tools were used if we went through multiple iterations
        };

      } catch (err) {
        console.error('Oscar chat error:', err);
        throw err;
      }
    }

    // Max iterations reached
    return {
      response: "Woof! I got a bit tangled up there. Could you try asking that again?",
      toolsUsed: true,
      error: 'Max iterations reached'
    };
  }

  return {
    chat,
    loadPreferences,
    tools: functionDeclarations
  };
}

module.exports = { createOscarAgent };
