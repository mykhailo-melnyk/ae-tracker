# Undo Toast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a task check/uncheck saves, show a non-blocking "Marked as done/not done · Undo" toast so an accidental toggle can be reverted in one click.

**Architecture:** Frontend-only. Add a fixed toast element to `tracker.html`. In `app.js`, after `toggleTask` persists successfully, call `showUndoToast(taskId, done)`, which sets the message, wires Undo to re-call `toggleTask(taskId)`, shows the toast, and starts a 5s auto-dismiss (replacing any prior timer). No Worker/API changes — Undo is just another toggle.

**Tech Stack:** Vanilla HTML/CSS/JS, no build step. Worker unchanged.

## Global Constraints

- No Worker/API changes; Undo re-uses existing `toggleTask` → `POST /api/mark`.
- Tracker only (`tracker.html`/`app.js`/`styles.css`); cert page out of scope.
- Toast shows only after a **successful** write; failed writes keep the existing rollback + `alert`, no toast.
- One toast at a time; a new toggle replaces the message and resets the 5s timer.
- Bottom-center placement (`left: 50%; transform: translateX(-50%); bottom: 24px`, `z-index: 50`) — conventional undo-snackbar spot, clear of the bottom-right feedback FAB.
- Read-only views never show a toast (`toggleTask` early-returns on `READONLY`).
- `app.js` has no automated test harness; verification is manual.

---

### Task 1: Toast markup and styles

**Files:**
- Modify: `public/tracker.html` (add toast before the feedback modal, ~line 50)
- Modify: `public/styles.css` (append)

**Interfaces:**
- Produces: DOM ids `#toast` (container, `hidden` by default), `#toast-msg` (message span), `#toast-undo` (Undo button).

- [ ] **Step 1: Add markup**

In `public/tracker.html`, immediately after the `#feedback-open` button line (the floating feedback FAB) and before `<div id="feedback-modal" …>`, insert:

```html
  <div id="toast" class="toast hidden" role="status" aria-live="polite">
    <span id="toast-msg"></span>
    <button type="button" id="toast-undo">Undo</button>
  </div>
```

- [ ] **Step 2: Add styles**

Append to `public/styles.css`:

```css
/* ---- Undo toast ---- */
.toast {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: 24px;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 14px;
  background: #0f172a;
  color: white;
  padding: 12px 16px;
  border-radius: 10px;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.35);
  font-size: 14px;
}
.toast-undo, #toast-undo {
  background: none;
  border: none;
  color: #93c5fd;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}
.toast-undo:hover, #toast-undo:hover { color: #bfdbfe; text-decoration: underline; }
```

- [ ] **Step 3: Verify it renders when un-hidden**

Run `npx http-server public -p 8080 -c-1`. In devtools console on the tracker page, run `document.getElementById('toast').classList.remove('hidden')`.
Expected: a dark toast appears bottom-center with an "Undo" text button; it does not overlap the bottom-right feedback button.

- [ ] **Step 4: Commit**

```bash
git add public/tracker.html public/styles.css
git commit -m "feat: undo toast markup and styles (#23)"
```

---

### Task 2: Toast logic and wiring

**Files:**
- Modify: `public/app.js` (state near line 1–8; `toggleTask` success path; `init`)

**Interfaces:**
- Consumes: ids `#toast`, `#toast-msg`, `#toast-undo` (Task 1); existing `toggleTask(taskId)`.
- Produces: `function showUndoToast(taskId, done)`, `function hideToast()`, module state `let TOAST_TIMER = null;`.

- [ ] **Step 1: Add toast state**

After the other top-level `let` declarations at the top of `public/app.js` (e.g. after `let FB_TYPE = "bug";`), add:

```javascript
let TOAST_TIMER = null;  // pending auto-dismiss timeout for the undo toast
```

- [ ] **Step 2: Add `showUndoToast` and `hideToast`**

Add these functions to `public/app.js` (e.g. just below `closeFeedback`):

```javascript
// Show a non-blocking "Marked as done/not done · Undo" toast after a toggle
// saves. Undo re-toggles the same task. One toast at a time; each call resets
// the 5s auto-dismiss timer.
function showUndoToast(taskId, done) {
  const toast = document.getElementById("toast");
  document.getElementById("toast-msg").textContent = done ? "Marked as done" : "Marked as not done";
  const undo = document.getElementById("toast-undo");
  undo.onclick = () => { hideToast(); toggleTask(taskId); };
  toast.classList.remove("hidden");
  if (TOAST_TIMER) clearTimeout(TOAST_TIMER);
  TOAST_TIMER = setTimeout(hideToast, 5000);
}

function hideToast() {
  if (TOAST_TIMER) { clearTimeout(TOAST_TIMER); TOAST_TIMER = null; }
  document.getElementById("toast").classList.add("hidden");
}
```

- [ ] **Step 3: Show the toast on successful save**

In `toggleTask`, in the `try` block right after `PROGRESS = await res.json();`, add:

```javascript
    showUndoToast(taskId, newDone);
```

so the success path reads:

```javascript
    if (!res.ok) throw new Error("mark failed: " + res.status);
    PROGRESS = await res.json();
    showUndoToast(taskId, newDone);
```

Leave the `catch` (rollback + `alert`) unchanged — no toast on failure.

- [ ] **Step 4: Verify end to end**

With `http-server` + `wrangler dev` running, sign in, pick a competency:
1. Check a task → "Marked as done · Undo" toast appears bottom-center, disappears after ~5s.
2. Click Undo before it dismisses → task reverts, totals/pills update, a "Marked as not done" toast shows.
3. Toggle 3 tasks in quick succession → only one toast visible, showing the last action; timer resets each time.
4. (Optional) Go offline in devtools, toggle a task → error `alert` fires, no toast.

- [ ] **Step 5: Typecheck sanity**

Run: `cd worker && npm run typecheck`
Expected: passes (no Worker files touched).

- [ ] **Step 6: Commit**

```bash
git add public/app.js
git commit -m "feat: wire undo toast into task toggle (#23)"
```

---

## Self-Review

**Spec coverage:**
- Toast markup/placement/z-index bottom-center → Task 1. ✓
- Shows after successful write only → Task 2 Step 3 (inside `try`, after `res.json()`). ✓
- Message done/not-done → Task 2 Step 2. ✓
- Undo re-toggles + hides → Task 2 Step 2 (`undo.onclick`). ✓
- 5s auto-dismiss, one toast, timer reset → Task 2 Steps 1–2 (`TOAST_TIMER`, clear+set). ✓
- No toast on failure → Task 2 Step 3 (catch unchanged). ✓
- Read-only safe → `toggleTask` early-return, unchanged. ✓
- No Worker/API changes → Task 2 Step 5 typecheck. ✓

**Placeholder scan:** none. ✓

**Type consistency:** `showUndoToast(taskId, done)` / `hideToast()` / `TOAST_TIMER` names used consistently across Task 2; ids match Task 1. Undo wiring uses `undo.onclick` (not a duplicate addEventListener) so re-renders don't stack handlers. ✓

**Note:** Undo button handler is set via `onclick` (idempotent assignment) rather than `addEventListener`, so repeated `showUndoToast` calls never stack duplicate listeners.
