# Preparation exercises

Four hands-on exercises from the exam guide, paraphrased here with the same objective and step structure. Build each one — reading about a hook or a schema is not the same as having watched it fail and fixing it. Each exercise names the domains it reinforces so you can pair it with the matching domain guide.

## Exercise 1 — Build a Multi-Tool Agent with Escalation Logic

**Objective:** practice designing an agentic loop with tool integration, structured error handling, and escalation patterns.

**Steps:**
1. Define 3–4 MCP tools with detailed descriptions that clearly differentiate each tool's purpose, expected inputs, and boundary conditions. Include at least two tools with similar functionality that require careful description to avoid selection confusion.
2. Implement an agentic loop that checks `stop_reason` to decide whether to continue tool execution or present the final response. Handle both `"tool_use"` and `"end_turn"` correctly.
3. Add structured error responses to your tools: an `errorCategory` (transient/validation/permission), an `isRetryable` boolean, and a human-readable description. Verify the agent handles each error type appropriately — retrying transient errors, explaining business errors to the user.
4. Implement a hook that intercepts tool calls to enforce a business rule (for example, blocking an operation above a dollar threshold), redirecting to an escalation workflow when triggered.
5. Test with a multi-concern message (a request bundling more than one issue) and verify the agent decomposes the request, handles each concern, and synthesizes a unified response.

**Domains reinforced:** Domain 1 (Agentic Architecture & Orchestration), Domain 2 (Tool Design & MCP Integration), Domain 5 (Context Management & Reliability).

## Exercise 2 — Configure Claude Code for a Team Development Workflow

**Objective:** practice configuring CLAUDE.md hierarchies, custom slash commands, path-specific rules, and MCP server integration for a multi-developer project.

**Steps:**
1. Create a project-level CLAUDE.md with universal coding standards and testing conventions. Verify the instructions apply consistently for every team member who clones the project.
2. Create `.claude/rules/` files with YAML frontmatter glob patterns for different code areas (for example `paths: ["src/api/**/*"]` for API conventions, `paths: ["**/*.test.*"]` for testing conventions). Confirm each rule loads only when you edit a matching file.
3. Create a project-scoped skill in `.claude/skills/` with `context: fork` and `allowed-tools` restrictions. Verify the skill runs in isolation without polluting the main conversation context.
4. Configure an MCP server in `.mcp.json` with environment variable expansion for credentials. Add a personal, experimental MCP server in `~/.claude.json` and verify both are available at the same time.
5. Test plan mode versus direct execution on tasks of varying complexity: a single-file bug fix, a multi-file library migration, and a new feature with multiple valid implementation approaches. Observe where plan mode actually earns its cost.

**Domains reinforced:** Domain 3 (Claude Code Configuration & Workflows), Domain 2 (Tool Design & MCP Integration).

## Exercise 3 — Build a Structured Data Extraction Pipeline

**Objective:** practice designing JSON schemas, using `tool_use` for structured output, implementing validation-retry loops, and designing a batch processing strategy.

**Steps:**
1. Define an extraction tool with a JSON schema that includes required and optional fields, an enum with an `"other"` + detail-string pattern, and nullable fields for information that may not exist in the source. Process documents with fields missing and confirm the model returns `null` rather than fabricating a value.
2. Implement a validation-retry loop: on a Pydantic or JSON-schema validation failure, send a follow-up request that includes the document, the failed extraction, and the specific validation error. Track which errors resolve via retry (format mismatches) versus which don't (information genuinely absent from the source).
3. Add few-shot examples demonstrating extraction from documents with varied formats (inline citations vs. bibliographies, narrative descriptions vs. structured tables) and confirm improved handling of the structural variety.
4. Design a batch processing strategy: submit a batch of 100 documents through the Message Batches API, handle failures by `custom_id`, resubmit failed documents with modifications (for example chunking oversized documents), and calculate total processing time against an SLA constraint.
5. Implement a human review routing strategy: have the model emit field-level confidence scores, route low-confidence extractions to human review, and analyze accuracy by document type and field to check for consistent performance.

**Domains reinforced:** Domain 4 (Prompt Engineering & Structured Output), Domain 5 (Context Management & Reliability).

## Exercise 4 — Design and Debug a Multi-Agent Research Pipeline

**Objective:** practice orchestrating subagents, managing context passing, implementing error propagation, and handling synthesis with provenance tracking.

**Steps:**
1. Build a coordinator agent that delegates to at least two subagents (for example web search and document analysis). Make sure the coordinator's `allowedTools` includes `"Task"`, and that each subagent receives its research findings directly in its prompt rather than relying on automatic context inheritance.
2. Implement parallel subagent execution by having the coordinator emit multiple `Task` calls in a single response. Measure the latency improvement against sequential execution.
3. Design structured output for subagents that separates content from metadata: each finding should include a claim, an evidence excerpt, a source URL/document name, and a publication date. Verify the synthesis subagent preserves source attribution when combining findings.
4. Implement error propagation: simulate a subagent timeout and verify the coordinator receives structured error context (failure type, attempted query, partial results). Confirm the coordinator can proceed with partial results and annotate the final output with coverage gaps.
5. Test with conflicting source data (two credible sources reporting different statistics) and verify the synthesis output preserves both values with source attribution rather than arbitrarily picking one — and structures the report to separate well-established from contested findings.

**Domains reinforced:** Domain 1 (Agentic Architecture & Orchestration), Domain 2 (Tool Design & MCP Integration), Domain 5 (Context Management & Reliability).
