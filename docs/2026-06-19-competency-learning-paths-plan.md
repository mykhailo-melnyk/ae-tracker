# Per-competency Learning Paths + Scoped Dashboard — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Run `npm run typecheck` and `npm test` from `worker/` after each backend part; verify the frontend manually (no build step / no frontend tests, per the original tracker spec).

**Goal:** Make `competency` drive a real learning path. Each competency gets its own task list (same five levels), stored in a per-competency JSON file plus a manifest. The tracker gates on competency selection and renders that competency's path; the dashboard filters whole-page by competency.

**Architecture:** Implementation matches `docs/superpowers/specs/2026-06-19-competency-learning-paths-design.md`. `public/curriculum.json` becomes a **manifest** (competency registry + shared L1–L5 framework, no tasks). Each `public/curriculum.<id>.json` holds per-level task arrays with globally-unique, competency-prefixed task IDs (`web-L1.T1`). The worker gains a small curriculum **registry** module that statically imports the manifest + every path file and resolves a composed path per competency. The dashboard recomputes KPIs/bars client-side from the engineers list filtered by a page-level competency scope.

**Tech Stack:** Vanilla HTML/JS · Cloudflare Workers (TypeScript) · `@cloudflare/vitest-pool-workers` · ajv schema validation in CI.

---

## Conventions for this plan

- **Repo root:** `~/Projects/solvd/ae-tracker/`. Spec at `docs/superpowers/specs/2026-06-19-competency-learning-paths-design.md`.
- **Competencies for the pilot:** `web`, `mobile`, `backend` (unchanged from today).
- **Reset accepted:** no migration of existing `progress/<user>.json`. Existing ticks under old IDs (`L1.T1`) simply stop matching the new prefixed IDs and become harmless residue. No data-repo changes are part of this plan.
- **Task IDs:** `<competency>-L<n>.T<m>`, e.g. `web-L1.T1`. The `/api/mark` body cap is 32 chars (`api.ts:83`); longest prefixed ID (`backend-L5.T18`) is well under — no change needed.
- **Branch:** create `feature/competency-learning-paths` off `main` before starting.
- **Cache key:** the aggregate's per-engineer semantics change, so bump `CACHE_KEY` to `aggregate-v4`.

---

## Part 1 — Curriculum data files (manifest + path files)

Split the single `public/curriculum.json` into a manifest plus three seed path files. Seeding all three from today's task list is the safe reset starting point; per-competency divergence happens later as plain JSON edits.

### Task 1.1: Snapshot the current curriculum

**Files:** none (read-only prep)

