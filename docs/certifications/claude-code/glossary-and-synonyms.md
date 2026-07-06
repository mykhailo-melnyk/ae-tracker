# Glossary and exam synonyms

The exam frequently names a concept you already know, but under its formal or alternate label. Missing the synonym — not missing the concept — is what costs you the question. Use this list to pre-load the mappings.

## Synonym pairs to recognize on sight

| If the question says... | It means... |
|---|---|
| Orchestrator-workers pattern | Hub-and-spoke: one coordinator, specialized subagents (the "workers"/"spokes") that don't see each other's context |
| Primacy effect | Information placed at the *beginning* of a long input is retained better |
| Recency effect | Information placed at the *end* of a long input is retained better — together with primacy, this is why key findings go at the start and are repeated at the end, never buried in the middle |
| Evaluator-optimizer (pattern) | A generation step followed by a critique/evaluation step (by the same or a different agent) that feeds back into improving the output — the formal name for a self-critique-against-a-checklist loop |
| Graceful degradation with transparency | Coverage annotations: when some sources or subagents fail or are unavailable, synthesize what's available and explicitly label what's well-supported versus what has a gap — don't silently produce false completeness, and don't abandon the task |

## Core terms by domain

**Agentic architecture**
- **Agentic loop** — the request → inspect `stop_reason` → execute tools → append results → repeat cycle.
- **`stop_reason`** — the deterministic signal for what the model did (`tool_use`, `end_turn`, and others); the loop's real router.
- **Hub-and-spoke / orchestrator-workers** — one coordinator plus specialized subagents; see synonym table above.
- **Context isolation** — subagents do not automatically inherit the coordinator's conversation history; it must be passed explicitly.
- **`fork_session`** — branch a new session from a shared baseline to explore a divergent approach without cross-contaminating context.
- **Hook** — code that intercepts the agent loop at a defined point (for example `PostToolUse`) for deterministic transformation or enforcement, as opposed to a prompt instruction.
- **Prompt chaining** — fixed, sequential decomposition of a task into focused passes, used when the steps are known in advance.

**Tool design & MCP**
- **Tool description** — the primary signal the model uses to select which tool to call; the first thing to fix when tool selection misfires.
- **`isError`** — the MCP flag marking a tool result as a failure.
- **`errorCategory` / `isRetryable`** — structured error metadata that tells the agent whether retrying is worth attempting (transient) or not (business rule, validation).
- **MCP resource** vs. **MCP tool** — a resource exposes a readable content catalog (schema, doc hierarchy); a tool performs an action.
- **`.mcp.json`** vs. **`~/.claude.json`** — project-scoped (checked into version control, shared) vs. user-scoped (personal) MCP server configuration.
- **Scoped / constrained tool** — a narrow tool covering a frequent cross-role need (for example `verify_fact`) without granting full access to the underlying capability.

**Claude Code configuration**
- **CLAUDE.md hierarchy** — user (`~/.claude/CLAUDE.md`) → project (root `CLAUDE.md`) → directory-level, loaded together with project/directory scope shared via version control and user scope kept personal.
- **`.claude/rules/`** — YAML-frontmatter files with `paths:` glob patterns; load only when a matching file is being edited.
- **Skill** (`.claude/skills/<name>/SKILL.md`) — a reusable, on-demand recipe; `context: fork` runs it in an isolated subagent context instead of inline.
- **`allowed-tools` (skill)** vs. **`tools` (subagent)** — a skill's `allowed-tools` pre-approves without narrowing the available pool; a subagent's `tools` genuinely restricts what it can call.
- **Plan mode** vs. **direct execution** — plan for architecturally significant, multi-file, or multiple-valid-approach work; direct for well-scoped single-file changes.
- **`-p` / `--print`** — non-interactive Claude Code CLI mode for CI.
- **`--output-format json` / `--json-schema`** — machine-parseable structured CLI output for CI pipelines.

**Prompt engineering & structured output**
- **`tool_use` + JSON schema** — guarantees syntactic/structural correctness (valid JSON, correct types); does not guarantee semantic correctness (values can still be inconsistent with each other).
- **`tool_choice`** — `"auto"` (model decides tool vs. text), `"any"` (must call a tool, model picks which), forced (`{"type": "tool", "name": "..."}`, must call the named tool).
- **Few-shot prompting** — 2–4 targeted examples, most valuable when they demonstrate reasoning on an ambiguous case rather than just showing format.
- **Validation-retry loop** — a retry that includes the specific validation error and the failed output; effective for format/structural errors, ineffective when the information is simply absent from the source.
- **Message Batches API** — asynchronous, ~50% cheaper, up to a 24-hour window, correlated by `custom_id`, no multi-turn tool calling support.
- **Independent review** — a fresh model instance/context reviewing another's output, used to catch correctness issues the generator is biased against finding in itself.

**Context management & reliability**
- **Case facts block** — a persistent, non-summarized block of transactional facts (amounts, dates, IDs, statuses) injected into every prompt.
- **Lost-in-the-middle** — information placed in the middle of a long input is retained worse than information at the start or end (see primacy/recency above).
- **Escalation trigger** — a valid reason to hand off to a human: explicit request, policy gap, insufficient authority, no progress. Sentiment and self-reported confidence are *not* valid triggers — neither correlates with whether the case is actually solvable.
- **Provenance** — the claim-source-date mapping that must survive synthesis across multiple sources; conflicting sources are preserved with attribution, never averaged or silently resolved to one.
- **Stratified sampling** — measuring accuracy broken out by segment (document type, field) rather than trusting one aggregate number.

## Where to go deeper

Every term above is expanded with worked examples in its domain guide (`domain-1-agentic-architecture.md` through `domain-5-context-reliability.md`) and applied in context in the scenario docs (`scenario-1-customer-support.md` through `scenario-6-structured-extraction.md`).
