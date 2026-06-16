# Measuring the Transformation

This is **org-level reference**, not a per-engineer task. If we want to know whether the
agentic-engineering rollout is actually working, we have to measure it — and "engineers feel
faster" is not a measurement. Read this so you understand what the program tracks and why.

## Baseline first

You can only show improvement against a **baseline** captured *before* (or alongside) the
rollout. Without one, every claimed gain is unfalsifiable.

## Delivery metrics

- **Cycle time** — idea/commit → production. The headline speed metric.
- **Change-failure rate** — share of changes that cause an incident, rollback, or hotfix.
  Speed that raises this isn't a win.
- **Rework** — churn: code rewritten or reverted shortly after merge. AI can inflate this if
  output ships unreviewed.

## People & quality metrics

- **Review burden** — reviewer time and PR throughput. AI shifts load from authoring to
  reviewing; watch the new bottleneck (see *Team Practices for AI Code*).
- **Developer-experience (DX) survey** — periodic self-report on flow, friction, and
  confidence. Captures effects the delivery metrics miss.

## Control cohort

Where feasible, compare adopting teams against a **control cohort** that hasn't rolled out
yet. This separates the tooling's effect from seasonality and other concurrent changes —
the difference between an anecdote and evidence.

## Cost/benefit drivers

- **Costs:** tool/seat and API/token spend, training time, review overhead.
- **Benefits:** faster cycle time, fewer defects, capacity freed for higher-value work.
- Track both so the program is judged on net value, not gross spend or gross speed alone.
