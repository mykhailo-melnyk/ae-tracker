# Domain 1: Agentic Architecture & Orchestration — 27%

This is the heaviest domain, so work it deliberately. For each Task Statement below, read *What's tested*, run the *Self-audit* honestly, then use the *Deep-dive prompt* to have an LLM teach you the concept, generate concrete examples and counter-examples, and quiz you until you can answer the *Active-recall self-check* from memory. The recurring skill this domain rewards is separating the deterministic control mechanism (a signal, a hook, a Task call) from the probabilistic one (a prompt, a judgment call) — and diagnosing root cause instead of the symptom.

## Task Statement 1.1 — Design and implement agentic loops for autonomous task execution

### What's tested
**Knowledge of:** the agentic loop lifecycle — send a request to Claude, inspect `stop_reason` (`tool_use` vs `end_turn`), execute the requested tools, return results, and iterate; how tool results are appended to conversation history so the model can reason about the next action; the distinction between model-driven decision-making (Claude reasons about which tool to call next from context) and a pre-configured decision tree or hard-coded tool sequence.
**Skills in:** implementing loop control flow that continues while `stop_reason` is `tool_use` and terminates on `end_turn`; adding tool results to the conversation between iterations so new information enters the model's reasoning; avoiding anti-patterns — parsing natural-language signals to decide termination, using an arbitrary iteration cap as the *primary* stop, or treating the presence of assistant text as a completion indicator.
*Self-audit:* You can describe the exact message shapes appended after a `tool_use` turn, and explain why `stop_reason` — not text parsing or a counter — is the loop's terminating signal.

### Distilled notes
`stop_reason` is the deterministic completion signal and the loop's real router: `tool_use` means "execute the tools and continue," `end_turn` means "exit." After a `tool_use` turn you append **two** messages: first `{ role: "assistant", content: response.content }` — the entire content array, text plus every `tool_use` block — then `{ role: "user", content: toolResults }`, where each block is `{ type: "tool_result", tool_use_id, content }`. If a single assistant turn emits several `tool_use` blocks, you return exactly that many `tool_result` blocks inside **one** user message, each linked back by its `tool_use_id`.

Handle *every* `stop_reason`, not just the two common ones. An unhandled reason (`max_tokens`, `pause_turn`, and so on) drops you into an infinite loop that burns tokens, trips rate limits, and hangs the user — so fail loud (throw explicitly, or return a partial result with a flag) rather than spin. Two semantic nuances worth remembering: `pause_turn` means "keep going," and `refusal` means "stop gracefully." An iteration counter is a *safety backstop*, never the primary stopping mechanism — the number of turns does not correlate with "task solved."

The two headline anti-patterns are (1) using an iteration cap as the main completion mechanism and (2) parsing text like "done" to decide you're finished — a probabilistic string standing in for a deterministic signal.

### Deep-dive prompt
> I'm studying the Claude agentic loop. (1) Walk me through one full iteration: the request, inspecting `stop_reason`, and the exact messages I append after a `tool_use` turn — show the JSON shapes for the assistant message and the tool_result user message, including the case of multiple tool calls in one turn. (2) Explain why `stop_reason` is the correct termination signal and why text-parsing, an iteration cap, or "assistant produced text" are all wrong. (3) List the less common `stop_reason` values and what my loop should do for each. (4) Now quiz me: give five short "what does the loop do next?" scenarios one at a time and critique my answers.

### Active-recall self-check
1. After Claude returns a turn with two `tool_use` blocks, exactly what messages do you append before the next request, and how are results correlated to calls?
2. Why is an iteration cap a backstop rather than the primary stop condition — what does a high iteration count *not* tell you?
3. Name two `stop_reason` values beyond `tool_use`/`end_turn` and what your loop should do for each.

## Task Statement 1.2 — Orchestrate multi-agent systems with coordinator-subagent patterns

