# Evaluating AI Systems

Once you ship features *powered by* AI (not just code written with AI's help), "it looked
good in my three test prompts" stops being enough. You need evaluation: a repeatable way to
measure whether the system does its job, and whether a change made it better or worse.

## Eval datasets

An eval dataset is a curated set of cases, each with three parts:

- **Input** — what the system receives (prompt, document, user request).
- **Expected output / reference** — what a good answer looks like (or the key facts it must
  contain).
- **Criteria** — how you judge the actual output: exact match, contains-X, a rubric, or an
  LLM-as-judge score.

Start small and real: 20–50 cases drawn from actual usage and known failure modes beats a
huge synthetic set. Grow it every time you find a new failure in production.

## Acceptance testing

Decide *before* shipping what "good enough" means, in numbers. For classification-style
behaviour, the standard vocabulary:

- **Precision** — of the things the system flagged, how many were correct.
- **Recall** — of the things it should have flagged, how many it caught.
- **False positives (FP)** / **false negatives (FN)** — the two error types; their cost is
  usually asymmetric, so weight accordingly.
- **Human-acceptance rate** — share of outputs a human accepts as-is. Often the metric that
  actually predicts adoption.

## Regression testing

Run the eval dataset on every prompt, model, or config change. Because outputs are
non-deterministic, "the suite passed" means *scores stayed within threshold*, not
"identical output." Catching a silent quality drop after a model upgrade is the whole point.

## Evaluate a new model yourself — don't trust the hype

When a new model drops, benchmark leaderboards and launch posts tell you little about *your*
task. Run it against *your* eval dataset and compare on *your* criteria and cost. The team
that can evaluate a model in an afternoon adopts the right one; everyone else argues from
vibes.
