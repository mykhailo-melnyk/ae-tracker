# Domain 4: Prompt Engineering & Structured Output — 20%

This domain is where probabilistic prompting meets deterministic guarantees, and most wrong answers come from confusing the two. For each Task Statement below, read *What's tested*, run the *Self-audit* honestly, then use the *Deep-dive prompt* to have an LLM teach the concept with concrete examples and counter-examples and quiz you until you can answer the *Active-recall self-check* from memory. The recurring skill this domain rewards is knowing exactly what a technique guarantees and what it does not — a schema fixes syntax but not semantics, a retry fixes how something was extracted but not what is missing, and precision comes from sharper criteria rather than a request for more caution.

## Task Statement 4.1 — Design prompts with explicit criteria to improve precision and reduce false positives

### What's tested
**Knowledge of:** why explicit, categorical criteria beat vague instructions (e.g. "flag a comment only when the claimed behavior contradicts the actual code behavior" versus "check that comments are accurate"); why general dials like "be conservative" or "only report high-confidence findings" fail to improve precision compared with specific categorical criteria; the compounding effect of false positives on developer trust — one high-false-positive category undermines confidence in the accurate categories too.
**Skills in:** writing specific review criteria that define which issues to report (bugs, security) versus skip (minor style, local conventions) instead of relying on confidence-based filtering; temporarily disabling a high-false-positive category to restore trust while you improve its prompt; defining explicit severity levels anchored to concrete code examples so classification is consistent across runs.
*Self-audit:* You can rewrite a vague instruction into a categorical criterion, and explain why "be more conservative" does not reduce false positives while a sharper definition does.

### Distilled notes
Precision is a function of how you *define the target*, not how hard you turn the caution dial. "Be conservative" and "only high-confidence findings" ask the model to move a probabilistic threshold it cannot reliably calibrate — the boundary of what counts as a finding is unchanged, so the same false positives keep coming through. A categorical criterion ("flag a comment only when its claimed behavior contradicts the actual code behavior") moves the decision boundary itself and removes whole classes of false positives.

False positives are contagious to trust: a single noisy category — style nitpicks, say — makes developers distrust the accurate categories alongside it, so the whole tool degrades. The pragmatic move is to disable the noisy category entirely while you rewrite its criteria, rather than leave it poisoning confidence in everything else. For consistent severity classification, anchor each level to concrete code examples instead of adjectives like "major" or "minor," which every run interprets differently. This is the same enforcement-versus-guidance theme that runs through the certification: you get reliability from sharpening the definition, not from asking the model to try harder to be careful.

### Deep-dive prompt
> I'm studying how to improve precision and reduce false positives in an LLM-based code reviewer. (1) Explain why instructions like "be conservative" or "only report high-confidence findings" fail to reduce false positives, and why a categorical criterion succeeds — contrast "check that comments are accurate" with "flag a comment only when its claimed behavior contradicts the actual code." (2) Explain how one high-false-positive category damages trust in the accurate categories, and why temporarily disabling it can be the right move. (3) Show me how to define severity levels anchored to concrete code examples. (4) Quiz me: give five vague review instructions one at a time and ask me to rewrite each as an explicit categorical criterion, then critique my answers.

### Active-recall self-check
1. Your reviewer produces too many false positives. Why won't "be more conservative" help, and what will?
2. One category (style) is noisy while the others are accurate. What do you do, and why does the noisy one matter beyond its own findings?
3. How do you make severity classification consistent from run to run?

## Task Statement 4.2 — Apply few-shot prompting to improve output consistency and quality

### What's tested
**Knowledge of:** few-shot examples as the most effective technique for consistently formatted, actionable output when detailed instructions alone still produce inconsistent results; the role of examples in demonstrating ambiguous-case handling (tool selection for an ambiguous request, branch-level test-coverage gaps); how examples let the model generalize *judgment* to novel patterns rather than pattern-match only the pre-specified cases; the effectiveness of examples at reducing hallucination in extraction (informal measurements, varied document structures).
**Skills in:** creating 2–4 targeted examples for ambiguous scenarios that show the reasoning for why one action was chosen over a plausible alternative; including examples that demonstrate the exact desired output format (location, issue, severity, suggested fix); providing examples that distinguish acceptable code patterns from genuine issues to cut false positives while still generalizing; covering varied document structures (inline citations versus bibliographies, methodology sections versus embedded details); and adding examples of correct extraction from varied formats to fix empty/null extraction of required fields.
*Self-audit:* You can explain why 2–4 well-chosen examples beat both plain instructions and a pile of 5–8 examples, and name what the single most valuable example demonstrates.

