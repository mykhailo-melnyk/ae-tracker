# Tracing, Cost Tracking & Failure Analysis

When you orchestrate multi-step agents and automated loops, you lose the line-by-line
visibility you had at L2. Observability is how you get it back — and how you keep agent
spend and failure rates under control.

## Tracing

- A **trace** records one end-to-end run: every prompt, tool call, model response, and
  intermediate step, in order. It's the stack trace of an agent run.
- Without traces, a multi-step failure is a black box — you see a bad final answer and can't
  tell which step went wrong. With them, you can replay the run and find the exact step that
  derailed.
- Capture inputs, outputs, token counts, latency, and tool results at each step. Tools like
  the model provider's logging, or LLM-observability platforms, do this for you.

## Cost tracking

- Cost scales with tokens × calls, and agents multiply both — a single "task" can fan out
  into dozens of model calls. Untracked, this surprises you on the invoice.
- Attribute cost per run, per feature, and per model so you can answer "what does this
  workflow cost per execution?" Use it to right-size models (Opus for planning, Haiku for
  cheap sub-steps) and to set budgets/alerts.

## Failure analysis

- Treat failures as data. Collect failing traces, **cluster them by root cause** (bad
  retrieval, tool error, prompt ambiguity, hallucination, context overflow), and fix the
  largest cluster first.
- Feed recurring failures back into your eval dataset (see *Evaluating AI Systems*) so a fix
  is verified and a regression can't silently return.

## The loop

Trace every run → track what it costs → analyze the failures → turn them into eval cases →
fix and re-measure. This is the operational discipline that makes agent automation
trustworthy at scale.
