# Heuristics cheat sheet

One screen, four decisive heuristics. Most exam questions are answer-elimination exercises in disguise: three distractors are each wrong for a specific, nameable reason, and these four heuristics are what catch them. When you're stuck between two plausible options, run the scenario through this list before you guess.

For the full reasoning and worked examples behind each domain's version of these heuristics, see that domain's "Decision heuristics recap" in `domain-1-agentic-architecture.md` through `domain-5-context-reliability.md`.

## 1. Root cause vs. symptom

Diagnose the underlying cause, not the surface behavior — and don't blame the wrong component.

- A subagent behaving as if it "doesn't know" something is almost always un-passed context, not a model bug, temperature, or `max_tokens`.
- Incomplete coverage on a broad topic is the coordinator's narrow decomposition, not a failure by the subagents that did their scoped jobs correctly.
- Tool misrouting traces to thin or overlapping tool descriptions — fix the description (or split/rename the tool) before reaching for a routing layer or classifier.
- A sharp, reproducible, keyword-triggered behavior — even with clean tool descriptions — points to a configured instruction in your own system prompt, not to the base model.
- An empty result and an access failure are two different root causes wearing the same "nothing came back" symptom — conflating them drives the wrong response (spurious retry vs. missed escalation).
- A high aggregate accuracy can hide a broken segment; measure by document type and field before trusting the average.

## 2. Determinism for the critical, calibration for the judgment call

Match the enforcement mechanism to the nature of the rule, not the severity of the symptom.

- Sharp, checkable, consequential rules (money, safety, sequencing prerequisites) belong in code: a hook, a prerequisite gate, `disallowedTools`, a glob-scoped rule. Zero failure rate, physically enforced.
- Fuzzy, judgment-based decisions (when to escalate, which tool in an ambiguous case, how complete a draft is) belong in the prompt: few-shot examples, explicit criteria, self-critique against a checklist.
- The trap runs both ways: "strengthen the prompt" cannot guarantee a financial threshold, and a hook is unworkable on a decision that's genuinely a judgment call.
- The same logic extends to semantic validation: compare two extracted signals in code (`calculated_total` vs. `stated_total`) instead of asking the model to "be accurate."
- Independent-instance review removes generation bias for *correctness* (a fresh context, not "be more critical"); the same agent's self-critique is fine — even preferred — for *completeness* against an explicit checklist.

## 3. Right tool for the mechanism the runtime actually keys on

When something needs to happen automatically, reach for the primitive the system is actually watching — not a proxy for it.

- Loop termination is driven by `stop_reason`, not text parsing or an iteration cap (a safety backstop only).
- Parallel subagent spawning is several `Task` calls in one coordinator response — not lowering `max_tokens`, raising iteration limits, or merging agents into one.
- Non-interactive CI execution is `-p` / `--print`; structured, parseable CI output is `--output-format json` (+ schema) — never regex over free text.
- Sharing across a team is decided by file location (`.claude/` vs. `~/.claude/`), not by `.gitignore`.
- `tool_choice`: a named tool in the requirement → forced; "any/appropriate tool," no name given → `"any"`; plain text is an acceptable answer → `"auto"`.
- Latency-tolerant, non-blocking, single-turn bulk work → the Batch API (half cost, ≤24h, no SLA, no multi-turn tool loop); anything blocking → the synchronous API.
- Bug discovery wants recall (a consensus filter suppresses rare real findings); claim verification wants consensus (a skeptical second pass catches false positives).

## 4. Proportionate first step

Reach for the cheapest fix that addresses the actual root cause before escalating to heavier machinery.

- Tool confusion → expand/differentiate the description first; a keyword router or ML classifier is disproportionate and doesn't fix the underlying ambiguity.
- Heterogeneous data formats from multiple tools → a `PostToolUse` normalization hook, not an on-demand `normalize_data` tool (forgettable) or prompt documentation (probabilistic).
- Retry-with-error-feedback fixes *how* something was extracted (a format/structural mismatch); it does not fix *what's missing* from the source — that calls for a nullable field, not another retry.
- Complexity that's knowable up front from the requirements calls for plan mode from the start — "start direct, switch to plan if it gets complicated" pays for rework on whatever was already touched.
- Large-scale review needing both local and cross-cutting judgment → a per-file pass plus a separate integration pass, not one monolithic prompt (attention dilution) and not a bigger context window (doesn't fix dilution).
- A fixed set of few-shot examples doesn't fix a problem whose gaps vary case to case (that's a self-critique/checklist problem) or one whose root cause is really a thin tool description or missing schema field.
