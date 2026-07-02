# Design: Move LLM-mechanics content earlier in Web L1 (GitHub issue #14)

**Date:** 2026-07-02
**Source:** GitHub issue #14 (feedback from @martin-daprotis, Web competency)

## Summary

Reorder the Level 1 `tasks` array in `public/curriculum.web.json` so the
LLM-mechanics pair — `web-L1.T13` (Karpathy "Deep Dive into LLMs", optional
~3.5h video) and `web-L1.T14` (LLM Mechanics — Synthesized Notes, required
~10 min) — moves from positions 10–11 up to positions 5–6, immediately after
the mindset readings and before `web-L1.T8` ("Claude Code — Best Practices").

## Rationale

Martin's point: understanding how LLMs are constructed is foundational, yet the
LLM-mechanics content currently lands after the Claude Code tooling readings
(T8, T18, T19) and two practice tasks. Moving it earlier puts the mental model
before the tooling deep-dive.

We move the **pair** (T13 + T14) rather than the video alone because:
- T14 is the *required* piece; T13 is explicitly *optional* ("recommended for
  depth"). They cross-reference each other — T13's description says "the
  synthesized notes in the next task (L1.T14) are the primary required read,"
  and T14's says "read it before the Anthropic Academy courses below." Keeping
  them adjacent, with T13 immediately before T14 and both before the courses,
  keeps every cross-reference valid with **no description edits**.
- "Break the AI on purpose" (T17) stays at position 2 by design ("Before the
  wall of reading below, get your hands dirty… This anchors everything the
  mindset readings then explain"), so the reorder does not front-load a 3.5h
  video ahead of the hands-on hook.

## Change

Single file: `public/curriculum.web.json`, L1 `tasks` array reordered.

| Position | Before | After |
|---|---|---|
| 1 | web-L1.T5  | web-L1.T5 |
| 2 | web-L1.T17 | web-L1.T17 |
| 3 | web-L1.T6  | web-L1.T6 |
| 4 | web-L1.T7  | web-L1.T7 |
| 5 | web-L1.T8  | **web-L1.T13** |
| 6 | web-L1.T18 | **web-L1.T14** |
| 7 | web-L1.T19 | web-L1.T8 |
| 8 | web-L1.T1  | web-L1.T18 |
| 9 | web-L1.T2  | web-L1.T19 |
| 10 | web-L1.T13 | web-L1.T1 |
| 11 | web-L1.T14 | web-L1.T2 |
| 12–19 | T15, T9, T10, T11, T12, T3, T4, T16 | unchanged |

Net effect: T13 and T14 (in that order) lift out of positions 10–11 and insert
between T7 and T8; everything between shifts down by two.

## Constraints & safety

- **Only array order changes.** No task `id`, `kind`, `title`, `desc`, or
  `link` is modified. Per-user progress is keyed by task ID, so ticks are fully
  preserved.
- **No schema change.** Task IDs stay unique and competency-prefixed.
- **No Worker redeploy required.** The aggregate counts by task ID; ordering
  does not affect it. Only the Pages frontend (which renders in array order)
  needs the change, delivered by the normal push-to-`main` Pages deploy.

## Verification

- `node schema/validate-curriculum.mjs` passes (211 unique task ids, all
  prefixed).
- Diff of `curriculum.web.json` shows only the two task objects relocated,
  with byte-identical contents (semantic check: the set of L1 task objects is
  unchanged; only their order differs).

## Out of scope

- Any wording change to T13/T14 or other tasks.
- Reordering mobile/backend paths (they have their own L1 orderings; this
  feedback is web-specific).
