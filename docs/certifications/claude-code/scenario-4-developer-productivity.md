# Scenario 4: Developer Productivity with Claude

You are building a developer-productivity agent on the Claude Agent SDK that helps engineers explore unfamiliar codebases, understand legacy systems, generate boilerplate, and automate repetitive tasks, using the built-in tools (Read, Write, Edit, Bash, Grep, Glob) plus MCP server integrations. The implicit bar is efficient code navigation rather than reading everything indiscriminately.

## Primary domains

- **Domain 2 — Tool Design & MCP Integration.** Built-in tools (Grep/Glob/Edit), MCP integration, and tool descriptions. This is the core of the scenario.
- **Domain 3 — Claude Code Configuration & Workflows.** Claude Code configuration and MCP scope (`.mcp.json` vs. `~/.claude.json`).
- **Domain 1 — Agentic Architecture & Orchestration.** Incremental investigation strategy.

This scenario has no dedicated set of sample questions of its own in the exam guide — it integrates tool-design and configuration concepts that otherwise show up in the neighboring scenarios, so expect its questions to draw on the same concepts framed slightly differently.

## Signature failure modes

**Symptom:** the agent tries to load an entire unfamiliar codebase into context before doing anything useful.
**Best practice:** investigate incrementally — grep for entry points, then read along the actual import chain — rather than reading everything up front.

**Symptom:** the agent reaches for the wrong search tool for the job.
**Best practice:** know the split. **Grep** searches by **content** (function names, error messages, import statements). **Glob** searches by **path/name** (extensions, filename patterns). Tracing how a function is used through wrapper modules, for example, means first finding the exported names, then grepping for each one.

**Symptom:** an `Edit` call fails because `old_string` isn't unique, or isn't found at all.
**Best practice:** fall back to `Read` followed by `Write` — read the current content, then write the full replacement. Reaching for `Bash`/`sed` is a last resort, not the default fallback.

**Symptom:** the agent keeps reaching for a built-in tool even when a more capable MCP tool is available for the same job.
**Root cause:** the MCP tool's description is too thin to compete with the built-in tool's description for the model's attention.
**Best practice:** write MCP tool descriptions in more detail than the built-in tools they're meant to be preferred over, since description quality is what drives tool selection.

**Symptom:** an MCP server meant for the whole team was registered somewhere personal, and teammates can't see it.
**Best practice:** register team-wide, domain-specific MCP servers in the project-scoped `.mcp.json` (checked into the repo, shared via version control); reserve the personal `~/.claude.json` for individual experimentation. Handle secrets through environment-variable substitution rather than hardcoding them into either file.

A few standing heuristics resolve most of the judgment calls in this scenario. An MCP resource — a browsable catalog of content such as a database schema or documentation tree — lets the agent read directly instead of running a series of exploratory tool calls to reconstruct the same information. For standard integrations (Jira, GitHub, and the like), prefer a mature community MCP server; write a custom one only when you need team-specific or workflow-specific behavior a generic server won't provide. Least privilege matters for tool counts too: scope an agent to roughly four or five tools suited to its role rather than handing it eighteen, since more tools than the role needs degrades tool selection quality. And the mechanism that actually restricts which tools a subagent can call is the subagent's own `tools` configuration — a skill's `allowed-tools` only pre-approves usage, it doesn't restrict the agent to that set.

## Domain → this scenario

| Task Statement | How it surfaces here |
|---|---|
| 2.4 — built-in tool selection | Grep (content) vs. Glob (names); `Edit` → `Read`+`Write` fallback on a non-unique match |
| 2.1 — tool descriptions & selection | Detailed MCP descriptions needed to be chosen over built-ins |
| 2.4 / 3.1 — MCP scope | `.mcp.json` for team tools vs. `~/.claude.json` for personal ones |
| 1.6 — incremental investigation | Grep entry points, then Read along the import chain |