### What's tested
**Knowledge of:** hub-and-spoke architecture, where one coordinator agent manages all inter-subagent communication, error handling, and information routing; that subagents run with isolated context and do **not** inherit the coordinator's conversation history automatically; the coordinator's role in task decomposition, delegation, result aggregation, and deciding which subagents to invoke based on query complexity; the risk of overly narrow decomposition producing incomplete coverage of broad topics.
**Skills in:** designing coordinators that analyze the query and dynamically select which subagents to run rather than always routing through the full pipeline; partitioning research scope across subagents to minimize duplication (distinct subtopics or source types per agent); implementing iterative-refinement loops where the coordinator evaluates the synthesis for gaps, re-delegates targeted queries to search/analysis subagents, and re-runs synthesis until coverage is sufficient; routing all subagent communication through the coordinator for observability, consistent error handling, and controlled information flow.
*Self-audit:* You can explain why "hub-and-spoke" and "orchestrator-workers" name the same pattern, and can attribute an incomplete-coverage failure to the right actor.

### Distilled notes
Hub-and-spoke and the orchestrator-workers pattern are the same idea under two names: one coordinator (the hub) plus specialized subagents (the spokes — search, analyze, synthesize, report). Every message flows through the coordinator, which is what gives you observability, consistent error handling, and controlled routing.

Subagent context is **isolated by design**, and that isolation is a feature, not a bug: only a summary flows back up (context economy), each subagent gets a narrow prompt and tool set (specialization → higher precision), and parallel workers can't cross-contaminate each other. The corollary lives in 1.3 — because nothing is inherited, the coordinator must pass data into each subagent's prompt explicitly and structurally.

Diagnostic pattern for this domain: when *coverage* is too narrow — a broad research topic comes back with gaps — the fault is the **coordinator's decomposition**, not the subagents. The subagents did their scoped jobs correctly. Don't blame the executor for a planning failure. The fix is an iterative-refinement loop (coordinator inspects the synthesis for gaps, re-delegates targeted subqueries, re-synthesizes) and/or broader decomposition up front. A related dynamic control choice: a good coordinator selects subagents by query complexity instead of always firing the whole pipeline.

### Deep-dive prompt
> I'm studying coordinator-subagent (hub-and-spoke / orchestrator-workers) multi-agent systems. (1) Explain the architecture and why routing all communication through the coordinator matters for observability and error handling. (2) Explain why subagent context isolation is a deliberate benefit, listing the three advantages it buys. (3) A broad research question comes back with major gaps in coverage — walk me through diagnosing whether the coordinator or a subagent is at fault, and design the iterative-refinement loop that fixes it. (4) Quiz me with four short scenarios where I must name the responsible component and the fix.

### Active-recall self-check
1. Why is subagent context isolation an advantage rather than a limitation? Give the concrete benefits.
2. A broad research report has significant coverage gaps. Which component is responsible, and what loop do you add to fix it?
3. What does routing every subagent message through the coordinator give you, and why prefer dynamic subagent selection over always running the full pipeline?

## Task Statement 1.3 — Configure subagent invocation, context passing, and spawning

### What's tested
**Knowledge of:** the `Task` tool as the mechanism for spawning subagents, and the requirement that a coordinator's `allowedTools` must include `"Task"` to delegate at all; that subagent context must be provided explicitly in the prompt — subagents inherit no parent context and share no memory across invocations; the `AgentDefinition` configuration (descriptions, system prompts, tool restrictions per subagent type); fork-based session management for exploring divergent approaches from a shared analysis baseline.
**Skills in:** including complete findings from prior agents directly in a subagent's prompt (e.g. passing web-search results and document-analysis output into the synthesis subagent); using structured data formats to separate content from metadata (source URLs, document names, page numbers) so attribution survives; spawning parallel subagents by emitting multiple `Task` calls in a single coordinator response rather than across separate turns; writing coordinator prompts that specify goals and quality criteria rather than step-by-step procedures, so subagents can adapt.
*Self-audit:* You can state what makes spawning *parallel* vs *sequential*, and why a coordinator that "responds in text instead of delegating" is almost always a config problem.

### Distilled notes
Spawning is done with the `Task` tool, and the coordinator's `allowedTools` **must** include `"Task"` — if it doesn't, the coordinator won't delegate; it will just answer in text. When a coordinator responds with prose instead of dispatching work, suspect that configuration first.

Parallelism reuses the same mechanism as multiple tool calls in one turn: **parallel = several `Task` calls emitted in a single coordinator response**; **sequential = one `Task` per response across several responses**, which is what you want when step B depends on A's result. The "make it faster" distractors — lowering `max_tokens`, raising the iteration limit, or collapsing everything into one agent — are all wrong; none of them is how you parallelize.

