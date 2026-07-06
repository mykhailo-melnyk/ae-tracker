# Domain 2: Tool Design & MCP Integration — 18%

This domain is mostly one insight applied five ways: the words you write — tool descriptions, error metadata, system prompts, MCP config — are the control surface an agent actually reasons over, so the fix for most failures is a better-written interface, not more infrastructure. For each Task Statement below, read *What's tested*, run the *Self-audit* honestly, then use the *Deep-dive prompt* to have an LLM teach you the concept, generate concrete examples and counter-examples, and quiz you until you can answer the *Active-recall self-check* from memory. The recurring instinct this domain rewards is reaching for the proportionate, root-cause fix (rewrite the description, structure the error) over the heavyweight one (a router, a classifier, a blind retry).

## Task Statement 2.1 — Design effective tool interfaces with clear descriptions and boundaries

### What's tested
**Knowledge of:** the tool `description` as the primary mechanism an LLM uses to select a tool — minimal or near-identical descriptions produce unreliable selection among similar tools; the elements a good description must carry (input formats/parameters, example queries, edge cases, and boundary explanations against neighboring tools); how ambiguous or overlapping descriptions cause misrouting (the classic `analyze_content` vs `analyze_document` collision); how system-prompt wording feeds back into selection — keyword-sensitive instructions can forge unintended tool associations that override even well-written descriptions.
**Skills in:** writing descriptions that differentiate each tool's purpose, expected inputs, outputs, and when to use it versus a similar alternative; renaming a tool and rewriting its description to remove functional overlap (`analyze_content` → `extract_web_results` with a web-specific description); splitting a generic tool into purpose-specific tools with defined input/output contracts (`analyze_document` → `extract_data_points`, `summarize_content`, `verify_claim_against_source`); auditing the system prompt for keyword-sensitive phrasing that could hijack selection.
*Self-audit:* You can name the first, proportionate fix for two similar tools being confused, and list the three or four elements a differentiating description must contain.

### Distilled notes
The single most important idea in this domain: the agent picks a tool primarily by reading its **`description`**. So when two tools get confused or an agent misroutes, the root cause is almost always thin or overlapping descriptions — and the cheapest, most on-target first step is to **expand and differentiate the descriptions**, not to build a routing layer or a classifier. A strong description carries three things: (1) input formats and parameters (e.g. "order ID in the form `ord_xxxx`"), (2) example queries / use cases, and (3) an explicit boundary against the neighboring tool — "use THIS when…, do NOT use it when…". When two names still overlap semantically, rename to kill the ambiguity (vague `analyze_content` → concrete `extract_web_results`) or split a bloated generic tool into several contract-bound ones.

Two distractor families to recognize: a keyword-based routing layer and an ML classifier are both over-engineered — they add overhead, bypass the model's natural tool selection, and leave the real defect (bad descriptions) unfixed. Choose the proportionate fix that hits the root cause. One more feedback loop the exam probes: the **system prompt** itself can distort selection — a keyword-sensitive instruction ("for anything about documents, use…") can forge an unintended association that overrides a well-written description, so reviewing the prompt is part of the fix surface.

### Deep-dive prompt
> I'm studying tool-interface design for LLM agents. (1) Explain why the tool `description` is the primary selection mechanism and what three or four elements a well-differentiated description must contain. (2) Give me a worked example of two tools that get confused (like `analyze_content` vs `analyze_document`) and show three fixes ranked by proportionality: expand descriptions, rename, split into purpose-specific tools. (3) Explain how system-prompt keyword sensitivity can override a good description, with an example. (4) Now quiz me: give five short "the agent keeps calling the wrong tool" scenarios and ask me for the proportionate first fix, then critique my answers.

### Active-recall self-check
1. Two tools with near-identical descriptions are being confused. What is the cheapest first fix, and why are a keyword router or ML classifier the wrong answers?
2. What three elements make a tool description differentiating rather than minimal?
3. Beyond the descriptions themselves, what other text can distort tool selection, and how?

## Task Statement 2.2 — Implement structured error responses for MCP tools

