# NYC Trip Planner - Testing Checklist

## Quick Test Guide
Use this checklist when testing features or after deployments.

---

## 🔐 Authentication & Session

- [ ] **Login Page** - Navigate to app, verify redirect to `/login`
  - [ ] "Sign in with Google" button visible and clickable
  - [ ] Design matches editorial theme (warm cream background)
  - [ ] Mobile responsive (375px width)
  - [ ] No console errors

- [ ] **OAuth Flow** (requires real Google credentials)
  - [ ] Click "Sign in with Google"
  - [ ] Google consent screen appears
  - [ ] After approval, redirected to main app
  - [ ] Session cookie set (check browser DevTools)

- [ ] **Session Persistence**
  - [ ] Refresh page → stays logged in
  - [ ] Close tab/reopen → still logged in (7-day cookie)
  - [ ] Click "Sign Out" → redirected to login
  - [ ] After logout, accessing `/` redirects to login

---

## 📅 Calendar View

### Display
- [ ] All 5 days load (Jan 14-18)
- [ ] Day selector buttons show (14, 15, 16, 17, 18)
- [ ] Currently selected day is highlighted
- [ ] Clicking different days updates:
  - [ ] Header with correct date and day name
  - [ ] Event list shows correct day's items
  - [ ] All events visible without horizontal scroll

### Events
- [ ] Items display with dots (timeline markers)
- [ ] Each item shows: title, type badge, time
- [ ] Optional items marked with blue "OPTIONAL" badge
- [ ] Fallback items marked appropriately

### Expanded View
- [ ] Click item to expand → shows full details
- [ ] Click again to collapse
- [ ] Enrichment data displays:
  - [ ] Address (if available)
  - [ ] Hours/operating times
  - [ ] Price range
  - [ ] Tip/recommendation (singular "tip", not "tips")
  - [ ] Lightbulb emoji (💡) for tip indicator
- [ ] "Directions" button links to Google Maps
- [ ] "Edit" button allows inline editing

### Mobile View
- [ ] Calendar responsive at 375px width
- [ ] Day buttons scroll horizontally without breaking
- [ ] Expanded items don't overflow
- [ ] Bottom nav tabs (Calendar/Chat) don't overlap content

---

## 🗒️ Editor View

- [ ] Switch to Editor tab
- [ ] itinerary.txt content displays in editable area
- [ ] Make a small test edit (e.g., add a note)
- [ ] Click Save button
- [ ] Verify:
  - [ ] File is updated on server
  - [ ] Parser re-processes the content
  - [ ] Switch to Calendar → changes appear
  - [ ] New items show enrichment (wait 2-3 seconds for background enrichment)

### Parser Validation
- [ ] Correct time format: `7:30pm`, `4-6pm`, `morning`
- [ ] Optional items: suffix with `(optional)`
- [ ] Fallback items: prefix with `fallback:`
- [ ] Day headers: `# Jan 14 (Tue) - Title`

---

## 💬 Chat (Oscar)

- [ ] Switch to Chat tab
- [ ] Oscar's welcome message shows: "Woof! I'm Oscar..."
- [ ] Suggested prompts appear: "Tuesday plans", "Dinner spots", "Near hotel"

### Basic Chat
- [ ] Type greeting (e.g., "Hi Oscar")
- [ ] Oscar responds in bulldog personality
- [ ] Message appears in conversation history

### Function Calling
Test Oscar's ability to use tools:

- [ ] **Search Places**: "What restaurants are near Times Square?"
  - [ ] Oscar searches and returns results
  - [ ] Results include address, hours, rating

- [ ] **Get Itinerary**: "What's on the schedule for Jan 15?"
  - [ ] Oscar reads the day and lists events
  - [ ] Times and descriptions are accurate

- [ ] **Get Preferences**: "Do we have any dietary restrictions?"
  - [ ] Oscar reads preferences.md
  - [ ] Returns dietary info from preferences

- [ ] **Update Itinerary**: "Add lunch at Balthazar on Jan 15 at noon"
  - [ ] Oscar confirms the update
  - [ ] Item appears in Calendar view
  - [ ] Enrichment runs in background

### Conversation Memory
- [ ] Multiple messages maintain context
- [ ] Oscar remembers earlier parts of conversation
- [ ] Up to ~20 messages per session

### Clear Chat
- [ ] Click "Clear" button
- [ ] Conversation history deleted
- [ ] Fresh chat starts with welcome message

---

## ✨ Enrichment Data

### Data Structure
- [ ] All items have `enrichment` object in JSON
- [ ] No items have broken/incomplete enrichment
- [ ] Field names use singular `tip` (not `tips`)

### Enrichment Fields
Verify these fields are populated (where applicable):