Because subagent context is isolated (1.2), passing is explicit and *structural*: put the prior findings into the subagent's prompt as `content` plus `metadata` (sources, dates, IDs). Keeping content and metadata separate is what preserves attribution when a downstream agent summarizes — lose that structure and citations dissolve, which is the bridge to the provenance problems in Domain 5. Finally, write coordinator prompts as goals and quality criteria, not procedural steps, so each subagent can adapt within its scope.

### Deep-dive prompt
> I'm studying subagent invocation and context passing in a coordinator-subagent system. (1) Explain the `Task` tool and why `allowedTools` must include `"Task"`; describe the symptom when it's missing. (2) Show me the difference between spawning subagents in parallel vs sequentially, in terms of how many `Task` calls go in one response, and when each is correct. (3) Show how to pass prior findings into a synthesis subagent using a structured content-plus-metadata format, and explain what breaks if I flatten it. (4) Quiz me: for five short setups, ask "parallel or sequential, and how many Task calls per response?" and critique my answers.

### Active-recall self-check
1. What single `allowedTools` entry must a coordinator have to delegate, and what happens if it's absent?
2. How do you spawn three subagents in parallel versus sequentially — describe it in terms of `Task` calls per response.
3. Why pass context as structured content + metadata rather than flattened text, and which later domain does this connect to?

## Task Statement 1.4 — Implement multi-step workflows with enforcement and handoff patterns

### What's tested
**Knowledge of:** programmatic enforcement (hooks, prerequisite gates) vs prompt-based guidance for workflow ordering; that prompt instructions have a non-zero failure rate when deterministic compliance is required (e.g. identity verification before financial operations); structured handoff protocols for mid-process escalation (customer details, root cause, recommended actions).
**Skills in:** blocking downstream tool calls until prerequisites complete (e.g. block `process_refund` until `get_customer` returns a verified ID); decomposing multi-concern requests and investigating each in parallel on shared context before synthesizing; compiling structured handoff summaries for human agents who lack the transcript.
*Self-audit:* You can explain when a prompt is not enough and name a concrete rule that must be a hook.

### Distilled notes
A rule that is sharp, checkable, and consequential (money/safety) belongs in code — a hook/prerequisite gate — because the action is physically blocked and the failure rate is zero. A rule that is fuzzy and judgment-based (when to escalate, which tool in an ambiguous case) belongs in the prompt plus few-shot examples: you are calibrating a probabilistic decision, not enforcing an invariant. The trap runs both ways — "strengthen the prompt" for a financial threshold is insufficient, and a hook on a fuzzy escalation decision is unworkable. Diagnose by the nature of the rule, not the severity of the symptom.

Handoff is the second half of this statement. A structured mid-process escalation carries three elements: (1) the customer details / case context, (2) the reason for escalating / root-cause analysis, and (3) what has already been done plus the recommended action. The human agent has no access to the transcript, so each element exists to let them continue from exactly where the agent stopped. Keep the *trigger* (when to escalate) distinct from the *handoff* (what to pass) — they are different questions.

### Deep-dive prompt
> I'm studying enforcement vs prompt guidance for agent workflows. (1) Explain the difference between a prerequisite/PreToolUse hook and a system-prompt instruction for ordering tool calls. (2) Give me three business rules where a hook is the only correct choice and one where a hook would be wrong, with reasoning. (3) Now quiz me: give five short scenarios and ask me "hook or prompt?" one at a time, then critique each answer.

### Active-recall self-check
1. Policy: "never auto-refund above $500." Hook or prompt? Why?
2. Your agent escalates frustrated-but-simple cases. Hook or prompt? Why?
3. What three elements must a mid-process escalation handoff include, and why does the human need each?

## Task Statement 1.5 — Apply Agent SDK hooks for tool call interception and data normalization

### What's tested
**Knowledge of:** hook patterns such as `PostToolUse` that intercept tool *results* for transformation before the model processes them; hook patterns that intercept outgoing tool *calls* to enforce compliance rules (e.g. blocking refunds above a threshold); the distinction between hooks for deterministic guarantees and prompt instructions for probabilistic compliance.
**Skills in:** implementing `PostToolUse` hooks to normalize heterogeneous data formats (Unix timestamps, ISO 8601, numeric status codes) from different MCP tools before the agent sees them; implementing interception hooks that block policy-violating actions (e.g. refunds over $500) and redirect to an alternative workflow (human escalation); choosing hooks over prompt-based enforcement when a business rule requires guaranteed compliance.
*Self-audit:* You can name which hook fires on results vs on outgoing calls, and give one normalization use case and one enforcement use case.

