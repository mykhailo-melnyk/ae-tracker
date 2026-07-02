# Tracker UI Polish (Issue #13) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the three UI tweaks from GitHub issue #13 — Solvd logo in the navbar, the level number in the "Currently at:" line, and per-task time-estimate badges on the web path.

**Architecture:** Pure static-frontend changes under `public/` (vanilla HTML/CSS/JS, no build step) plus one optional-field addition to the curriculum path JSON schema and the web path data. No Worker code changes; the aggregate does not read the new field and the frontend fetches path files live, so no redeploy is required for the feature to appear.

**Tech Stack:** Plain HTML/CSS/JS, JSON Schema (draft-07) validated by `schema/validate-curriculum.mjs` (Ajv), Node for the validator, `tsc` for the Worker typecheck safety net.

## Global Constraints

- No framework, no bundler — edit `public/*.html`, `public/*.css`, `public/*.js` directly.
- The frontend has **no JS test harness** (Vitest runs only in `worker/`). Automated gates for this work are `node schema/validate-curriculum.mjs` and `cd worker && npm run typecheck`; display-only changes are verified visually via `npx http-server public -p 8080 -c-1`.
- Task IDs stay competency-prefixed (`web-L<n>.T<m>`); do not renumber.
- `estimated_minutes` is an **optional** integer (`minimum: 1`) — mobile/backend path files omit it and must stay valid.
- The base rule `.topbar .brand .tag` in `styles.css` MUST be kept: the dashboard's ADMIN pill (`.tag.admin` in `dashboard.css`) inherits from it. Only the tracker's `SOLVD` span is removed.
- Logo asset already committed at `public/assets/solvd-logo.svg` (viewBox `0 0 698 162`, text outlined, transparent bg).
- All work happens on branch `feature/issue-13-ui-polish`.

---

### Task 1: Solvd logo in the navbar

**Files:**
- Modify: `public/tracker.html:11`
- Modify: `public/dashboard.html:12`
- Modify: `public/styles.css:16-29` (the `.topbar .brand` block; add `.brand-logo`, keep `.tag`)

**Interfaces:**
- Consumes: `public/assets/solvd-logo.svg` (already present).
- Produces: navbar markup with `<img class="brand-logo">`; CSS class `.brand-logo` and a flex `.topbar .brand`.

- [ ] **Step 1: Swap the tracker navbar markup**

In `public/tracker.html` replace line 11:

```html
    <div class="brand">AE Tracker <span class="tag">SOLVD</span></div>
```

with:

```html
    <div class="brand"><img class="brand-logo" src="assets/solvd-logo.svg" alt="Solvd"> AE Tracker</div>
```

- [ ] **Step 2: Add the logo to the dashboard navbar (keep the ADMIN pill)**

In `public/dashboard.html` replace line 12:

```html
    <div class="brand">AE Tracker <span class="tag admin">ADMIN</span></div>
```

with:

```html
    <div class="brand"><img class="brand-logo" src="assets/solvd-logo.svg" alt="Solvd"> AE Tracker <span class="tag admin">ADMIN</span></div>
```

- [ ] **Step 3: Update the brand CSS (flex + logo sizing, keep `.tag`)**

In `public/styles.css` replace the `.topbar .brand` block (lines 16-20):

```css
.topbar .brand {
  font-weight: 700;
  font-size: 16px;
  color: #0f172a;
}
```

with:

```css
.topbar .brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 16px;
  color: #0f172a;
}
.topbar .brand-logo {
  height: 22px;
  width: auto;
  display: block;
}
```

Do **not** touch the following `.topbar .brand .tag` rule (lines 21-29) — the dashboard ADMIN pill depends on it.

- [ ] **Step 4: Visually verify both pages**

Run: `npx http-server public -p 8080 -c-1`
Open `http://localhost:8080/tracker.html` and `http://localhost:8080/dashboard.html`.
Expected: the "solvd" wordmark renders ~22px tall to the left of "AE Tracker" on both pages; the dashboard still shows the purple `ADMIN` pill; no layout jump or overflow in the topbar. Stop the server (Ctrl-C) when done.

- [ ] **Step 5: Commit**

```bash
git add public/tracker.html public/dashboard.html public/styles.css
git commit -m "feat(tracker): show Solvd logo in navbar (#13)"
```

---

### Task 2: Level number in the "Currently at:" line

**Files:**
- Modify: `public/app.js:303` (inside `renderPath()`)

**Interfaces:**
- Consumes: `lvl.id` (e.g. `"L1"`) and `lvl.title` from the composed curriculum.
- Produces: the greeting sub-line string `Currently at: LEVEL <n> — <title>`.

- [ ] **Step 1: Change the greeting sub-line format**

In `public/app.js` replace line 303:

```js
  document.getElementById("greeting-sub").textContent = lvl ? "Currently at " + lvl.title : "";
```

