# Design: Reconcile Claude Code cert prep content with the official exam blueprint

**Date:** 2026-07-06
**Status:** Approved (brainstorming) — revised to a Task-Statement-centric,
Exam-Guide-anchored study path (synthetic practice questions dropped).
**Branch:** `feature/certification-prep-paths` (PR #24, already open — this is additive work on the same branch)

## Summary

`public/certification.claude-code.json` currently ships as a `"draft": true`
starter path with **generic Claude Code tool-usage content** (install, daily
workflows, MCP wiring) that does not reflect the real exam. This is the
follow-up explicitly called out as out-of-scope in the original cert-paths
design: *"reconcile Claude Code starter content against the confirmed
official Anthropic exam blueprint."*

The author has since **passed the exam** and has detailed personal study
material (domain notes, scenario breakdowns) plus the official,
publicly-distributed **Exam Guide PDF**
(`Claude_Certified_Architect_-_Foundations_-_Exam_Guide.pdf`, v0.2).

**The design is anchored on the Exam Guide, because that is the tested
surface.** The guide's Content Outline defines **5 domains + 6 scenarios** and,
crucially, **30 Task Statements** (Domain 1: 7, Domain 2: 5, Domain 3: 6,
Domain 4: 6, Domain 5: 6), each with explicit *Knowledge of* / *Skills in*
bullet lists. Per the author (who passed), the single highest-leverage prep
activity was **working through each Task Statement individually in a Socratic
dialogue with an LLM — asking questions and requesting concrete examples** —
and the real exam questions map directly onto the guide's listed topics.
Self-authored / synthetic multiple-choice questions, by contrast, added
**near-zero preparation value**.

This design therefore makes the **30 Task Statements the study spine**, worked
one at a time with that proven method, uses the author's notes as a distilled
companion, adopts the guide's own **4 Preparation Exercises** as the required
hands-on practice, and adds fast-review artifacts — while drawing a hard line
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
  its question numbers (e.g. "Q35"), to attempt scores, or to "this came up on
  my exam" anywhere in published content — the boundary must be **invisible to
  the reader**, not merely technically absent.
- **Safe to use as-is (public Exam Guide content):** the guide's **Content
  Outline** — domain names, weights, and the **Task Statements** with their
  *Knowledge of* / *Skills in* bullet lists (this is the published syllabus);
  the guide's **Sample Questions**, **Preparation Exercises (1–4)**, **In-Scope
  / Out-of-Scope topic lists**, and the **Appendix "Technologies and
  Concepts"**. The guide is distributed publicly to help candidates prepare and
  explicitly states its sample questions "illustrate the format and difficulty
  level of the exam." Task Statement bullet lists and the scope/concept lists
  may be quoted/paraphrased directly; the **Sample Questions are used only as a
  difficulty reference and are not reproduced into the path** (see below — this
  design authors no multiple-choice questions at all).
- **Safe to port and publish (author's own original work):** `notes/domains/
  *.md` and `notes/scenarios/*.md` — personal synthesis, not exam content.
  Ported in **adapted, generalized form**: rewritten from a first-person study
  log into second-person prep material, and stripped of any wording that ties
  a heuristic to a specific official-exam question/attempt.
- **Not ported (dropped, not reworked):** `notes/practice/practice-questions*.md`
  and `notes/practice/scenario-practice-questions*.md` (the author's
  self-authored 40-question mock and 24-question scenario mock). Per the author,
  who passed the exam, **self-authored / synthetic multiple-choice questions
  carry near-zero preparation value** — they are noticeably weaker than the real
  exam and do not build the judgment it tests. They stay private. Their role
  ("how do I test myself") is filled better by **active-recall self-checks per
  Task Statement** (below) plus the **official Practice Exam** as the final
  calibration. This design authors **no synthetic multiple-choice questions**,
  which also shrinks the confidentiality surface to nothing.

## Content architecture

New folder **`docs/certifications/claude-code/`** (English only, mirrors the
existing `docs/curriculum/` convention: markdown lesson content authored
in-repo, linked from JSON items via GitHub blob URL). **17 docs total.**

### Five domain study guides — organized by Task Statement

`domain-1-agentic-architecture.md`, `domain-2-tool-design-mcp.md`,
`domain-3-claude-code-config.md`, `domain-4-prompt-structured-output.md`,
`domain-5-context-reliability.md`.

Each domain guide opens with the domain title + official number + weight (e.g.
"Domain 1: Agentic Architecture & Orchestration — 27%") and a short "how to
work this domain" note, then contains **one section per Task Statement** of that
domain (all 30 covered across the five files). Each Task Statement section
follows a fixed **4-part template**:

1. **What's tested** — the Task Statement's official *Knowledge of* / *Skills in*
   bullets (verbatim/paraphrased from the guide — public syllabus), framed as a
   checklist of "I can explain / I can do this."
2. **Distilled notes** — the author's practical synthesis for this sub-point:
   mental models, terminology, root-cause diagnostics, and the domain's
   answer-elimination heuristics, generalized (adapted from
   `notes/domains/domainN-summary.md`).
3. **Deep-dive prompt** — a ready-to-paste prompt that runs the exact Socratic
   exploration that worked for the author: have Claude explain the concept,
   produce concrete examples and counter-examples, then quiz the reader. This
   **operationalizes the highest-value study method** as a self-service path
   element.
4. **Active-recall self-check** — 1–3 recall questions derived directly from the
   *Knowledge of* / *Skills in* bullets (e.g. *"When would you choose a hook over
   a prompt for workflow ordering? Give the financial-threshold example."* /
   *"How does a valid empty result differ from an access failure, and why does
   the distinction matter?"*). These are **recall prompts, not multiple-choice
   questions** — they mirror how the guide itself frames the skill.

The domain guide closes with a one-screen **decision-heuristics recap** for that
domain (the "how to spot the right answer" elimination patterns).

### Six scenario docs

`scenario-1-customer-support.md`, `scenario-2-code-generation.md`,
`scenario-3-multi-agent-research.md`, `scenario-4-developer-productivity.md`,
`scenario-5-cicd.md`, `scenario-6-structured-extraction.md` (names and content
match the guide's Exam Scenarios and the author's `notes/scenarios/*.md`).

Each scenario doc follows:
1. Setup (agent, tools, target metric) — from the guide + `notes/scenarios/*.md`.
2. Primary domains it draws on (as listed in the guide).
3. Signature failure modes → best practice, **generalized** (no attempt-error /
   question-number framing).
4. A "domain → this scenario" bridge table mapping the relevant Task Statements
   to how they surface in this scenario.

### Cross-cutting docs

- `exam-overview.md` — format facts from the guide's public "Exam Details at a
  Glance" (60 questions, 120 minutes, 4-of-6 scenarios, multiple choice with 1
  correct + 3 distractors, scaled 100–1000, pass 720, 12-month validity, $125
  fee, online-proctored or test-center) + registration pointer (Anthropic
  Academy) + the **recommended study order by weight** (see below).
- `scope-map.md` — the guide's **In-Scope** and **Out-of-Scope** topic lists,
  plus the Appendix "Technologies and Concepts". The Out-of-Scope list (e.g.
  fine-tuning, vision, streaming, prompt-caching internals, tokenization, cloud
  configs) is high-leverage: it tells candidates what **not** to spend time on.
- `heuristics-cheatsheet.md` — one page consolidating the decisive
  answer-elimination heuristics across all five domains (root-cause-vs-symptom,
  determinism-vs-calibration, right-tool, proportionate-first-step). A
  final-review artifact.
- `glossary-and-synonyms.md` — terms plus the exam's synonym pairs the reader
  must recognize (`orchestrator-workers` = hub-and-spoke; `primacy/recency`
  effect; `evaluator-optimizer`; `graceful degradation with transparency` =
  coverage annotations). Seeded from the guide's Appendix and the author's
  compiled synonyms.
- `easy-to-confuse.md` — de-identified confusable pairs distilled from the
  hardest lessons: self-review-for-bugs vs self-critique-for-completeness; poor
  tool descriptions vs clean descriptions overridden by keyword-sensitive
  system-prompt instructions; hook-for-critical-rules vs prompt-for-judgment;
  valid-empty-result vs access-failure; `tool_choice` `any` vs forced; plan mode
  vs direct execution; batch API vs synchronous API.
- `exercises.md` — the guide's **4 Preparation Exercises** paraphrased (objective
  + numbered steps + domains reinforced), one anchored section each, so the
  `exercises` path items can deep-link to them. (Public guide content — safe to
  paraphrase. This is the 17th doc; the guide's Exercises are richer than its
  terse recommendation list #21–27, so they are the hands-on spine.)

**No synthetic multiple-choice questions are authored anywhere.** The guide's 12
Sample Questions are cited in `exam-overview.md` as the difficulty reference the
reader should study *in the guide*, not reproduced here.

## Study order (by exam weight) and domain numbering

**Official domain numbers, names, and weights are never renumbered.** They are
the shared vocabulary with the exam and the Exam Guide; relabeling them would
desync the path from the authoritative source and confuse any candidate who
cross-references the guide or the exam's weight breakdown.

Instead, the **path presents domains in recommended study order** while keeping
each labeled with its official number + weight. The order (highest-leverage
first, per weight and the author's experience) is:

**Domain 1 (27%) → Domain 3 (20%) → Domain 4 (20%) → Domain 2 (18%) →
Domain 5 (15%).**

Mechanically: the JSON `sections[]` array is physically ordered in this study
sequence (the frontend renders in array order), and each domain section's `id`
retains its official number (`cc.d1`, `cc.d3`, `cc.d4`, `cc.d2`, `cc.d5`) with
its official number + weight in the title. `exam-overview.md` states this order
explicitly and links `scope-map.md`.

## `certification.claude-code.json` restructure

Drop the current 6 generic sections. New sections, **in study order**:

| Section id | Title | Items |
|---|---|---|
| `start` | How to use this path | 3 (2 required + 1 optional) |
| `domain-1` | Domain 1: Agentic Architecture & Orchestration (27%) | 1 |
| `domain-3` | Domain 3: Claude Code Configuration & Workflows (20%) | 1 |
| `domain-4` | Domain 4: Prompt Engineering & Structured Output (20%) | 1 |
| `domain-2` | Domain 2: Tool Design & MCP Integration (18%) | 1 |
| `domain-5` | Domain 5: Context Management & Reliability (15%) | 1 |
| `exercises` | Hands-on exercises | 4 |
| `scenarios` | Exam scenarios (4 of 6 appear on the exam) | 6 |
| `final-review` | Final review | 3 |
| `exam-day` | Exam day | 2 |

**Total: 23 items — 22 required + 1 optional.** Item IDs follow the existing
`^cc\.[a-z0-9-]+\.\d+$` scheme (e.g. `cc.d3.1`, `cc.ex.2`, `cc.scn.4`,
`cc.rev.1`), all ≤ 32 chars. Note the section *id*s keep the official domain
number even though the array order is the study order.

**`start`** — orientation before domain prep:
- `cc.start.1` reading → `exam-overview.md` (format, registration, study order).
- `cc.start.2` reading → `scope-map.md` (what is and isn't tested — read this
  before diving in).
- `cc.start.3` course, **`optional: true`** — Anthropic's free "Claude with the
  Anthropic API" course, recommended as a foundation:

```json
{ "id": "cc.start.3", "kind": "course", "optional": true,
  "title": "Claude with the Anthropic API (official course)",
  "desc": "Anthropic's free, in-depth course covering the Messages API, tool use, and prompting fundamentals used throughout the exam. Long, but a high-leverage foundation before domain prep.",
  "link": "https://anthropic-partners.skilljar.com/claude-with-the-anthropic-api",
  "estimated_minutes": 240 }
```

(`kind: "course"` already has CSS support in `public/styles.css:231` — unused
until now — and is a valid `kind` in the curriculum schema; the cert
validator's `KINDS` set gains `"course"`.)

**Each domain section** — one required `reading` item linking that domain's
study guide (which internally covers all its Task Statements with the 4-part
template, deep-dive prompts, and active-recall self-checks). One checkbox per
domain keeps the tracker's item count meaningful; the per-Task-Statement depth
lives inside the doc.

**`exercises`** — the guide's **4 Preparation Exercises** as required `practice`
items, each linking to its anchored section in `exercises.md` and carrying an
`exam_note` naming the domains it reinforces:
- `cc.ex.1` → Exercise 1: *Build a Multi-Tool Agent with Escalation Logic* (D1, D2, D5)
- `cc.ex.2` → Exercise 2: *Configure Claude Code for a Team Development Workflow* (D3, D2)
- `cc.ex.3` → Exercise 3: *Build a Structured Data Extraction Pipeline* (D4, D5)
- `cc.ex.4` → Exercise 4: *Design and Debug a Multi-Agent Research Pipeline* (D1, D2, D5)

These are richer than the guide's terse recommendation list (#21–27) — they
carry 20 concrete numbered steps — so they, not #21–27, are the hands-on spine.
They are **required** (they count toward readiness): the exam tests applied
judgment, so hands-on practice must be part of "ready", not a bonus.

**`scenarios`** — 6 required `reading` items, one per scenario doc; each `desc`
states the primary domains and target metric, mirroring the guide's scenario
list.

**`final-review`** — 3 required `reading` items: `cc.rev.1` heuristics
cheat-sheet, `cc.rev.2` glossary & synonyms, `cc.rev.3` easy-to-confuse pairs.

**`exam-day`**:
- `cc.exam.1` practice → complete the **official Anthropic Practice Exam**
  (external, unlimited attempts — the real calibration tool; instructs the
  candidate to review every miss against the domain study guides above).
- `cc.exam.2` practice → take the certification exam (the finish line).

Top-level `exam` block and `draft` flag are updated (**neutral provenance — no
score published**):

```json
{
  "certification": "claude-code",
  "draft": false,
  "exam": {
    "name": "Claude Certified Architect – Foundations",
    "link": "https://academy.anthropic.com/",
    "notes": "Reconciled against the official Exam Guide (v0.2) and a real exam pass. Domains, weights, task statements, and scenarios match the confirmed blueprint."
  }
}
```

## New item fields: `optional` and `exam_note`

Two new, additive, optional fields on path-file items (no change to
required fields):

- `"optional": true` — this item is supplementary; it does **not** count
  toward the certification's "ready" status (see aggregate change below). If
  absent, an item is required (matches all existing items today — fully
  backward compatible). In this content set only `cc.start.3` (the official
  course) is optional.
- `"exam_note": "…"` — a one-line hint on *why* this task matters for the exam
  (e.g. *"Reinforces D1/D2/D5: agentic loop, tool descriptions, escalation."*).
  Used on the exercise items here, but not restricted to them.

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
the official guide" provenance note is visible on the page. (The note carries
no score.)

**Worker (`worker/src/certifications.ts`)** — `CertInfo` gains
`requiredItemIds: string[]` (items where `optional !== true`), alongside the
existing `itemIds` (all items, unchanged meaning — back-compat for anything
still reading it).

**Aggregate (`worker/src/aggregate.ts`)** — the cert pass switches from
`def.itemIds` to `def.requiredItemIds` for `total_items`,
`engineers_started`/`engineers_ready`, and each engineer's
`certifications[id].{done,total,ready}`. This makes "ready to pass the exam"
mean *all required items done*, independent of whether optional bonus
practice was ticked. Bump `CACHE_KEY` (v5 → v6) since cached aggregate values
computed under the old "all items count" semantics would otherwise look
stale/wrong post-deploy.

**Validator (`schema/validate-certifications.mjs`)** — `KINDS` gains
`"course"`; add light type checks: `optional` must be boolean if present,
`exam_note` must be a string if present (matching the project's existing
minimal-validation style — no stricter than the checks already in place for
`link`/`estimated_minutes`).

## Content authoring guidelines (for the implementation plan)

- Write in second person, addressing the engineer preparing for the exam —
  not as a first-person study diary.
- **Author no synthetic multiple-choice questions.** Self-checks are
  active-recall / explain-and-example prompts derived from the Task Statement's
  *Knowledge of* / *Skills in* bullets. The guide's Sample Questions are the
  difficulty reference and are studied *in the guide*, cited from
  `exam-overview.md`, not copied here.
- Each Task Statement section must include a runnable **deep-dive prompt** that
  drives an LLM to explain → give concrete examples/counter-examples → quiz the
  reader.
- Quote/paraphrase the Task Statement bullets and the In-Scope/Out-of-Scope
  lists from the guide (public syllabus). Do **not** reference official-exam
  question numbers, attempt scores, or "this came up on my exam" anywhere in
  `docs/certifications/` or the JSON — keep the confidentiality boundary
  invisible to the reader.
- Generalize the author's failure-mode notes: new framing, no attempt/question
  attribution.
- Where a domain guide fully covers a legacy draft item (e.g. `cc.mcp.1` "What
  MCP is" vs. the new Domain 2 study guide), the legacy item is simply gone —
  the whole section set is replaced, not merged.

## Rollout

Same as the existing cert-paths feature: push to `main` → Pages redeploys
`public/**` and the new `docs/certifications/**`; **`wrangler deploy` from
`worker/` is required** (new `requiredItemIds` field, aggregate semantics
change, cache key bump).

Verify:
- Cert page renders all 10 sections **in study order** (start → D1 → D3 → D4 →
  D2 → D5 → exercises → scenarios → final-review → exam-day) with correct
  counts and each domain labeled with its official number + weight.
- Ticking the optional course does not change the engineer's "ready" status;
  ticking every required item (including the 4 exercises) does.
- Add a `worker/test/` vitest asserting the new aggregate semantics: optional
  items are excluded from `total_items`/`requiredItemIds`, and `ready` is true
  iff all required items are done regardless of whether the optional item is
  ticked.

Known migration note: flipping `draft:false` and replacing the old sections
means any historical ticks against removed IDs (`cc.fund.*`, `cc.flow.*`,
`cc.ctx.*`, `cc.mcp.*`, `cc.orch.*`, old `cc.exam.*`) become orphaned entries in
`progress/<username>.json` — harmless (`/api/mark` doesn't validate IDs and the
aggregate ignores unknown IDs) but they linger and an affected engineer's cert
`done` count drops. This is acceptable while the path is pre-launch (`draft`
was `true`); the verify step should spot-check an engineer who had ticked old
items.

## Out of scope

- Certifications other than Claude Code (no change to the generic
  registry/extensibility model from the original design).
- Any UI for authoring cert content (still hand-edited JSON + validator).
- Per-Task-Statement checkboxes in the tracker (depth lives inside the domain
  docs; the tracker keeps one checkbox per domain).
- Reworking the dashboard's cert-readiness UI beyond consuming the new
  `requiredItemIds`-based numbers (no visual/layout change needed).
- Re-adding a self-hosted mock exam or authoring synthetic questions —
  deliberately replaced by active-recall self-checks, deep-dive prompts, and
  Anthropic's own official Practice Exam.
- Renumbering the official exam domains (numbers/names/weights stay canonical;
  only the path's presentation order changes).
