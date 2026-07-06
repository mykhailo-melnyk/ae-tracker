# Preparation exercises

Four hands-on exercises from the exam guide, paraphrased here with the same objective and step structure. Build each one — reading about a hook or a schema is not the same as having watched it fail and fixing it. Each exercise names the domains it reinforces so you can pair it with the matching domain guide.

## Exercise 1 — Build a Multi-Tool Agent with Escalation Logic

**Objective:** an agent loop that calls tools, handles their failures in a structured way, and knows when to hand off to a human — that's the muscle this exercise builds.

**Steps:**
1. Write 3–4 MCP tool descriptions precise enough that the model never has to guess which one applies — spell out purpose, inputs, and edge cases for each. Deliberately include a pair of tools whose jobs overlap, so you have to word the descriptions carefully enough to keep the model from picking the wrong one.
2. Wire up the agentic loop around `stop_reason`: it should keep looping through tool calls while `stop_reason` says `"tool_use"`, and hand back the final answer once it flips to `"end_turn"`. Both branches need to work, not just the happy path.
3. Give your tools a structured failure shape instead of bare error strings — a category (transient, validation, or permission), a boolean flag for whether retrying makes sense, and plain-language detail. Then prove it works: transient failures should trigger a retry, and business-rule failures should surface as an explanation to the user rather than a raw stack trace.
4. Add a hook that watches tool calls in-flight and enforces a business rule — say, refusing anything over a dollar cap — and routes the blocked request into an escalation path instead of just failing.
5. Throw a message at the agent that bundles two or three unrelated asks at once, and confirm it splits them apart, resolves each one, and stitches the results back into one coherent reply rather than answering only the first thing it noticed.

**Domains reinforced:** Domain 1 (Agentic Architecture & Orchestration), Domain 2 (Tool Design & MCP Integration), Domain 5 (Context Management & Reliability).

## Exercise 2 — Configure Claude Code for a Team Development Workflow

**Objective:** this one is about making Claude Code behave consistently across a whole team — shared CLAUDE.md context, scoped rules, slash commands, and MCP servers configured so they don't step on each other.

**Steps:**
1. Start with a project-level CLAUDE.md holding the coding and testing standards everyone on the team should follow, then confirm it actually reaches every team member the same way regardless of who clones the repo.
2. Split path-specific guidance into separate `.claude/rules/` files, each scoped with a YAML frontmatter glob — one for `src/api/**/*`, another for `**/*.test.*`, and so on. Edit a file under each glob and check that only the matching rule fires.
3. Scope a skill to the project under `.claude/skills/`, running it with `context: fork` and a locked-down `allowed-tools` list, and confirm it executes in its own sandbox without leaking state into the main conversation.
4. Set up a shared MCP server in `.mcp.json` that pulls credentials from environment variables, then add a second, personal MCP server in `~/.claude.json` purely for your own experiments — verify Claude Code sees both at once without conflict.
5. Run the same three tasks — a one-file bug fix, a migration touching a whole library, and a new feature with several defensible designs — once in plan mode and once without it, and notice for yourself where the planning step actually paid for itself versus where it was overhead.

**Domains reinforced:** Domain 3 (Claude Code Configuration & Workflows), Domain 2 (Tool Design & MCP Integration).

## Exercise 3 — Build a Structured Data Extraction Pipeline

**Objective:** the goal here is a pipeline that pulls structured fields out of messy documents reliably — schema design, `tool_use` for the output shape, a retry loop when validation fails, and a plan for running it at batch scale.

**Steps:**
1. Design an extraction tool schema with a mix of required and optional fields, an enum that falls back to `"other"` plus a free-text detail when nothing else fits, and fields marked nullable for data that genuinely might not be in the source. Run it against documents that are missing information and check the model reports `null` instead of inventing an answer.
2. Build a retry loop around validation failures: when the extracted JSON doesn't pass schema (or Pydantic) validation, send the model another turn containing the original document, what it extracted, and exactly why validation rejected it. Keep track of which failures clear up after a retry (usually formatting) versus which persist because the source simply doesn't contain that information.
3. Feed the tool few-shot examples covering the range of document formats you expect — citations styled inline versus as a bibliography, prose versus tables — and confirm extraction quality holds up across that variety rather than only working on the format you tested first.
4. Work out a batching approach: push 100 documents through the Message Batches API, track failures by their `custom_id`, fix and resubmit the ones that failed (splitting up oversized documents, for instance), and check the total runtime against whatever SLA you're targeting.
5. Have the model attach a confidence score to each extracted field, send anything below a threshold to human review, and then slice the accuracy numbers by document type and field to see whether performance holds steady or degrades in specific spots.

**Domains reinforced:** Domain 4 (Prompt Engineering & Structured Output), Domain 5 (Context Management & Reliability).

## Exercise 4 — Design and Debug a Multi-Agent Research Pipeline

**Objective:** this exercise is about coordinating multiple subagents on a research task — passing context between them deliberately, propagating errors instead of swallowing them, and synthesizing results without losing track of where each fact came from.

**Steps:**
1. Set up a coordinator that hands work off to at least two subagents — web search and document analysis is a reasonable split. Make sure `"Task"` is actually in the coordinator's `allowedTools`, and pass each subagent its research context explicitly in the prompt rather than assuming it inherits context automatically.
2. Have the coordinator fire off several `Task` calls in the same response so the subagents run in parallel, then time it against a sequential version to see the actual latency win.
3. Shape each subagent's output so content and metadata don't get mixed together — every finding needs its claim, the evidence snippet backing it, where it came from (URL or document name), and when it was published. Check that when the synthesis step merges findings together, the source attribution survives intact.
4. Force a failure: simulate one subagent timing out, and confirm the coordinator gets back a structured error — what kind of failure, what it was trying to do, and what partial results it already had — rather than just an exception. The coordinator should be able to finish with the partial results it has and flag the gap in coverage in its final output.
5. Feed the pipeline two credible sources that disagree on a statistic, and check the synthesis keeps both numbers with their respective attributions instead of silently choosing one — and that the final report separates the well-established facts from the ones still in dispute.

**Domains reinforced:** Domain 1 (Agentic Architecture & Orchestration), Domain 2 (Tool Design & MCP Integration), Domain 5 (Context Management & Reliability).
