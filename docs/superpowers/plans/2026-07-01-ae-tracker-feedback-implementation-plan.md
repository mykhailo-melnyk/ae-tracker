# AE Tracker — Feedback Fixes Implementation Plan (Web path)

**Design:** `docs/superpowers/specs/2026-07-01-ae-tracker-feedback-triage-design.md`
**Branch:** `feature/curriculum-feedback-triage`
**Scope:** Web path only, content-only (curriculum JSON + `docs/` markdown).

## Guiding constraints (from the design)

- Every task `link` must point to a file that exists → **author docs before linking tasks to them.**
- Task display order = `tasks[]` array order → position new L1 tasks early.
- IDs prefixed `web-L<n>.T<m>`, globally unique; `kind` ∈ `{practice, course, checkpoint, reading, video}`.
- CI: `node schema/validate-curriculum.mjs` must pass.
- Dashboard aggregate needs `wrangler deploy` after merge (Worker bundles the JSON).

## New task ID allocation (Web path)

| ID | Level | Kind | Title |
|----|-------|------|-------|
| `web-L1.T17` | L1 | practice | Break the AI on purpose |
| `web-L1.T18` | L1 | reading | Golden example: a good CLAUDE.md |
| `web-L2.T15` | L2 | reading | Golden example: a good AI-assisted PR |
| `web-L2.T16` | L2 | reading | Cost & when *not* to use AI (intro) |
| `web-L3.T11` | L3 | reading | Golden example: a good spec |
| `web-L3.T12` | L3 | reading | Golden example: a good eval |
| `web-L1.T19` | L1 | reading | Your tools are portable (not just Claude Code) |
| `web-L5.T10` | L5 | checkpoint | Capstone: verification harness + team rules |

(Existing assessments L1.T16 / L2.T14 / L3.T10 / L4.T18 are **edited in place**, not renumbered.)

---

## Phase 1 — Author the docs (no JSON changes yet)

These must exist before any task links to them.

- [ ] **1.1** `docs/curriculum/examples/claude-md.md` — an annotated exemplar `CLAUDE.md`
      with inline "why this is good" notes (structure, altitude, what to include/omit).
- [ ] **1.2** `docs/curriculum/examples/spec.md` — an annotated good spec (problem framing,
      acceptance criteria, scope boundaries, non-goals) with notes.
- [ ] **1.3** `docs/curriculum/examples/eval.md` — an annotated good eval (dataset shape,
      criteria, rule-based vs. model-graded) with notes.
- [ ] **1.4** `docs/curriculum/examples/ai-assisted-pr.md` — an annotated good AI-assisted PR
      (description, review trail, tests, the plausible-but-wrong parts caught) with notes.
- [ ] **1.5** `docs/curriculum/tool-agnostic.md` — short note: skills are portable
      (planning, review, context engineering, orchestration); OpenCode is model-agnostic,
      Codex is OpenAI's equivalent; only specific commands + skills/MCP setup are tool-specific.
- [ ] **1.6** `docs/curriculum/cost-awareness.md` — short note: token-cost intuition + a
      "when *not* to hand a task to AI" checklist. Points forward to the fuller L4 treatment.
- [ ] **1.7** Update rubric docs for the upgraded capstones:
      - `assessments/L1.md` — add the annotate-a-transcript deliverable + rubric.
      - `assessments/L2.md` — reframe around producing a merge-quality change; audit = evidence.
      - `assessments/L3.md` — light: add `Capstone` framing + explicit deliverable list.
      - `assessments/L4.md` — add the "small eval suite that gates the skill/MCP" deliverable.
      - New `assessments/L5-capstone.md` (or a new section in `assessments/L5.md`) — verification
        harness rubric: show it catching a bad change before merge + the team rules written.

**Verify:** all six new docs render on GitHub; blob URLs resolve.

## Phase 2 — Capstones (edit existing assessments + add L5)

- [ ] **2.1 L1** — edit `web-L1.T16`: retitle `Capstone: spot & annotate AI behavior`, fold the
      annotate-a-transcript deliverable into `desc`, keep the L1.md link.
- [ ] **2.2 L2** — edit `web-L2.T14`: retitle `Capstone: bring an AI change to merge quality`,
      rewrite `desc` around the build deliverable (audit becomes supporting evidence).
- [ ] **2.3 L3** — edit `web-L3.T10`: retitle `Capstone: ship a spec-first backlog item (>3 files)`;
      `desc` largely unchanged (already a real build), add explicit deliverable list.
- [ ] **2.4 L4** — edit `web-L4.T18`: retitle `Capstone: team-adopted skill/MCP + eval suite`,
      add the eval-suite-that-gates-it deliverable to `desc`.
- [ ] **2.5 L5** — add new `web-L5.T10` (`checkpoint`): `Capstone: verification harness + team rules`,
      linked to the L5 capstone rubric. Keep `web-L5.T9` unchanged.

**Verify:** each level still has a single clear terminal capstone; L5 has both T9 (thinking) and T10 (build).

## Phase 3 — Small content adds

- [ ] **3.1** Add `web-L1.T17` (`practice`) `Break the AI on purpose` — position **early** in L1's
      `tasks[]` array (before the reading block). No external link (self-contained drill), matching
      the pattern of existing L1 practice tasks `T1`/`T2`.
- [ ] **3.2** Add `web-L1.T19` (`reading`) linking `tool-agnostic.md`.
- [ ] **3.3** Add `web-L2.T16` (`reading`) linking `cost-awareness.md`.
- [ ] **3.4** Add golden-example reading tasks linking Phase-1 docs:
      `web-L1.T18` → claude-md.md, `web-L2.T15` → ai-assisted-pr.md,
      `web-L3.T11` → spec.md, `web-L3.T12` → eval.md.

## Phase 4 — Trim edit

- [ ] **4.1** Edit `web-L2.T4` `desc`: add a level-specific focus note
      ("At L2 focus on modes/context/review chapters; you revisit Plan Mode at L3")
      so the L2/L3 pairing reads as one course viewed twice.

## Phase 5 — Bookkeeping & validation

- [ ] **5.1** Update each touched level's `estimated_hours_min` / `estimated_hours_max` for the
      added tasks.
- [ ] **5.2** `node schema/validate-curriculum.mjs` passes (install `ajv@8 ajv-formats@2` if needed).
- [ ] **5.3** `cd worker && npm run typecheck && npm test` (curriculum import still compiles;
      aggregate over new IDs works).
- [ ] **5.4** Manual smoke: serve `public/` and load `tracker.html?competency=web`; confirm new
      tasks render, links resolve, ordering is right.

## Phase 6 — Ship

- [ ] **6.1** PR from `feature/curriculum-feedback-triage`; CI (curriculum validation) green.
- [ ] **6.2** After merge to `main`: Pages auto-redeploys the frontend.
- [ ] **6.3** `cd worker && wrangler deploy` so the dashboard aggregate reflects the new tasks.

## Deferred (tracked, not in this plan)

Solvd tech talks/webinars (needs assets), placement quiz, running portfolio, dashboard
cadence guidance, example fading, and mirroring these changes to Mobile/Backend paths.

## Notes / open choices for implementation

- Golden-example tasks are modeled as `reading` kind (no `project`/`example` kind exists;
  adding one is deferred as a visual-polish follow-up).
- If adding standalone golden-example tasks feels like task-count bloat, an alternative is
  to link the example docs from within the relevant existing task `desc` instead of new
  tasks — decide during implementation, but the plan above assumes discrete trackable tasks.
