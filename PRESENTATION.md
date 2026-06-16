# AE Progress Tracker — Time-to-Complete Estimates

> Source material for a manager-facing presentation on AI enablement at Solvd. Data only — narrative slides built around this.

## What this is

The Solvd AE (Agentic Engineering) curriculum is a 5-level path that takes a software engineer from "uses AI casually" to "uses AI as an architecture partner". 67 tasks total: readings from our internal knowledge base and in-repo lesson notes, hands-on practice tasks, per-level assessments, one optional long-form video (Andrej Karpathy's "Deep Dive into LLMs", with synthesized notes as the required read), 12 free Anthropic Academy courses with certificates, and 7 supplementary deeplearning.ai courses. Each engineer's progress is tracked individually in the [AE Progress Tracker](https://mykhailo-melnyk.github.io/ae-tracker/tracker.html); aggregate adoption is visible on the [admin dashboard](https://mykhailo-melnyk.github.io/ae-tracker/dashboard.html).

## Why now

Industry adoption of AI coding tools has moved from "experiment" to "table stakes" in the last 12 months. Solvd's leadership has set a direction: turn software engineers into *agent* software engineers — engineers who use AI fluently to multiply their output. The choice now isn't *whether* to upskill the unit but whether to do it deliberately or by accident.

Doing it by accident — letting each engineer figure it out alone — produces what we see today: a wide variance in capability, a small fraction of "power users", and a long tail of engineers who tried AI tools once and stopped. Doing it deliberately, with a shared curriculum and visible progress tracking, gets the whole unit to a consistent baseline (Level 2) in a predictable timeframe and identifies the cohort ready to push further (Levels 3-5).

## Success criteria

L1 ("Understand") and L2 ("Edit with Review") are **universal baseline expectations for the unit** — every engineer is expected to reach them. L3-L5 remain role-dependent (feature leads, platform engineers, architects).

We will know this program is working when, **6 months in**:

| Metric | Source | Target |
|---|---|---|
| Engineers completed L1 | Tracker dashboard | **100% of unit** |
| Engineers completed L2 | Tracker dashboard | **100% of unit** |
| Engineers stalled (no activity in 14d) | Tracker dashboard | ≤ 5% of *active* |
| Average curriculum completion | Tracker dashboard | ≥ 60% |
| Custom commands / skills shared across teams | Manual count | ≥ 10 reusable artifacts |
| Engineers reporting they use Claude Code daily | Quarterly survey | ≥ 70% |

100% is the stated ambition. In practice, expect natural attrition: engineers on extended leave, exits, or late hires will leave a residual 5-10% short of literal 100% at any given snapshot. The headline target is "every engineer at L2 within their first 6 months in the unit."

L3-L5 are explicitly **not** unit-wide targets — see the "Who should reach which level" section below.

## 3- and 6-month milestones

The 6-month column is the success-criteria endpoint; the 3-month column is the halfway checkpoint. Targets assume engineers receive **~5 hrs/week of explicit upskilling time** (see ask #3 in "What we're asking for"). The L1+L2 100% target depends on this — without dedicated time, the calendar stretches roughly linearly and the 6-month deadline slips. These targets were originally sized against ~37–49 h of L1+L2 work; the mid-2026 curriculum expansion raised that to **53–70 h**, so the 6-month target is now tighter — see the math check below. All percentages are of the business-unit headcount.

| Milestone | 3 months | 6 months |
|---|---:|---:|
| % completed L1 (Understand) | 55% | **100%** |
| % at L2+ (universal baseline) | 30% | **100%** |
| % at L3+ (feature leads) | 5% | 25% |
| % at L4+ (platform engineers) | 1% | 10% |
| % at L5 (architects) | 0% | 2% |
| Stalled rate (no activity 14d) | ≤ 20% | ≤ 5% |

Multiply by your unit headcount to get absolute numbers. Example for a 100-engineer unit at 6 months: 100 completed L1, 100 at L2+, 25 at L3+, 10 at L4+, 2 at L5 (net of natural attrition).

**Math check for the 100% L2 target:** L1+L2 cumulative time is now **53-70 hours** per engineer — up from 37-49 h before the mid-2026 curriculum expansion. At 5 hrs/week, that's **11-14 weeks** of effective work. Spread across 6 months (26 weeks) still allows for onboarding lag, parental leave, project deadlines, and other interruptions — feasible *if* the dedicated time is allocated, but **noticeably tighter than before the expansion** (less slack against the 6-month deadline). Without dedicated time (engineers fitting it into the margins of full sprint loads), the realistic 6-month outcome is ~50-60% at L2+, not 100%.

## What we're asking for

1. **OKR inclusion.** Add `% of unit at L2+` as an OKR for the business unit. Makes the program visible to senior leadership and converts a soft target into a tracked one. The OKR commitment should match the milestones table — 30% at L2+ at the 3-month checkpoint, 100% at L2+ at the 6-month endpoint.

2. **Unit Leaders as the pilot cohort.** Unit Leaders complete the curriculum first — they're the natural ambassadors. Going through it themselves before rolling it down accomplishes three things: (a) builds their own AI fluency, (b) gives them firsthand experience of the time commitment and content quality, (c) makes their downstream advocacy credible to engineers. Start date for the Unit Leader cohort: *[fill in: target start date]*.

3. **Dedicated upskilling time — to be discussed.** The milestone targets above assume engineers receive ~5 hrs/week of explicit upskilling time, treated as work rather than added on top of full sprint load. With less dedicated time, the calendar stretches roughly linearly: at 2 hrs/week, hitting L2 in 6 months becomes hitting it in roughly 15-20 months (the larger post-expansion curriculum pushes this out further). This is the highest-leverage decision in the program and is partly a budget question — discuss what's feasible for the unit and adjust the milestones table to match.

4. **Budget — none requested for v1.** All Anthropic Academy courses are free with certificates. Claude Code is free for individual use. The tracker is self-hosted on free tiers (Cloudflare Workers + GitHub Pages + GitHub repo storage). Re-open this only if we later want enterprise Claude Code seats, paid training, or external coaching.

## To revisit later

These are intentionally not in scope for the initial ask but should be discussed before the program scales beyond the pilot:

- **Measurement boundaries.** Whether tracker data ever feeds into individual performance reviews. The dashboard shows per-engineer progress and stalled status. To preserve honest self-reporting, the standard recommendation is to commit explicitly that tracker data is unit-level only — but this is a policy decision for later.
- **Kickoff endorsement / all-hands message.** A leadership endorsement at unit kickoff would accelerate adoption but isn't strictly required if the OKR carries the weight.
- **External communications.** Whether to publish anything externally about Solvd's AE program (blog post, conference talk, partner outreach).

## Estimated time per level

| Level | Theme | Reading | Practice | Video | Courses | Assess. | **Total** |
|---|---|---:|---:|---:|---:|---:|---:|
| **L1 Understand** | Use AI to read, not write | 2 h | 1–2 h | 3.5 h (optional) | 19–26 h (6 courses) | 2–3 h | **28–37 h** |
| **L2 Edit with Review** | Quality is the point | 6–9 h | 8–11 h | — | 7–10 h (2 courses) | 2–3 h | **25–33 h** |
| **L3 Plan and Implement** | Think before building | 3–5 h | 4–8 h | — | 9–12 h (3 courses) | 3–4 h | **20–28 h** |
| **L4 Orchestrate** | Multiply your output | 5–8 h | 10–16 h | — | 16–22 h (5 courses) | 3–5 h | **35–50 h** |
| **L5 AI as Architecture Partner** | Use AI for thinking | 1 h | 5–8 h | — | 26–35 h (4 courses) | 3–4 h | **35–48 h** |
| **Whole curriculum** |  | ~17–25 h | ~28–45 h | 3.5 h | ~77–105 h | ~13–19 h | **143–196 h** |

The per-level **Total** column is authoritative — it is the `estimated_hours_min`–`estimated_hours_max` range from [`public/curriculum.json`](public/curriculum.json). The component columns (Reading / Practice / Video / Courses / Assess.) are **approximate** — per-task hours aren't tracked, so the splits are hand-estimates and don't always sum exactly to the Total. Practice hours reflect habit-formation cost, not single-sitting completion: L2's "diff-review habit for one week" is ~3-5 hours of slowdown during real work; L3's "one real multi-file change end-to-end with Plan mode" is one full afternoon; L4's "Run a spec-driven implementation end-to-end" implies a real shipped feature; L5's anti-sycophancy and evaluator-optimizer techniques applied to a real architecture decision span days, not minutes. The Karpathy video is now optional (synthesized notes are the required read).

## Calendar projection

Most engineers will work through this part-time alongside their normal workload. Translating cumulative hour-ranges into calendar time at common cadences (4, 5, and 10 hours per week):

| Level | Hours | @ 4 h/week | @ 5 h/week | @ 10 h/week |
|---|---:|---|---|---|
| L1 only | 28–37 h | 7–9 weeks | 6–7.5 weeks | 3–4 weeks |
| Through L2 (target for most engineers) | 53–70 h | 13–18 weeks | 11–14 weeks | 5–7 weeks |
| Through L3 (feature leads) | 73–98 h | 18–25 weeks | 15–20 weeks | 7–10 weeks |
| Through L4 (platform engineers) | 108–148 h | 27–37 weeks | 22–30 weeks | 11–15 weeks |
| Through L5 (architects) | 143–196 h | 36–49 weeks | 29–39 weeks | 14–20 weeks |

**Practical reading:** at 5 hours/week of dedicated upskilling time, an engineer reaches the target steady state (L2) in **11–14 weeks** — roughly 3 months. At a lighter 4 hours/week that's **13–18 weeks**. Reaching L3 takes another **4–6 weeks**. L4 and L5 are substantial additional commitments (each adds **~7–10 weeks** at 5 h/week) and are not the default destination.

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

- Curriculum: [`public/curriculum.json`](public/curriculum.json) in this repo (67 tasks across 5 levels). In-repo lesson notes and assessment rubrics live under [`docs/curriculum/`](docs/curriculum/).
- Design narrative: [`general/getting-started/levels.md`](https://github.com/solvdinc/agentic-engineering/blob/main/general/getting-started/levels.md) in the knowledge base.
- Tracker (live): https://mykhailo-melnyk.github.io/ae-tracker/tracker.html
