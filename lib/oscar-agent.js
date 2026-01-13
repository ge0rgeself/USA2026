/**
 * Oscar Agent - Gemini-powered agentic trip assistant
 *
 * Uses Gemini 2.5 Flash for reasoning/chat with function calling
 * Uses Gemini 2.5 Flash for Maps grounding (searchPlaces tool)
 */

const { GoogleGenAI, Type } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const db = require('./db');
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
    description: 'Add, modify, or remove items from the trip itinerary using free-form prompts. Use this when the user wants to change their plans.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          enum: ['add', 'update', 'remove'],
          description: 'Type of change: "add", "update", or "remove"'
        },
        prompt: {
          type: Type.STRING,
          description: 'Free-form description like "dinner at Carbone Tuesday evening" or "backup pizza spot for Friday"'
        },
        backup: {
          type: Type.BOOLEAN,
          description: 'Mark as backup/fallback option (optional)'
        },
        optional: {
          type: Type.BOOLEAN,
          description: 'Mark as optional activity (optional)'
        }
      },
      required: ['action', 'prompt']
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
   * Load preferences from database or fallback to preferences.md
   * @param {string} userId - User ID for database lookup
   * @returns {Promise<string>} Preferences as text
   */
  async function loadPreferences(userId) {
    try {
      // Try to load from database first
      if (userId) {
        const user = await db.getUserByEmail(userId);
        if (user && user.preferences) {
          // If preferences is a JSONB object, convert to readable text
          const prefs = typeof user.preferences === 'string' ? JSON.parse(user.preferences) : user.preferences;
          return JSON.stringify(prefs, null, 2);
        }
      }
    } catch (err) {
      console.warn('Could not load preferences from database:', err.message);
    }

    // Fallback to file-based preferences
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
   * @param {string} userId - User ID for loading preferences
   */
  async function buildSystemPrompt(userId) {
    const preferences = await loadPreferences(userId);

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
   * @param {Object} args - Tool arguments
   * @param {string} userId - User ID from context
   */
  async function executeUpdateItinerary(args, userId) {
    const { action, prompt, backup, optional } = args;

    if (!userId) {
      return {
        success: false,
        error: 'User ID required for itinerary updates'
      };
    }

    try {
      // For updates/removes, we need to parse which day from the prompt
      // This is a simplified implementation - Oscar's prompt should contain date context
      if (action === 'remove') {
        // Remove requires item ID - we'd need to search for it
        // For now, return a message asking for more specificity
        return {
          success: false,
          error: 'Remove action requires item details. Please specify which item to remove.'
        };
      }

      if (action === 'add') {
        // Parse date from prompt if available
        // For now, delegate to itineraryManager if available, or return error
        if (itineraryManager && itineraryManager.update) {
          const result = await itineraryManager.update({
            action,
            prompt,
            backup,
            optional
          });
          return {
            success: true,
            action,
            prompt,
            message: `Successfully added: ${prompt}`
          };
        }

        return {
          success: false,
          error: 'Itinerary manager not available for item creation'
        };
      }

      if (action === 'update') {
        // Update requires item ID
        if (itineraryManager && itineraryManager.update) {
          const result = await itineraryManager.update({
            action,
            prompt,
            backup,
            optional
          });
          return {
            success: true,
            action,
            prompt,
            message: `Successfully updated: ${prompt}`
          };
        }

        return {
          success: false,
          error: 'Itinerary manager not available for item updates'
        };
      }

      return {
        success: false,
        error: `Unknown action: ${action}`
      };

    } catch (err) {
      console.error('updateItinerary error:', err.message);
      return {
        success: false,
        error: err.message,
        action
      };
    }
  }

  /**
   * Execute getPreferences tool
   * @param {Object} args - Tool arguments (unused)
   * @param {string} userId - User ID from context
   */
  async function executeGetPreferences(args, userId) {
    try {
      const preferences = await loadPreferences(userId);
      return {
        success: true,
        preferences
      };
    } catch (err) {
      console.error('getPreferences error:', err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Execute getItinerary tool
   * @param {Object} args - Tool arguments with optional 'day'
   * @param {string} userId - User ID from context
   */
  async function executeGetItinerary(args, userId) {
    const { day } = args;

    if (!userId) {
      return {
        success: false,
        error: 'User ID required to fetch itinerary'
      };
    }

    try {
      // Define date mapping for NYC trip Jan 14-18, 2025
      const dateMap = {
        'jan 14': '2025-01-14', 'tuesday': '2025-01-14', 'tue': '2025-01-14',
        'jan 15': '2025-01-15', 'wednesday': '2025-01-15', 'wed': '2025-01-15',
        'jan 16': '2025-01-16', 'thursday': '2025-01-16', 'thu': '2025-01-16',
        'jan 17': '2025-01-17', 'friday': '2025-01-17', 'fri': '2025-01-17',
        'jan 18': '2025-01-18', 'saturday': '2025-01-18', 'sat': '2025-01-18'
      };

      if (day) {
        // Find the specific day in database
        const dateStr = dateMap[day.toLowerCase()];
        if (!dateStr) {
          return {
            success: false,
            error: `Unknown day: ${day}`
          };
        }

        const dayData = await db.getDayByDate(userId, dateStr);
        if (!dayData) {
          return {
            success: false,
            error: `No itinerary for ${day}`
          };
        }

        return {
          success: true,
          day: dayData.date,
          title: dayData.title,
          items: dayData.items.map(item => ({
            id: item.id,
            time: `${item.timeStart || ''}${item.timeEnd ? '-' + item.timeEnd : ''}`.trim(),
            description: item.description,
            type: item.type,
            status: item.status
          }))
        };
      }

      // Return full itinerary summary (all 5 days)
      const days = await db.getDaysByDateRange(userId, '2025-01-14', '2025-01-18');

      return {
        success: true,
        days: days.map(d => ({
          date: d.date,
          title: d.title,
          itemCount: d.items.length,
          items: d.items.map(i => {
            const time = `${i.timeStart || ''}${i.timeEnd ? '-' + i.timeEnd : ''}`.trim();
            return `${time ? time + ': ' : ''}${i.description}`;
          })
        }))
      };

    } catch (err) {
      console.error('getItinerary error:', err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Execute a tool by name
   * @param {string} name - Tool name
   * @param {Object} args - Tool arguments
   * @param {Object} context - Execution context with userId and other data
   */
  async function executeTool(name, args, context) {
    console.log(`Executing tool: ${name}`, args);

    const { userId } = context;

    switch (name) {
      case 'searchPlaces':
        return await executeSearchPlaces(args);
      case 'updateItinerary':
        return await executeUpdateItinerary(args, userId);
      case 'getPreferences':
        return await executeGetPreferences(args, userId);
      case 'getItinerary':
        return await executeGetItinerary(args, userId);
      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  }

  /**
   * Main chat function - handles the agentic loop
   * @param {string} message - User message
   * @param {Object} context - Execution context with userId, chatHistory, itineraryData
   */
  async function chat(message, context) {
    const { chatHistory = [], itineraryData, userId } = context;

    const systemPrompt = await buildSystemPrompt(userId);

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
              { userId, itineraryData, itineraryManager }
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
