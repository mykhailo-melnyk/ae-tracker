# Easy to confuse

Pairs of concepts that look interchangeable in a question stem but resolve to opposite answers once you spot the deciding signal. Each entry: what makes them look the same, the one signal that tells them apart, and the call you should make.

## Self-review for bugs vs. self-critique for completeness

**Looks the same:** both are "have the agent check its own output before sending it" — and the general exam guidance is that self-review is unreliable, so it's tempting to reject both.

**Deciding signal:** what's being checked. Correctness/bug-finding review is biased because the generating context still holds the reasoning that produced the bug — the same session defends its own logic. Completeness review against an explicit, objective checklist (did the response include a policy citation, a timeline, next steps?) isn't reasoning about correctness at all; it's a structural presence/absence check.

**Right call:** route correctness and bug-finding review to an independent instance with a fresh context. Route completeness-against-a-checklist to a self-critique / evaluator-optimizer pass on the same agent — this is the correct, efficient choice, not a shortcut that happens to work.

## Poor tool descriptions vs. clean descriptions overridden by a system prompt

**Looks the same:** in both cases the agent picks the wrong tool, or picks a tool based on something other than the user's actual intent.

**Deciding signal:** whether the tool descriptions themselves are actually thin, overlapping, or ambiguous. If they are, that's the root cause. If the descriptions are clear and unambiguous but the agent still tracks a specific keyword rather than intent, the reproducible, deterministic pattern points to an instruction in your own system prompt overriding the descriptions — not to the base model or a training gap.

**Right call:** diagnose by reading the descriptions before touching anything else. Thin/overlapping → expand, differentiate, or split the tools. Clean descriptions plus a reproducible keyword dependency → find and fix the system-prompt instruction that's causing it.

## Hook for critical rules vs. prompt for judgment calls

**Looks the same:** both are ways of telling the agent "do X before Y" or "never do Z."

**Deciding signal:** whether the rule is sharp, checkable, and consequential (a fixed dollar threshold, a required verification step before a financial action) or fuzzy and context-dependent (when exactly to escalate, which tool fits an ambiguous request).

**Right call:** sharp + consequential → a hook or prerequisite gate, for a guaranteed zero-failure-rate outcome. Fuzzy + contextual → a prompt with few-shot examples, because you're calibrating a probabilistic judgment, not enforcing an invariant. A hook on a fuzzy decision is unworkable; a stronger prompt can't guarantee a financial rule.

## Valid empty result vs. access failure

**Looks the same:** the tool call returns having found nothing — no data, no error message, no exception.

**Deciding signal:** whether the underlying operation actually completed successfully and legitimately found zero matches, versus the operation failing (timeout, permission denial, malformed query) and that failure being masked as "success, empty."

**Right call:** represent these as two structurally distinct outcomes at the tool-result level (a real error flag/category vs. a genuine empty success). Treating a real failure as empty-success causes the agent to draw a false conclusion; treating a legitimate empty result as a failure triggers a pointless retry or an unnecessary escalation.

## `tool_choice: "any"` vs. forced tool selection

**Looks the same:** both compel the model to call a tool instead of responding with plain text.

**Deciding signal:** whether the requirement names a *specific* tool the model must call, or just requires *some* appropriate tool without naming it.

**Right call:** a named tool in the requirement → forced (`{"type": "tool", "name": "..."}`). "Any/appropriate tool," no name given, model should pick → `"any"`. If plain text is also an acceptable response, neither applies — that's `"auto"`. Note: with exactly one tool defined, `"any"` and forced produce the same behavior, but forced is still the more explicit choice when a name is given.

## Plan mode vs. direct execution

**Looks the same:** both are ways to get Claude Code to make a change; a question may not obviously flag which is "correct" for a given task.

**Deciding signal:** whether the complexity, file count, and number of valid approaches are knowable from the task description up front. A single well-scoped file change with a clear stack trace has none of that ambiguity; an architectural change, a multi-file migration, or a task with several valid designs does.

**Right call:** complexity known up front → plan mode first, then execute. Simple and well-scoped → direct execution. Do not "start direct and switch to plan mode if it gets complicated" when the complexity was predictable from the requirements — that pattern pays for rework on whatever was already changed under the wrong mode.

## Batch API vs. synchronous API

**Looks the same:** both send requests to Claude and get structured responses back; a large volume of similar requests could plausibly go through either.

**Deciding signal:** whether the workflow can tolerate asynchronous, non-blocking processing with no latency guarantee (up to a 24-hour window), and whether any single request needs multi-turn tool-calling within it.

**Right call:** non-blocking, latency-tolerant, single-turn, high-volume → Batch API (roughly half the cost, correlate results by `custom_id`, not by array order). Anything a user or process is waiting on synchronously (pre-merge checks, an interactive session), or anything requiring a multi-turn agentic loop inside one request → the synchronous API instead.
