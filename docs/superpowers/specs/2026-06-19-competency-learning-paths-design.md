# Per-competency learning paths + competency-scoped dashboard

**Status:** Design approved
**Date:** 2026-06-19

## Problem

Today `competency` (web / mobile / backend) is only a *tag* on an engineer. Every
engineer follows the same flat curriculum (`public/curriculum.json` → one `levels[]`
array of ~67 tasks), and the dashboard's competency pills filter only the engineers
table — KPIs, the level-distribution bars, and the completion accordion ignore
competency entirely.

We want competency to drive a real **learning path** (different tasks per competency,
same five levels) and we want the dashboard to filter **whole-page** by competency.

## Decisions (locked)

1. **Path structure:** same five levels (L1–L5, Understand → Architecture) for every
   competency; the tasks *inside* each level differ per competency. Levels stay
   comparable across competencies, so the "All" dashboard view remains meaningful.
2. **Storage:** one file per competency (`public/curriculum.<id>.json`), plus a
   manifest. Manifest is the single source of truth for the shared level framework and
   the competency registry; competency files hold only per-level task arrays (composed
   approach, no duplicated level titles).
3. **"All" dashboard view:** KPIs + level-distribution bars only (these are comparable
   across paths). The per-task completion accordion appears only when a specific
   competency is selected.
4. **No competency selected (tracker):** gate the tracker — the engineer sees a "pick
   your competency to start" prompt and the task list appears only after they choose.
   No ambiguous default path.
5. **Task IDs & switching:** task IDs are globally unique via a competency prefix
   (`web-L1.T1`). Progress is keyed by task ID, so the progress map never collides;
   switching competency preserves prior ticks (old keys sit harmlessly).
6. **Migration:** accept a reset — no migration of existing progress. Real progress has
   not started yet, so existing pilot data is throwaway.

## Data model & file layout

### Manifest — `public/curriculum.json`

Single source of truth for the shared framework and the competency registry. No tasks.

```jsonc
{
  "version": "2.0",
  "source": "general/getting-started/levels.md",
  "last_reviewed": "2026-06-19",
  "competencies": [
    { "id": "web",     "label": "Web",     "file": "curriculum.web.json" },
    { "id": "mobile",  "label": "Mobile",  "file": "curriculum.mobile.json" },
    { "id": "backend", "label": "Backend", "file": "curriculum.backend.json" }
  ],
  "levels": [
    { "id": "L1", "title": "Understand", "subtitle": "Use AI to Read, Not Write",
      "move_on_when": "...", "link": "https://github.com/solvdinc/..." },
    { "id": "L2", "title": "...", "subtitle": "...", ... },
    { "id": "L3", ... }, { "id": "L4", ... }, { "id": "L5", ... }
  ]
}
```

### Path files — `public/curriculum.<id>.json`

Only per-level task arrays, plus optional per-level hour estimates (task volume differs
per competency).

```jsonc
{
  "competency": "web",
  "levels": [
    {
      "id": "L1",
      "estimated_hours_min": 28,
      "estimated_hours_max": 37,
      "tasks": [
        { "id": "web-L1.T1", "kind": "reading", "title": "...", "desc": "...", "link": "..." }
      ]
    },
    { "id": "L2", "tasks": [ ... ] }, ... L3–L5
  ]
}
```

The tracker composes manifest level metadata (title / subtitle / move_on_when / link)
with the competency file's per-level tasks and hour estimates at runtime.

### Task IDs

Globally unique, competency-prefixed: `<competency>-L<n>.T<m>` (e.g. `web-L1.T1`,
`mobile-L3.T4`). Because `progress/<user>.json` keys tasks by ID, unique IDs guarantee
no cross-competency collision and make competency-switching non-destructive.

## Backend (worker)

### Curriculum registry

A small module statically imports the manifest and every competency file, and exposes:

