# AE Progress Tracker — Time-to-Complete Estimates

> Source material for a manager-facing presentation on AI enablement at Solvd. Data only — narrative slides built around this.

## What this is

The Solvd AE (Agentic Engineering) curriculum is a 5-level path that takes a software engineer from "uses AI casually" to "uses AI as an architecture partner". 45 tasks total: readings from our internal knowledge base, hands-on practice tasks, one long-form video (Andrej Karpathy's "Deep Dive into LLMs"), and 11 free Anthropic Academy courses with certificates. Each engineer's progress is tracked individually in the [AE Progress Tracker](https://mykhailo-melnyk.github.io/ae-tracker/tracker.html); aggregate adoption is visible on the [admin dashboard](https://mykhailo-melnyk.github.io/ae-tracker/dashboard.html).

## Why now

Industry adoption of AI coding tools has moved from "experiment" to "table stakes" in the last 12 months. Solvd's leadership has set a direction: turn software engineers into *agent* software engineers — engineers who use AI fluently to multiply their output. The choice now isn't *whether* to upskill the unit but whether to do it deliberately or by accident.

Doing it by accident — letting each engineer figure it out alone — produces what we see today: a wide variance in capability, a small fraction of "power users", and a long tail of engineers who tried AI tools once and stopped. Doing it deliberately, with a shared curriculum and visible progress tracking, gets the whole unit to a consistent baseline (Level 2) in a predictable timeframe and identifies the cohort ready to push further (Levels 3-5).

## Success criteria

L1 ("Understand") and L2 ("Edit with Review") are **universal baseline expectations for the unit** — every engineer is expected to reach them. L3-L5 remain role-dependent (feature leads, platform engineers, architects).

We will know this program is working when, **12 months in**:

| Metric | Source | Target |
|---|---|---|
| Engineers completed L1 | Tracker dashboard | **100% of unit** |
| Engineers completed L2 | Tracker dashboard | **100% of unit** |
| Engineers stalled (no activity in 14d) | Tracker dashboard | ≤ 5% of *active* |
| Average curriculum completion | Tracker dashboard | ≥ 75% |
| Custom commands / skills shared across teams | Manual count | ≥ 15 reusable artifacts |
| Engineers reporting they use Claude Code daily | Quarterly survey | ≥ 80% |

100% is the stated ambition. In practice, expect natural attrition: engineers on extended leave, exits, or late hires will leave a residual 5-10% short of literal 100% at any given snapshot. The headline target is "every engineer at L2 within their first 12 months in the unit."

L3-L5 are explicitly **not** unit-wide targets — see the "Who should reach which level" section below.

## 3- and 6-month milestones

Quarterly checkpoints between program start and the 12-month success criteria. Targets assume engineers receive **~5 hrs/week of explicit upskilling time** (see ask #3 in "What we're asking for"). The L1+L2 100% target at 12 months depends on this — without dedicated time, the calendar stretches roughly linearly and the deadline slips. All percentages are of the business-unit headcount.

| Milestone | 3 months | 6 months |
|---|---:|---:|
| % completed L1 (Understand) | 35% | 70% |
| % at L2+ (universal baseline) | 15% | 45% |
| % at L3+ (feature leads) | 3% | 12% |
| % at L4+ (platform engineers) | 0% | 5% |
| % at L5 (architects) | 0% | 1% |
| Stalled rate (no activity 14d) | ≤ 25% | ≤ 12% |

Multiply by your unit headcount to get absolute numbers. Example for a 100-engineer unit at 6 months: 70 completed L1, 45 at L2+, 12 at L3+, 5 at L4+, 1 at L5.

**Math check for the 100% L2 target:** L1+L2 cumulative time is 37-49 hours per engineer. At 5 hrs/week, that's 7-10 weeks of effective work. Spread across 12 months allows for onboarding lag, parental leave, project deadlines, and other interruptions — the per-engineer commitment is small enough that 100% is mathematically feasible *if* the dedicated time is allocated.

## What we're asking for

1. **OKR inclusion.** Add `% of unit at L2+` as an OKR for the business unit. Makes the program visible to senior leadership and converts a soft target into a tracked one. The OKR commitment should match the milestones table — e.g., 45% at L2+ at the 6-month mark, climbing to 100% at L2+ by the 12-month mark.

2. **Unit Leaders as the pilot cohort.** Unit Leaders complete the curriculum first — they're the natural ambassadors. Going through it themselves before rolling it down accomplishes three things: (a) builds their own AI fluency, (b) gives them firsthand experience of the time commitment and content quality, (c) makes their downstream advocacy credible to engineers. Start date for the Unit Leader cohort: *[fill in: target start date]*.

3. **Dedicated upskilling time — to be discussed.** The milestone targets above assume engineers receive ~5 hrs/week of explicit upskilling time, treated as work rather than added on top of full sprint load. With less dedicated time, the calendar stretches roughly linearly: at 2 hrs/week, hitting L2 in 6 months becomes hitting it in 12-15 months. This is the highest-leverage decision in the program and is partly a budget question — discuss what's feasible for the unit and adjust the milestones table to match.

4. **Budget — none requested for v1.** All Anthropic Academy courses are free with certificates. Claude Code is free for individual use. The tracker is self-hosted on free tiers (Cloudflare Workers + GitHub Pages + GitHub repo storage). Re-open this only if we later want enterprise Claude Code seats, paid training, or external coaching.

## To revisit later

These are intentionally not in scope for the initial ask but should be discussed before the program scales beyond the pilot:

- **Measurement boundaries.** Whether tracker data ever feeds into individual performance reviews. The dashboard shows per-engineer progress and stalled status. To preserve honest self-reporting, the standard recommendation is to commit explicitly that tracker data is unit-level only — but this is a policy decision for later.
- **Kickoff endorsement / all-hands message.** A leadership endorsement at unit kickoff would accelerate adoption but isn't strictly required if the OKR carries the weight.
- **External communications.** Whether to publish anything externally about Solvd's AE program (blog post, conference talk, partner outreach).

## Estimated time per level

| Level | Theme | Reading | Practice | Video | Courses | **Total** |
|---|---|---:|---:|---:|---:|---:|
| **L1 Understand** | Use AI to read, not write | 1.5 h | 1 h | 3.5 h | 16–23 h (5 courses) | **22–29 h** |
| **L2 Edit with Review** | Quality is the point | 2 h | 5–8 h | — | 3–4 h (1 course) | **15–20 h** |
| **L3 Plan and Implement** | Think before building | 1 h | 4–8 h | — | 30 m–1 h (rewatch) | **10–15 h** |
| **L4 Orchestrate** | Multiply your output | 2 h | 10–16 h | — | 4–6 h (2 courses) | **16–24 h** |
| **L5 AI as Architecture Partner** | Use AI for thinking | 20 m | 5–8 h | — | 23–32 h (3 courses) | **29–40 h** |
| **Whole curriculum** |  | ~7 h | ~25–43 h | 3.5 h | ~47–66 h | **~92–128 h** |

Practice hours across all levels reflect habit-formation cost, not single-sitting task completion. Examples: L2's "diff-review habit for one week" is ~3-5 hours of slowdown during real work; L3's "one real multi-file change end-to-end with Plan mode" is one full afternoon; L4's "Run a spec-driven implementation end-to-end" implies a real shipped feature; L5's anti-sycophancy and evaluator-optimizer techniques applied to a real architecture decision span days, not minutes.

## Calendar projection

Most engineers will work through this part-time alongside their normal workload. Translating hour-ranges into calendar time at common cadences:

| Level | Hours | @ 5 h/week | @ 10 h/week |
|---|---:|---|---|
| L1 only | 22–29 h | 4.5–6 weeks | ~3 weeks |
| Through L2 (target for most engineers) | 37–49 h | 7–10 weeks | 4–5 weeks |
| Through L3 (feature leads) | 47–64 h | 9–13 weeks | 5–6.5 weeks |
| Through L4 (platform engineers) | 63–88 h | 13–18 weeks | 6.5–9 weeks |
| Through L5 (architects) | 92–128 h | 18–26 weeks | 9–13 weeks |

**Practical reading:** at 5 hours/week of dedicated upskilling time, an engineer reaches the target steady state (L2) in **7–10 weeks** — roughly 2 months. Reaching L3 takes another 2–3 weeks. L4 and L5 are substantial additional commitments (each adds ~4–8 weeks) and are not the default destination.

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
