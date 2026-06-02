# AE Progress Tracker — Time-to-Complete Estimates

> Source material for a manager-facing presentation on AI enablement at Solvd. Data only — narrative slides built around this.

## What this is

The Solvd AE (Agentic Engineering) curriculum is a 5-level path that takes a software engineer from "uses AI casually" to "uses AI as an architecture partner". 45 tasks total: readings from our internal knowledge base, hands-on practice tasks, one long-form video (Andrej Karpathy's "Deep Dive into LLMs"), and 11 free Anthropic Academy courses with certificates. Each engineer's progress is tracked individually in the [AE Progress Tracker](https://mykhailo-melnyk.github.io/ae-tracker/tracker.html); aggregate adoption is visible on the [admin dashboard](https://mykhailo-melnyk.github.io/ae-tracker/dashboard.html).

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