with:

```js
  document.getElementById("greeting-sub").textContent = lvl ? `Currently at: LEVEL ${lvl.id.slice(1)} — ${lvl.title}` : "";
```

- [ ] **Step 2: Visually verify**

Run: `npx http-server public -p 8080 -c-1`
Sign in (or view a user with a competency selected) at `http://localhost:8080/tracker.html`.
Expected: the sub-line reads e.g. **"Currently at: LEVEL 1 — Understand"** (level number matches the highlighted pill). Stop the server when done.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat(tracker): show level number in 'Currently at:' line (#13)"
```

---

### Task 3: Per-task time-estimate badges (schema + web data + render)

**Files:**
- Modify: `schema/curriculum.path.schema.json:28-35` (task `properties`)
- Modify: `public/curriculum.web.json` (add `estimated_minutes` to every task)
- Modify: `public/app.js` (add `formatEstimate` helper; render badge in `renderFocusCard`, ~line 117)
- Modify: `public/styles.css` (add `.task-est`, after the `.kind-tag` rules ~line 226)

**Interfaces:**
- Consumes: `task.estimated_minutes` (optional integer) from the path file.
- Produces: global helper `formatEstimate(min: number): string`; CSS class `.task-est`; schema property `estimated_minutes`.

- [ ] **Step 1: Add the optional `estimated_minutes` property to the schema**

In `schema/curriculum.path.schema.json`, inside the task `properties` object (currently lines 28-35), add the `estimated_minutes` line so the block reads:

```json
              "properties": {
                "id": { "type": "string", "pattern": "^[a-z0-9_-]+-L[1-5]\\.T[0-9]+$" },
                "kind": { "type": "string", "enum": ["practice", "course", "checkpoint", "reading", "video"] },
                "title": { "type": "string", "minLength": 1 },
                "desc": { "type": "string" },
                "link": { "type": "string", "format": "uri" },
                "self_assessment": { "type": "boolean" },
                "estimated_minutes": { "type": "integer", "minimum": 1 }
              }
```

- [ ] **Step 2: Run the validator to confirm the schema change is valid and existing data still passes**

Run: `node schema/validate-curriculum.mjs`
Expected: exits 0, prints the success summary (all path files valid). `estimated_minutes` is optional, so `curriculum.web.json` (no field yet) and mobile/backend all still pass.

- [ ] **Step 3: Add `estimated_minutes` to every task in `public/curriculum.web.json`**

Add an `estimated_minutes` integer to each task object using these drafted values (minutes of focused time-on-task; **flagged for user review**). Match by task `id`:

| id | kind | estimated_minutes |
|---|---|---|
| web-L1.T5 | reading | 10 |
| web-L1.T17 | practice | 15 |
| web-L1.T6 | reading | 10 |
| web-L1.T7 | reading | 20 |
| web-L1.T8 | reading | 30 |
| web-L1.T18 | reading | 15 |
| web-L1.T19 | reading | 10 |
| web-L1.T1 | practice | 30 |
| web-L1.T2 | practice | 15 |
| web-L1.T13 | video | 210 |
| web-L1.T14 | reading | 10 |
| web-L1.T15 | course | 90 |
| web-L1.T9 | course | 60 |
| web-L1.T10 | course | 60 |
| web-L1.T11 | course | 60 |
| web-L1.T12 | course | 60 |
| web-L1.T3 | course | 120 |
| web-L1.T4 | checkpoint | 10 |
| web-L1.T16 | checkpoint | 60 |
| web-L2.T6 | reading | 20 |
| web-L2.T7 | reading | 20 |
| web-L2.T8 | reading | 20 |
| web-L2.T15 | reading | 15 |
| web-L2.T9 | reading | 20 |
| web-L2.T1 | practice | 30 |
| web-L2.T2 | practice | 30 |
| web-L2.T3 | practice | 20 |
| web-L2.T18 | practice | 45 |
| web-L2.T4 | course | 90 |
| web-L2.T5 | checkpoint | 10 |
| web-L2.T10 | reading | 20 |
| web-L2.T11 | reading | 20 |
| web-L2.T16 | reading | 10 |
| web-L2.T17 | checkpoint | 10 |
| web-L2.T12 | reading | 15 |
| web-L2.T13 | course | 90 |
| web-L2.T14 | checkpoint | 90 |
| web-L3.T5 | reading | 20 |
| web-L3.T11 | reading | 15 |
| web-L3.T6 | reading | 15 |
| web-L3.T1 | practice | 45 |
| web-L3.T2 | practice | 30 |
| web-L3.T3 | course | 45 |
| web-L3.T4 | checkpoint | 10 |
| web-L3.T7 | reading | 25 |
| web-L3.T12 | reading | 15 |
| web-L3.T8 | course | 90 |
| web-L3.T9 | course | 90 |
| web-L3.T10 | checkpoint | 120 |
| web-L4.T6 | reading | 30 |
| web-L4.T7 | reading | 25 |
| web-L4.T8 | reading | 15 |
| web-L4.T9 | reading | 30 |
| web-L4.T1 | practice | 30 |
| web-L4.T2 | practice | 30 |
| web-L4.T3 | practice | 60 |
| web-L4.T4 | course | 60 |
| web-L4.T10 | course | 60 |
| web-L4.T5 | checkpoint | 10 |
| web-L4.T11 | reading | 25 |
| web-L4.T12 | reading | 25 |
| web-L4.T13 | reading | 20 |
| web-L4.T14 | reading | 15 |
| web-L4.T15 | course | 90 |
| web-L4.T16 | course | 90 |
| web-L4.T17 | course | 90 |
| web-L4.T18 | checkpoint | 180 |
| web-L5.T5 | reading | 15 |
| web-L5.T1 | practice | 30 |
| web-L5.T2 | practice | 45 |
| web-L5.T3 | course | 150 |
| web-L5.T6 | course | 90 |
| web-L5.T7 | course | 90 |
| web-L5.T4 | checkpoint | 10 |
| web-L5.T8 | course | 90 |
| web-L5.T9 | checkpoint | 90 |
| web-L5.T10 | checkpoint | 180 |

Example — `web-L1.T5` becomes:

```json
{
  "id": "web-L1.T5",
  "kind": "reading",
  "title": "Tool Setup Guide",
  "desc": "Install Claude Code (and iTerm 2 on macOS). After this you can install everything else by pasting prompts into Claude Code. Plan ~10 minutes for the manual bootstrap, then come back here.",
  "link": "https://github.com/solvdinc/agentic-engineering/blob/main/general/getting-started/tool-setup.md",
  "estimated_minutes": 10
}
```

- [ ] **Step 4: Run the validator to confirm the web data is valid against the updated schema**

Run: `node schema/validate-curriculum.mjs`
Expected: exits 0 with the success summary. If it fails, read the Ajv error (likely a task missing the integer or a typo in the property name) and fix.

- [ ] **Step 5: Add the `formatEstimate` helper to `public/app.js`**

Add this function near the other pure helpers (e.g. immediately before `renderFocusCard`, ~line 104):

```js
// Render an estimated-minutes value as a short human string: "10 min" or "1.5 hr".
function formatEstimate(min) {
  if (min < 60) return min + " min";
  const hrs = min / 60;
  return (Number.isInteger(hrs) ? hrs : hrs.toFixed(1)) + " hr";
}
```

- [ ] **Step 6: Render the badge in the task title line**

In `public/app.js`, in `renderFocusCard`, change the title line (currently line 117):

```js
          <div class="title">${task.title} <span class="kind-tag ${task.kind}">${task.kind}</span></div>
```

to:

```js
          <div class="title">${task.title} <span class="kind-tag ${task.kind}">${task.kind}</span>${task.estimated_minutes ? `<span class="task-est">· ${formatEstimate(task.estimated_minutes)}</span>` : ""}</div>
```

- [ ] **Step 7: Style the badge**

In `public/styles.css`, after the `.kind-tag` colour rules (after line 226), add:

```css
.task-est {
  color: #94a3b8;
  font-size: 12px;
  font-weight: 500;
  margin-left: 6px;
}
```

- [ ] **Step 8: Confirm the Worker still typechecks (it imports the path JSON)**

Run: `cd worker && npm run typecheck`
Expected: exits 0. The added JSON field is additive and unused by the Worker, so `tsc` passes.

- [ ] **Step 9: Visually verify the badges**

Run: `npx http-server public -p 8080 -c-1`
Open `http://localhost:8080/tracker.html`, sign in as a web-competency user, click through the level pills.
Expected: each task title shows a muted badge, e.g. `Tool Setup Guide  [reading]  · 10 min`; the Karpathy video shows `· 3.5 hr`; `AI Fluency` shows `· 2 hr`. No badge would appear for a task without the field (none in web). Stop the server when done.

- [ ] **Step 10: Commit**

```bash
git add schema/curriculum.path.schema.json public/curriculum.web.json public/app.js public/styles.css
git commit -m "feat(tracker): per-task time-estimate badges on the web path (#13)"
```

---

## Notes for the reviewer / follow-ups

- The drafted `estimated_minutes` are conservative focused-time figures and intentionally do **not** sum to each level's more generous `estimated_hours_min/max` range (which includes buffer and full external-course durations). Confirm the numbers read sensibly; they are the one subjective part of this plan.
- Mobile and backend path files are left without `estimated_minutes` in this pass; the field is optional so they remain valid and simply show no badge.
- No `wrangler deploy` is required: the aggregate never reads `estimated_minutes` and the frontend loads path files directly from Pages.
