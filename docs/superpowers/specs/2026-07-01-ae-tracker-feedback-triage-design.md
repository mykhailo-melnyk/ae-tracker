# AE Tracker — Feedback Triage & Change Plan (Web path)

**Date:** 2026-07-01
**Source:** "SOLVD AE Tracker — Curriculum & Product Analysis (Web Path)" feedback PDF
**Scope this round:** content-only (curriculum JSON + `docs/` markdown). No product/app-feature work.
**Path this round:** Web only. Mobile/Backend paths mirror later.

## Context

The feedback critiques the Web learning path (67 tasks: 24 reading, 20 course, 1 video,
12 practice, 10 checkpoint — ~67% passive). The core complaint is accurate to the data:
the path is mostly reading with little building, no capstones, no worked examples, and
Solvd's own internal content is unused.

This document records which feedback items we will fix, leave, and defer, and the plan
for the ones we fix. It is a triage + change plan, not an implementation plan (that comes
next via writing-plans).

## Decisions

### Fixing this round (content only)

1. **Capstones at every level (all 5).** A deliverable-producing capstone per level, using
   the PDF's suggested builds:
   - **L1** — annotate a provided agent transcript: mark good vs. bad behavior and say why.
   - **L2** — take an AI-generated multi-file change and bring it to merge quality (write the
     missing tests, fix the plausible-but-wrong parts).
   - **L3** — a spec-driven feature: write the spec, delegate to the agent, verify against the spec.
   - **L4** — author a reusable Claude Code skill or a small MCP server, plus a small eval suite that gates it.
   - **L5** — build a verification harness for a real codebase area that catches a bad change
     before merge; write the team rules that codify the lesson.

   **Approach (approved):** *upgrade the existing end-of-level assessment into the capstone
   where one already fits, and add a new capstone task only where it doesn't.* Existing
   assessments that already gesture at these builds: L3.T10 ("ship a spec-first backlog item
   >3 files"), L4.T18 ("team-shared command/skill + finbot CTF"). Net effect: 5 real capstones,
   minimal duplication.

   **Kind (approved):** reuse the existing `checkpoint` kind with a `Capstone:` title prefix.
   A dedicated `project` kind is deliberately out of scope (would touch schema + frontend
   rendering) — flagged as an easy visual follow-up.

   Each capstone gets a rubric doc under `docs/curriculum/assessments/`.

2. **Golden examples library (full set of 4).** Annotated `CLAUDE.md`, spec, eval, and
   AI-assisted PR, each with "why this is good" notes, authored under `docs/curriculum/`
   and linked from the relevant tasks/levels. Example **fading** (full → partial → blank as
   the engineer climbs) is a product feature and is **deferred**.

3. **Three small content adds:**
   - **E** — a new L1 hands-on "break the AI on purpose" `practice` task, placed near the
     **top** of L1 (before the reading wall).
   - **F** — a short tool-agnostic note: the skills are portable (OpenCode, Codex are
     model-agnostic / OpenAI's equivalent); only specific commands and skills/MCP setup are
     Claude-specific.
   - **G** — a short cost-awareness + "when not to use AI" note seeded at L1–L2. The fuller
     L4 treatment stays.

4. **One trim edit.** Add a level-specific focus note to the L2 "Claude Code in Action"
   slot (`web-L2.T4`) so the L2/L3 pair reads clearly as one course viewed twice. (L3.T3
   already has such a note.)

### Leaving as-is (explicit calls)

- **"Measuring the Transformation" (`web-L4.T14`)** stays and keeps counting toward L4.
- **Eval content** (`web-L2.T13`, `web-L3.T7`, `web-L3.T8`, `web-L4.T15`) untouched this round.
- **Advanced RAG (`web-L4.T17`)** stays a required L4 gate.

### Deferred (recorded, not rejected)

- **Solvd tech talks / webinars** woven into matching levels — waiting on source assets
  (links/recordings). High value, low effort once assets exist.
- **Placement quiz** to start engineers at the right level — product feature.
- **Running portfolio** that accumulates artifacts across levels — product feature.
- **Dashboard cadence guidance** (hrs/week, target window) — product feature.
- **Example fading** logic — product feature.

## Mechanics / constraints

- New/edited tasks use prefixed IDs (`web-L<n>.T<m>`), a valid `kind` from the schema enum
  (`practice, course, checkpoint, reading, video`), and every `link` must point to a file
  that exists. Therefore **example and rubric docs are authored before the tasks link to them.**
- Task display order within a level follows the `tasks[]` array order — the new L1 hands-on
  task must be positioned early in the array.
- CI validates via `schema/validate-curriculum.mjs` (manifest + path schemas, ID uniqueness/prefix).
- Frontend redeploys on push to `main`; **the Worker must be redeployed (`wrangler deploy`)**
  for the dashboard aggregate to reflect the new/changed tasks (it bundles the JSON).

## Out of scope

- Any Worker/frontend code changes (product features above).
- Mobile and Backend path edits (mirror after Web is validated).
- Schema changes (no new `kind`).

## Next step

Hand off to writing-plans to produce the implementation plan for the "Fixing this round" items.