- `competencyIds()` / manifest metadata for callers that need the registry.
- `curriculumFor(competencyId)` → composed `{ levels: [{ id, title, ..., tasks }] }`
  (manifest level framework merged with that competency's tasks). Returns `null`/empty
  for an unknown or missing competency.

Static imports match the current model — the worker is already redeployed for curriculum
changes (`src/index.ts` imports `curriculum.json` as JSON). Adding a brand-new competency
is a code change (new import + manifest entry + redeploy); editing tasks within an
existing competency is a JSON edit + worker redeploy, exactly as today.

### `aggregate.ts`

- For each engineer, resolve their path via `curriculumFor(p.competency)`.
- `current_level`: computed against **their own path** (first level not fully done).
- `completion_pct`: done tasks / **their own path's** total task count.
- `by_task`: one flat map keyed by globally-unique task IDs (counts how many active
  engineers ticked each ID). Works directly because IDs are unique — no per-competency
  namespacing needed in the response.
- Engineers with **no competency**: remain in `engineers[]` (admins must see them) with
  `current_level: "L1"`, `completion_pct: 0`, and a way to surface "no competency"
  (e.g. `competency` absent — the dashboard renders a "—"/"no competency" state).
- Disabled-engineer handling is unchanged (still excluded from headline counts, still
  listed behind the Disabled filter).

The `Curriculum` interface in `aggregate.ts` and the handler signatures that currently
take `curriculum` change to take the registry (or resolve paths internally). Bump
`CACHE_KEY` (e.g. `aggregate-v4`) because the aggregate's per-engineer semantics change.

## Dashboard (whole-page competency scope)

- **Promote competency to a page-level scope selector** at the top of the dashboard
  (move it out of the table toolbar). Pills: `All`, `Web`, `Mobile`, `Backend`.
  Selecting a scope rescopes KPIs, bars, completion accordion, and table together.
- **KPIs & bars** are recomputed client-side from the `engineers[]` list filtered by the
  selected competency (the list already carries `competency`, `current_level`,
  `completion_pct`, `disabled`, `last_active`). Disabled engineers stay excluded from
  headline numbers as today.
- **Completion accordion** renders only when a specific competency is selected: fetch
  that competency's path file, render its levels/tasks, using `by_task` counts with the
  denominator = number of active engineers in that competency. In "All", the accordion
  is hidden; the panel shows a short hint ("Select a competency to see task detail").
- The existing per-row **competency `<select>`** and **Disable/Enable** controls in the
  table are unchanged. The table's own row filters (L1–L5 / Stalled / Disabled / search)
  continue to work, now within the page-level competency scope.

## Tracker (engineer page)

- After auth, if the engineer has **no competency**: show the "pick your competency to
  start" prompt (reuse the existing competency picker), keep the level/task UI hidden
  until a competency is chosen. On selection, persist via the existing
  `POST /api/competencies`, then load the competency path and render.
- Load order: fetch manifest (`curriculum.json`) for the level framework, then fetch the
  engineer's `curriculum.<competency>.json`, compose, and render the path.
- Admin viewing `?as=<user>`: load that user's competency path (read-only, as today). If
  the viewed user has no competency, show a read-only "no competency selected" state.

## Schema & CI

- Split the schema in two:
  - `schema/curriculum.manifest.schema.json` — competencies require `id`, `label`,
    `file`; `levels` are the shared framework (id / title / subtitle / move_on_when /
    link) with **no** tasks; exactly 5 levels.
  - `schema/curriculum.path.schema.json` — per-competency: `competency` id; `levels`
    each with `tasks[]`; task-ID pattern updated to require the competency prefix
    (e.g. `^[a-z0-9_-]+-L[1-5]\.T[0-9]+$`); exactly 5 levels with ids L1–L5.
- CI (`.github/workflows/validate-curriculum.yml`):
  - validate the manifest against the manifest schema;
  - validate every `public/curriculum.*.json` (the path files) against the path schema;
  - cross-checks: every manifest competency has a present file; the `competency` field
    in each path file matches its manifest entry; task IDs are globally unique across all
    path files and correctly prefixed.
  - update the `paths:` triggers to include `public/curriculum.*.json` and both schema
    files.

## Out of scope

- Per-competency *level metadata* differences beyond hour estimates (titles/subtitles/
  links stay shared — that's the point of "same five levels").
- Multi-competency engineers (still single-select).
- Any migration of existing progress (reset accepted).
- Changes to auth, session, or the disable/enable feature.

## Touched files (anticipated)

- `public/curriculum.json` (→ manifest), new `public/curriculum.web.json`,
  `public/curriculum.mobile.json`, `public/curriculum.backend.json`
- `public/dashboard.html`, `public/dashboard.js` (page-level scope, client-side recompute,
  conditional accordion)
- `public/app.js` (gate on competency, compose + render per-competency path)
- `worker/src/index.ts` (curriculum registry imports, handler wiring)
- `worker/src/aggregate.ts` (per-path current level / completion; registry signature)
- `worker/src/api.ts` (any handler taking `curriculum` now takes the registry)
- `schema/curriculum.manifest.schema.json`, `schema/curriculum.path.schema.json`
  (replace `schema/curriculum.schema.json`)
- `.github/workflows/validate-curriculum.yml`
- Tests under `worker/test/` for aggregate + registry
- `CLAUDE.md` (document the manifest + path-file model and the new common operations)
