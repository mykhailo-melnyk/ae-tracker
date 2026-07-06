# Design: Reconcile Claude Code cert prep content with the official exam blueprint

**Date:** 2026-07-06
**Status:** Approved (brainstorming)
**Branch:** `feature/certification-prep-paths` (PR #24, already open — this is additive work on the same branch)

## Summary

`public/certification.claude-code.json` currently ships as a `"draft": true`
starter path with **generic Claude Code tool-usage content** (install, daily
workflows, MCP wiring) that does not reflect the real exam. This is the
follow-up explicitly called out as out-of-scope in the original cert-paths
design: *"reconcile Claude Code starter content against the confirmed
official Anthropic exam blueprint."*

The author has since **passed the exam (871/1000, 2026-06-26)** and has
detailed personal study material (domain notes, scenario breakdowns) plus the
official, publicly-distributed **Exam Guide PDF** (`Claude_Certified_Architect
- Foundations - Exam Guide.pdf`, v0.2). This design restructures the prep
path to mirror the exam's actual **5 domains + 6 scenarios**, grounds each
domain in the guide's own **Task Statements**, and adds original
harder-than-practice-exam example questions — while drawing a hard line
around what may and may not be published from the author's private notes.

## Confidentiality boundary (binding constraint on this work)

Checked against `Anthropic_Certification_Exam_Policy.pdf` §1 ("Confidentiality")
and `Certification_Terms_and_Conditions.pdf`: candidates **may not distribute,
copy, display, publish, or transmit any Exam or Exam tasks/questions/answers**
— this covers the official (timed, login-gated) Practice Exam, not only the
proctored real exam.

- **Never ported:** `notes/practice/official-practice-exam-60q-review.md`
  (verbatim official Practice Exam questions + answers) and any close
  paraphrase of it. Stays a private file outside `ae-tracker`. No reference to
  its question numbers (e.g. "Q35") anywhere in published content, since that
  itself is Exam-related information.
- **Safe to use as-is:** the Exam Guide's own **Content Outline** (domain
  names, weights, Task Statement titles) and its **"Sample Questions"**
  section — the guide explicitly states these "illustrate the format and
  difficulty level of the exam" and are distributed publicly to help
  candidates prepare. These may be paraphrased/cited as a difficulty
  reference point, not reproduced verbatim into JSON content.
