# AE Progress Tracker — Time-to-Complete Estimates

> Source material for a manager-facing presentation on AI enablement at Solvd. Data only — narrative slides built around this.

## What this is

The Solvd AE (Agentic Engineering) curriculum is a 5-level path that takes a software engineer from "uses AI casually" to "uses AI as an architecture partner". 45 tasks total: readings from our internal knowledge base, hands-on practice tasks, one long-form video (Andrej Karpathy's "Deep Dive into LLMs"), and 11 free Anthropic Academy courses with certificates. Each engineer's progress is tracked individually in the [AE Progress Tracker](https://mykhailo-melnyk.github.io/ae-tracker/tracker.html); aggregate adoption is visible on the [admin dashboard](https://mykhailo-melnyk.github.io/ae-tracker/dashboard.html).

## Why now

Industry adoption of AI coding tools has moved from "experiment" to "table stakes" in the last 12 months. Solvd's leadership has set a direction: turn software engineers into *agent* software engineers — engineers who use AI fluently to multiply their output. The choice now isn't *whether* to upskill the unit but whether to do it deliberately or by accident.

Doing it by accident — letting each engineer figure it out alone — produces what we see today: a wide variance in capability, a small fraction of "power users", and a long tail of engineers who tried AI tools once and stopped. Doing it deliberately, with a shared curriculum and visible progress tracking, gets the whole unit to a consistent baseline (Level 2) in a predictable timeframe and identifies the cohort ready to push further (Levels 3-5).

## Success criteria

We will know this program is working when, **6 months in**:

| Metric | Source | Target |
|---|---|---|
| Engineers signed up & started L1 | Tracker dashboard | ≥ 85% of unit |
| Engineers at L2 or higher | Tracker dashboard | ≥ 55% of unit |
| Engineers stalled (no activity in 14d) | Tracker dashboard | ≤ 10% of *started* |
| Average curriculum completion | Tracker dashboard | ≥ 50% |
| Custom commands / skills shared across teams | Manual count | ≥ 5 reusable artifacts |
| Engineers reporting they use Claude Code daily | Quarterly survey | ≥ 50% |

L2 ("Edit with Review") is the explicit target steady state for most engineers per the original curriculum design. Hitting 55% at L2+ in 6 months means the bulk of the unit is operating at the level where AI-assisted development is productive and quality-controlled, not chaotic.

## 3 / 6 / 12-month milestones

Targets are aspirational and assume engineers receive **~5 hrs/week of explicit upskilling time** (see "What we're asking for" below). All percentages are of the business-unit headcount.

| Milestone | 3 months | 6 months | 12 months |
|---|---:|---:|---:|
| % signed up & started L1 | 70% | 85% | 95% |
| % completed L1 (Understand) | 45% | 75% | 90% |
| % at L2+ (target steady state) | 30% | 55% | 75% |
| % at L3+ (feature leads) | 8% | 20% | 35% |
| % at L4+ (platform engineers) | 2% | 8% | 15% |
| % at L5 (architects) | 0% | 2% | 5% |
| Stalled rate (no activity 14d) | ≤ 20% | ≤ 10% | ≤ 8% |

Multiply by your unit headcount to get absolute numbers. Example for a 100-engineer unit at 6 months: 85 started, 55 at L2+, 20 at L3+, 8 at L4+, 2 at L5.

## What we're asking for

To hit the targets above, we need the following. Items marked **[fill in]** require your decision before the presentation.

1. **Dedicated time:** ~5 hrs/week of explicit upskilling time per engineer, treated as work — not done on top of a full sprint load. Without dedicated time, the timelines stretch by ~3-4x and engagement falls off. *[fill in: confirm this is acceptable, or propose an alternative cadence]*

2. **Endorsement / sponsorship:** A public endorsement from you to the unit at all-hands or via Teams, framing the program as a strategic priority not a side project. Quick to do, high leverage on adoption rates. *[fill in: confirm you're willing to send the kickoff message; we'll draft it for you]*

3. **OKR inclusion (optional):** Add `% of unit at L2+` as an OKR for the business unit at the next quarterly cycle. Makes the program visible to senior leadership and converts a soft target into a tracked one. *[fill in: yes / no / discuss]*

4. **Lead identification:** Help name 2-3 engineers in the unit to act as ambassadors — they pilot the curriculum first, give feedback, then evangelize. They should be people who already use AI tools and have peer respect. *[fill in: who do you have in mind?]*

5. **Measurement boundaries:** Confirm that the tracker data will **not** be used as performance-review input for individuals. The whole point is honest self-reporting; if engineers think the data feeds into their performance review, they'll game it. We're optimizing for unit-level adoption visibility, not individual-level surveillance. *[fill in: confirm this commitment]*

6. **Budget:** None requested. All Anthropic Academy courses are free with certificates. Claude Code is free for individual use. The tracker is self-hosted on free tiers. *[fill in: revisit only if we later want enterprise Claude Code seats or paid training]*

## Estimated time per level

| Level | Theme | Reading | Practice | Video | Courses | **Total** |
|---|---|---:|---:|---:|---:|---:|
| **L1 Understand** | Use AI to read, not write | 1.5 h | 1 h | 3.5 h | 16–23 h (5 courses) | **22–29 h** |
| **L2 Edit with Review** | Quality is the point | 1.5–2 h | 2–3 h | — | 3–4 h (1 course) | **7–9 h** |
| **L3 Plan and Implement** | Think before building | 45 m | 2–3 h | — | 30 m–1 h (rewatch) | **3–5 h** |
| **L4 Orchestrate** | Multiply your output | 2 h | 6–10 h | — | 4–6 h (2 courses) | **12–18 h** |
| **L5 AI as Architecture Partner** | Use AI for thinking | 20 m | 2–3 h | — | 23–32 h (3 courses) | **26–35 h** |
| **Whole curriculum** |  | ~6 h | ~13–19 h | 3.5 h | ~47–66 h | **~70–96 h** |

## Calendar projection

Most engineers will work through this part-time alongside their normal workload. Translating hour-ranges into calendar time at common cadences:

| Level | Hours | @ 5 h/week | @ 10 h/week |
|---|---:|---|---|
| L1 only | 22–29 h | 4.5–6 weeks | ~3 weeks |
| Through L2 (target for most engineers) | 29–38 h | 6–8 weeks | 3–4 weeks |
| Through L3 (feature leads) | 32–43 h | 6.5–9 weeks | 3–4.5 weeks |
| Through L4 (platform engineers) | 44–61 h | 9–13 weeks | 4.5–6 weeks |
| Through L5 (architects) | 70–96 h | 14–20 weeks | 7–10 weeks |

**Practical reading:** at 5 hours/week of dedicated upskilling time, an engineer reaches the target steady state (L2) in **6–8 weeks**. Reaching L3 is one extra week; L4 and L5 are the substantial additional commitments and are not the default destination.

## Who should reach which level

Per the original curriculum design ([levels.md in the KB](https://github.com/solvdinc/agentic-engineering/blob/main/general/getting-started/levels.md)):

| Audience | Target level |
|---|---|
| Every engineer | **L2** (Edit with Review) — the "target steady state" |
| Engineers leading multi-file changes | L3 (Plan and Implement) |
| Platform / DevOps / tooling-focused engineers | L4 (Orchestrate) |
| Architects, tech leads making system-level decisions | L5 (AI as Architecture Partner) |

The original guidance is explicit: "Levels 3–5 exist for specific roles — feature leads, platform engineers, architects — not as a universal destination. Being excellent at Level 2 is more valuable than being mediocre at Level 4."

## Caveats

1. **Anthropic Academy doesn't publish course durations.** The course-hour estimates above are derived from module/lesson counts × ~15–20 minutes per lesson. Real time-on-task depends on playback speed, whether engineers do the embedded exercises, and prior knowledge.
2. **Practice tasks are the biggest variable.** "Run a spec-driven implementation end-to-end" (L4) is anywhere from half a day to a week depending on what feature the engineer picks.
3. **Background knowledge collapses the timeline.** Engineers who already use Claude Code daily can finish L1 in ~3–5 hours (mostly just the foundational Anthropic courses they haven't taken yet). The ranges above assume someone starting from "I've heard of AI coding tools".
4. **Hours ≠ competency.** The curriculum's "Move on when" criteria are skill-based, not time-based. Finishing the checkboxes is necessary but not sufficient — the practice tasks are designed to build judgment that only emerges with real work.

## Source

- Curriculum: [`public/curriculum.json`](public/curriculum.json) in this repo (45 tasks across 5 levels).
- Design narrative: [`general/getting-started/levels.md`](https://github.com/solvdinc/agentic-engineering/blob/main/general/getting-started/levels.md) in the knowledge base.
- Tracker (live): https://mykhailo-melnyk.github.io/ae-tracker/tracker.html
