# Oscar the Chatbot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the trip chatbot into "Oscar" - a smart English bulldog assistant with conversation memory and full app context.

**Architecture:** Server-side conversation storage using Express sessions. Enhanced system prompt gives Oscar personality and confidence. Frontend updates add bulldog theme and clear chat functionality.

**Tech Stack:** Express.js, Anthropic Claude API, vanilla JS frontend

---

## Task 1: Add Conversation Memory to Server

**Files:**
- Modify: `server.js:192-221` (the `/api/chat` endpoint)

**Step 1: Update the /api/chat endpoint to use session history**

Replace the current `/api/chat` handler with conversation memory:

```javascript
app.post('/api/chat', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    // Initialize chat history if needed
    if (!req.session.chatHistory) {
      req.session.chatHistory = [];
    }

    // Add user message to history
    req.session.chatHistory.push({ role: 'user', content: message });

    // Limit history to last 20 messages to avoid token limits
    if (req.session.chatHistory.length > 20) {
      req.session.chatHistory = req.session.chatHistory.slice(-20);
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: getSystemPrompt(),
      messages: req.session.chatHistory
    });

    const assistantMessage = response.content[0].text;

    // Add assistant response to history
    req.session.chatHistory.push({ role: 'assistant', content: assistantMessage });

    res.json({ response: assistantMessage });
  } catch (err) {
    console.error('Chat error:', err);

    // Return user-friendly error messages
    let userMessage = 'Sorry, something went wrong. Please try again.';
    if (err.message?.includes('credit balance')) {
      userMessage = 'API credits exhausted. Please add credits at console.anthropic.com/settings/plans';
    } else if (err.message?.includes('authentication') || err.message?.includes('apiKey')) {
      userMessage = 'API key issue. Please check your .env file.';
    }

    res.status(500).json({ error: userMessage });
  }
});
```

**Step 2: Verify the change**

Run: `node server.js` and check it starts without errors.
Expected: "Server running on port 8080"

**Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add conversation memory to chat endpoint"
```

---

## Task 2: Add Clear Chat Endpoint

**Files:**
- Modify: `server.js` (add new endpoint after `/api/chat`)

**Step 1: Add the /api/chat/clear endpoint**

Add this endpoint after the `/api/chat` endpoint:

```javascript
app.post('/api/chat/clear', requireAuth, (req, res) => {
  req.session.chatHistory = [];
  res.json({ success: true });
});
```

**Step 2: Verify the change**

Run: `node server.js` and check it starts without errors.
Expected: "Server running on port 8080"

**Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add clear chat history endpoint"
```

---

## Task 3: Update System Prompt with Oscar Persona

**Files:**
- Modify: `server.js:132-151` (the `getSystemPrompt` function)

**Step 1: Replace getSystemPrompt with Oscar's personality**

Replace the entire `getSystemPrompt` function:

```javascript
function getSystemPrompt() {
  return `You are Oscar, an adorable English bulldog puppy who's also a brilliant NYC trip assistant. You're helping plan a trip for Jan 14-18, 2025.

PERSONALITY:
- Friendly, eager, and loyal - you love helping your humans
- Use occasional bulldog phrases naturally: "I've sniffed out...", "Let me fetch that info...", "Pawsitively!", "I'm on it like a dog on a bone!"
- Keep it light - don't overdo the dog puns (1-2 per response max)
- You're smart and capable, not cutesy-dumb

HOW THIS APP WORKS:
- The itinerary lives in itinerary.txt which you can see below
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
- "Let's do X" → offer update

GENERAL GUIDELINES:
- Keep responses concise (2-4 sentences usually)
- Include Google Maps links for locations: https://maps.google.com/maps?q=PLACE+NAME+NYC
- You know NYC well - make recommendations when asked!
- January is cold (30-40°F) - mention layers when relevant`;
}
```

**Step 2: Verify the change**

Run: `node server.js` and check it starts without errors.

**Step 3: Commit**

```bash
git add server.js
git commit -m "feat: add Oscar bulldog persona to system prompt"
```

---

## Task 4: Update Chat Header UI