- [ ] `name` - Place name
- [ ] `hook` - 1-2 sentence description
- [ ] `tip` - Insider recommendation (singular!)
- [ ] `address` - Full street address
- [ ] `neighborhood` - Area (e.g., "Lower East Side")
- [ ] `hours` - Operating hours with day-specific times
- [ ] `price` - Price level (e.g., "$$")
- [ ] `website` - Official URL
- [ ] `mapsUrl` - Google Maps link

### Walking Routes
For walking route items:
- [ ] `isWalkingRoute: true` is set
- [ ] `distance` field shows miles/kilometers
- [ ] `duration` field shows time estimate
- [ ] `waypoints` array lists key stops
- [ ] `routeUrl` has valid Google Maps link

### Activities (No Place Data)
Items like "Check-in and walk..." should still show:
- [ ] `hook` field with description (e.g., "Settle in, then discover...")
- [ ] Other fields can be null
- [ ] Display doesn't break with missing data

---

## 🌐 Network & Performance

- [ ] Open DevTools → Network tab
- [ ] Verify single `/api/itinerary` request on load
- [ ] Response time < 2 seconds
- [ ] No failed requests (no 404s, 500s)
- [ ] Console has no errors or warnings
- [ ] Page load time < 3 seconds

---

## 📱 Responsive Design

### Desktop (1280x800)
- [ ] All content visible without scroll
- [ ] Typography readable (16px+ body text)
- [ ] Buttons easily clickable (48px+ target)

### Tablet (768x1024)
- [ ] Layout adapts gracefully
- [ ] Day buttons stack if needed
- [ ] Expanded events don't overlap nav

### Mobile (375x667)
- [ ] All content stacks vertically
- [ ] No horizontal scroll
- [ ] Bottom nav tabs accessible
- [ ] Expandable items don't overflow
- [ ] Tap targets are 48px+

---

## 🎨 Design & Styling

- [ ] Background color: Warm cream (`#f8f6f3`)
- [ ] Text color: Dark (`#1a1a1a`)
- [ ] Accent color: Coral (`#c9463d`) for active states
- [ ] Fonts load:
  - [ ] Playfair Display (serif, headings)
  - [ ] DM Sans (sans-serif, body)
- [ ] No missing/broken images
- [ ] Consistent spacing and padding
- [ ] Card shadows subtle and consistent

---

## 🔧 Development Setup

- [ ] `npm install` completes with 0 vulnerabilities
- [ ] `npm start` launches server on port 8080
- [ ] App loads at `http://localhost:8080/login`
- [ ] No console errors during startup
- [ ] All Google Fonts load correctly

---

## 🚀 Deployment

- [ ] `git push origin main` triggers GitHub Actions
- [ ] Deployment completes in ~2 minutes
- [ ] Cloud Run service shows "Serving traffic"
- [ ] Live app at https://nyc-trip-522204863154.us-central1.run.app works
- [ ] No errors in Cloud Run logs:
  ```bash
  gcloud run services logs read nyc-trip --region us-central1 --limit 50
  ```

---

## 🐛 Common Issues & Fixes

| Issue | Cause | Solution |
|-------|-------|----------|
| OAuth fails locally | Callback URL mismatch (expected) | Test only on production |
| Enrichment not showing | Gemini API key missing | Check Cloud Run secrets |
| Session lost on refresh | Cookie not set | Check browser cookie settings |
| Day navigation doesn't work | State sync bug | Check calendar.js render logic |
| Chat errors | Oscar API calls fail | Check Gemini/Maps API keys |
| Parser errors | Itinerary.txt format | See CLAUDE.md > Itinerary Format |

---

## ✅ Pre-Release Checklist

Before deploying to production:

- [ ] All items in this checklist pass
- [ ] No console errors in any view
- [ ] Network requests all successful (no 5xx errors)
- [ ] Enrichment coverage: 100% or documented reason for gaps
- [ ] OAuth works with both whitelisted emails
- [ ] Day navigation works for all 5 days
- [ ] Chat function calling works (all 4 tools)
- [ ] Mobile view tested on actual device
- [ ] Ran `npm test` (when tests exist)
- [ ] Updated CHANGELOG with new features/fixes
- [ ] Pinged team members to test before release

---

## 📊 Enrichment Audit

Run this to check enrichment coverage:

```bash
node tools/check_enrichment.js
```

Expected output: All items enriched, zero gaps.

---

## 🎯 Performance Targets

- **Page load:** < 3 seconds
- **API response:** < 1 second
- **Calendar render:** < 500ms
- **Chat response:** < 2 seconds
- **Enrichment:** < 30 seconds (background)

---

## 📝 Notes

- **Local OAuth:** Won't work locally due to callback URL mismatch. Test on production only.
- **Session duration:** 7 days. After 7 days, user must re-authenticate.
- **Enrichment timing:** New items take 2-3 seconds to enrich in background. UI updates automatically.
- **GCS updates:** All itinerary changes saved to Google Cloud Storage (no local DB).
- **Conversation memory:** Chat maintains up to 20 messages per session. Cleared on browser restart or manual clear.