### What's tested
**Knowledge of:** the MCP `isError` flag as the channel for signalling a tool failure back to the agent; the four error classes — transient (timeouts, service unavailability), validation (bad input), business (policy violation), and permission; why uniform "Operation failed" responses prevent the agent from choosing an appropriate recovery; the retryable/non-retryable distinction and how structured metadata stops wasted retries.
**Skills in:** returning structured error metadata — `errorCategory`, an `isRetryable` boolean, and a human-readable description; attaching `retriable: false` and a customer-friendly explanation to business-rule violations so the agent can communicate rather than loop; recovering from transient failures locally inside a subagent and propagating to the coordinator only what can't be resolved, together with partial results and what was already attempted; distinguishing a genuine access failure (which needs a retry decision) from a valid empty result (a successful query that simply found no matches).
*Self-audit:* You can classify an error into its category and say whether a retry could possibly help, and you can explain why "zero matches" must not be reported as an error.

### Distilled notes
A bare `"Error"` string is useless: the agent can't decide what to do with it. A structured error carries **`errorCategory`** (transient / validation / business / permission), an **`isRetryable`** flag, and a **human-readable message**; in a multi-agent setup it also carries what was attempted and any partial results. The category drives behaviour: a **transient** error (a timeout) warrants a retry, possibly with backoff; a **business-rule** violation makes retrying pointless — explain it to the user or escalate; a **validation** error means retrying without fixing the input is wasted. That is the whole point of `isRetryable` — it tells the agent whether trying again could ever succeed, which is what prevents retry storms.

The subtle, heavily tested distinction is **access failure vs valid empty result**. "Zero matches" is a *success* — the query ran and legitimately returned nothing; reporting it as an error triggers pointless retries or needless escalation. The mirror-image trap is worse: a real access failure masked as "success, empty" makes the agent draw a false conclusion ("there are no such records") from what was actually a broken call. So a tool must represent "it worked and found nothing" and "it failed to look" as distinctly different responses. And in a coordinator-subagent system, resolve transient failures locally in the subagent and bubble up only the irreducible ones — with partial results and a note of what was tried — so the coordinator isn't handed raw noise.

### Deep-dive prompt
> I'm studying structured error responses for MCP tools. (1) Explain the `isError` flag and the four error categories (transient, validation, business, permission), and for each say whether a retry can help. (2) Show me a good structured error object (`errorCategory`, `isRetryable`, human-readable message, plus partial results in a multi-agent case) versus a bare "Operation failed", and explain what recovery decisions the structured one enables. (3) Explain the access-failure-vs-valid-empty-result distinction in both directions and why each mistake is dangerous. (4) Quiz me: give six short failures and ask me for the category, `isRetryable`, and the agent's correct next move, then critique my answers.

### Active-recall self-check
1. Name the four error categories and, for each, whether retrying could succeed.
2. A search tool returns no matches. Is that an error? What breaks if you model it as one — and what breaks if a real access failure is modeled as an empty success?
3. In a coordinator-subagent system, which errors should a subagent resolve itself, and what must it include when it does propagate one upward?

## Task Statement 2.3 — Distribute tools appropriately across agents and configure tool choice

### What's tested
**Knowledge of:** the principle that too many tools (18 instead of ~4–5) degrades selection reliability by inflating decision complexity; that an agent given tools outside its specialization tends to misuse them (a synthesis agent attempting web searches); scoped tool access — each agent gets only its role's tools, plus a few narrow cross-role tools for high-frequency needs; the `tool_choice` options `"auto"`, `"any"`, and forced selection (`{"type": "tool", "name": "..."}`).
**Skills in:** restricting each subagent's tool set to its role to prevent cross-specialization misuse; replacing a generic tool with a constrained alternative (`fetch_url` → `load_document` that validates document URLs); providing a scoped cross-role tool for a frequent simple need (a `verify_fact` tool for the synthesis agent) while still routing complex cases through the coordinator; using forced `tool_choice` to guarantee a specific tool runs first (force `extract_metadata` before enrichment tools) and handling later steps in follow-up turns; setting `tool_choice: "any"` to force a tool call instead of conversational text.
*Self-audit:* You can pick the right `tool_choice` for "must call a tool" vs "must call *this* tool first", and justify a scoped cross-role tool as a least-privilege/latency trade-off.

### Distilled notes
Least privilege is a *performance* lever here, not just a safety one: hand an agent 18 tools when it needs 4–5 and selection reliability drops (more options, more chances to misroute) and it starts reaching into operations outside its specialization (the synthesis agent that tries to run web searches). The fix is to scope each subagent's tool set to its role — in Claude Code terms this is the subagent's `tools` / `disallowedTools` configuration (the Domain 3 link). A useful refinement is the **scoped (constrained) tool**: for a frequent, simple cross-role need, give the agent a narrow tool — `verify_fact` (fact-check only, not a full web search), or `load_document` (validates document URLs) in place of a wide-open `fetch_url` — so the common case is handled in-house while anything complex still routes through the coordinator. That is a deliberate trade-off between strict least privilege and latency.