### Distilled notes
Two to four examples is the sweet spot, and *what* they demonstrate matters far more than *how many*. The highest-value example shows reasoning on an ambiguous case — why this action rather than a plausible alternative — because that is what teaches the model to generalize judgment to new borderline cases, exactly the thing plain instructions cannot do. Vary the structure across your examples (inline citations versus a bibliography, narrative versus a table) so behavior stays stable across heterogeneous documents, and include at least one example that returns `null` so the model learns that "no data here" is a legitimate output rather than a prompt to invent something.

The distractor to reject is "add 5–8 examples." It bloats the context and, more importantly, it often does not touch the root cause: if the real problem is the tool description, the criteria, or the schema, more examples just pile onto the symptom. Ask whether adding examples addresses the underlying cause or merely buries it — the same root-cause-versus-symptom discipline that governs the rest of the certification.

### Deep-dive prompt
> I'm studying few-shot prompting for consistent, high-quality LLM output. (1) Explain why few-shot examples outperform detailed instructions alone for output consistency, and why 2–4 targeted examples beat both plain instructions and 5–8 examples. (2) Explain what the single most valuable example demonstrates (reasoning on an ambiguous case) and how that enables generalization to novel patterns rather than mere pattern-matching. (3) Show me how few-shot examples reduce hallucination in extraction — including one example that returns null and examples spanning varied document structures. (4) Quiz me: give five scenarios one at a time and ask me what few-shot example I'd add and why, then critique my answers.

### Active-recall self-check
1. Detailed instructions still produce inconsistent output. Would you add six examples? How many, and what should the best one show?
2. Extraction returns empty for a required field on some document layouts. What kind of few-shot example fixes it?
3. Why does one example that reasons through an ambiguous case do more than five that only illustrate the format?

## Task Statement 4.3 — Enforce structured output using tool use and JSON schemas

