# Scenario 1: Customer Support Resolution Agent

You are building a customer support resolution agent on the Claude Agent SDK that handles high-ambiguity requests — returns, billing disputes, account issues — through custom MCP tools (`get_customer`, `lookup_order`, `process_refund`, `escalate_to_human`), targeting 80%+ first-contact resolution with correct escalation of the rest.

## Primary domains

- **Domain 1 — Agentic Architecture & Orchestration.** The agentic loop, hooks vs. prompt-based enforcement, and structured handoff when a case needs a human.
- **Domain 2 — Tool Design & MCP Integration.** Tool descriptions as the selection mechanism, structured error metadata, scoped access.
- **Domain 5 — Context Management & Reliability.** Escalation triggers, a persistent case-facts block, and treating tool output as an unreliable proxy for ground truth.
- Two Task Statements recur even though this scenario isn't their primary domain: Domain 3's system-prompt configuration (a keyword-driven instruction as the source of a routing bug) and Domain 4's self-critique loop (checking a response for completeness before it goes out).

## Signature failure modes

**Symptom:** the agent calls `lookup_order` or `process_refund` before it has confirmed the customer's identity, occasionally acting on the wrong account.
**Root cause:** a critical, checkable business sequence was left to the model's probabilistic judgment instead of being enforced in code.
**Best practice:** add a programmatic prerequisite — a hook that physically blocks `process_refund` until `get_customer` has returned a verified identity. Strengthening the system prompt is not sufficient here: any non-zero failure rate is unacceptable when the downstream action has financial consequences.

**Symptom:** a request like "check my order #12345" gets routed to `get_customer` instead of `lookup_order`.
**Root cause:** both tools have thin descriptions and similar-looking ID formats, so the model has no reliable signal to disambiguate.
**Best practice:** expand each tool's description with its expected input format, example queries, and explicit "use this when… not when…" boundaries. This is a proportionate first fix — reach for a routing layer or a dedicated classifier only if better descriptions don't close the gap.

**Symptom:** the escalation rate is far below target — the agent escalates straightforward cases (a standard photo-verified replacement) while trying to handle complex ones with policy exceptions itself.
**Root cause:** the boundary for "when to escalate" was never made explicit, so the model is guessing.
**Best practice:** write explicit escalation criteria into the prompt, backed by few-shot examples on the borderline cases. Do not rely on a self-reported confidence score (poorly calibrated) or on sentiment (it measures the customer's emotional state, not the case's actual complexity).

**Symptom:** the team wants a hard ceiling — no autonomous refund above a fixed dollar threshold.
**Root cause:** this is a sharp, checkable, money-bearing rule, which is exactly the kind of rule a prompt cannot guarantee.
**Best practice:** enforce it as a hook that redirects any refund over the threshold to escalation. A prompt instruction is not enough for a rule with financial consequences.

**Symptom:** `process_refund` returns a bare string like `"Error"`, and the agent has no basis for deciding whether to retry or escalate.
**Root cause:** the tool surfaces failures as unstructured text instead of structured, actionable metadata.
**Best practice:** return a structured error with an `errorCategory` (transient / validation / business / permission) and an `isRetryable` flag. Transient errors get retried; business-rule failures get explained to the customer or escalated — the category, not a guess, drives the branch.

**Symptom:** `lookup_order` returns zero matching orders, and the agent treats that as if the tool had failed.
**Root cause:** an empty result and an error are being conflated, when an empty result can be a perfectly valid, successful outcome.
**Best practice:** distinguish "the call succeeded and found nothing" from "the call failed" at the tool-result level, so the agent doesn't trigger a spurious retry or escalation, or draw the wrong conclusion, from a legitimate empty answer.

**Symptom:** the agent's tool choice tracks a specific keyword rather than the customer's actual intent — for example it reliably calls one tool when a message contains a particular word, and a different tool when that word is absent, even though the tool descriptions themselves are clear and unambiguous.
**Root cause:** a sharp, reproducible keyword dependency, given clean descriptions, points to a configured instruction in the system prompt telling the model to key off that word — not to a base-model association and not to a data or fine-tuning gap (both out of scope for what you control).
**Best practice:** when behavior is deterministic and reproducible, look first at your own configuration — the system prompt and tool descriptions — before attributing the failure to the model. A deterministic pattern implies a configured rule somewhere in your inputs; find and fix that rule rather than "fixing" the model. This is the mirror image of the description-quality failure mode above: there, the descriptions were the problem; here, the descriptions are fine and a system-prompt instruction is overriding them.

**Symptom:** the resolution the agent gives is technically correct, but the pieces that are missing vary case to case — sometimes the policy citation is missing, sometimes the timeline, sometimes next steps.
**Root cause:** there's no per-response check for completeness, so gaps slip through inconsistently.
**Best practice:** add a self-critique / evaluator-optimizer step — the agent evaluates its own draft against a completeness checklist (concern acknowledged, context given, next steps stated) before sending it. Fixed few-shot examples won't help here because the gaps aren't a fixed pattern, and moving to a larger model isn't the fix either. Note that this is a case where self-review is the right call, not the general caution against self-review as self-critique for bias — here you're checking a draft against an objective checklist, not asking the model to catch its own subtler reasoning errors.

**Symptom:** MCP tools return timestamps and status data in inconsistent formats — Unix epoch, ISO 8601, numeric codes — including from third-party servers you can't modify.
**Best practice:** add a `PostToolUse` hook that normalizes every tool's output into one canonical shape before the agent ever sees it, including third-party tools. This beats an on-demand `normalize_data` tool (the agent can forget to call it, or call it redundantly), per-tool wrapper code (more surface area to maintain), or documenting the formats in the prompt (probabilistic, not guaranteed).

**Symptom:** a single message bundles two unrelated concerns — for example, a refund on one order and an address change on another — and the agent mishandles the combination in one of two distinct ways depending on what's actually broken.
**Root cause and fix depend on which symptom you see:**
- If the agent only acts on one of the two sub-requests, or mixes up parameters between them, the fix is a prompt-level one: few-shot examples that show the reasoning for decomposing the request and sequencing the right tool calls per sub-case.
- If the agent handles both correctly but inefficiently — many redundant tool calls, run sequentially, re-fetching the same customer data for each concern — the fix is structural: decompose the request, investigate each concern in parallel against shared customer context gathered once, then synthesize.
Neither symptom is fixed by merging tools into a bigger one, running a separate pre-processing model call, or a post-hoc validation/re-prompt pass.

## Domain → this scenario

| Task Statement | How it surfaces here |
|---|---|
| 1.4 — enforcement & handoff | `get_customer` prerequisite before refund; dollar-threshold hook |
| 1.5 — hooks for interception & normalization | `PostToolUse` normalization of heterogeneous MCP data formats |
| 1.6 — task decomposition | Multi-concern request: parallel investigation on shared context, then synthesis |
| 2.1 — tool descriptions & selection | `get_customer` vs. `lookup_order` disambiguation |
| 2.2 — structured tool errors | Refund failure: retryable vs. business-rule vs. permission |
| 3.x — Claude Code / system-prompt configuration | Keyword-driven routing traced back to a system-prompt instruction, not the model |
| 4.x — self-critique | Evaluator-optimizer pass for response completeness before sending |
| 5.2 — escalation triggers & case facts | Explicit escalation criteria (not sentiment/confidence); amounts and order IDs held outside conversation summarization |
