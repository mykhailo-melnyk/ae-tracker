# Cross-level Step Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in engineer search every step across all levels of their learning path and tick it done/undone from the results, without navigating to that step's level.

**Architecture:** Frontend-only. Add a search input above the pill bar in `tracker.html`. In `app.js`, a `SEARCH_QUERY` state drives a `renderSearch()` function that, when the query is non-empty, hides the pill bar + focus card and renders a flat list of matching tasks (title/description substring match, case-insensitive) across all levels, each with a level badge and a checkbox wired to the existing `toggleTask`. Clearing the query restores the single-level view. No Worker/API changes — `/api/mark` already accepts any task id.

**Tech Stack:** Vanilla HTML/CSS/JS (no framework, no build step). Cloudflare Worker unchanged.

## Global Constraints

- No Worker or API changes; marking uses the existing `POST /api/mark` via `toggleTask`.
- No new dependencies, no build step — plain static files in `public/`.
- Match is case-insensitive substring over task `title` + `desc` only; results ordered by level then task order.
- Query is not persisted (no URL/localStorage).
- Search UI shares the same lifecycle as the pill bar: visible only when a competency is chosen and a path is loaded; hidden otherwise.
- Read-only view (`body.readonly` / `READONLY`): search renders results but checkboxes do not toggle (existing `toggleTask` early-returns).
- `app.js` has no automated test harness; verification is manual via `http-server` + `wrangler dev`.

---

### Task 1: Extract a shared task-row template

Currently `renderFocusCard` builds each task row inline. The search results panel needs the identical row (plus a level badge). Extract the row markup into one helper so the two views never diverge.

**Files:**
- Modify: `public/app.js` (`renderFocusCard`, ~lines 111–154)

**Interfaces:**
- Produces: `function taskRowHtml(task, opts)` where `opts = { levelBadge?: string, report?: boolean }`. Returns the `<div class="task …" data-task="…">…</div>` string. `levelBadge` (e.g. `"L3"`) renders a `<span class="task-level">LEVEL 3</span>` after the title when present; `report` (default `true`) controls whether the "⚑ Report / suggest" button is emitted (omitted for search rows).

- [ ] **Step 1: Add the `taskRowHtml` helper**

Add this function just above `renderFocusCard` in `public/app.js`:

```javascript
// Shared task-row markup used by both the focus card and the search results.
// opts.levelBadge (e.g. "L3") adds a "LEVEL 3" badge after the title;
// opts.report (default true) emits the per-task "Report / suggest" button.
function taskRowHtml(task, opts = {}) {
  const { levelBadge = null, report = true } = opts;
  const isDone = PROGRESS.tasks[task.id]?.done === true;
  const badge = levelBadge ? ` <span class="task-level">LEVEL ${levelBadge.slice(1)}</span>` : "";
  return `
    <div class="task ${isDone ? "done" : ""}" data-task="${task.id}">
      <div class="check"></div>
      <div class="body">
        <div class="title">${task.title} <span class="kind-tag ${task.kind}">${task.kind}</span>${task.estimated_minutes ? `<span class="task-est">· ${formatEstimate(task.estimated_minutes)}</span>` : ""}${badge}</div>
        ${task.desc ? `<div class="desc">${task.desc}</div>` : ""}
        ${task.link ? `<a class="external" href="${task.link}" target="_blank" rel="noopener">${task.link} ↗</a>` : ""}
        ${(!READONLY && report) ? `<div><button type="button" class="task-report">⚑ Report / suggest</button></div>` : ""}
      </div>
    </div>`;
}
```

- [ ] **Step 2: Use the helper in `renderFocusCard`**

Replace the existing `const taskHtml = lvl.tasks.map((task) => { … }).join("");` block in `renderFocusCard` with:

```javascript
  const taskHtml = lvl.tasks.map((task) => taskRowHtml(task)).join("");
```

Leave the rest of `renderFocusCard` (the `.task` event wiring in the `card.querySelectorAll(".task")` loop) unchanged.

- [ ] **Step 3: Verify no behavior change**

Run: `npx http-server public -p 8080 -c-1` (in one terminal) and `cd worker && npm run dev` (in another), open `http://localhost:8080/tracker.html`, sign in, pick a competency.
Expected: the focus card renders exactly as before — task rows, kind tags, estimates, descriptions, links, and the "⚑ Report / suggest" button all present; ticking a checkbox still works.

- [ ] **Step 4: Commit**

```bash
git add public/app.js
git commit -m "refactor: extract shared taskRowHtml helper"
```

---

### Task 2: Add the search box markup and styles

