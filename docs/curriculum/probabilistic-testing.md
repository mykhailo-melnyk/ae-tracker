# Deterministic vs Probabilistic Testing

Traditional tests assume the same input always yields the same output. AI systems break that
assumption: the same prompt can give different answers. Testing them needs a different model.

## Deterministic vs probabilistic

- **Deterministic code:** assert exact equality, one run is enough.
- **Probabilistic (LLM) behaviour:** any single run can pass or fail by chance. You test
  *distributions* — run a case many times and require the success *rate* to clear a
  threshold, not a single green check.

## The compounding-failure math

For a multi-step agent, success requires every step to succeed. If each of `n` steps
succeeds independently with probability `(1 − e)` (error rate `e`), end-to-end success is:

```
P(success) = (1 − e)^n
```

The lesson is brutal and useful: **reliability collapses as steps multiply.** With a 5%
per-step error rate, 3 steps ≈ 86% success, but 14 steps ≈ 49% — a coin flip. Two levers:

- **Reduce `n`** — fewer steps. Collapse or remove steps, do more per call, don't chain when
  one well-scoped prompt would do. This is usually the biggest win.
- **Reduce `e`** — better prompts, grounding, tool use, and reflection at each step.

## Secondary-LLM-as-grader regression tests

Because outputs vary, you can't diff against a fixed string. Use a **second model as a
grader**: give it the input, the criteria, and the system's output, and have it score
pass/fail (or rate against a rubric). Run this over your eval dataset on every change so a
quality regression is caught even though the literal text differs each run. Validate the
grader itself against some human-labelled cases so you trust its judgment.
