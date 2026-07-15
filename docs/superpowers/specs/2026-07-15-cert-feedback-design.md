# Feedback entry points on the certification page

**Issue:** [#37](https://github.com/mykhailo-melnyk/ae-tracker/issues/37) — request from @martin-daprotis to add the report/suggest buttons to the Claude certification page.

## Goal

Give `public/cert.html` full parity with the tracker's feedback UI:

- a floating **"⚑ Feedback"** button (general feedback, no task scope), and
- a per-prep-item **"⚑ Report / suggest"** link on each certification item.

Teach the backend `/api/feedback` to accept **certification item IDs** so a
per-item report from the cert page does not 400 (today it only accepts known
curriculum task IDs).

## Background

The feedback modal markup and CSS already exist and are reused across pages:

- The modal styles (`.fb-*`) and the FAB style (`.feedback-fab`) live in the
  shared `public/styles.css`, which `cert.html` already loads.
- On the tracker there are two entry points: the per-task `⚑ Report / suggest`
  link (rendered per task in `app.js`) and the floating `#feedback-open` FAB
  (revealed for signed-in, non-readonly engineers).
- `/api/feedback` (`worker/src/api.ts:handleApiFeedback`) validates a submitted
  `task_id` via `curriculum.taskInfo(...)` and returns **400** for any id that
  is not a known curriculum task. Certification item IDs (`ccc.*`, etc.) are
  **not** curriculum tasks, so the cert page's per-item report needs backend
  support.

The cert page is signed-in only and has **no read-only / view-as-someone-else
mode** (unlike the tracker), so its feedback entry points are always eligible
when the page renders.

## Tier 1 — Backend (`worker/`)

### `src/certifications.ts`

Add a flat item index mirroring `curriculum.ts`'s `TASK_INDEX`:

- Extend the internal `PathFile` interface to carry section `title` and item
  `title` (already present in the JSON path files; just typed for use here).
- Build an item-id → info map across every imported cert path file.
- Export:

  ```ts
  export interface CertItemInfo {
    certId: string;
    certLabel: string;
    sectionTitle: string;
    title: string;
  }
  export function certItemInfo(itemId: string): CertItemInfo | null;
  ```

  `certLabel` resolves from the registry (reuse the existing `certLabel(id)`),
  falling back to the cert id if unknown.

### `src/api.ts` — `handleApiFeedback`

When `task_id` is present (after the existing type / length ≤ 32 checks):

1. Try `curriculum.taskInfo(task_id)` (unchanged path). On a hit, keep today's
   `**Task:** <id> — <title> (Level N)` enrichment line.
2. On a miss, try `certifications.certItemInfo(task_id)`. On a hit, enrich with:

   ```
   **Certification:** <certLabel>
   **Item:** <id> — <title> (<sectionTitle>)
   ```

3. If **both** miss → **400** (genuinely-unknown ids still reject).

The submitter's `**Competency:**` line and the `[type] <id> — <summary>` title
prefix are unchanged for both cases.

### Tests — `worker/test/feedback.test.ts`

- Add a case: a valid **cert item id** produces a 200 + the issue body carries
  the `**Certification:**` / `**Item:**` enrichment.
- Confirm a bogus id (neither curriculum nor cert) still returns **400** (the
  existing "unknown task_id" test already covers the shape; add/extend as
  needed).

## Tier 2 — Frontend (`public/`)

The meaningful duplication is the ~85 lines of modal JS in `app.js`. Both pages
already share `auth.js`, so extracting a shared module is consistent with the
existing structure.

### New file: `public/feedback.js`

Holds the module-level `FB_TASK` / `FB_TYPE` state and the four functions moved
verbatim from `app.js`: `openFeedback(taskId)`, `closeFeedback()`,
`submitFeedback()`, `initFeedback()`.

Constraints (plain `<script>` tags share one global scope — no bundler):

- It must **not** redeclare any identifier that `app.js` or `cert.js` already
  declares at top level (`WORKER`, `PROGRESS`, `apiFetch`, …). It *uses* the
  existing global `WORKER` and `apiFetch` (from `auth.js`); it does not declare
  them.
- `openFeedback` no longer references `READONLY` (an `app.js`-only global). This
  is safe: on the tracker the entry points are already gated by their callers
  (the per-task button is only rendered when `!READONLY`; the FAB is only
  revealed in the non-readonly branch), so tracker behavior is unchanged.

`showUndoToast` / `hideToast` stay in `app.js` — they are tracker-only toast
helpers, not feedback logic.

### `public/app.js`

Remove the `FB_TASK` / `FB_TYPE` globals and the four feedback functions (now in
`feedback.js`). All existing call sites (`openFeedback(...)`, `initFeedback()`,
the per-task button wiring, the FAB reveal) are unchanged.

### `public/tracker.html`

Add `<script src="feedback.js"></script>` **before** `app.js`. Modal + FAB
markup stay as-is.

### `public/cert.html`

- Add the floating FAB button (`#feedback-open`, `.feedback-fab hidden`) and the
  `#feedback-modal` markup, copied from `tracker.html`.
- Add `<script src="feedback.js"></script>` **before** `cert.js`.

### `public/cert.js`

- In `renderBody`, render a `<button type="button" class="task-report">⚑ Report
  / suggest</button>` inside each item's `.body`.
- After `renderBody` wires the check toggles, wire each `.task-report` click to
  `openFeedback(el.dataset.item)` with `e.stopPropagation()` (parity with the
  tracker; the check toggle is on `.check` only, so this is belt-and-suspenders).
- In `init()`, after `#cert-app` is shown for an enabled engineer: reveal the
  FAB (`#feedback-open` → remove `hidden`) and call `initFeedback()`.

## Deploy

- **Frontend:** merges to `main` → Pages auto-deploys `public/**`.
- **Backend:** `wrangler deploy` from `worker/` (not in CI) so the aggregate and
  the extended `/api/feedback` pick up the cert item index.

One feature branch `feature/issue-37-cert-feedback` and one PR referencing #37;
PR body ends with the Claude Code footer.

## Out of scope

- No change to how cert progress is stored or marked (`/api/mark` already
  accepts cert ids).
- No new feedback types or fields; reuses the existing `{type, message,
  task_id?}` contract.