**Files:**
- Modify: `public/tracker.html` (inside `#signed-in`, before `#pill-bar-wrap` at line 46)
- Modify: `public/styles.css` (append a new section)

**Interfaces:**
- Produces: DOM ids `#step-search-wrap` (container, hidden by default via `hidden` class) and `#step-search` (the `<input>`); a `#search-results` container that Task 3 renders into.

- [ ] **Step 1: Add the search markup**

In `public/tracker.html`, between `<div class="competency-picker" id="competency-picker"></div>` (line 44) and `<div class="pill-bar-wrap" …>` (line 46), insert:

```html
    <div class="step-search hidden" id="step-search-wrap">
      <input type="search" id="step-search" placeholder="Search all steps across levels…" autocomplete="off" aria-label="Search all steps across levels">
    </div>
```

Then add the results container immediately after the focus card (after line 47 `<div class="focus-card" id="focus-card"></div>`):

```html
    <div class="search-results" id="search-results"></div>
```

- [ ] **Step 2: Add styles**

Append to `public/styles.css`:

```css
/* ---- Cross-level step search ---- */
.step-search { margin-top: 20px; }
.step-search input {
  width: 100%;
  box-sizing: border-box;
  padding: 11px 14px;
  font-size: 14px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: white;
}
.step-search input:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}
.search-results {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 8px 32px;
  margin-top: 20px;
}
.search-results:empty { display: none; }
.search-results .search-head {
  padding: 14px 0;
  font-size: 13px;
  color: #64748b;
  border-bottom: 1px solid #e2e8f0;
}
.search-results .search-empty { padding: 20px 0; color: #64748b; font-size: 14px; }
.task-level {
  display: inline-block;
  background: #eef2ff;
  color: #3730a3;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  vertical-align: middle;
}
```

- [ ] **Step 3: Verify the box appears**

Reload `http://localhost:8080/tracker.html` with a competency selected.
Expected: after Task 3 wires visibility it will show; for now the box stays hidden (has `hidden` class) and the page is unchanged. Confirm no layout breakage.

- [ ] **Step 4: Commit**

```bash
git add public/tracker.html public/styles.css
git commit -m "feat: search box markup and styles for cross-level search"
```

---

### Task 3: Implement search state, rendering, and wiring

**Files:**
- Modify: `public/app.js` (state near line 1–10; `toggleTask` ~226–252; `renderPath` ~306–316; `showNoCompetency` ~320–330; `init` ~380–388)

**Interfaces:**
- Consumes: `taskRowHtml(task, opts)` (Task 1); ids `#step-search`, `#step-search-wrap`, `#search-results`, `#pill-bar-wrap`, `#focus-card` (Task 2).
- Produces: `function renderSearch()`; `function initSearch()`; module state `let SEARCH_QUERY = "";`.

- [ ] **Step 1: Add search state**

Near the other top-level `let` declarations at the top of `public/app.js` (after `let CURRICULUM = null;`), add:

```javascript
let SEARCH_QUERY = "";     // current cross-level search text (empty = normal view)
```

- [ ] **Step 2: Add `renderSearch` and `initSearch`**

Add these two functions to `public/app.js` (e.g. just after `renderFocusCard`):

```javascript
// Render the cross-level search view. Empty query => normal single-level view.
// Non-empty => hide the pill bar + focus card and list matching tasks from every
// level, each wired to toggleTask.
function renderSearch() {
  const results = document.getElementById("search-results");
  const pillWrap = document.getElementById("pill-bar-wrap");
  const focus = document.getElementById("focus-card");
  const q = SEARCH_QUERY.trim().toLowerCase();
  if (!CURRICULUM || !q) {
    results.innerHTML = "";
    if (CURRICULUM) { pillWrap.classList.remove("hidden"); focus.classList.remove("hidden"); }
    return;
  }
  pillWrap.classList.add("hidden");
  focus.classList.add("hidden");
  const matches = [];
  for (const lvl of CURRICULUM.levels) {
    for (const task of lvl.tasks) {
      const hay = (task.title + " " + (task.desc || "")).toLowerCase();
      if (hay.includes(q)) matches.push({ task, levelId: lvl.id });
    }
  }
  if (!matches.length) {
    results.innerHTML = `<div class="search-empty">No steps match “${SEARCH_QUERY.trim()}”.</div>`;
    return;
  }
  const rows = matches.map((m) => taskRowHtml(m.task, { levelBadge: m.levelId, report: false })).join("");
  results.innerHTML =
    `<div class="search-head">${matches.length} match${matches.length === 1 ? "" : "es"}</div>${rows}`;
  results.querySelectorAll(".task").forEach((el) => {
    el.querySelector(".check").addEventListener("click", () => toggleTask(el.dataset.task));
  });
}

// Wire the search input once.
function initSearch() {
  const input = document.getElementById("step-search");
  input.addEventListener("input", () => { SEARCH_QUERY = input.value; renderSearch(); });
}
```