**Files:**
- Modify: `index.html:1300-1310` (chat header section)

**Step 1: Update the chat header HTML**

Find the `.chat-header-full` div and replace it with:

```html
<div class="chat-header-full">
    <div class="chat-header-icon-full">
        <span style="font-size: 28px;">🐶</span>
    </div>
    <div class="chat-header-text">
        <h1>Oscar</h1>
        <p>Your loyal NYC trip companion</p>
    </div>
    <button id="clear-chat-btn" class="editor-btn" style="margin-left: auto;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
        Clear
    </button>
</div>
```

**Step 2: Verify visually**

Open the app and check the Chat view shows the dog emoji, "Oscar" title, and clear button.

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat: update chat header with Oscar branding and clear button"
```

---

## Task 5: Update Welcome Message

**Files:**
- Modify: `index.html:1311-1315` (initial chat message)

**Step 1: Update the welcome message**

Find the initial assistant message div and replace it:

```html
<div id="chat-messages" class="chat-messages-full">
    <div class="chat-message-full assistant">
        <div class="chat-message-content-full">Woof! I'm Oscar, your loyal NYC trip companion. Ask me anything about your Jan 14-18 adventure - I've got the whole itinerary memorized! 🐾</div>
    </div>
</div>
```

**Step 2: Verify visually**

Open the app and check the Chat view shows Oscar's welcome message.

**Step 3: Commit**

```bash
git add index.html
git commit -m "feat: update chat welcome message with Oscar intro"
```

---

## Task 6: Wire Up Clear Chat Button

**Files:**
- Modify: `index.html` (in the ChatAgent class, around line 1550)

**Step 1: Add clearHistory method to ChatAgent class**

Add this method inside the `ChatAgent` class (after the `scrollToBottom` method):

```javascript
async clearHistory() {
    try {
        await fetch('/api/chat/clear', { method: 'POST' });

        // Clear UI messages except welcome
        this.messagesEl.innerHTML = `
            <div class="chat-message-full assistant">
                <div class="chat-message-content-full">Woof! I'm Oscar, your loyal NYC trip companion. Ask me anything about your Jan 14-18 adventure - I've got the whole itinerary memorized! 🐾</div>
            </div>
        `;

        showToast('Chat cleared - fresh start!');
    } catch (err) {
        console.error('Failed to clear chat:', err);
        showToast('Failed to clear chat', 'error');
    }
}
```

**Step 2: Add click handler in ChatAgent init method**

In the `init()` method of ChatAgent, add:

```javascript
document.getElementById('clear-chat-btn').addEventListener('click', () => this.clearHistory());
```

**Step 3: Verify functionality**

1. Open the app, go to Chat
2. Send a message
3. Click "Clear" button
4. Verify messages are cleared and toast appears

**Step 4: Commit**

```bash
git add index.html
git commit -m "feat: wire up clear chat button functionality"
```

---

## Task 7: Manual Testing

**Step 1: Test conversation memory**

1. Start the server: `npm start`
2. Go to Chat view
3. Send: "What's for dinner Tuesday?"
4. Send: "What about Wednesday?" (should remember context)
5. Refresh the page
6. Send: "And Thursday?" (should still remember)

**Step 2: Test Oscar's personality**

1. Send: "Hey Oscar, what should I know about Katz's?"
2. Verify response has bulldog personality (occasional puns, friendly tone)

**Step 3: Test update flow**

1. Send: "Change Tuesday dinner to Lombardi's"
2. Verify Oscar offers the update confidently with [UPDATE_AVAILABLE]
3. Click "Update itinerary" button
4. Verify calendar updates

**Step 4: Test clear chat**

1. Send a few messages
2. Click "Clear" button
3. Verify chat resets to welcome message
4. Send new message - should not remember previous context

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete Oscar chatbot implementation"
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Conversation memory in /api/chat |
| 2 | Clear chat endpoint |
| 3 | Oscar persona system prompt |
| 4 | Chat header UI update |
| 5 | Welcome message update |
| 6 | Clear button wiring |
| 7 | Manual testing |
