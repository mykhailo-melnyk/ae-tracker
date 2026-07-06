# Scope map: what's tested and what isn't

Read Out-of-Scope first. Every topic on that list is a plausible-sounding rabbit hole — it's adjacent to something the exam does test, which is exactly why it's worth naming explicitly as a place to stop spending time.

## Out-of-scope topics — don't spend time on these

The exam guide is explicit that the following topics will **not** be tested:

- Fine-tuning Claude models or training custom models
- Claude API authentication, billing, or account management
- Detailed implementation of specific programming languages or frameworks (beyond what's needed for tool and schema configuration)
- Deploying or hosting MCP servers (infrastructure, networking, container orchestration)
- Claude's internal architecture, training process, or model weights
- Constitutional AI, RLHF, or safety training methodologies
- Embedding models or vector database implementation details
- Computer use (browser automation, desktop interaction)
- Vision/image analysis capabilities
- Streaming API implementation or server-sent events
- Rate limiting, quotas, or API pricing calculations
- OAuth, API key rotation, or authentication protocol details
- Specific cloud provider configurations (AWS, GCP, Azure)
- Performance benchmarking or model comparison metrics
- Prompt caching implementation details (beyond knowing it exists)
- Token counting algorithms or tokenization specifics

If your study time gravitates toward any of these — for example going deep on vector database internals because a scenario mentions "search," or reading up on OAuth flows because a scenario has a login step — redirect it. None of that depth is scored.

## In-scope topics — what's actually tested

- **Agentic loop implementation** — control flow based on `stop_reason`, tool result handling, loop termination conditions
- **Multi-agent orchestration** — coordinator-subagent patterns, task decomposition, parallel subagent execution, iterative refinement loops
- **Subagent context management** — explicit context passing, structured state persistence, crash recovery using manifests
- **Tool interface design** — writing effective tool descriptions, splitting vs. consolidating tools, tool naming to reduce ambiguity
- **MCP tool and resource design** — resources for content catalogs, tools for actions, description quality for adoption
- **MCP server configuration** — project vs. user scope, environment variable expansion, multi-server simultaneous access
- **Error handling and propagation** — structured error responses, transient vs. business vs. permission errors, local recovery before escalation
- **Escalation decision-making** — explicit criteria, honoring customer preferences, policy gap identification
- **CLAUDE.md configuration** — hierarchy (user/project/directory), `@import` patterns, `.claude/rules/` with glob patterns
- **Custom commands and skills** — project vs. user scope, `context: fork`, `allowed-tools`, `argument-hint` frontmatter
- **Plan mode vs. direct execution** — complexity assessment, architectural decisions, single-file changes
- **Iterative refinement** — input/output examples, test-driven iteration, interview pattern, sequential vs. parallel issue resolution
- **Structured output via `tool_use`** — schema design, `tool_choice` configuration, nullable fields to prevent hallucination
- **Few-shot prompting** — ambiguous scenario targeting, format consistency, false-positive reduction
- **Batch processing** — Message Batches API appropriateness, latency tolerance assessment, failure handling by `custom_id`
- **Context window optimization** — trimming verbose tool outputs, structured fact extraction, position-aware input ordering
- **Human review workflows** — confidence calibration, stratified sampling, accuracy segmentation by document type and field
- **Information provenance** — claim-source mappings, temporal data handling, conflict annotation, coverage gap reporting

Every one of these maps to a Task Statement in one of the five domain guides — if you can place a bullet above under its Task Statement number, you know where to go deep. See `domain-1-agentic-architecture.md` through `domain-5-context-reliability.md`.

## Technologies and concepts appendix

The exam guide's appendix lists the concrete technologies and concepts that might appear in question stems or answer options. Recognizing these by name (even without deep expertise in all of them) is part of the exam:

- **Claude Agent SDK** — agent definitions, agentic loops, `stop_reason` handling, hooks (`PostToolUse`, tool call interception), subagent spawning via the `Task` tool, `allowedTools` configuration
- **Model Context Protocol (MCP)** — MCP servers, MCP tools, MCP resources, the `isError` flag, tool descriptions, tool distribution, `.mcp.json` configuration, environment variable expansion
- **Claude Code** — CLAUDE.md configuration hierarchy (user/project/directory), `.claude/rules/` with YAML frontmatter path-scoping, `.claude/commands/` for slash commands, `.claude/skills/` with `SKILL.md` frontmatter (`context: fork`, `allowed-tools`, `argument-hint`), plan mode, direct execution, `/memory` command, `/compact`, `--resume`, `fork_session`, the Explore subagent
- **Claude Code CLI** — `-p` / `--print` flag for non-interactive mode, `--output-format json`, `--json-schema` for structured CI output
- **Claude API** — `tool_use` with JSON schemas, `tool_choice` options (`"auto"`, `"any"`, forced tool selection), `stop_reason` values (`"tool_use"`, `"end_turn"`), `max_tokens`, system prompts
- **Message Batches API** — 50% cost savings, up to a 24-hour processing window, `custom_id` for request/response correlation, polling for completion, no multi-turn tool calling support
- **JSON Schema** — required vs. optional fields, enum types, nullable fields, `"other"` + detail string patterns, strict mode for syntax error elimination
- **Pydantic** — schema validation, semantic validation errors, validation-retry loops
- **Built-in tools** — Read, Write, Edit, Bash, Grep, Glob — their purposes and selection criteria
- **Few-shot prompting** — targeted examples for ambiguous scenarios, format demonstration, generalization to novel patterns
- **Prompt chaining** — sequential task decomposition into focused passes
- **Context window management** — token budgets, progressive summarization, lost-in-the-middle effects, context extraction, scratchpad files
- **Session management** — session resumption, `fork_session`, named sessions, session context isolation
- **Confidence scoring** — field-level confidence, calibration with labeled validation sets, stratified sampling for error rate measurement

If a term above is unfamiliar, don't treat it as a gap in your general Claude knowledge — check `glossary-and-synonyms.md` first, since several of these are just the exam's preferred name for a concept you already know under a different label.