`tool_choice` is the other half. `"auto"` lets the model decide whether and which tool to call; `"any"` forces it to call *some* tool rather than returning prose (use it when a conversational reply would be wrong); forced `{"type": "tool", "name": "..."}` pins the *specific* tool for this turn — the pattern for guaranteeing an ordering like "extract metadata first, then enrich," with the subsequent steps handled in follow-up turns. Match the mechanism to the requirement: "it must use a tool" → `"any"`; "it must use *this* tool first" → forced selection.

### Deep-dive prompt
> I'm studying tool distribution across agents and `tool_choice`. (1) Explain why giving an agent 18 tools instead of 4–5 hurts, and what "tools outside its specialization" leads to. (2) Define a scoped/constrained cross-role tool (like `verify_fact`, or `load_document` replacing `fetch_url`) and the least-privilege-vs-latency trade-off it makes. (3) Contrast `tool_choice` `"auto"`, `"any"`, and forced `{"type":"tool","name":"..."}`, with a use case for each and how forced selection enforces ordering across turns. (4) Quiz me: for six requirements, ask me which `tool_choice` (or scoping change) fits, and critique my answers.

### Active-recall self-check
1. Why does over-provisioning tools degrade an agent, and what's the concrete failure when an agent holds tools outside its role?
2. What is a scoped cross-role tool, and what trade-off does adding one make? Give an example.
3. Which `tool_choice` guarantees *some* tool is called, and which guarantees a *specific* tool runs first?

## Task Statement 2.4 — Integrate MCP servers into Claude Code and agent workflows

### What's tested
**Knowledge of:** MCP server scoping — project-level `.mcp.json` for shared team tooling (committed to VCS) vs user-level `~/.claude.json` for personal/experimental servers; environment-variable expansion in `.mcp.json` (`${GITHUB_TOKEN}`) so credentials aren't committed; that tools from all configured servers are discovered at connection time and available simultaneously; MCP resources as a way to expose content catalogs (issue summaries, documentation hierarchies, database schemas) that reduce exploratory tool calls.
**Skills in:** configuring shared servers in project-scoped `.mcp.json` with env-var expansion for auth tokens; configuring personal/experimental servers in user-scoped `~/.claude.json`; enhancing MCP tool descriptions so the agent doesn't fall back to a weaker built-in tool (preferring `Grep` over a more capable MCP tool); choosing a mature community MCP server for a standard integration (Jira) and reserving custom servers for team-specific workflows; exposing content catalogs as MCP resources so agents can see available data without probing for it.
*Self-audit:* You can say which config file a given server belongs in, how its secret is supplied, and when a resource beats a tool call.

