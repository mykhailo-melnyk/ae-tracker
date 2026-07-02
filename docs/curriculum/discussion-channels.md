# Per-Level Discussion Channels — Setup Plan

A plan for standing up discussion forums for the agentic-engineering curriculum,
one channel per level, so questions, shared resources, and mock-exam coordination
stay organized by level instead of piling into a single busy room.

> **Status:** proposal for the program owner to action. Creating the channels is
> an organizational step (not a change to this repo). This doc is the blueprint.
> Source: GitHub issue #15 (feedback from @martin-daprotis).

## Why per-level

Engineers move through five levels at their own pace. A single shared channel
mixes an L1 beginner's "how do I install Claude Code?" with an L5 discussion of
evaluation harnesses — noise for both. One channel per level keeps each
conversation relevant to the people currently in it, and makes the pinned
resources for a level easy to find.

## Channel structure

Six channels: one general channel plus one per level. Names are derived from the
level titles in `public/curriculum.json`.

| Channel | Level | Focus |
|---|---|---|
| `#ae-general` | — | Announcements, logistics, cross-level chat, "which level am I?" questions. Keeps the level channels on-topic. |
| `#ae-l1-understand` | L1 · Understand | Tool setup, LLM mechanics, spotting hallucinations. |
| `#ae-l2-edit-with-review` | L2 · Edit with Review | Prompting, diff-review habits, security basics, the AI-test trap. |
| `#ae-l3-plan-and-implement` | L3 · Plan and Implement | Spec-driven work, plan mode, evaluating AI systems. |
| `#ae-l4-orchestrate` | L4 · Orchestrate | Skills/plugins, MCP, hooks, subagents, tracing & cost. |
| `#ae-l5-architecture-partner` | L5 · AI as Architecture Partner | Anti-sycophancy, evaluator-optimizer, the Claude API, verification harnesses. |

**Slack:** create the six channels above (the `#` prefix is Slack's).
**Teams:** create one Team named **"Agentic Engineering"** with these as its
channels (same names, drop the `#`).

## One channel per level — not per competency

The curriculum has three competencies (`web`, `mobile`, `backend`), but the L1–L5
framing, level goals, and most discussion topics are shared across them. Creating
a channel per competency *and* level would mean 15 channels — sprawl that works
against the goal of keeping rooms active and focused.

**Recommendation:** start with the six level channels only. If one competency's
traffic grows enough to warrant its own space, split just that one out later
(e.g. a `#ae-l4-orchestrate-mobile` thread or channel) rather than pre-creating
the full grid.

## What goes in each channel

- **Level channels:** questions about that level's tasks, sharing courses /
  articles / references relevant to that level, and coordinating mock exams and
  study pairings for that level's assessment.
- **`#ae-general`:** program announcements, scheduling, tooling news that spans
  levels, and anything off-topic for a specific level. When a thread in a level
  channel drifts, move it here.

## Pinned resources per level channel

Pin these on day one so newcomers self-serve before asking:

1. The level's explanation on the knowledge base — the level `link` from
   `public/curriculum.json`.
2. The level's assessment rubric —
   `docs/curriculum/assessments/L<n>.md` in this repo.
3. Any golden examples relevant to the level (e.g. the good `CLAUDE.md`, the
   good AI-assisted PR, the good spec, the good eval).
4. A one-line "how to use this channel" note (mirroring the norms below).

## Norms

Keep it light — a few shared expectations, not a rulebook:

- **Search before asking.** The answer may already be pinned or in a recent thread.
- **Use threads.** Reply in-thread to keep the main channel scannable.
- **Right room.** Post in the channel for the level you're asking about; use
  `#ae-general` for cross-level or logistics.
- **Share what helped you.** A link or note that unblocked you will unblock the
  next person.
- **Owner / moderator.** Name one person per channel (or one across all) to seed
  discussion, keep pins current, and answer or route stray questions.

## Optional future hook (separate work)

Once the channels exist and have stable URLs, the tracker can surface a
per-level **"💬 Discuss this level"** link next to the existing
"Read the full level explanation on GitHub" link in each level card. That is a
small frontend change (an optional `discussion_url` per level in the manifest,
rendered in `renderFocusCard`) and is intentionally **out of scope here** — track
it as its own issue if wanted.
