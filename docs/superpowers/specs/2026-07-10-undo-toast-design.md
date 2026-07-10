# Undo toast for task toggles — design

**Issue:** [#23](https://github.com/mykhailo-melnyk/ae-tracker/issues/23) (improvement, @andvirga)
**Date:** 2026-07-10
**Status:** Design

## Problem

Ticking a task is a one-click optimistic action that persists immediately. A
misclick silently flips a task's done state (and saves it). The reporter asked
for a confirmation modal on every action; that adds friction to the app's core,
high-frequency interaction. Instead we address the same concern —
recover-from-misclick — with a **non-blocking undo**.

## Goal

After the engineer checks or unchecks a task, briefly show a toast confirming
what happened with an **Undo** action, so an accidental toggle can be reverted
in one click without any modal in the normal flow.

## Non-goals

- No confirmation modal, no blocking dialogs.
- No Worker/API changes. Undo re-uses the existing `toggleTask` → `/api/mark`
  path (a toggle is already reversible).
- Tracker only (`tracker.html` / `app.js`). The certifications page (`cert.js`)
  has its own toggle and is out of scope for this issue; a follow-up could reuse
  the same pattern.
- No toast queue/stacking — one toast at a time.

## Design

- A single fixed toast element lives in `tracker.html`, hidden by default:
  ```html
  <div id="toast" class="toast hidden" role="status" aria-live="polite">
    <span id="toast-msg"></span>
    <button type="button" id="toast-undo">Undo</button>
  </div>
  ```
- **When it shows:** in `toggleTask`, *after the write succeeds*
  (`PROGRESS = await res.json()`), not optimistically. This way the toast only
  appears for changes that actually saved; a failed write keeps the existing
  rollback + `alert` path with no toast.
- **Message:** `Marked as done` when the new state is done, `Marked as not done`
  otherwise.
- **Undo:** the Undo button calls `toggleTask(taskId)` again (flipping back) and
  hides the toast. Undo itself is just another toggle, so it will show its own
  toast ("Marked as not done · Undo") — expected and consistent.
- **Auto-dismiss:** the toast hides after 5s. A new toggle replaces the message
  and resets the timer (clear any pending timeout first). Module state holds the
  active timeout id.
- **Placement:** fixed **bottom-left** (`left: 24px; bottom: 24px`) so it never
  collides with the bottom-right feedback FAB; `z-index: 50` (above the FAB's
  40).
- **Read-only:** `toggleTask` already returns early when `READONLY`, so no toast
  is ever shown in read-only views. No extra guard needed.

## Files

- `public/tracker.html` — add the toast markup.
- `public/app.js` — `showUndoToast(taskId, done)` + `hideToast()`, a
  `TOAST_TIMER` state var, and a call in `toggleTask`'s success path; wire the
  Undo button once (in `init`).
- `public/styles.css` — `.toast` and its button styles.

## Testing

`app.js` has no automated harness (plain static frontend). Verify manually with
`npx http-server public -p 8080 -c-1` + `wrangler dev`:

1. Check a task → toast "Marked as done · Undo" appears bottom-left, auto-hides
   after ~5s.
2. Click Undo → task reverts to not-done, pills/totals update, a new
   "Marked as not done" toast shows.
3. Toggle several tasks quickly → only one toast, always reflecting the latest
   action, timer resets each time.
4. Simulate a failed write (offline) → existing error `alert` fires, no toast.
5. Read-only (`?as=`) → clicking does nothing, no toast.
