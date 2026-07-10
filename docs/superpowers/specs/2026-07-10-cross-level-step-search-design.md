# Cross-level step search — design

**Issue:** [#19](https://github.com/mykhailo-melnyk/ae-tracker/issues/19) (improvement, @nacholesci)
**Date:** 2026-07-10
**Status:** Design

## Problem

The tracker shows one level at a time (the focus card, switched via the pill
bar). An engineer who has completed a step that lives in a level other than
their current one has no quick way to find it — they must know which level it's
in and eyeball that level's list. The request: a search bar to find a step
**regardless of level** and mark it done from there.

## Goal

Let a signed-in engineer type a query and see every matching step across all
levels in one list, and tick it done/undone right there — without first
navigating to that step's level.

## Non-goals

- No Worker or API changes. Marking already works for any task id via
  `POST /api/mark` (it does not validate against the current level), so this is
  a **frontend-only** feature.
- No fuzzy matching, ranking, or search-as-you-scroll. Plain case-insensitive
  substring match over title + description.
- No persistence of the query (not stored in the URL or localStorage).
- No search across competencies — only the engineer's own loaded path.

## UX

- A search input lives inside `#signed-in`, above the pill bar
  (`#pill-bar-wrap`). It is shown/hidden together with the path UI: visible only
  once a competency is chosen and the path is loaded (same lifecycle as the pill
  bar in `renderPath` / `showNoCompetency`).
- Placeholder: **"Search all steps across levels…"**. A clear (×) affordance
  resets it.
- **Empty query (default):** normal behavior — pill bar + focus card visible.
- **Non-empty query** (≥1 non-whitespace char): the pill bar and focus card are
  hidden and a results panel takes their place, listing every task whose title
  or description contains the query (case-insensitive), in level order then the
  task order within each level. A header shows the match count
  (e.g. "3 matches"). No matches shows: *No steps match "<query>".*
- Each result row mirrors the focus-card task row — checkbox, title + kind tag +
  estimate, description, external link — plus a **level badge** ("LEVEL n") so
  the engineer knows where it lives. The per-task "⚑ Report / suggest" link is
  omitted from result rows to keep them compact.
- Ticking a result's checkbox calls the existing `toggleTask(taskId)`, which
  persists via `/api/mark` and re-renders. The results panel re-renders in place
  so the row reflects the new state and the totals update.
- Clearing the query restores the single-level view focused on whatever level
  was active before.

## Read-only view

Admins viewing a `?as=` page (`READONLY`) can use search to find a step, but
checkboxes stay non-interactive exactly as elsewhere — `toggleTask` already
returns early when `READONLY`, and `.task` interactivity is governed by the
`body.readonly` styling. No special-casing needed beyond not wiring a click that
would no-op anyway.

## Implementation sketch

- **`public/tracker.html`** — add a search-box wrapper inside `#signed-in`,
  before `#pill-bar-wrap`:
  ```html
  <div class="step-search" id="step-search-wrap">
    <input type="search" id="step-search" placeholder="Search all steps across levels…" autocomplete="off">
  </div>
  ```
- **`public/app.js`**
  - New state `let SEARCH_QUERY = "";`.
  - `renderSearch()` — reads `SEARCH_QUERY`; if empty, unhide `#pill-bar-wrap`
    and `#focus-card` and clear `#search-results`; else hide them and render the
    results panel into a `#search-results` container.
  - A small factory to render a task row is shared between `renderFocusCard` and
    the results panel to avoid divergence (extract the existing task-row
    template into `taskRowHtml(task, {levelBadge})`).
  - Wire the input's `input` event to update `SEARCH_QUERY` and call
    `renderSearch()`.
  - `toggleTask` gains a `renderSearch()` call (alongside the existing
    `renderTotals` / `renderPillBar` / `renderFocusCard`) and the rollback path
    does the same, so a tick from the results list updates in place.
  - `renderPath` shows `#step-search-wrap`; `showNoCompetency` hides it and
    resets `SEARCH_QUERY = ""`.
- **`public/styles.css`** — styles for the search input and the results panel /
  level badge, matching existing tokens.

## Testing

`app.js` has no automated tests (frontend is plain static files). Verify
manually with `npx http-server public -p 8080 -c-1` against local `wrangler
dev`:

1. Typing a term shows matches from multiple levels with correct level badges.
2. Ticking a result marks it done (persists across reload) and updates totals.
3. Clearing the box restores the previously focused level view.
4. A non-matching term shows the empty message.
5. Read-only (`?as=<user>`): search lists results; checkboxes do not toggle.
