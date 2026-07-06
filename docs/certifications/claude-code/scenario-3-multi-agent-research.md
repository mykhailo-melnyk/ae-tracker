# Scenario 3: Multi-Agent Research System

You are building a research system on the Claude Agent SDK where a coordinator delegates to specialized subagents — web search, document analysis, synthesis, report generation — to produce comprehensive, cited reports on a topic. The implicit quality bar is complete topic coverage plus correct source attribution.

## Primary domains

- **Domain 1 — Agentic Architecture & Orchestration.** Hub-and-spoke coordination, context isolation, parallel spawning, decomposition, and iterative refinement. This is the core of the scenario.
- **Domain 2 — Tool Design & MCP Integration.** Scoped tool access and structured error handling.
- **Domain 5 — Context Management & Reliability.** Error propagation, provenance, and reconciling conflicting sources.

## Signature failure modes

**Symptom:** a broad topic ("AI in creative industries") comes back covering only one slice of it (say, visual arts) while entire other subtopics (music, writing, film) are missing, and the coordinator's own delegation log shows that narrow split from the start.
**Root cause:** the coordinator decomposed the topic too narrowly — the subagents did exactly what they were asked and aren't at fault.
**Best practice:** decompose more broadly up front, and add an iterative-refinement loop where the coordinator evaluates the synthesis for gaps and re-delegates targeted follow-up subtasks to close them.
A mirror-image version of the same root cause is **overlapping** decomposition: subagents investigate the same subtopics as each other, duplicating tokens without adding coverage. The fix is the same class of fix — explicitly partition the research space into non-overlapping subtopics or source types before delegating, while keeping the work parallel. Deduplicating after the fact doesn't help (the tokens are already spent), falling back to sequential execution sacrifices the parallelism, and peer-to-peer shared state between subagents is not the mechanism this architecture uses.

**Symptom:** a subagent behaves as though it's missing information that an earlier subagent already produced.
**Root cause:** subagent context is isolated by design — a subagent does not automatically inherit the coordinator's conversation history. This is not a model bug, and not a temperature or `max_tokens` issue.
**Best practice:** the coordinator must explicitly pass prior findings into each subagent's prompt, structured as content plus metadata rather than flattened text.

**Symptom:** a subagent's tool call — say, a web search — times out, and the failure either takes down the whole workflow or is silently swallowed.
**Root cause:** the failure is returned (or handled) as an unstructured signal, so nothing upstream can distinguish "retryable" from "fatal" or decide what to do next.
**Best practice:** surface a structured error context: what kind of failure occurred, what request was attempted, any partial results obtained, viable alternatives, and whether it's retryable. Avoid a generic "search unavailable" message, avoid treating an empty result as if it were a success, and avoid letting one recoverable failure abort the entire workflow. Recover locally for transient failures; escalate upward only what genuinely can't be resolved at that level.

**Symptom:** the synthesis subagent repeatedly bounces back to the coordinator to trigger a fresh web search just to verify simple facts, adding significant latency, even though most of these checks are simple.
**Root cause:** the synthesis subagent has no tool of its own for simple verification, so every check — trivial or not — has to round-trip through the coordinator.
**Best practice:** give the synthesis subagent a narrowly scoped `verify_fact` tool for simple checks — least-privilege access to just the capability it needs — while routing genuinely complex verification back through the coordinator as before. Giving synthesis the entire web-search tool over-provisions it, and batching all verification to the end would block the pipeline unnecessarily.

**Symptom:** the final report reads as a smooth, uncited narrative — the specific sources behind each claim have been lost in the synthesis step.
**Root cause:** subagents pass findings forward as flattened prose rather than as claims tied to their originating source, so the synthesis step has nothing left to attribute.
**Best practice:** have each subagent return a claim-to-source mapping (source, supporting excerpt, and publication date) and have the synthesis step preserve that linkage rather than collapsing it into prose.

**Symptom:** two credible sources report different numbers for the same statistic.
**Root cause:** genuine disagreement between sources is being treated as a data-cleaning problem to resolve, rather than a fact about the evidence to preserve.
**Best practice:** keep both figures, attributed and dated, and label which is well-established versus contested. Do not average them (that fabricates a number nobody reported) and do not arbitrarily pick one (that hides the disagreement from the reader).

A few standing heuristics resolve most of the judgment calls in this scenario. Parallel spawning means several `Task` calls emitted in one coordinator response; sequential spawning means one `Task` call per response, used when a later task depends on an earlier result — and the coordinator's `allowedTools` must include `"Task"`, or it will answer in text instead of delegating at all. Context isolation is a feature, not a limitation: it keeps only a summary flowing upward (context economy), lets each subagent specialize, and prevents cross-contamination between subagents running in parallel — so select subagents dynamically based on query complexity rather than always running the full pipeline. Put dates in structured output to prevent the model from misinterpreting figures drawn from different time periods as comparable.

## Domain → this scenario

| Task Statement | How it surfaces here |
|---|---|
| 1.2 — coordinator-subagent orchestration | Narrow/overlapping coverage traced to the coordinator's decomposition, not the subagents |
| 1.2 / 1.3 — context isolation | A subagent "doesn't know" something = context wasn't explicitly passed |
| 1.3 — parallel spawning | Multiple `Task` calls in one response to run search and analysis together |
| 2.3 — scoped tool access | A narrow `verify_fact` tool granted to the synthesis subagent |
| 5.3 — error propagation | Structured context for a timed-out tool call |
| 5.6 — provenance & conflicting sources | Claim-source mapping; both figures kept, attributed and dated |
