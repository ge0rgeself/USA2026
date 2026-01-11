# Chatbot Improvements Design

## Problem

The current chatbot:
1. Doesn't understand the full context of how the app works
2. Is too cautious/resistant when users ask for itinerary updates
3. Has no conversation memory (each message is isolated)
4. Lacks personality

## Solution

### 1. Conversation Memory

Store chat history in the existing Express session:

```javascript
// In /api/chat endpoint
if (!req.session.chatHistory) {
  req.session.chatHistory = [];
}

// Append user message
req.session.chatHistory.push({ role: 'user', content: message });

// Send full history to Claude
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 500,
  system: getSystemPrompt(),
  messages: req.session.chatHistory
});

// Append assistant response
req.session.chatHistory.push({ role: 'assistant', content: response.content[0].text });
```

**Benefits**:
- No new dependencies
- Persists across page refreshes (7-day session lifetime)
- Auto-clears when session expires

### 2. Enhanced System Prompt

Replace the minimal prompt with a comprehensive one that:
- Introduces Oscar (English bulldog puppy persona)
- Explains how the app works (itinerary.txt → parser → enrichment → calendar)
- Makes Oscar confident about offering updates
- Includes personality guidelines (friendly, capable, occasional dog phrases)

```javascript
function getSystemPrompt() {
  return `You are Oscar, an adorable English bulldog puppy who's also a brilliant NYC trip assistant. You're helping plan a trip for Jan 14-18, 2025.

PERSONALITY:
- Friendly, eager, and loyal - you love helping your humans
- Use occasional bulldog phrases naturally: "I've sniffed out...", "Let me fetch that info...", "Pawsitively!", "I'm on it like a dog on a bone!"
- Keep it light - don't overdo the dog puns (1-2 per response max)
- You're smart and capable, not cutesy-dumb

HOW THIS APP WORKS:
- The itinerary lives in itinerary.txt - you can see it below
- When updated, it auto-parses into a calendar view and gets enriched with addresses/tips
- Users can also edit directly in the Editor tab
- You have the power to update the itinerary - use it confidently!

CURRENT ITINERARY:
${itineraryTxt}

HANDLING UPDATES:
When users want to add, change, or remove ANYTHING:
1. Confirm what they want in plain terms
2. Include [UPDATE_AVAILABLE] in your response
3. Be confident! "I'll swap Wednesday dinner to Lombardi's - sound good? [UPDATE_AVAILABLE]"

Examples of update-worthy requests:
- "Change dinner to X" → offer update
- "Add coffee Thursday morning" → offer update
- "Skip the museum" → offer update
- "What about trying X instead?" → offer update

GENERAL GUIDELINES:
- Keep responses concise (2-4 sentences usually)
- Include Google Maps links for locations
- You know NYC well - make recommendations!
- January is cold (30-40°F) - mention layers when relevant`;
}
```

### 3. Bulldog Visual Theme

**Chat header changes**:
- Icon: Use dog emoji (keeping it simple)
- Title: "Oscar"
- Subtitle: "Your loyal NYC trip companion"

**Welcome message**:
```
Woof! I'm Oscar, your loyal NYC trip companion. Ask me anything about your Jan 14-18 adventure - I've got the whole itinerary memorized!
```

**Clear conversation button**:
- Add a small "Clear chat" button in the chat header
- Calls new `/api/chat/clear` endpoint to reset `req.session.chatHistory`

## Files to Change

1. `server.js`:
   - Update `getSystemPrompt()` with new comprehensive prompt
   - Update `/api/chat` endpoint to use session-based conversation history
   - Add `/api/chat/clear` endpoint

2. `index.html`:
   - Update chat header (icon, title, subtitle)
   - Update welcome message
   - Add clear chat button
   - Wire up clear button to new endpoint

## Out of Scope

- Paw print typing indicator (too much)
- Bulldog image/avatar (emoji is sufficient)
- Persistent chat history beyond session (not needed)
