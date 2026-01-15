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
    description: 'Add, modify, or remove items from the trip itinerary. Use this when the user wants to change their plans.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          enum: ['add', 'update', 'remove'],
          description: 'Type of change: "add", "update", or "remove"'
        },
        day: {
          type: Type.STRING,
          description: 'Day for the item: "Tuesday", "Jan 15", "Wednesday", etc.'
        },
        description: {
          type: Type.STRING,
          description: 'What the activity is, e.g. "Dinner at Carbone" or "Visit MoMA"'
        },
        time: {
          type: Type.STRING,
          description: 'Time for the activity like "7pm", "2:30pm", or "morning". Optional.'
        },
        type: {
          type: Type.STRING,
          enum: ['food', 'activity', 'transit', 'culture', 'entertainment'],
          description: 'Category of activity. Default is "activity".'
        },
        status: {
          type: Type.STRING,
          enum: ['primary', 'optional', 'backup'],
          description: 'Whether this is a primary plan, optional, or backup. Default is "primary".'
        },
        itemId: {
          type: Type.STRING,
          description: 'Item ID for update/remove actions. Get from getItinerary first.'
        }
      },
      required: ['action', 'day', 'description']
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
  },
  {
    name: 'getExpenses',
    description: 'Get the trip expenses and totals. Shows all expenses with who paid (George or Val), amounts, categories, and calculates who owes whom.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
      required: []
    }
  },
  {
    name: 'addExpense',
    description: 'Add a new expense to track trip spending. Use when the user mentions paying for something or wants to log an expense.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        description: {
          type: Type.STRING,
          description: 'What the expense was for (e.g., "Dinner at Carbone", "Uber to hotel", "Museum tickets")'
        },
        amount: {
          type: Type.NUMBER,
          description: 'Amount in dollars (e.g., 45.50)'
        },
        payer: {
          type: Type.STRING,
          enum: ['george', 'val'],
          description: 'Who paid: "george" or "val"'
        },
        category: {
          type: Type.STRING,
          enum: ['food', 'transport', 'activity', 'accommodation', 'other'],
          description: 'Expense category. Default is "other".'
        },
        date: {
          type: Type.STRING,
          description: 'Date of expense in YYYY-MM-DD format. Defaults to today.'
        }
      },
      required: ['description', 'amount', 'payer']
    }
  },
  {
    name: 'updateExpense',
    description: 'Update an existing expense. Use getExpenses first to find the expense ID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        expenseId: {
          type: Type.STRING,
          description: 'The expense ID to update (get from getExpenses)'
        },
        description: {
          type: Type.STRING,
          description: 'New description (optional)'
        },
        amount: {
          type: Type.NUMBER,
          description: 'New amount in dollars (optional)'
        },
        payer: {
          type: Type.STRING,
          enum: ['george', 'val'],
          description: 'New payer (optional)'
        },
        category: {
          type: Type.STRING,
          enum: ['food', 'transport', 'activity', 'accommodation', 'other'],
          description: 'New category (optional)'
        },
        date: {
          type: Type.STRING,
          description: 'New date in YYYY-MM-DD format (optional)'
        }
      },
      required: ['expenseId']
    }
  },
  {
    name: 'deleteExpense',
    description: 'Delete an expense from the tracker. Use getExpenses first to find the expense ID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        expenseId: {
          type: Type.STRING,
          description: 'The expense ID to delete (get from getExpenses)'
        }
      },
      required: ['expenseId']
    }
  }
];

// Convert tools to functionDeclarations format
const functionDeclarations = tools.map(tool => ({
  name: tool.name,
  description: tool.description,
  parameters: tool.parameters
}));