- **Safe to port and publish (author's own original work):** `notes/domains/
  *.md` and `notes/scenarios/*.md` — personal synthesis, not exam content.
  Ported in **adapted, generalized form**: rewritten from a first-person study
  log into second-person prep material, and stripped of any wording that ties
  a heuristic to a specific official-exam question/attempt.
- **Not ported:** `notes/practice/practice-questions*.md` and
  `notes/practice/scenario-practice-questions*.md` (the author's self-authored
  40-question mock and 24-question scenario mock). Per author feedback these
  are noticeably easier than real exam questions and their inclusion made the
  "how do I test myself" story unclear. Dropped rather than reworked — the
  official Practice Exam already fills that role better (see "Exam day"
  below).

## Content architecture

New folder **`docs/certifications/claude-code/`** (English only, mirrors the
existing `docs/curriculum/` convention: markdown lesson content authored
in-repo, linked from JSON items via GitHub blob URL):

- `domain-1-agentic-architecture.md` … `domain-5-context-management.md` (5)
- `scenario-1-customer-support.md` … `scenario-6-structured-extraction.md` (6)
- `exam-overview.md` (1)

Each **domain doc** follows a fixed template:
1. Domain title + weight (e.g. "Domain 1: Agentic Architecture & Orchestration — 27%").
2. Its official Task Statements, one line each (from the Exam Guide's Content
   Outline — safe, public syllabus content), as a checklist of what's tested.
3. **Study notes** — the author's practical synthesis: mental models,
   terminology, root-cause diagnostics (adapted from `notes/domains/domainN-summary.md`).
4. **"How to spot the right answer"** — the domain's answer-elimination
   heuristics, generalized (adapted from the "Решающие эвристики" section of
   each summary), e.g. *"a sharp, reproducible behavioral pattern points to a
   configured rule (prompt/hook), not a model/training limitation."*
5. **Harder practice question** — one new, original multiple-choice question
   (scenario stem + 4 options + full elimination reasoning for all 4),
   explicitly written to be **more difficult than both the mock questions and
   the Exam Guide's own Sample Questions** — the actual gap the author
   flagged. Labeled inline as unofficial ("Written for this prep path, not
   from Anthropic — calibrated harder than the exam's public sample
   questions for a stronger self-check.").

Each **scenario doc** follows:
1. Setup (agent, tools, target metric) — from `notes/scenarios/scenarioN-*.md`.
2. Domains it draws on.
3. Signature failure modes → best practice, **generalized** (no "attempt
   error" / question-number framing).
4. One new harder original example question, same bar as the domain docs.

`exam-overview.md`: format facts sourced from the Exam Guide's public "Exam
Details at a Glance" (60 questions, 120 minutes, 4-of-6 scenarios, multiple
choice with 1 correct + 3 distractors, scaled 100–1000, pass 720, 12-month
validity, $125 fee) + registration pointer (Anthropic Academy).

This is **11 new original hard questions** total (5 domains + 6 scenarios) —
the concrete answer to "add an example question, but harder than what
exists."

## `certification.claude-code.json` restructure

Drop the current 6 generic sections. New sections, in exam-domain order:

| Section id | Title | Items |
|---|---|---|
| `resources` | Recommended resources | 1 |
| `domain-1` | Domain 1: Agentic Architecture & Orchestration (27%) | 2 |
| `domain-2` | Domain 2: Tool Design & MCP Integration (18%) | 2 |
| `domain-3` | Domain 3: Claude Code Configuration & Workflows (20%) | 4 |
| `domain-4` | Domain 4: Prompt Engineering & Structured Output (20%) | 3 |
| `domain-5` | Domain 5: Context Management & Reliability (15%) | 3 |
| `scenarios` | Exam scenarios (4 of 6 appear on the exam) | 6 |
| `exam-day` | Exam day | 3 |

**`resources`** — added per author request: a pointer to Anthropic's own free
course, recommended as a foundation before domain-specific prep:

```json
{ "id": "cc.res.1", "kind": "course", "optional": true,
  "title": "Claude with the Anthropic API (official course)",
  "desc": "Anthropic's free, in-depth course covering the Messages API, tool use, and prompting fundamentals used throughout the exam. Long, but the single highest-leverage resource before starting domain prep.",
  "link": "https://anthropic-partners.skilljar.com/claude-with-the-anthropic-api",
  "estimated_minutes": 240 }
```

(`kind: "course"` already has CSS support in `public/styles.css:231` — unused
until now — and is already a valid `kind` in the curriculum schema; the cert
validator's `KINDS` set gains `"course"`.)

**Each domain section** — one required `reading` item linking its study-guide
doc, plus its official **Exam Preparation Recommendation** (from the Guide's
numbered list #21–27) as an `optional: true` `practice` item with an
`exam_note` hint. Domain 3 additionally keeps the existing CLAUDE.md
golden-example reading and a bundled "core workflow habits" optional practice
(the current draft's read-before-write / diff-review / plan-mode items,
merged into one item rather than three):

- Domain 1 → practice: *"Build a complete agentic loop with the Agent SDK"* (rec #21)
- Domain 2 → practice: *"Design and test MCP tools"* (rec #23)
- Domain 3 → practice: *"Configure Claude Code for a real project"* (rec #22) + *"Core workflow habits"*
- Domain 4 → practice: *"Build a structured data extraction pipeline"* (rec #24) + *"Practice prompt engineering techniques"* (rec #25)
- Domain 5 → practice: *"Study context management patterns"* (rec #26) + *"Review escalation and human-in-the-loop patterns"* (rec #27)

**`scenarios`** — 6 required `reading` items, one per scenario doc; `desc`
states the domains it draws on and its target metric, mirroring the Exam
Guide's own scenario list.

**`exam-day`** — replaces the old mock-exam section:
1. `cc.exam.1` reading: `exam-overview.md` (format/registration facts).
2. `cc.exam.2` practice: **complete the official Anthropic Practice Exam**
   (external, unlimited attempts — the real calibration tool; instructs the
   candidate to review every miss against the domain study guides above,
   rather than us re-hosting a weaker homemade mock).
3. `cc.exam.3` practice: take the certification exam (unchanged from today).

Total: **24 items** (up from 16), item IDs follow the existing
`^cc\.[a-z0-9-]+\.\d+$` scheme (e.g. `cc.d3.3`, `cc.scn.4`), all ≤ 32 chars.

Top-level `exam` block and `draft` flag are updated:

```json
{
  "certification": "claude-code",
  "draft": false,
  "exam": {
    "name": "Claude Certified Architect – Foundations",
    "link": "https://academy.anthropic.com/",
    "notes": "Reconciled against the official Exam Guide (v0.2) and a real exam pass (871/1000, 2026-06-26). Domains, weights, and scenarios match the confirmed blueprint."
  }
}
```

## New item fields: `optional` and `exam_note`

Two new, additive, optional fields on path-file items (no change to
required fields):

- `"optional": true` — this item is supplementary; it does **not** count
  toward the certification's "ready" status (see aggregate change below). If
  absent, an item is required (matches all existing items today — fully
  backward compatible).
- `"exam_note": "…"` — a one-line hint on *why* this hands-on task matters for
  the exam (e.g. *"Exam angle: hook vs. prompt determinism for a financial
  threshold rule."*). Only used on optional practice items in this content
  set, but not restricted to them.

**Frontend (`public/cert.js`)** stays permissive: it still tracks and ticks
every item regardless of `optional`, and `renderTotals()` continues to count
*all* items (required + optional) as "your" progress — the personal view is
intentionally everything you've done, bonus practice included. `renderBody()`
gains an `optional` badge (reusing `.kind-tag`, new `.kind-tag.optional`
style) and, when present, an `exam_note` line under the description (new
`.exam-note` CSS, small/muted).

`renderBanner()` is extended: today it renders nothing once `draft` is
`false`. It gains a plain (non-"Draft:"-prefixed) info line whenever
`exam.notes` is present, regardless of `draft`, so the "reconciled against
the official guide" provenance note is visible on the page.

**Worker (`worker/src/certifications.ts`)** — `CertInfo` gains
`requiredItemIds: string[]` (items where `optional !== true`), alongside the
existing `itemIds` (all items, unchanged meaning — back-compat for anything
still reading it).

**Aggregate (`worker/src/aggregate.ts`)** — the cert pass switches from
`def.itemIds` to `def.requiredItemIds` for `total_items`,
`engineers_started`/`engineers_ready`, and each engineer's
`certifications[id].{done,total,ready}`. This makes "ready to pass the exam"
mean *all required items done*, independent of whether optional bonus
practice was ticked — the entire point of introducing `optional`. Bump
`CACHE_KEY` (v5 → v6) since cached aggregate values computed under the old
"all items count" semantics would otherwise look stale/wrong post-deploy.

**Validator (`schema/validate-certifications.mjs`)** — `KINDS` gains
`"course"`; add light type checks: `optional` must be boolean if present,
`exam_note` must be a string if present (matching the project's existing
minimal-validation style — no stricter than the checks already in place for
`link`/`estimated_minutes`).

## Content authoring guidelines (for the implementation plan)

- Write in second person, addressing the engineer preparing for the exam —
  not as a first-person study diary.
- Every domain/scenario doc's "harder practice question" must be original:
  new scenario framing, new specific numbers/details, not a reworded version
  of any sample, mock, or (especially) private practice-exam question.
  Difficulty bar: should require combining two concepts or spotting a subtler
  distractor than the Guide's own sample questions do.
- No references to official-exam question numbers, attempt scores, or "this
  came up on my exam" framing anywhere in `docs/certifications/` or the JSON —
  keep the confidentiality boundary invisible to the reader, not just
  technically absent.
- Where a domain doc's content already fully covers a legacy draft item
  (e.g. `cc.mcp.1` "What MCP is" vs. the new Domain 2 study guide), drop the
  redundant legacy item rather than keep both.

## Rollout

Same as the existing cert-paths feature: push to `main` → Pages redeploys
`public/**` and the new `docs/certifications/**`; **`wrangler deploy` from
`worker/` is required** (new `requiredItemIds` field, aggregate semantics
change, cache key bump). Verify: cert page renders all 8 sections with
correct counts; ticking an optional item does not change the dashboard's
"ready" status for that engineer; ticking every required item does.

## Out of scope

- Certifications other than Claude Code (no change to the generic
  registry/extensibility model from the original design).
- Any UI for authoring cert content (still hand-edited JSON + validator).
- Reworking the dashboard's cert-readiness UI beyond consuming the new
  `requiredItemIds`-based numbers (no visual/layout change needed).
- Re-adding a self-hosted mock exam — deliberately replaced by pointing to
  Anthropic's own official Practice Exam.
