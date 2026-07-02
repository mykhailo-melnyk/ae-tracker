# Design: Tracker UI polish (GitHub issue #13)

**Date:** 2026-07-02
**Source:** GitHub issue #13 (feedback from @andvirga, Web competency)

## Summary

Three small, independent display-only changes to the engineer tracker frontend
(`public/`):

1. Replace the text "SOLVD" pill in the navbar with the real Solvd logo.
2. Show the level number in the "Currently at:" line
   (e.g. `Currently at: LEVEL 1 — Understand`).
3. Show a per-task time estimate badge next to each task title
   (e.g. `Tool Setup Guide · 10 min`).

None of these require a Worker change: all three are display-only, and the
frontend fetches curriculum path files live. The aggregate dashboard does not
read the new field.

## 1. Solvd logo in navbar

**Current state:** `tracker.html:11` renders
`<div class="brand">AE Tracker <span class="tag">SOLVD</span></div>`; the pill
is styled at `styles.css:21` (`.topbar .brand .tag`). No image asset exists in
the repo.

**Change:**
- Add asset `public/assets/solvd-logo.svg` (provided by the user).
- `tracker.html`: replace the `<span class="tag">SOLVD</span>` with
  `<img class="brand-logo" src="assets/solvd-logo.svg" alt="Solvd">`, keeping
  "AE Tracker" as the title text. Result: `[Solvd logo]  AE Tracker`.
- `styles.css`: remove `.topbar .brand .tag`; add
  `.brand-logo { height: 22px; width: auto; }`; make `.topbar .brand` a flex
  row (`display:flex; align-items:center; gap:8px;`).
- Apply the same swap to `dashboard.html` if it shares the topbar markup, to
  keep the two pages consistent.

## 2. Level in "Currently at:"

**Current state:** `app.js:303` sets the greeting sub-line to
`"Currently at " + lvl.title` → renders "Currently at Understand".

**Change:** `app.js:303` →
`` `Currently at: LEVEL ${lvl.id.slice(1)} — ${lvl.title}` `` → renders
**"Currently at: LEVEL 1 — Understand"**. `lvl.id` is `L1`, so `.slice(1)` =
`1`, matching the existing pill (`pill-num`) and focus-card (`level-tag`)
convention.

## 3. Per-task time estimate

**Current state:** task objects have no time field. Existing task fields:
`id, kind, title, desc, link, self_assessment`. Only levels carry
`estimated_hours_min` / `estimated_hours_max`.

**Change:**
- **Schema** (`schema/curriculum.path.schema.json`): add an optional integer
  property `estimated_minutes` (`type: integer`, `minimum: 1`) to the task
  object. Optional, so path files without it remain valid.
- **Data**: populate `estimated_minutes` on every task in
  `curriculum.web.json` in this pass. `curriculum.mobile.json` and
  `curriculum.backend.json` are left for a later pass (field is optional).
  Estimates are drafted from task `kind` + content and **flagged for user
  review** before merge.
- **Render** (`app.js`, `renderFocusCard`, ~line 117): when
  `task.estimated_minutes` is present, append a muted badge after the
  kind-tag. Format helper: `< 60` → `"N min"`; `>= 60` →
  `"N.N hr"` trimmed (e.g. `90` → `"1.5 hr"`, `120` → `"2 hr"`).
- **Style** (`styles.css`): add `.task-est` — a subtle muted span
  (smaller/lighter than `.kind-tag`).

## Validation

- `node schema/validate-curriculum.mjs` must still pass. Because
  `estimated_minutes` is optional, mobile/backend path files without it stay
  valid; the web file with it validates against the updated schema.
- Manual check: load `tracker.html` locally, confirm logo renders, the
  "Currently at:" line shows the level, and web tasks show the estimate badge.

## Out of scope

- Mobile/backend per-task estimates (later pass).
- Any Worker/aggregate change — `estimated_minutes` is display-only and not
  read by `worker/`.
- Level-level `estimated_hours_min/max` display (unchanged; the per-task badge
  is additive).

## Open items

- User provides `public/assets/solvd-logo.svg`.
- User sanity-checks the drafted web estimates.