### Distilled notes
Two scopes: **`.mcp.json`** lives in the repo, is project-scoped, and is shared with the team through version control; **`~/.claude.json`** is user-scoped and personal (experimental servers, anything you don't want to impose on teammates). Secrets never get committed — you reference them with environment-variable expansion (`${GITHUB_TOKEN}`) so the file holds a placeholder, not the token. All configured servers connect at startup and their tools become available simultaneously, so naming and descriptions matter across the whole set, not just within one server.

Two nuances the exam likes. First, **MCP tool descriptions must be detailed** — if an MCP tool is under-described, the agent will prefer a familiar built-in (like `Grep`) even when the MCP tool is more capable; this is the same "description drives selection" law from 2.1, applied to MCP. Second, an **MCP resource** is a read-only catalog of content or data (a database schema, a docs hierarchy, issue summaries): the agent reads it directly instead of burning several exploratory tool calls to discover what exists. On build-vs-reuse: for a standard integration (Jira) reach for a mature community server; write a custom server only when the community options fall short or you need a team-specific/custom workflow.

### Deep-dive prompt
> I'm studying MCP server integration in Claude Code. (1) Contrast project-scoped `.mcp.json` with user-scoped `~/.claude.json`: what goes in each, and how do I supply credentials without committing them? (2) Explain what "all servers' tools are available simultaneously at connection time" implies for naming and descriptions, and why an under-described MCP tool loses to a built-in like `Grep`. (3) Explain what an MCP resource is and give three catalog examples, plus why it reduces exploratory tool calls. (4) Give me the community-server-vs-custom-server decision rule. (5) Quiz me with six short setups: which config file, resource or tool, community or custom?

### Active-recall self-check
1. A server should be shared with the whole team and needs a GitHub token. Which config file, and how do you supply the token safely?
2. Your agent keeps using `Grep` instead of a more capable MCP search tool. What's the likely cause and fix?
3. What is an MCP resource, and what problem does exposing one solve that a tool call doesn't?

## Task Statement 2.5 — Select and apply built-in tools (Read, Write, Edit, Bash, Grep, Glob) effectively

### What's tested
**Knowledge of:** `Grep` for content search (matching patterns inside files — function names, error strings, import statements); `Glob` for file-path pattern matching (finding files by name/extension); `Read`/`Write` for whole-file operations and `Edit` for targeted changes anchored on unique text; that when `Edit` can't find a unique match, `Read` + `Write` is the reliable fallback.
**Skills in:** choosing `Grep` to search code content across a codebase (all callers of a function, a specific error message); choosing `Glob` to find files by naming pattern (`**/*.test.tsx`); using `Read` then `Write` when `Edit` has no unique anchor; building codebase understanding incrementally — start with `Grep` to find entry points, then `Read` to follow imports and trace flows, rather than reading every file up front; tracing a function's usage across wrapper modules by first listing all exported names, then searching each name across the tree.
*Self-audit:* You can pick the right tool for "find by content" vs "find by filename", and state the fallback when `Edit` fails.

### Distilled notes
Keep the two search tools straight by *what they match*: **`Grep` searches file contents** (patterns like a function name, an error message, an import statement); **`Glob` searches paths and filenames** (e.g. `**/*.test.tsx`). The efficient way to understand an unfamiliar codebase is incremental, not exhaustive: `Grep` to locate entry points, then `Read` to follow the imports and trace the flow — never read every file up front. To trace how a function is used across wrapper modules, first identify all the exported names, then `Grep` for each name across the tree.

For edits: `Read`/`Write` operate on whole files; `Edit` makes a targeted change by matching a **unique** anchor string. When `Edit` can't find a unique match (the anchor appears more than once, or not exactly), the reliable fallback is **`Read` + `Write`** — re-read the file, then write back the full modified contents. Dropping to `Bash`/`sed` for edits is a last resort, not a first move.

### Deep-dive prompt
> I'm studying Claude Code's built-in tools. (1) Draw the line between `Grep` (content search) and `Glob` (path/filename patterns) with two example tasks each. (2) Explain the incremental codebase-exploration flow (`Grep` for entry points → `Read` to follow imports) and why it beats reading everything up front. (3) Explain when `Edit` fails and why `Read` + `Write` is the correct fallback rather than `Bash`/`sed`. (4) Quiz me: for eight short tasks, ask me which built-in tool I'd reach for and why, then critique my answers.

### Active-recall self-check
1. You need every caller of `processRefund`. `Grep` or `Glob`? What about finding all `**/*.test.tsx` files?
2. `Edit` reports it can't find a unique match for your anchor text. What's the reliable fallback, and what's the last resort?
3. How do you build understanding of an unfamiliar codebase without reading every file, and how do you trace a function across wrapper modules?

## Decision heuristics recap

These heuristics eliminate most wrong answers in this domain:

1. **The description decides the selection.** When tools get confused or an agent misroutes, the root cause is thin or overlapping descriptions — so the proportionate first fix is to expand, differentiate, rename, or split the tools, not to bolt on a keyword router or an ML classifier. The same law governs MCP: an under-described MCP tool loses to a familiar built-in like `Grep`.
2. **Empty is not an error.** A query that ran and found nothing is a *success*; modeling it as an error triggers pointless retries and escalations. The mirror trap is just as dangerous — a real access failure disguised as "success, empty" makes the agent conclude something false. Represent "worked, found nothing" and "failed to look" as distinctly different responses.
3. **`isRetryable` says whether trying again can help.** Transient errors (timeouts) are retryable; business-rule and validation errors are not — retrying them without changing the input or the policy just burns turns. Structured metadata (`errorCategory` + `isRetryable` + a human-readable message) is what lets the agent recover instead of loop.
4. **Least privilege, plus a scoped tool for the frequent case.** Give each agent only its role's tools (4–5, not 18) to protect selection reliability; add a narrow cross-role tool (`verify_fact`, `load_document`) for a common simple need, and route the complex cases through the coordinator.
5. **Match `tool_choice` to the requirement.** "It must call *some* tool, not chat" → `"any"`; "it must call *this* tool first" → forced `{"type": "tool", "name": "..."}`; otherwise `"auto"`.