### What's tested
**Knowledge of:** `tool_use` with JSON schemas as the most reliable way to guarantee schema-compliant structured output and eliminate JSON syntax errors; the distinction between `tool_choice: "auto"` (the model may return text instead of calling a tool), `"any"` (the model must call a tool but chooses which), and forced tool selection (the model must call one specific named tool); that strict schemas eliminate syntax errors but *not* semantic errors (line items that don't sum to the total, values placed in the wrong field); schema-design considerations — required versus optional fields, and `enum` + `"other"` + detail-string patterns for extensible categories.
**Skills in:** defining extraction tools whose JSON schema *is* the input parameter and reading the structured data out of the `tool_use` response; setting `tool_choice: "any"` to guarantee structured output when several extraction schemas exist and the document type is unknown; forcing a specific tool with `tool_choice: {"type": "tool", "name": "extract_metadata"}` to ensure a particular extraction runs before enrichment; designing fields as optional/nullable when a document may not contain the information, so the model does not fabricate values to satisfy a required field; adding `enum` values like `"unclear"` for ambiguity and `"other"` + detail for extensibility; and including format-normalization rules in the prompt alongside the strict schema.

*Self-audit:* You can choose `auto` / `any` / forced from the wording of a requirement, and state precisely what a schema does and does not guarantee.

### Distilled notes
Two crisp formulas carry this statement.

**Schema removes syntactic errors, not semantic ones.** `tool_use` plus a JSON schema guarantees valid JSON with the right field names and types — it cannot guarantee the *values* are internally consistent. Line items still might not sum to the stated total, and a value can land in the wrong field. Semantic correctness is a code-level check (Task Statement 4.4), never a property of the schema itself.

**`tool_choice` selection** is the classic point of confusion, so hold the three modes apart precisely:

| Mode | Behavior | Choose when |
|---|---|---|
| `"auto"` (default) | Model decides: call a tool *or* answer in text | A plain-text answer is acceptable |
| `"any"` | Model *must* call a tool but picks which one; text is not allowed | The requirement says "any / an appropriate / one of" the tools and names none — e.g. several extraction schemas and an unknown document type |
| forced `{"type": "tool", "name": "..."}` | Model *must* call one specific named tool | The requirement names a specific tool — e.g. run `extract_metadata` before enrichment |

The decision rule: **if the requirement names a specific tool, use forced; if it says "any / appropriate / whichever fits" with no name, use `"any"`; if a text answer is allowed, use `"auto"`.** The subtle case worth memorizing — when only a single tool is defined, `"any"` and forced produce the identical outcome, since the one tool is the only choice; forced is simply the most explicit expression when the name is given.

**Schema design against fabrication.** If you want an honest "no data" instead of an invention, make the field nullable/optional and include an example that returns `null`. Marking every field required *provokes* fabrication: the model is obligated to emit something, so it manufactures a plausible value. For extensible categorization, use an `enum` plus an `"other"` value plus a separate detail field (and `"unclear"` for genuine ambiguity) so a new category neither breaks the schema nor silently loses information. Inconsistent source formatting is handled by normalization rules in the prompt, not by the schema.

### Deep-dive prompt
> I'm studying structured output with tool use and JSON schemas. (1) Explain why tool_use with a JSON schema is the most reliable way to get schema-compliant output, and state exactly what it guarantees (valid JSON, fields, types) versus what it does not (semantic consistency like line items summing to a total). (2) Contrast tool_choice "auto", "any", and forced {"type":"tool","name":"..."}, give the selection rule based on whether the requirement names a specific tool, and explain why "any" and forced coincide when only one tool is defined. (3) Show me schema patterns that prevent fabrication (nullable fields with a null example) and that support extensible categories (enum + "other" + detail, plus "unclear"). (4) Quiz me: give six short requirements one at a time and ask me "auto, any, or forced?" then critique each answer.

### Active-recall self-check
1. State what `tool_use` plus a JSON schema guarantees and what it does not.
2. A requirement says "the document type is unknown; guarantee structured output using one of several extraction tools." Which `tool_choice`? What changes if it instead says "always run `extract_metadata` first"?
3. Extractions fabricate values for missing fields. What two schema changes stop this?

## Task Statement 4.4 — Implement validation, retry, and feedback loops for extraction quality

### What's tested
**Knowledge of:** retry-with-error-feedback — appending the specific validation errors to the prompt on retry to steer the model toward correction; the limits of retry — it is ineffective when the required information is simply *absent* from the source (as opposed to a format or structural error); feedback-loop design — tracking which code constructs trigger findings via a `detected_pattern` field so you can analyze dismissal patterns systematically; the difference between semantic validation errors (values that don't sum, wrong field placement) and schema syntax errors (already eliminated by tool use).
**Skills in:** issuing a follow-up request that includes the original document, the failed extraction, and the specific validation errors for self-correction; identifying when retries will fail (the information exists only in an external document you didn't provide) versus succeed (format mismatches, structural output errors); adding `detected_pattern` fields to findings so you can analyze false-positive patterns when developers dismiss them; and designing self-correction flows — extracting `calculated_total` alongside `stated_total` to flag discrepancies, or adding a `conflict_detected` boolean for inconsistent source data.
*Self-audit:* You can decide whether a retry will help for a given failure, and design a deterministic code-level check for a semantic error.

### Distilled notes
The governing formula: **retry fixes *how* something was extracted, not *what isn't there*.** A retry that appends the specific validation error plus the failed extraction is effective for format and structural errors — the data exists in the source but came back in the wrong shape (a non-ISO date, a value mis-typed or mis-placed). Retry is useless when the information is genuinely absent from the source; the correct design there is a nullable field returning `null` (Task Statement 4.3), not another round-trip that will only invite fabrication.

For semantic errors, do not ask the model to "be accurate." Extract *both* signals — `calculated_total` alongside `stated_total`, or a `conflict_detected` boolean — and compare them in **code, deterministically**, then flag or retry on mismatch. This is the same "code instead of a probabilistic instruction" heuristic that governs hook-versus-prompt choices elsewhere in the certification: a deterministic comparison has a zero failure rate, whereas an instruction to self-check does not. For continuous improvement, add a `detected_pattern` field that records which construct triggered each finding, so when developers dismiss findings you can see which patterns are noisy and tighten the criteria — which closes the loop back to the explicit-criteria work in Task Statement 4.1.

### Deep-dive prompt
> I'm studying validation, retry, and feedback loops for extraction quality. (1) Explain retry-with-error-feedback (include the original document, the failed extraction, and the specific validation error) and why it works for format/structural errors. (2) Explain the hard limit of retry — that it cannot recover information absent from the source — and what the correct design is in that case (nullable field returning null). (3) Show me a deterministic self-correction flow for a semantic error, e.g. extracting calculated_total alongside stated_total and comparing them in code rather than instructing the model to "be accurate," plus what a detected_pattern field buys me over time. (4) Quiz me: give five failed extractions one at a time and ask me "will a retry fix this?" then critique my reasoning.

### Active-recall self-check
1. Two failures: (a) a date came back non-ISO; (b) the required value lives only in a document you did not provide. Which is fixable by retry, and what is the right fix for the other?
2. How do you validate that invoice line items sum to the total — and why not simply instruct the model to check?
3. What does a `detected_pattern` field give you over time, and which other Task Statement does it feed back into?

## Task Statement 4.5 — Design efficient batch processing strategies

### What's tested
**Knowledge of:** the Message Batches API — roughly 50% cost savings, an up-to-24-hour processing window, and *no* guaranteed latency SLA; that batch processing suits non-blocking, latency-tolerant workloads (overnight reports, weekly audits, nightly test generation) and is wrong for blocking workflows (pre-merge checks); that the batch API does not support multi-turn tool calling within a single request (it cannot execute tools mid-request and feed results back); and `custom_id` for correlating request/response pairs.
**Skills in:** matching the API to the latency requirement — the synchronous API for blocking pre-merge checks, the batch API for overnight/weekly analysis; calculating submission cadence from an SLA constraint (e.g. 4-hour submission windows to guarantee a 30-hour SLA given a 24-hour processing ceiling); handling failures by resubmitting only the failed documents (identified by `custom_id`) with appropriate fixes (chunking a document that exceeded the context limit); and refining the prompt on a sample set before batch-processing large volumes to maximize first-pass success and avoid iterative resubmission costs.
*Self-audit:* You can decide batch versus synchronous from the latency requirement alone, and recite the three defining properties of the batch API.

### Distilled notes
Batch is about half the cost, with an up-to-24-hour window and *no* latency SLA — so plan against the ceiling, not against an average you hope for. Use it for non-blocking, single-turn jobs at scale: classifying, extracting, or generating over thousands of documents, or nightly report runs. Never use it for blocking work where a developer is actively waiting — a pre-merge check needs the synchronous API. Correlate results by **`custom_id`, not array position**, because responses do not return in submission order. A single-turn tool call inside a batch request is fine (you execute the tool yourself afterward), but a **multi-turn agentic loop inside one batch request is not supported** — there is no mid-request tool execution.

Two operational skills follow from the ceiling. First, size your submission cadence against it: to keep an end-to-end 30-hour SLA with a 24-hour maximum processing time, submit on roughly a 4-hour window so a batch that takes the full 24 hours still lands inside budget. Second, refine the prompt on a small sample before committing thousands of documents, so you maximize first-pass success and do not pay repeatedly for iterative resubmission. On failure, resubmit only the failed `custom_id`s, chunking any document that blew past the context limit. The governing principle is simply: **match the API to the latency need.**

### Deep-dive prompt
> I'm studying batch processing strategy with the Message Batches API. (1) State its three defining properties — ~50% cost savings, up-to-24-hour window, no latency SLA — and explain which workloads fit (non-blocking, latency-tolerant) versus which do not (blocking pre-merge checks). (2) Explain why results are correlated by custom_id rather than array order, and why a multi-turn agentic tool loop cannot run inside a single batch request. (3) Walk me through sizing submission cadence for a 30-hour SLA against a 24-hour ceiling, handling partial failures by custom_id, and refining the prompt on a sample first. (4) Quiz me: give five workloads one at a time and ask me "batch or synchronous, and why?" then critique my answers.

### Active-recall self-check
1. When is batch the wrong choice, and what do you use instead?
2. Why correlate by `custom_id` rather than position, and why can't you run an agentic tool loop inside a single batch request?
3. You need results within 30 hours using a 24-hour batch window. How do you schedule submissions, and what do you do before processing all the documents?

## Task Statement 4.6 — Design multi-instance and multi-pass review architectures

### What's tested
**Knowledge of:** self-review limitations — a model retains its reasoning context from generation, which makes it less likely to question its own decisions within the same session; that independent review instances (with no prior reasoning context) catch subtle issues more effectively than self-review instructions or extended thinking; and multi-pass review — splitting a large review into per-file local analysis passes plus cross-file integration passes to avoid attention dilution and contradictory findings.
**Skills in:** using a second, independent Claude instance to review generated code without the generator's reasoning context; splitting a large multi-file review into focused per-file passes (local issues) plus separate integration passes (cross-file data-flow analysis); and running verification passes where the model self-reports confidence alongside each finding to enable calibrated review routing.
*Self-audit:* You can say when self-critique is valid versus when you must use an independent instance, and diagnose attention dilution correctly.

### Distilled notes
For **correctness, independent beats self.** The generating session carries its own reasoning and is biased toward defending the decisions it just made, so "be more critical," extended thinking, and running it twice all stay *inside* that biased context and don't fix the problem. A fresh independent instance (or subagent) with no generation context questions the output cleanly.

The nuance this statement tests: **self-critique is valid for completeness, not for correctness.** Bug-hunting and correctness checking need an independent instance. But checking *completeness against a checklist* — did the response include the policy, the timeline, the next steps? — is well served by the same agent critiquing its own draft, the evaluator-optimizer pattern, because it catches gaps that vary case by case, the kind fixed few-shot examples cannot anticipate. So: **correctness → independent instance; completeness against explicit criteria → self-critique of the same agent.**

**Multi-pass** addresses scale. Reviewing many files at once causes attention dilution — uneven depth and contradictory findings. The fix is a per-file *local* pass plus a separate cross-file *integration* pass. A larger context window does **not** cure attention dilution; the problem is attention allocation, not raw capacity.

One more axis the certification leans on: **discovery versus verification.** Discovery — hunting for bugs — needs high recall, so a consensus filter ("2 of 3 must agree") is *harmful*: it suppresses the rare real finding that only one pass caught. Verification — checking a specific claim — *benefits* from voting or multiple skeptics, which filter out false positives. A verification pass can also have the model self-report confidence per finding, so you route low-confidence findings to human review.

### Deep-dive prompt
> I'm studying multi-instance and multi-pass review architectures. (1) Explain why an independent review instance catches correctness bugs that self-review, "be more critical," and extended thinking miss — and then the nuance that self-critique IS valid for completeness against a checklist (the evaluator-optimizer pattern). (2) Explain attention dilution in large multi-file reviews and the per-file-plus-integration-pass fix, and why a bigger context window doesn't solve it. (3) Explain discovery-versus-verification: why a "2 of 3" consensus filter helps verification but hurts bug discovery, plus per-finding confidence self-reporting for routing. (4) Quiz me: give five review scenarios one at a time and ask me "independent instance or self-critique, and single-pass or multi-pass?" then critique my answers.

### Active-recall self-check
1. Your generator reviews its own code and misses bugs. Why, what's the fix, and when is self-critique actually the right tool?
2. A whole-repo review returns shallow, contradictory findings. What is the failure called, what is the fix, and does a larger context window help?
3. For bug discovery versus claim verification, when does a "2 of 3" consensus filter help and when does it hurt?

## Decision heuristics recap

A handful of heuristics eliminate most wrong answers in this domain:

1. **Syntax is not semantics.** `tool_use` with a JSON schema guarantees valid, well-typed structure — it never guarantees the values are consistent. Validate semantic constraints (line items summing to a total, cross-field agreement) in code, not with the schema.
2. **Code instead of a probabilistic instruction.** For semantic validation, extract both signals (`calculated_total` and `stated_total`, or a `conflict_detected` boolean) and compare them deterministically — don't ask the model to "be accurate." Same logic as choosing a hook over a prompt.
3. **Match the API to the latency need.** Batch is for non-blocking, latency-tolerant, single-turn work at ~half the cost and up to a 24-hour window with no SLA; anything blocking (pre-merge) needs the synchronous API, and no batch request runs a multi-turn agentic loop.
4. **Named tool → forced; unnamed but required → `any`; text allowed → `auto`.** If the requirement names a specific tool, force it; if it says "any / appropriate / whichever fits" with the document type unknown, use `"any"`; if a plain-text answer is acceptable, leave it `"auto"`. With one tool defined, `"any"` and forced coincide.
5. **Precision comes from sharper criteria, not more caution.** Replace "be conservative" with categorical definitions of what to report; disable a noisy category rather than let it erode trust in the accurate ones.
6. **Retry fixes *how*, not *what's missing*.** Retry-with-error-feedback recovers format and structural errors (the data exists); when information is absent from the source, use a nullable field returning `null` instead.
7. **Independent for correctness, self-critique for completeness; recall for discovery, consensus for verification.** Use a fresh instance to find bugs and the same agent's self-critique to check completeness against a checklist; a "2 of 3" consensus filter helps verify a claim but suppresses rare real findings during discovery. Fix attention dilution with per-file plus integration passes, not a bigger context window.