- [ ] **Step 1:** Read the current `public/curriculum.json`. Note its `competencies`, the five level objects (`id`, `title`, `subtitle`, `move_on_when`, `link`, `estimated_hours_min/max`), and each level's `tasks[]`.
- [ ] **Step 2:** Keep a copy of the original file content in scratch (you'll transform it into the manifest and seed files). Do not commit the original shape.

### Task 1.2: Rewrite `public/curriculum.json` as the manifest

**Files:** Modify `public/curriculum.json`

- [ ] **Step 1:** Replace the file with a manifest: keep `version` (bump to `"2.0"`), `source`, `last_reviewed` (set to `2026-06-19`); add `file` to each competency entry; keep `levels[]` as the **shared framework with NO tasks and NO hours** (`id`, `title`, `subtitle`, `move_on_when`, `link` only). Shape:
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
      { "id": "L1", "title": "Understand", "subtitle": "...", "move_on_when": "...", "link": "..." }
      // L2–L5, copied verbatim from the original (titles/subtitles/move_on_when/link)
    ]
  }
  ```
- [ ] **Step 2:** Confirm `levels` has exactly 5 entries (L1–L5) and no `tasks`/`estimated_hours_*` keys remain in the manifest.

### Task 1.3: Create the three seed path files

**Files:** Create `public/curriculum.web.json`, `public/curriculum.mobile.json`, `public/curriculum.backend.json`

- [ ] **Step 1:** For `web`, build:
  ```jsonc
  {
    "competency": "web",
    "levels": [
      { "id": "L1", "estimated_hours_min": 28, "estimated_hours_max": 37, "tasks": [ /* original L1 tasks, IDs re-prefixed */ ] },
      // L2–L5 likewise
    ]
  }
  ```
  Re-prefix every task `id` from `L<n>.T<m>` → `web-L<n>.T<m>`. Carry over `kind`, `title`, `desc`, `link`, `self_assessment` unchanged. Move each level's `estimated_hours_min/max` from the original here.
- [ ] **Step 2:** Produce `mobile` and `backend` identically, prefixing IDs with `mobile-` / `backend-` respectively. (Identical task content is fine as a seed — divergence is a later content edit.)
- [ ] **Step 3:** Sanity-check IDs and JSON validity:
  ```bash
  cd ~/Projects/solvd/ae-tracker
  for f in web mobile backend; do
    echo "== $f =="
    python3 -c "import json,sys; d=json.load(open('public/curriculum.'+'$f'+'.json')); ids=[t['id'] for l in d['levels'] for t in l['tasks']]; assert all(i.startswith('$f'+'-L') for i in ids), 'bad prefix'; assert len(ids)==len(set(ids)), 'dupe ids'; print(len(ids),'tasks OK')"
  done
  # cross-file global uniqueness:
  python3 -c "import json; ids=[t['id'] for f in ['web','mobile','backend'] for l in json.load(open('public/curriculum.'+f+'.json'))['levels'] for t in l['tasks']]; assert len(ids)==len(set(ids)), 'global dupe'; print('global unique:', len(ids))"
  ```
  All assertions must pass.

---

## Part 2 — Schema split + CI

### Task 2.1: Split the JSON schema

**Files:** Create `schema/curriculum.manifest.schema.json`, `schema/curriculum.path.schema.json`; delete `schema/curriculum.schema.json`

- [ ] **Step 1:** `curriculum.manifest.schema.json`: required `version`, `source`, `last_reviewed`, `competencies`, `levels`. Each competency requires `id` (pattern `^[a-z][a-z0-9_-]{0,31}$`), `label`, **`file`** (`^curriculum\.[a-z0-9_-]+\.json$`), `additionalProperties:false`. `levels`: exactly 5 items, each requires `id` (`^L[1-5]$`), `title`, `subtitle`; allows `move_on_when`, `link` (uri); **forbids `tasks`** (`"not": { "required": ["tasks"] }`).
- [ ] **Step 2:** `curriculum.path.schema.json`: required `competency` (pattern `^[a-z][a-z0-9_-]{0,31}$`), `levels`. `levels`: exactly 5, each requires `id` (`^L[1-5]$`), `tasks` (minItems 1); allows `estimated_hours_min/max` (integer ≥1). Each task requires `id`, `kind`, `title`; `id` pattern **`^[a-z0-9_-]+-L[1-5]\.T[0-9]+$`**; `kind` enum unchanged (`practice|course|checkpoint|reading|video`); allow `desc`, `link` (uri), `self_assessment`.
- [ ] **Step 3:** Delete `schema/curriculum.schema.json`.

### Task 2.2: Update CI to validate all files + cross-checks

**Files:** Modify `.github/workflows/validate-curriculum.yml`

- [ ] **Step 1:** Update `paths:` triggers (push + pull_request) to: `public/curriculum.json`, `public/curriculum.*.json`, `schema/*.schema.json`, and the workflow file itself.
- [ ] **Step 2:** Replace the single `ajv validate` step with:
  - validate manifest: `ajv validate -s schema/curriculum.manifest.schema.json -d public/curriculum.json -c ajv-formats`
  - validate each path file via a glob: `ajv validate -s schema/curriculum.path.schema.json -d "public/curriculum.*.json" -c ajv-formats` (the glob must exclude the manifest — name path files so the manifest is `curriculum.json` and paths are `curriculum.<id>.json`; if ajv's glob also matches the manifest, list the three files explicitly instead).
- [ ] **Step 3:** Add a Node cross-check step asserting: every manifest competency's `file` exists; each path file's `competency` matches its manifest entry; task IDs are globally unique across path files and prefixed with `<competency>-`. Fail (`process.exit(1)`) on any violation.
- [ ] **Step 4:** Run the equivalent checks locally with the `npx ajv-cli`/Python snippets from Task 1.3 before pushing.

---

## Part 3 — Worker: curriculum registry + aggregate

### Task 3.1: Add the curriculum registry module

**Files:** Create `worker/src/curriculum.ts`

- [ ] **Step 1:** Statically import the manifest and the three path files:
  ```ts
  import manifest from "../../public/curriculum.json";
  import webPath from "../../public/curriculum.web.json";
  import mobilePath from "../../public/curriculum.mobile.json";
  import backendPath from "../../public/curriculum.backend.json";
  ```
- [ ] **Step 2:** Define types: `LevelMeta` (id/title/subtitle/move_on_when?/link?), `PathFile` (`{ competency; levels: Array<{ id; tasks: Array<{ id }>; estimated_hours_min?; estimated_hours_max? }> }`), and a composed `ResolvedCurriculum` (`{ levels: Array<{ id; tasks: Array<{ id }> }> }`) matching what `aggregate.ts` needs.
- [ ] **Step 3:** Build `PATHS: Record<string, PathFile>` keyed by `competency`. Export `MANIFEST = manifest` and:
  - `competencyIds(): string[]`
  - `pathFor(competencyId?: string): ResolvedCurriculum | null` — returns composed levels (manifest level order + that path's tasks) or `null` when `competencyId` is falsy/unknown.
- [ ] **Step 4:** `npm run typecheck` passes (the JSON imports resolve; `tsconfig` already allows `resolveJsonModule` since `index.ts` imports JSON today).

### Task 3.2: Make `aggregate.ts` per-path

**Files:** Modify `worker/src/aggregate.ts`

- [ ] **Step 1:** Replace the `Curriculum` parameter with the registry. `computeAggregate` signature becomes `(cfg, registry, fetchFn, now?)` where `registry` exposes `pathFor`. `handleApiAggregate` takes the registry instead of `curriculum`.
- [ ] **Step 2:** Per engineer: `const path = registry.pathFor(p.competency)`.
  - `current_level`: if `path`, first level not fully done (existing `currentLevel` logic over `path.levels`); if no path, `"L1"`.
  - `completion_pct`: `path ? done / pathTotalTasks : 0` (guard divide-by-zero).
  - `by_task`: iterate the engineer's path task IDs (if any) and increment the global `by_task` map keyed by the unique ID. Initialize `by_task` lazily (engineers across competencies contribute different keys) — drop the pre-seeded `Object.fromEntries(allTaskIds...)` that assumed one global task list.
  - `by_current_level`: increment for active engineers as today (now keyed off per-path current level).
  - `stalled_14d`, `engineers_started`: unchanged (still exclude `disabled`).
- [ ] **Step 3:** Keep the per-engineer `engineers[]` shape (already carries `competency`, `current_level`, `completion_pct`, `last_active`, `disabled`). No new field strictly required — a missing `competency` signals "no competency" to the client.
- [ ] **Step 4:** Bump `CACHE_KEY` to `"aggregate-v4"` and update its comment (v4: per-competency paths; per-engineer completion relative to own path; `by_task` keyed by globally-unique IDs).

### Task 3.3: Wire the registry into the router

**Files:** Modify `worker/src/index.ts`

- [ ] **Step 1:** Replace `import curriculum from "../../public/curriculum.json"` with `import * as curriculum from "./curriculum"` (registry). 
- [ ] **Step 2:** `/api/competencies` and `/api/user/<u>/competencies` validate against the competency list — pass `curriculum.MANIFEST` (it still has `competencies`). Confirm `handleApiCompetencies` / `handleApiUserCompetencies` still receive an object with `.competencies` (they read `curriculum.competencies` — `api.ts:222,250`).
- [ ] **Step 3:** `/api/aggregate` passes the registry: `handleApiAggregate(request, env, curriculum)`.
- [ ] **Step 4:** `npm run typecheck` passes.

### Task 3.4: Update worker tests

**Files:** Modify `worker/test/aggregate.test.ts` (and `api.test.ts` if it stubs the curriculum shape)

- [ ] **Step 1:** Update aggregate tests: seed progress files with prefixed IDs (`web-L1.T1`), assert `completion_pct` is relative to the engineer's competency path, `current_level` is per-path, and `by_task` is keyed by prefixed IDs. Add a case for an engineer with **no competency** (`completion_pct` 0, `current_level` "L1", still present in `engineers[]`).
- [ ] **Step 2:** If `api.test.ts` passes a fake curriculum to the competency handlers, ensure it still provides `{ competencies: [...] }` (manifest shape) — IDs `web|mobile|backend`.
- [ ] **Step 3:** `npm test` is green; `npm run typecheck` passes.
- [ ] **Step 4:** Commit Parts 1–3 together (data + schema + worker move atomically so the worker always matches the files it imports):
  ```bash
  git add public/curriculum*.json schema/ .github/workflows/validate-curriculum.yml worker/src worker/test
  git commit -m "feat(curriculum): per-competency learning paths (manifest + path files)

  Split curriculum.json into a manifest (registry + shared L1-L5 framework) and
  per-competency path files with globally-unique prefixed task IDs. Worker resolves
  each engineer's path via a registry; aggregate computes completion/current-level
  per the engineer's own path. Schema split + CI validates all files. Cache v4.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Part 4 — Tracker frontend (gate + per-path render)

### Task 4.1: Gate on competency and render the engineer's path

**Files:** Modify `public/app.js` (and `public/tracker.html` only if a new container is needed)

- [ ] **Step 1:** `loadCurriculum()` now returns the **manifest**. Add `loadPath(competencyId)` that fetches `curriculum.<id>.json` and composes it with the manifest: for each manifest level, attach the path file's tasks (matched by level `id`) and its `estimated_hours_min/max`. Store the composed result in `CURRICULUM` (same downstream shape the render code already expects: `levels[].tasks[]`, `levels[].title`, etc.).
- [ ] **Step 2:** In `init()`, after `PROGRESS`/`READONLY` are known and the disabled check passes:
  - **No competency + not readonly:** render the competency picker prominently with a "Pick your competency to start" heading; keep the pill bar / focus card hidden. Do **not** render a path yet.
  - **Has competency:** `await loadPath(PROGRESS.competency)`, then `renderTotals/renderPillBar/renderFocusCard` as today.
  - **Readonly (admin `?as=`) with no competency:** show a read-only "No competency selected" message instead of a path.
- [ ] **Step 3:** In `selectCompetency()`, on a successful save that sets a competency (from none → chosen), load the path and render the full tracker (reveal pill bar + focus card). Clearing competency (chosen → none) returns to the gated "pick to start" state. Keep the optimistic update + rollback behavior.
- [ ] **Step 4:** Refactor the render trigger into a single `renderPath()` helper so both `init()` and `selectCompetency()` reuse it (avoid duplicated render sequences).
- [ ] **Step 5:** Manual check (local dev, see Part 6): a brand-new engineer sees the picker only; after choosing, the correct competency's tasks appear; ticking persists; the prefixed task IDs land in the data repo commit message.

---

## Part 5 — Dashboard frontend (page-level competency scope)

### Task 5.1: Move competency to a page-level scope selector

**Files:** Modify `public/dashboard.html`

- [ ] **Step 1:** Move the competency pills out of the table toolbar (`comp-toolbar`, lines ~48–51) up into the page head as a page-level scope selector (e.g. a `comp-scope` row directly under `.page-head` with `id="scope-pills"`). Keep the `All / Web / Mobile / Backend` pills. Leave the table's row filters (`filter-pill`: L1–L5/Stalled/Disabled) and search where they are.
- [ ] **Step 2:** Give the completion panel a placeholder element for the "select a competency" hint shown in the "All" scope.

### Task 5.2: Recompute the whole dashboard from the scoped engineer set

**Files:** Modify `public/dashboard.js`

- [ ] **Step 1:** Rename `COMP_FILTER` → `SCOPE` (page-level). `buildCompetencyPills()` targets `#scope-pills`; `wireFilters()` wires the scope pills to set `SCOPE` and re-render the **whole** dashboard (`renderKpis(); renderBars(); renderLevelCompletion(); renderTable();`).
- [ ] **Step 2:** Add `scopedActive()` → `AGG.engineers.filter(e => !e.disabled && (SCOPE === 'all' || e.competency === SCOPE))`. 
  - `renderKpis()`: compute "Engineers started", "At Level 2+", "Avg completion", "Stalled 14+d" from `scopedActive()` (compute the stalled count client-side from `last_active`, as `renderTable` already does, since the server's `stalled_14d` is global).
  - `renderBars()`: build the `by_current_level` distribution from `scopedActive()` instead of `AGG.by_current_level`.
- [ ] **Step 3:** `renderLevelCompletion()`:
  - **`SCOPE === 'all'`:** hide the accordion; show the placeholder hint ("Select a competency to see task detail").
  - **specific competency:** `await loadPath(SCOPE)` (fetch + cache `curriculum.<id>.json`, composing with the manifest `CUR` for level titles), then render its levels/tasks. Denominator = `scopedActive().length` (active engineers in that competency); per-task counts come from `AGG.by_task[taskId]` (prefixed IDs). Make this path tolerant of being async (the scope click handler must await it).
- [ ] **Step 4:** `renderTable()`: replace the old `COMP_FILTER` check with `SCOPE` (`SCOPE === 'all' || e.competency === SCOPE`). The existing `FILTER`/`SEARCH`/disabled logic stays. The per-row competency `<select>` and Disable/Enable controls are unchanged.
- [ ] **Step 5:** Cache loaded path files in a `PATHS` map so re-selecting a scope doesn't refetch. Handle a missing/failed path fetch gracefully (show an inline error in the completion panel, don't break the page).
- [ ] **Step 6:** `export.js` is unaffected (it reads `CUR.competencies` from the manifest — still present — and `AGG.engineers`; its own competency multiselect is independent of the page scope). No change required; confirm it still opens and exports.
- [ ] **Step 7:** Commit Parts 4–5:
  ```bash
  git add public/app.js public/dashboard.js public/dashboard.html
  git commit -m "feat(frontend): gate tracker on competency; scope dashboard whole-page by competency

  Tracker loads the engineer's per-competency path and gates until one is picked.
  Dashboard competency pills become a page-level scope that rescopes KPIs, level bars,
  completion accordion, and table; All shows KPIs+bars only (task detail per competency).

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Part 6 — Docs + verification

### Task 6.1: Update CLAUDE.md

**Files:** Modify `CLAUDE.md`

- [ ] **Step 1:** Update the `curriculum.json` gotcha to describe the manifest + per-competency path files, globally-unique prefixed task IDs, and that the worker imports all path files via the registry (so adding a competency = new file + manifest entry + registry import + redeploy; editing tasks = JSON edit + worker redeploy for the aggregate to reflect it).
- [ ] **Step 2:** Update the "Update the curriculum" common-operations row and add an "Add a competency" row. Note the schema split (`curriculum.manifest.schema.json` / `curriculum.path.schema.json`).

### Task 6.2: Backend verification

**Files:** none (verification)

- [ ] **Step 1:** From `worker/`: `npm run typecheck` (clean) and `npm test` (green).
- [ ] **Step 2:** Locally validate schemas as CI will:
  ```bash
  cd ~/Projects/solvd/ae-tracker
  npx ajv-cli validate -s schema/curriculum.manifest.schema.json -d public/curriculum.json -c ajv-formats
  npx ajv-cli validate -s schema/curriculum.path.schema.json -d public/curriculum.web.json -d public/curriculum.mobile.json -d public/curriculum.backend.json -c ajv-formats
  ```
  All pass.

### Task 6.3: End-to-end manual verification (local dev)

**Files:** none (verification). Start `wrangler dev` (`worker/`) and `npx http-server public -p 8080 -c-1` per CLAUDE.md.

- [ ] **Step 1 (gate):** Sign in as an engineer with no competency → only the "pick your competency to start" picker shows; no task list.
- [ ] **Step 2 (path):** Pick `Web` → the web path renders; tick a task → green; confirm a commit `progress(<user>): ✓ web-L1.T1` lands in the dev data repo.
- [ ] **Step 3 (switch keeps progress):** Switch to `Mobile` → mobile tasks show, web tick is gone from view; switch back to `Web` → the earlier tick is still checked (globally-unique IDs preserved it).
- [ ] **Step 4 (dashboard All):** Open the dashboard as admin, scope = All → KPIs + level bars reflect everyone; completion accordion is hidden with the hint.
- [ ] **Step 5 (dashboard scoped):** Scope = Web → KPIs, bars, completion accordion, and table all rescope to web engineers; accordion shows web tasks with correct percentages (denominator = active web engineers).
- [ ] **Step 6 (no-competency visible):** An engineer with no competency still appears in the table (with a "—"/no-competency state) and is excluded from headline counts.
- [ ] **Step 7 (export):** Open Export → it still opens and downloads CSV/XLSX.
- [ ] **Step 8:** If any step fails, fix before claiming done. Do not deploy the worker (`wrangler deploy`) or merge until all steps pass.

---

## Self-Review (run after drafting)

- **Spec coverage:** Decisions 1–2 → Parts 1–3 (same levels, per-competency files, composed manifest). Decision 3 (All = KPIs+bars only) → Task 5.2 Step 3. Decision 4 (gate on competency) → Task 4.1. Decision 5 (unique prefixed IDs, non-destructive switch) → Tasks 1.3, 3.2, verified in 6.3 Step 3. Decision 6 (reset, no migration) → Conventions + no data-repo task.
- **Scope:** One cohesive feature; no orphan tasks; no unrelated refactors.
- **Ordering:** Data + schema + worker land in one commit (worker imports the files), so `main` never has a worker that imports a non-existent file shape. Frontend follows. Docs last.

## Out of scope (per spec)

- Per-competency level *metadata* beyond hour estimates (titles/subtitles/links stay shared).
- Multi-competency engineers (still single-select).
- Migrating existing progress (reset accepted).
- Making `export.js` respect the page-level scope (it keeps its own independent competency multiselect).
- Changes to auth/session/disable features.
