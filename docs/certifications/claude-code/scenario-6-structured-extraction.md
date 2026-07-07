# Scenario 6: Structured Data Extraction

You are building a system that extracts structured data from unstructured documents, validates the output against a JSON schema, holds high accuracy, gracefully handles edge cases, and integrates with downstream systems. The metric to watch is extraction accuracy broken down per document type and per field, not just the aggregate.

## Primary domains

- **Domain 4 — Prompt Engineering & Structured Output.** Tool use with JSON schema, `tool_choice`, schema design, validation-and-retry, the Batch API. This is the core of the scenario.
- **Domain 5 — Context Management & Reliability.** Human-review workflows, stratified sampling, and confidence calibration.

## Signature failure modes

**Symptom:** the team assumes that because the output validates against the JSON schema, the extraction must be correct — but line items don't actually add up to the stated total.
**Root cause:** a schema guarantees syntactic validity and structural shape; it says nothing about semantic correctness.
**Best practice:** for semantic checks, extract both a `calculated_total` and a `stated_total`, compare them in code, and flag or retry on a mismatch. The general rule: a schema eliminates syntactic errors, not semantic ones.

**Symptom:** with every field marked required, the model starts fabricating plausible-looking values for data that genuinely isn't present in the source document.
**Best practice:** make the field nullable/optional and include an example in the prompt showing a legitimate `null` output — that teaches the model that "no data here" is an acceptable answer instead of a prompt to invent one.

**Symptom:** the wrong `tool_choice` mode is used for the situation.
**Best practice:** if a specific tool is named, use forced tool choice (`{"type": "tool", "name": "..."}`); if any suitable tool should be selected but none is named, use `"any"`; if a plain-text answer is also acceptable, use `"auto"`.

**Symptom:** the system retries extraction on a document where the requested data simply isn't present in the source.
**Root cause:** retry fixes *how* something was extracted, not the fact that the data was never there to extract.
**Best practice:** if the data isn't in the source, return `null` for that nullable field rather than retrying. Retry is the right tool when the failure is a format or structural problem (a non-ISO date, say) — in that case, append the specific validation error and the failed extraction attempt to the retry prompt.

**Symptom:** a new document type or category doesn't fit the existing fixed set of categories, and it either breaks the schema or gets silently lost.
**Best practice:** design the category field as an `enum` plus an `"other"` value, backed by a separate free-text detail field, so the schema can absorb novel categories without breaking.

**Symptom:** overall extraction accuracy looks strong (say, 97%), but that aggregate number is masking a much weaker result (say, 60%) on one specific document type or field.
**Best practice:** use stratified sampling to measure accuracy per document type and per field before trusting the system to run unattended, and calibrate field-level confidence on a labeled sample so it can be used to route uncertain extractions to human review.

**Symptom:** someone wants to move a latency-sensitive, blocking extraction workload onto the Batch API for the discount.
**Best practice:** Batch API gives roughly 50% cost savings with up to 24-hour turnaround and no latency SLA — a good fit for non-blocking bulk extraction or nightly runs, a bad fit for anything blocking. Correlate batch results by the `custom_id` you assigned, not by response order, since results can come back out of order. A multi-turn agentic loop is not supported within a single batch record — only a single-turn tool call is.

A few standing heuristics resolve most of the judgment calls in this scenario. For heterogeneous document formats, use 2–4 few-shot examples spanning different structures (inline citations vs. a bibliography, narrative text vs. a table), including at least one example that returns `null` on an ambiguous case. Prefer code over a probabilistic instruction for semantic validation — the same underlying heuristic as choosing a hook over a prompt for deterministic enforcement elsewhere in the certification. Annotate coverage explicitly, distinguishing well-supported findings from gaps caused by sources that simply weren't available. And match the API to the latency requirement: bulk overnight extraction fits Batch, interactive extraction needs real-time calls.

## Domain → this scenario

| Task Statement | How it surfaces here |
|---|---|
| 4.3 — schema syntax vs. semantics | Schema validates, but `calculated_total` doesn't match `stated_total` |
| 4.3 — nullable fields vs. fabrication | Missing data → `null`, not an invented value |
| 4.3 — `tool_choice` modes | A named tool → forced; unnamed but required → `any`; optional → `auto` |
| 4.4 — retry semantics | Retry fixes format/structure, not genuinely missing data |
| 4.3 — extensible categorization | `enum` + `"other"` + a free-text detail field |
| 5.5 — aggregate accuracy vs. segments | Stratified sampling exposes per-type, per-field weak spots |
| 4.5 — Batch API and `custom_id` | Bulk extraction on Batch; correlation by `custom_id`, not order |