### Distilled notes
Hooks come in two directions, and the exam leans on telling them apart. A **`PostToolUse`** hook fires *after* a tool returns and transforms the *result* before the model reads it — this is the place to normalize heterogeneous formats so the agent reasons over one consistent shape (map Unix epochs, ISO 8601 strings, and numeric status codes into a single canonical representation). A **call-interception** hook (the pre-call direction) fires *before* an outgoing tool call executes and can block a policy-violating action and reroute it — for example, refuse a `process_refund` above $500 and redirect to human escalation.

This is the same determinism-vs-probability principle as 1.4, now expressed through the SDK's hook machinery: a hook gives a guaranteed, zero-failure-rate outcome, so you choose it whenever a business rule demands guaranteed compliance; a prompt only nudges probabilistically. The two canonical use cases to keep straight: normalization is a *result* transform (`PostToolUse`), enforcement/blocking is a *call* transform (interception before execution).

### Deep-dive prompt
> I'm studying Agent SDK hooks. (1) Contrast a `PostToolUse` hook (transforms tool results before the model sees them) with a tool-call interception hook (blocks/redirects an outgoing call), including exactly when each fires in the loop. (2) Give a worked normalization example: three MCP tools returning Unix, ISO 8601, and numeric-status data, and the canonical shape a `PostToolUse` hook produces. (3) Give a worked enforcement example blocking a refund over a threshold and redirecting to escalation. (4) Quiz me: for six short requirements, ask "which hook — result-normalization or call-interception — and why?"

### Active-recall self-check
1. Which hook transforms a tool's *result* before the model sees it, and which intercepts an *outgoing* call before it runs?
2. Three MCP tools return timestamps as Unix epoch, ISO 8601, and a numeric status code. Which hook fixes this, and what does it produce?
3. Why implement a refund-threshold limit as a hook rather than as a stern line in the system prompt?

## Task Statement 1.6 — Design task decomposition strategies for complex workflows

### What's tested
**Knowledge of:** when to use fixed sequential pipelines (prompt chaining) vs dynamic adaptive decomposition driven by intermediate findings; prompt-chaining patterns that break reviews into sequential steps (analyze each file individually, then run a cross-file integration pass); the value of adaptive investigation plans that generate subtasks from what's discovered at each step.
**Skills in:** selecting the decomposition pattern that fits the workflow — prompt chaining for predictable multi-aspect reviews, dynamic decomposition for open-ended investigation; splitting large code reviews into per-file local passes plus a separate cross-file integration pass to avoid attention dilution; decomposing open-ended tasks (e.g. "add comprehensive tests to a legacy codebase") by first mapping structure, identifying high-impact areas, then building a prioritized plan that adapts as dependencies surface.
*Self-audit:* You can classify a given task as fixed-sequential vs dynamic-adaptive and justify the choice.

### Distilled notes
The core decision is whether the steps are knowable in advance. **Fixed sequential / prompt chaining** applies when the steps are known up front (issuing an insurance policy, a predictable multi-aspect review) — because the path is stable you can even supply reference examples for each step. **Dynamic adaptive decomposition** applies when steps are discovered as you go (hunting a bug, "add comprehensive tests to a legacy codebase") — the plan is generated and revised from intermediate findings: map the structure, find high-impact areas, build a prioritized plan that adapts as dependencies appear.

A concrete chaining pattern to remember: large code reviews split into per-file *local* analysis passes plus a separate *cross-file integration* pass — decomposing this way avoids attention dilution, where one giant prompt over the whole codebase loses fidelity. Connect this to 1.2's failure mode: the characteristic failure of *narrow* decomposition is incomplete coverage, and the responsible party is the coordinator that planned it, not the executors — you fix it with broader decomposition and an iterative-refinement loop, not by blaming a subagent.

### Deep-dive prompt
> I'm studying task-decomposition strategies. (1) Contrast fixed sequential pipelines (prompt chaining) with dynamic adaptive decomposition — the deciding question, and two example tasks for each. (2) Explain the per-file-plus-cross-file-integration pattern for large code reviews and why it beats one monolithic pass (attention dilution). (3) Walk through decomposing "add comprehensive tests to a legacy codebase" as an adaptive plan. (4) Quiz me: for six tasks, ask "fixed-sequential or dynamic-adaptive?" and critique my reasoning.