- [ ] **Step 3: Re-render search on mark**

In `toggleTask`, add `renderSearch();` after each `renderFocusCard();` call — both in the optimistic block (after line ~234) and in the rollback `catch` block (after line ~249). The optimistic block becomes:

```javascript
  PROGRESS.tasks[taskId] = { done: newDone, at: new Date().toISOString() };
  renderTotals();
  renderPillBar();
  renderFocusCard();
  renderSearch();
```

and the rollback block becomes:

```javascript
    PROGRESS.tasks[taskId] = { done: currentlyDone };
    renderTotals();
    renderPillBar();
    renderFocusCard();
    renderSearch();
    alert("Could not save your change. Try again in a moment.");
```

- [ ] **Step 4: Show/hide the search box with the path lifecycle**

In `renderPath`, after `document.getElementById("pill-bar-wrap").classList.remove("hidden");` add:

```javascript
  document.getElementById("step-search-wrap").classList.remove("hidden");
```

In `showNoCompetency`, after `document.getElementById("pill-bar-wrap").classList.add("hidden");` add:

```javascript
  document.getElementById("step-search-wrap").classList.add("hidden");
  SEARCH_QUERY = "";
  const searchInput = document.getElementById("step-search");
  if (searchInput) searchInput.value = "";
  renderSearch();
```

- [ ] **Step 5: Initialize search wiring**

In `init`, in the `if (!READONLY)` block alongside `initFeedback();`, this is engineer-only? No — search should work in read-only too. Instead, call `initSearch();` unconditionally right after `renderCompetencyPicker();` in `init`:

```javascript
  renderCompetencyPicker();
  initSearch();
```

- [ ] **Step 6: Verify end to end**

With `http-server` + `wrangler dev` running, open `http://localhost:8080/tracker.html`, sign in, pick a competency, then:
1. Type a term you know spans multiple levels (e.g. `claude`). Expected: pill bar + focus card hide; results list shows matching steps each with a `LEVEL n` badge and match count.
2. Tick a result whose level is NOT your current level. Expected: checkbox fills, totals increment, row shows done state; reload the page and confirm it persisted.
3. Clear the box. Expected: results disappear, pill bar + focus card return to the previously focused level.
4. Type gibberish (e.g. `zzzzz`). Expected: "No steps match “zzzzz”." message.
5. Visit `http://localhost:8080/tracker.html?as=<some-username>` as an admin (read-only). Expected: search lists results; clicking a checkbox does nothing (no toggle).

- [ ] **Step 7: Typecheck the Worker is untouched**

Run: `cd worker && npm run typecheck`
Expected: passes (no Worker files changed — this is a sanity check that nothing leaked).

- [ ] **Step 8: Commit**

```bash
git add public/app.js
git commit -m "feat: cross-level step search with inline marking (#19)"
```

---

## Self-Review

**Spec coverage:**
- Search input above pill bar, path lifecycle → Task 2 (markup) + Task 3 Step 4. ✓
- Non-empty query hides pill bar/focus card, lists all-level matches with level badge + count → Task 3 Steps 2. ✓
- Case-insensitive substring over title + desc, level order → Task 3 Step 2 (`hay.includes(q)`, nested loop in level order). ✓
- Inline marking via existing `toggleTask` / `/api/mark`, in-place update → Task 3 Steps 2–3. ✓
- Report link omitted from result rows → Task 1 (`report: false` path) + Task 3 Step 2. ✓
- Clearing restores view → Task 3 Step 2 (empty-query branch). ✓
- No-match message → Task 3 Step 2. ✓
- Read-only: results render, no toggle → Task 3 Step 5 (unconditional init) + existing `toggleTask` early-return; verified Task 3 Step 6.5. ✓
- No Worker/API changes → verified Task 3 Step 7. ✓

**Placeholder scan:** No TBD/TODO; all steps carry full code. ✓

**Type consistency:** `taskRowHtml(task, opts)` signature used identically in Task 1 (definition), Task 1 Step 2 (`taskRowHtml(task)`), and Task 3 Step 2 (`taskRowHtml(m.task, { levelBadge, report:false })`). `SEARCH_QUERY`, `renderSearch`, `initSearch` names consistent across Task 3. ✓
