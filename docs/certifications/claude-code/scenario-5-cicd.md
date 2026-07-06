# Scenario 5: Claude Code for CI/CD

You are integrating Claude Code into a CI/CD pipeline to run automated code review, generate test cases, and provide feedback on pull requests, with prompts designed to give actionable feedback while minimizing false positives. The implicit bar is developer trust (a low false-positive rate) plus output the pipeline can parse mechanically.

## Primary domains

- **Domain 3 — Claude Code Configuration & Workflows.** CLI flags for non-interactive use, `--output-format json`, independent review, multi-pass analysis.
- **Domain 4 — Prompt Engineering & Structured Output.** Explicit criteria against false positives, the Batch API, independent review, multi-pass analysis.

## Signature failure modes

**Symptom:** a CI job invoking Claude Code hangs, waiting on interactive input that will never come.
**Best practice:** use `-p` / `--print` to run once, print the result to stdout, and exit. Watch for distractors like a `CLAUDE_HEADLESS` environment variable, a `--batch` flag, or piping from `/dev/null` — none of these are the actual non-interactive mechanism.

**Symptom:** the pipeline tries to extract findings from free-form prose with regular expressions.
**Best practice:** request `--output-format json` (optionally with `--json-schema`) for machine-parsable structured output instead of parsing natural language.

**Symptom:** a single-pass review over many files (say, fourteen) shows inconsistent depth, misses issues, and even contradicts itself — flagging a pattern in one file while approving the identical pattern in another.
**Root cause:** this is attention dilution from a single large pass, not a lack of context-window size.
**Best practice:** split the review into a multi-pass pipeline — a local per-file analysis pass, plus a separate integration pass focused on cross-file relationships. A bigger context window doesn't fix attention dilution; splitting the PR itself just shifts the burden elsewhere; and a "2-out-of-3 consensus" filter suppresses real findings along with noise.

**Symptom:** the same session that generated a piece of code reviews it more leniently than it should — it's carrying the reasoning context from generation and is biased toward its own choices.
**Best practice:** run the review in a fresh, independent instance with no prior context. Telling the same session to "be critical," turning on extended thinking, or running the same session twice all still operate inside the same biased context and don't fix the underlying problem.

**Symptom:** the false-positive rate is high enough that developers stop trusting the review output, often traceable to vague instructions like "find problems."
**Best practice:** replace vague instructions with explicit, categorical criteria ("flag a case only when the documented behavior contradicts the actual code"), and temporarily disable whichever category is producing the most false positives while you improve its criteria — that's often what's needed to restore trust.

**Symptom:** someone proposes moving both the blocking pre-merge review and the nightly summary report onto the Batch API for the cost savings.
**Best practice:** only the nightly report — which has no latency requirement and tolerates up to 24 hours — belongs on Batch. The pre-merge review is blocking and needs a real-time, synchronous call; moving both onto Batch is the wrong call.

A few standing heuristics resolve most of the judgment calls in this scenario. Use `CLAUDE.md` as project context for review runs — testing standards, fixtures, house style — so the agent applies team-specific conventions rather than generic ones. Discovery and verification call for opposite treatments: finding bugs (discovery) benefits from recall, so a consensus filter across multiple passes actively hurts it, while confirming a specific claim (verification) is exactly where a voting/consensus approach helps. For iterative review runs, pass in the findings from the previous run and ask the model to report only what's new or still unresolved, to avoid duplicate findings across runs. And match the API to the latency requirement: blocking work needs a synchronous call, while non-blocking bulk work is a good fit for Batch.

## Domain → this scenario

| Task Statement | How it surfaces here |
|---|---|
| 3.7 — CLI / non-interactive mode | `-p`/`--print` for pipeline execution |
| 3.7 — structured CLI output | `--output-format json` instead of regex parsing on prose |
| 3.7 / 4.6 — independent vs. self-review | A fresh instance reviews the PR instead of the generating session |
| 4.6 — multi-pass / attention dilution | Per-file pass plus a separate integration pass |
| 4.1 — explicit criteria | Categorical criteria to cut false positives |
| 4.5 — Batch API fit | Nightly report on Batch; blocking pre-merge review stays synchronous |