### Active-recall self-check
1. What single question decides between prompt chaining and dynamic adaptive decomposition? Give one example task for each.
2. How do you decompose a large code review, and what problem does splitting it into per-file plus cross-file passes solve?
3. Narrow decomposition produced incomplete coverage. What's the failure mode called, who's responsible, and how do you fix it?

## Task Statement 1.7 — Manage session state, resumption, and forking

### What's tested
**Knowledge of:** named session resumption with `--resume <session-name>` to continue a specific prior conversation; `fork_session` for creating independent branches from a shared analysis baseline to explore divergent approaches; the importance of informing the agent about changes to previously analyzed files when resuming after code modifications; why starting a new session with a structured summary is more reliable than resuming with stale tool results.
**Skills in:** using `--resume` with session names to continue named investigations across work sessions; using `fork_session` to create parallel exploration branches (comparing two testing or refactoring approaches from one shared codebase analysis); choosing between resumption (prior context mostly valid) and a fresh start with an injected summary (prior tool results stale); informing a resumed session about specific file changes so it re-analyzes only what changed rather than re-exploring everything.
*Self-audit:* You can explain why resume ≠ auto-sync with disk, and pick resume vs fresh-start-with-summary from the state of prior context.

### Distilled notes
Three primitives. `fork_session` branches from a shared baseline to explore divergent approaches independently (three refactoring strategies from one analysis point) without cross-contaminating contexts. `--resume <session-name>` continues a specific named session; `--continue` picks up the most recent one.

The subtle trap is **stale tool results**. After you edit files by hand, a resumed session still references the *old* snapshots captured in the conversation history — resume replays stored context, it does not auto-sync with disk. The targeted fix is to inject the current state explicitly or ask the agent to re-read the changed files, so it re-analyzes only what moved rather than re-exploring the whole tree. And the strategic rule: when a lot has changed, a **fresh session seeded with a structured summary is more reliable** than dragging a polluted history forward. Choose by the state of prior context — resume when it's mostly still valid, start fresh with an injected summary when the prior tool results are stale.

### Deep-dive prompt
> I'm studying Claude Code session state. (1) Define `fork_session`, `--resume <session-name>`, and `--continue`, with a use case for each. (2) Explain the stale-tool-results problem: why a resumed session references outdated file snapshots after I edit files by hand, and the two ways to fix it. (3) Give me a decision rule for "resume the session" vs "start fresh with a structured summary," tied to how much of the prior context is still valid. (4) Quiz me: for five short situations, ask "resume, fork, or fresh-start-with-summary?" and critique my answers.

### Active-recall self-check
1. When would you use `fork_session` rather than `--resume`, and what does forking protect against?
2. You hand-edited several files, then resumed a session and the agent reasons over the old versions. Why, and what are the two fixes?
3. What signal tells you to abandon resumption and start a new session with a structured summary instead?

## Decision heuristics recap

Three heuristics eliminate most wrong answers in this domain:

1. **Root cause vs symptom.** When a subagent behaves as if it "doesn't know" something, the cause is almost always un-passed context — not a model bug, temperature, or `max_tokens`. When a broad topic comes back with incomplete coverage, the cause is the coordinator's narrow decomposition — not a broken subagent. Diagnose the underlying cause; don't blame the executor.
2. **Determinism for the critical, prompt for the calibrating.** Put sharp, checkable, consequential rules (money, safety, ordering prerequisites) in code — a hook or prerequisite gate — for a zero failure rate. Put fuzzy, judgment-based decisions (when to escalate, which tool in an ambiguous case) in the prompt plus few-shot examples. The trap runs both ways: strengthening a prompt won't guarantee a financial rule, and a hook on a fuzzy decision is unworkable. Judge by the nature of the rule, not the severity of the symptom.
3. **Right tool for control flow.** Termination is driven by `stop_reason`, not text parsing or an iteration cap (which is only a backstop). Parallelism is several `Task` calls in one coordinator response — not lowering `max_tokens`, raising iteration limits, or collapsing agents into one. Reach for the mechanism the runtime actually keys on.