// Date mapping for NYC trip Jan 14-18, 2026
const DATE_MAP = {
  'jan 14': '2026-01-14', 'january 14': '2026-01-14', 'wednesday': '2026-01-14', 'wed': '2026-01-14',
  'jan 15': '2026-01-15', 'january 15': '2026-01-15', 'thursday': '2026-01-15', 'thu': '2026-01-15',
  'jan 16': '2026-01-16', 'january 16': '2026-01-16', 'friday': '2026-01-16', 'fri': '2026-01-16',
  'jan 17': '2026-01-17', 'january 17': '2026-01-17', 'saturday': '2026-01-17', 'sat': '2026-01-17',
  'jan 18': '2026-01-18', 'january 18': '2026-01-18', 'sunday': '2026-01-18', 'sun': '2026-01-18'
};

/**
 * Parse time string to database format (HH:MM:SS)
 * Handles: "7pm", "7:30pm", "2-4pm" (takes start time), "morning", "afternoon", etc.
 * @param {string} timeStr - Natural language time
 * @returns {string|null} - Time in HH:MM:SS format or null
 */
function parseTimeString(timeStr) {
  if (!timeStr) return null;

  const lower = timeStr.toLowerCase().trim();

  // Handle keywords
  if (lower === 'morning' || lower === 'am') return '09:00:00';
  if (lower === 'noon' || lower === 'midday') return '12:00:00';
  if (lower === 'afternoon') return '14:00:00';
  if (lower === 'evening') return '18:00:00';
  if (lower === 'night') return '20:00:00';

  // Handle "7pm", "7:30pm", "14:00", "2-4pm" (just take start time)
  const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  let hours = parseInt(match[1]);
  const minutes = match[2] ? parseInt(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();

  // Convert to 24-hour format
  if (meridiem === 'pm' && hours !== 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;

  // Handle 24-hour format input (e.g., "14:00")
  if (!meridiem && hours >= 0 && hours <= 23) {
    // Already in 24-hour format
  }

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00`;
}

/**
 * Creates the Oscar agent
 */
function createOscarAgent(dependencies) {
  const { genAI } = dependencies;

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
        const user = await db.getUserById(userId);
        if (user && user.preferences && Object.keys(user.preferences).length > 0) {
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
   * Format itinerary data for inclusion in system prompt
   * @param {Array} days - Array of day objects with items
   * @returns {string} Formatted itinerary text
   */
  function formatItineraryForContext(days) {
    if (!days || days.length === 0) {
      return 'No itinerary items scheduled yet.';
    }

    const dayNames = {
      '2026-01-14': 'Wednesday, Jan 14',
      '2026-01-15': 'Thursday, Jan 15',
      '2026-01-16': 'Friday, Jan 16',
      '2026-01-17': 'Saturday, Jan 17',
      '2026-01-18': 'Sunday, Jan 18'
    };

    let output = '';

    for (const day of days) {
      const dateStr = typeof day.date === 'string'
        ? day.date.split('T')[0]
        : day.date.toISOString().split('T')[0];
      const dayName = dayNames[dateStr] || dateStr;
      const title = day.title ? ` - ${day.title}` : '';

      output += `\n### ${dayName}${title}\n`;

      if (!day.items || day.items.length === 0) {
        output += '(No items scheduled)\n';
        continue;
      }

      // Sort items by time
      const sortedItems = [...day.items].sort((a, b) => {
        if (!a.timeStart && !b.timeStart) return 0;
        if (!a.timeStart) return 1;
        if (!b.timeStart) return -1;
        return a.timeStart.localeCompare(b.timeStart);
      });

      for (const item of sortedItems) {
        const time = item.timeStart
          ? formatTimeForDisplay(item.timeStart)
          : '';
        const status = item.status !== 'primary' ? ` [${item.status}]` : '';
        const type = item.type ? ` (${item.type})` : '';

        // Include enrichment highlights if available
        let enrichmentNote = '';
        if (item.enrichment) {
          const e = item.enrichment;
          const parts = [];
          if (e.neighborhood) parts.push(e.neighborhood);
          if (e.address) parts.push(e.address);
          if (parts.length > 0) {
            enrichmentNote = ` — ${parts.join(', ')}`;
          }
        }

        output += `- ${time ? time + ' ' : ''}${item.description}${type}${status}${enrichmentNote} [id: ${item.id}]\n`;
      }
    }

    return output;
  }

  /**
   * Format time from HH:MM:SS to display format
   * @param {string} timeStr - Time in HH:MM:SS format
   * @returns {string} Formatted time like "7:30pm"
   */
  function formatTimeForDisplay(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':').map(Number);
    const meridiem = hours >= 12 ? 'pm' : 'am';
    const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
    return minutes > 0
      ? `${displayHours}:${minutes.toString().padStart(2, '0')}${meridiem}`
      : `${displayHours}${meridiem}`;
  }

  /**
   * Build the system prompt with preferences and full itinerary context
   * @param {string} userId - User ID for loading preferences
   * @param {Array} itineraryDays - Full itinerary data (optional, will fetch if not provided)
   */
  async function buildSystemPrompt(userId, itineraryDays = null) {
    const preferences = await loadPreferences(userId);

    // Fetch itinerary if not provided
    let days = itineraryDays;
    if (!days && userId) {
      try {
        days = await db.getDaysByDateRange(userId, '2026-01-14', '2026-01-18');
      } catch (err) {
        console.warn('Could not load itinerary for context:', err.message);
        days = [];
      }
    }

    const itineraryContext = formatItineraryForContext(days);

    return `You are Oscar, an adorable English bulldog puppy who's also a brilliant NYC trip assistant. You're helping plan a trip for Jan 14-18, 2026.

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
- getItinerary: Get fresh itinerary data (you already have the current state below, but use this to refresh after changes)

EXPENSE TRACKING TOOLS:
- getExpenses: See all trip expenses, totals, and who owes whom
- addExpense: Log a new expense (description, amount, who paid, category)
- updateExpense: Fix an expense (need the expense ID from getExpenses)
- deleteExpense: Remove an expense (need the expense ID from getExpenses)

HOW TO HELP:
1. When recommending places, ALWAYS call searchPlaces first for accurate data
2. Consult the TRAVELER PREFERENCES below when making food/activity suggestions
3. You already have the FULL ITINERARY below - reference it directly when discussing plans!
4. When user wants to change plans, use updateItinerary directly (no need to call getItinerary first - you have the IDs below)
5. Be specific: include addresses, hours, price range from your searches
6. When adding/updating items, you need the item ID - it's shown in [id: xxx] format in the itinerary below
7. For expenses: when users mention paying for things, offer to log it. Categories are: food, transport, activity, accommodation, other
8. Payers are George and Val - ask who paid if not clear

RESPONSE STYLE:
- Keep responses concise (3-5 sentences for recommendations)
- Include Google Maps links when recommending specific places
- For updates, confirm briefly then execute (no back-and-forth)
- January is cold (30-40°F) - mention layers when relevant
- Reference specific existing plans when relevant (e.g., "I see you have dinner at X, so maybe before that...")

TRAVELER PREFERENCES:
${preferences}

CURRENT ITINERARY (as of now):
${itineraryContext}`;
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
   * Execute updateItinerary tool - directly writes to database
   * @param {Object} args - Tool arguments
   * @param {string} userId - User ID from context
   * @param {Object} context - Additional context (enrichment callback, etc.)
   */
  async function executeUpdateItinerary(args, userId, context = {}) {
    const { action, day, description, time, type, status, itemId } = args;

    if (!userId) {
      return {
        success: false,
        error: 'User ID required for itinerary updates'
      };
    }

    if (!day) {
      return {
        success: false,
        error: 'Day is required (e.g., "Tuesday", "Jan 15")'
      };
    }

    // Map day name to date string
    const dateStr = DATE_MAP[day.toLowerCase()];
    if (!dateStr) {
      return {
        success: false,
        error: `Unknown day: ${day}. Valid days are Jan 14-18 (Tuesday-Saturday).`
      };
    }

    try {
      if (action === 'add') {
        // Get or create day record
        let dayRecord = await db.getDayByDate(userId, dateStr);
        if (!dayRecord) {
          dayRecord = await db.createDay(userId, dateStr);
          dayRecord.items = [];
        }

        // Calculate sort order (add at end)
        const sortOrder = dayRecord.items.length;

        // Parse time if provided
        const timeStart = parseTimeString(time);

        // Create item in database
        const item = await db.createItem(dayRecord.id, {
          prompt: description,
          description: description,
          timeStart: timeStart,
          type: type || 'activity',
          status: status || 'primary',
          sortOrder: sortOrder
        });

        console.log(`Oscar added item: ${description} on ${dateStr}`);
        // Note: Background enrichment is triggered by server.js after cache refresh

        return {
          success: true,
          action: 'add',
          day: dateStr,
          item: {
            id: item.id,
            description: item.description,
            time: time || null,
            type: item.type,
            status: item.status
          },
          message: `Added "${description}" to ${day}`
        };
      }

      if (action === 'update') {
        if (!itemId) {
          return {
            success: false,
            error: 'itemId is required for updates. Use getItinerary first to find the item ID.'
          };
        }

        // Check if this is a "move" operation (changing the day)
        // We need to delete from old day and create in new day
        if (day) {
          // Get the current item to preserve its data
          const currentDays = await db.getDaysByDateRange(userId, '2026-01-14', '2026-01-18');
          let currentItem = null;
          let currentDayDate = null;

          for (const d of currentDays) {
            const found = d.items.find(i => i.id === itemId);
            if (found) {
              currentItem = found;
              currentDayDate = d.date;
              break;
            }
          }

          if (!currentItem) {
            return {
              success: false,
              error: `Item not found: ${itemId}`
            };
          }

          // Check if the day is actually changing
          const targetDateStr = dateStr; // Already computed above from DATE_MAP
          const currentDateStr = typeof currentDayDate === 'string'
            ? currentDayDate.split('T')[0]
            : currentDayDate.toISOString().split('T')[0];

          if (targetDateStr !== currentDateStr) {
            // This is a MOVE operation - delete from old day, create in new day
            console.log(`Oscar moving item ${itemId} from ${currentDateStr} to ${targetDateStr}`);

            // Delete from old day
            await db.deleteItem(itemId);

            // Get or create the target day
            let targetDay = await db.getDayByDate(userId, targetDateStr);
            if (!targetDay) {
              targetDay = await db.createDay(userId, targetDateStr);
              targetDay.items = [];
            }

            // Create in new day with updated values
            const newItem = await db.createItem(targetDay.id, {
              prompt: description || currentItem.prompt || currentItem.description,
              description: description || currentItem.description,
              timeStart: time ? parseTimeString(time) : currentItem.timeStart,
              type: type || currentItem.type || 'activity',
              status: status || currentItem.status || 'primary',
              sortOrder: targetDay.items.length
            });

            // Copy enrichment data from old item if it exists
            if (currentItem.enrichment) {
              await db.updateItemEnrichment(newItem.id, currentItem.enrichment);
              console.log(`Copied enrichment data to moved item ${newItem.id}`);
            }
            // Note: Background enrichment is triggered by server.js after cache refresh

            return {
              success: true,
              action: 'move',
              fromDay: currentDateStr,
              toDay: targetDateStr,
              newItemId: newItem.id,
              message: `Moved "${description || currentItem.description}" from ${currentDateStr} to ${targetDateStr}`
            };
          }
        }

        // Regular update (same day) - just update fields
        const updates = {};
        if (description) {
          updates.description = description;
          updates.prompt = description;
        }
        if (time) {
          updates.timeStart = parseTimeString(time);
        }
        if (type) {
          updates.type = type;
        }
        if (status) {
          updates.status = status;
        }

        const updatedItem = await db.updateItem(itemId, updates);

        if (!updatedItem) {
          return {
            success: false,
            error: `Item not found: ${itemId}`
          };
        }

        console.log(`Oscar updated item ${itemId}: ${JSON.stringify(updates)}`);

        return {
          success: true,
          action: 'update',
          itemId: itemId,
          updates: updates,
          message: `Updated item successfully`
        };
      }

      if (action === 'remove') {
        if (!itemId) {
          return {
            success: false,
            error: 'itemId is required for removal. Use getItinerary first to find the item ID.'
          };
        }

        const deleted = await db.deleteItem(itemId);

        if (!deleted) {
          return {
            success: false,
            error: `Item not found: ${itemId}`
          };
        }

        console.log(`Oscar removed item ${itemId}`);

        return {
          success: true,
          action: 'remove',
          itemId: itemId,
          message: `Removed item from itinerary`
        };
      }

      return {
        success: false,
        error: `Unknown action: ${action}. Use "add", "update", or "remove".`
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
      if (day) {
        // Find the specific day in database using shared DATE_MAP
        const dateStr = DATE_MAP[day.toLowerCase()];
        if (!dateStr) {
          return {
            success: false,
            error: `Unknown day: ${day}. Valid days are Jan 14-18 (Tuesday-Saturday).`
          };
        }

        const dayData = await db.getDayByDate(userId, dateStr);
        if (!dayData) {
          return {
            success: true,
            day: dateStr,
            title: null,
            items: [],
            message: `No items scheduled for ${day} yet.`
          };
        }

        return {
          success: true,
          day: dayData.date,
          title: dayData.title,
          items: dayData.items.map(item => ({
            id: item.id,
            time: item.timeStart || null,
            description: item.description,
            type: item.type,
            status: item.status
          }))
        };
      }

      // Return full itinerary summary (all 5 days)
      const days = await db.getDaysByDateRange(userId, '2026-01-14', '2026-01-18');

      return {
        success: true,
        days: days.map(d => ({
          date: d.date,
          title: d.title,
          itemCount: d.items.length,
          items: d.items.map(i => ({
            id: i.id,
            time: i.timeStart || null,
            description: i.description,
            type: i.type,
            status: i.status
          }))
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
   * Execute getExpenses tool - get all expenses and totals
   * @param {Object} args - Tool arguments (unused)
   * @param {string} userId - User ID from context
   */
  async function executeGetExpenses(args, userId) {
    if (!userId) {
      return {
        success: false,
        error: 'User ID required to fetch expenses'
      };
    }

    try {
      const expenses = await db.getExpensesByUser(userId);
      const totals = await db.getExpenseTotals(userId);

      // Calculate who owes whom
      const splitAmount = totals.total / 2;
      const georgeOwesVal = Math.max(0, splitAmount - totals.georgePaid);
      const valOwesGeorge = Math.max(0, splitAmount - totals.valPaid);

      return {
        success: true,
        expenses: expenses.map(e => ({
          id: e.id,
          description: e.description,
          amount: parseFloat(e.amount),
          payer: e.payer,
          category: e.category,
          date: e.date
        })),
        totals: {
          total: totals.total,
          georgePaid: totals.georgePaid,
          valPaid: totals.valPaid
        },
        settlement: georgeOwesVal > 0
          ? { owes: 'george', amount: georgeOwesVal.toFixed(2), to: 'val' }
          : valOwesGeorge > 0
            ? { owes: 'val', amount: valOwesGeorge.toFixed(2), to: 'george' }
            : { settled: true, message: 'All even!' }
      };
    } catch (err) {
      console.error('getExpenses error:', err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Execute addExpense tool - add a new expense
   * @param {Object} args - Tool arguments with description, amount, payer, category, date
   * @param {string} userId - User ID from context
   */
  async function executeAddExpense(args, userId) {
    const { description, amount, payer, category, date } = args;

    if (!userId) {
      return {
        success: false,
        error: 'User ID required to add expense'
      };
    }

    if (!description || typeof description !== 'string') {
      return {
        success: false,
        error: 'Description is required'
      };
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return {
        success: false,
        error: 'Amount must be a positive number'
      };
    }

    if (!payer || !['george', 'val'].includes(payer.toLowerCase())) {
      return {
        success: false,
        error: 'Payer must be "george" or "val"'
      };
    }

    try {
      const expense = await db.createExpense(userId, {
        description,
        amount,
        payer: payer.toLowerCase(),
        category: category || 'other',
        date: date || new Date().toISOString().split('T')[0]
      });

      console.log(`Oscar added expense: ${description} ($${amount}) paid by ${payer}`);

      return {
        success: true,
        expense: {
          id: expense.id,
          description: expense.description,
          amount: parseFloat(expense.amount),
          payer: expense.payer,
          category: expense.category,
          date: expense.date
        },
        message: `Added expense: ${description} ($${amount}) paid by ${payer}`
      };
    } catch (err) {
      console.error('addExpense error:', err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Execute updateExpense tool - update an existing expense
   * @param {Object} args - Tool arguments with expenseId and optional updates
   * @param {string} userId - User ID from context
   */
  async function executeUpdateExpense(args, userId) {
    const { expenseId, description, amount, payer, category, date } = args;

    if (!userId) {
      return {
        success: false,
        error: 'User ID required to update expense'
      };
    }

    if (!expenseId) {
      return {
        success: false,
        error: 'Expense ID is required. Use getExpenses first to find the ID.'
      };
    }

    // Verify the expense belongs to this user
    const existing = await db.getExpenseById(expenseId);
    if (!existing) {
      return {
        success: false,
        error: `Expense not found: ${expenseId}`
      };
    }

    if (existing.userId !== userId) {
      return {
        success: false,
        error: 'Not authorized to update this expense'
      };
    }

    // Build updates object
    const updates = {};
    if (description) updates.description = description;
    if (amount !== undefined && amount > 0) updates.amount = amount;
    if (payer && ['george', 'val'].includes(payer.toLowerCase())) {
      updates.payer = payer.toLowerCase();
    }
    if (category) updates.category = category;
    if (date) updates.date = date;

    if (Object.keys(updates).length === 0) {
      return {
        success: false,
        error: 'No valid updates provided'
      };
    }

    try {
      const updated = await db.updateExpense(expenseId, updates);

      console.log(`Oscar updated expense ${expenseId}: ${JSON.stringify(updates)}`);

      return {
        success: true,
        expense: {
          id: updated.id,
          description: updated.description,
          amount: parseFloat(updated.amount),
          payer: updated.payer,
          category: updated.category,
          date: updated.date
        },
        message: 'Expense updated successfully'
      };
    } catch (err) {
      console.error('updateExpense error:', err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Execute deleteExpense tool - delete an expense
   * @param {Object} args - Tool arguments with expenseId
   * @param {string} userId - User ID from context
   */
  async function executeDeleteExpense(args, userId) {
    const { expenseId } = args;

    if (!userId) {
      return {
        success: false,
        error: 'User ID required to delete expense'
      };
    }

    if (!expenseId) {
      return {
        success: false,
        error: 'Expense ID is required. Use getExpenses first to find the ID.'
      };
    }

    // Verify the expense belongs to this user
    const existing = await db.getExpenseById(expenseId);
    if (!existing) {
      return {
        success: false,
        error: `Expense not found: ${expenseId}`
      };
    }

    if (existing.userId !== userId) {
      return {
        success: false,
        error: 'Not authorized to delete this expense'
      };
    }

    try {
      await db.deleteExpense(expenseId);

      console.log(`Oscar deleted expense ${expenseId}`);

      return {
        success: true,
        message: 'Expense deleted successfully'
      };
    } catch (err) {
      console.error('deleteExpense error:', err.message);
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

    const { userId, triggerEnrichment } = context;

    switch (name) {
      case 'searchPlaces':
        return await executeSearchPlaces(args);
      case 'updateItinerary':
        return await executeUpdateItinerary(args, userId, { triggerEnrichment });
      case 'getPreferences':
        return await executeGetPreferences(args, userId);
      case 'getItinerary':
        return await executeGetItinerary(args, userId);
      case 'getExpenses':
        return await executeGetExpenses(args, userId);
      case 'addExpense':
        return await executeAddExpense(args, userId);
      case 'updateExpense':
        return await executeUpdateExpense(args, userId);
      case 'deleteExpense':
        return await executeDeleteExpense(args, userId);
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
    const { chatHistory = [], itineraryData, userId, triggerEnrichment } = context;

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
              { userId, itineraryData, triggerEnrichment }
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
