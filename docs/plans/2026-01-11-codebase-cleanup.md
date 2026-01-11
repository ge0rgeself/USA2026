# Codebase Cleanup Implementation Plan

> **For Claude:** This is a cleanup task - execute tasks sequentially, verify each step.

**Goal:** Clean up the NYC trip guide codebase by removing clutter files, unused dependencies, and adding input validation to prepare for future feature development.

**Architecture:** No architectural changes - this is housekeeping. We're removing experimental files, trimming dependencies, and hardening the chat API.

**Tech Stack:** Node.js, Express, npm

---

## Task 1: Delete Clutter Files

**Files to delete:**
- `variant-1-glassy.html` (1,083 lines - experimental design)
- `variant-2-editorial.html` (979 lines - experimental design)
- `variant-3-fluid.html` (1,042 lines - experimental design)
- `variant-4-tactile-editorial.html` (1,392 lines - experimental design)
- `nyc_itinerary.html` (1,989 lines - superseded by index.html)
- `nul` (garbage from failed Windows command)

**Step 1: Delete the files**

```bash
rm -f variant-1-glassy.html variant-2-editorial.html variant-3-fluid.html variant-4-tactile-editorial.html nyc_itinerary.html nul
```

**Step 2: Verify deletion**

```bash
ls *.html
```

Expected output: Only `index.html` and `login.html` remain

---

## Task 2: Remove Unused Dependency

**Files:**
- Modify: `package.json`

**Step 1: Edit package.json to remove @google/generative-ai**

Remove this line from dependencies:
```json
"@google/generative-ai": "^0.24.1",
```

**Step 2: Run npm install to update package-lock.json**

```bash
npm install
```

Expected: Lockfile updates, no errors

**Step 3: Verify removal**

```bash
npm ls @google/generative-ai
```

Expected: "empty" or "not found"

---

## Task 3: Add Input Validation to Chat Endpoint

**Files:**
- Modify: `server.js:141-143`

**Step 1: Add validation after extracting message**

Current code (line 143):
```javascript
const { message } = req.body;
```

Replace with:
```javascript
const { message } = req.body;

if (!message || typeof message !== 'string' || message.trim().length === 0) {
  return res.status(400).json({ error: 'Message cannot be empty' });
}
```

**Step 2: Test the server starts**

```bash
npm start
```

Expected: "Server running on port 8080" (Ctrl+C to stop)

---

## Task 4: Commit and Push

**Step 1: Stage all changes**

```bash
git add -A
```

**Step 2: Check what will be committed**

```bash
git status
```

Expected:
- Deleted: `nyc_itinerary.html`
- Modified: `package.json`, `package-lock.json`, `server.js`
- New: `docs/plans/2026-01-11-codebase-cleanup.md`
- Note: variant files were untracked, so won't show as deleted

**Step 3: Commit**

```bash
git commit -m "chore: cleanup codebase - remove unused files and deps, add input validation

- Delete experimental design variants (variant-1/2/3/4.html)
- Delete superseded nyc_itinerary.html (replaced by index.html)
- Remove unused @google/generative-ai dependency
- Add input validation to /api/chat endpoint
- Add docs/plans directory for future planning

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Step 4: Push to GitHub**

```bash
git push origin main
```

Expected: Success, branch up to date with origin

---

## Summary

| Task | Action | Impact |
|------|--------|--------|
| 1 | Delete 6 files | -6,485 lines, ~270KB saved |
| 2 | Remove unused dep | Cleaner package.json |
| 3 | Add validation | Hardened API endpoint |
| 4 | Commit & push | Changes on GitHub |

**Total time:** ~5 minutes
