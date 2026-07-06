# Claude Code Cert Prep — Domain Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the draft, generic Claude Code cert prep path with a Task-Statement-centric, Exam-Guide-anchored study path (17 in-repo docs + a restructured JSON), and add the `optional`/`exam_note` item fields with required-only readiness.

**Architecture:** Content lives as markdown under `docs/certifications/claude-code/`, linked from `public/certification.claude-code.json` via GitHub blob URLs (mirrors the existing `docs/curriculum/` convention). The Worker bundles the JSON and computes dashboard readiness; a new `requiredItemIds` field makes "ready" mean *all required items done*, so optional/bonus items don't gate readiness. The frontend renders an `optional` badge and an `exam_note` line, and shows the provenance note whether or not the path is a draft.

**Tech Stack:** Vanilla JS static frontend (no build step); Cloudflare Worker (TypeScript) tested with `@cloudflare/vitest-pool-workers`; a hand-rolled Node validator (`schema/validate-certifications.mjs`, no deps); content authored in English markdown.

## Global Constraints

- **Working directory:** all repo paths below are relative to `ae-tracker/` (the git repo). Run worker commands from `ae-tracker/worker/`.
- **Item id scheme:** every path-file item id must match `^cc\.[a-z0-9-]+\.\d+$` and be **≤ 32 chars** (the `/api/mark` limit). Enforced by `schema/validate-certifications.mjs`.
- **Docs are English only**, authored in **second person** (addressing the engineer preparing for the exam), not a first-person study diary.
- **Blob URL base for doc links:** `https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/<file>`. Every item `link` to an in-repo doc must point to a file that actually exists (create the doc first).
- **Official domain numbers/names/weights are canonical — never renumber.** The path presents domains in **study order** (Domain 1 → 3 → 4 → 2 → 5) via `sections[]` array order; each section keeps its official number in `id` (`cc.d1`, `cc.d3`, `cc.d4`, `cc.d2`, `cc.d5`) and title.
- **No synthetic multiple-choice questions anywhere.** Self-checks are active-recall / explain-and-example prompts. The Exam Guide's Sample Questions are cited as a difficulty reference, never reproduced.
- **Confidentiality (binding):** never reference official-exam question numbers (e.g. `Q35`), attempt scores (e.g. `871/1000`), or "this came up on my exam" framing anywhere in `docs/certifications/` or the JSON. The file `preparing_for_Claude_Certified_Architect/notes/practice/official-practice-exam-60q-review.md` and the `notes/practice/*practice-questions*` mocks are **private — never ported or referenced**.
- **Source material (absolute paths, read-only inputs):**
  - Author domain notes: `/Users/andrey/Documents/work/projects/ae-tracker-project/preparing_for_Claude_Certified_Architect/notes/domains/domain{1..5}-summary.md`
  - Author scenario notes: `/Users/andrey/Documents/work/projects/ae-tracker-project/preparing_for_Claude_Certified_Architect/notes/scenarios/scenario{1..6}-*.md`
  - Exam Guide PDF: `/Users/andrey/Documents/work/projects/ae-tracker-project/preparing_for_Claude_Certified_Architect/claude-pdf/Claude_Certified_Architect_-_Foundations_-_Exam_Guide.pdf` — extract with `/opt/homebrew/bin/pdftotext -layout <pdf> /tmp/exam-guide.txt`.
- **Confidentiality grep guard** (run over authored docs; expect **no matches**):
  ```bash
  grep -rniE '\b[0-9]{2,4}/1000\b|\bq[0-9]{1,3}\b|my exam|on the exam|my attempt|attempt [0-9]|практическ' docs/certifications/claude-code/ || echo "CLEAN"
  ```
- **The author's notes use `[[wiki-links]]`** (e.g. `[[domain1-summary]]`). In published docs, convert these to plain prose references or relative markdown links between sibling docs — never leave `[[...]]` syntax in output.

**Deviation from spec (flagged):** the spec listed 16 docs; this plan adds a 17th, `exercises.md`, so the 4 hands-on exercise items are self-contained (the Exam Guide's Preparation Exercises are public guide content, safe to paraphrase). Each `cc.ex.N` item links to an anchor in it.

---

### Task 1: Validator — accept `course` kind and `optional`/`exam_note` fields

**Files:**
- Modify: `schema/validate-certifications.mjs:13` and `:49`

**Interfaces:**
- Consumes: nothing.
- Produces: a validator that accepts `kind: "course"` and boolean `optional` / string `exam_note` on items. Later tasks (JSON restructure) rely on this.

- [ ] **Step 1: Add `"course"` to the allowed kinds**

Change line 13 from:
```js
const KINDS = new Set(["reading", "practice", "video"]);
```
to:
```js
const KINDS = new Set(["reading", "practice", "video", "course"]);
```

- [ ] **Step 2: Add light type checks for the new optional fields**

After the title check (currently line 49, `if (typeof it.title !== "string" || !it.title) fail(...)`), add:
```js
      if ("optional" in it && typeof it.optional !== "boolean") fail(`item "${it.id}": optional must be boolean if present`);
      if ("exam_note" in it && typeof it.exam_note !== "string") fail(`item "${it.id}": exam_note must be a string if present`);
```

- [ ] **Step 3: Run the validator against the current JSON to confirm no regression**

Run: `node schema/validate-certifications.mjs`
Expected: `Certifications OK: registry + 1 path file(s), 16 unique item ids.` (the current JSON has no `course`/`optional`/`exam_note`, so the new rules are no-ops here.)

- [ ] **Step 4: Commit**

```bash
git add schema/validate-certifications.mjs
git commit -m "feat(cert): validator accepts course kind and optional/exam_note fields"
```

---

### Task 2: Worker — `requiredItemIds` and required-only cert readiness (TDD)

**Files:**
- Modify: `worker/src/certifications.ts:10-30`
- Modify: `worker/src/aggregate.ts:14-16`, `:28-34` (comment), `:88-125`, `:154-160`
- Test: `worker/test/aggregate.test.ts` (add a test; update the existing fake registry)

**Interfaces:**
- Consumes: nothing new.
- Produces: `CertInfo.requiredItemIds: string[]` (items where `optional !== true`); `computeAggregate` counts `total_items`/`engineers_started`/`engineers_ready` and per-engineer `{done,total,pct,ready}` against `requiredItemIds`; `CACHE_KEY = "aggregate-v6"`.

- [ ] **Step 1: Write the failing test (optional items excluded from readiness)**

Add to `worker/test/aggregate.test.ts`, inside the top-level `describe`, reusing the existing `cfg`, `registryOf`, and `WEB` helpers already defined in this file:
```ts
  it("excludes optional items from cert readiness via requiredItemIds", async () => {
    const registry = registryOf({ web: WEB });
    const certRegistry = {
      certList: () => [{
        id: "claude-code", label: "Claude Code",
        itemIds: ["cc.a.1", "cc.a.2", "cc.opt.1"],
        requiredItemIds: ["cc.a.1", "cc.a.2"], // cc.opt.1 is optional → excluded
      }],
    };
    const files: Record<string, any> = {
      "dana.json": {
        github_username: "dana", created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-27T00:00:00Z",
        competency: "web",
        tasks: { "cc.a.1": { done: true }, "cc.a.2": { done: true } }, // both required done, optional NOT done
      },
    };
    const fetchMock = (async (url: string) => {
      if (url.endsWith("/contents/progress")) {
        return new Response(JSON.stringify([{ name: "dana.json", type: "file", path: "progress/dana.json" }]),
          { headers: { "content-type": "application/json" } });
      }
      const name = url.split("/").pop()!;
      return new Response(JSON.stringify({ sha: "s", content: btoa(JSON.stringify(files[name])), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const now = new Date("2026-05-27T12:00:00Z");
    const agg = await computeAggregate(cfg, registry, fetchMock, now, certRegistry);
    const cc = agg.certifications.find((c) => c.id === "claude-code")!;
    expect(cc.total_items).toBe(2);        // optional excluded
    expect(cc.engineers_ready).toBe(1);    // dana ready without the optional item
    const dana = agg.engineers.find((e) => e.username === "dana")!;
    expect(dana.certifications["claude-code"]).toEqual({ done: 2, total: 2, pct: 1, ready: true });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd worker && npx vitest run test/aggregate.test.ts -t "excludes optional items"`
Expected: FAIL — `total_items` is `3` (aggregate still counts `itemIds`), not `2`.

- [ ] **Step 3: Add `requiredItemIds` to the certifications module**

In `worker/src/certifications.ts`, replace the `CertInfo` interface, `PathFile` interface, and the `LIST` builder (lines 10-30) with:
```ts
export interface CertInfo {
  id: string;
  label: string;
  itemIds: string[];
  requiredItemIds: string[];
}

interface PathFile {
  certification: string;
  sections: Array<{ id: string; items: Array<{ id: string; optional?: boolean }> }>;
}

const PATHS: Record<string, PathFile> = {};
for (const p of [claudeCodePath] as PathFile[]) {
  PATHS[p.certification] = p;
}

const LIST: CertInfo[] = registry.certifications.map((c) => {
  const path = PATHS[c.id];
  const items = path ? path.sections.flatMap((s) => s.items) : [];
  const itemIds = items.map((it) => it.id);
  const requiredItemIds = items.filter((it) => it.optional !== true).map((it) => it.id);
  return { id: c.id, label: c.label, itemIds, requiredItemIds };
});
```

- [ ] **Step 4: Update the aggregate's CertRegistry type and cert pass to use required items**

In `worker/src/aggregate.ts`:

Replace the `CertRegistry` interface (lines 14-16) with:
```ts
interface CertRegistry {
  certList(): Array<{ id: string; label: string; itemIds: string[]; requiredItemIds: string[] }>;
}
```

Update the `certAgg` initializer (currently line 89-92) to count required items:
```ts
  const certDefs = certRegistry.certList();
  const certAgg = certDefs.map((c) => ({
    id: c.id, label: c.label, total_items: c.requiredItemIds.length,
    engineers_started: 0, engineers_ready: 0,
  }));
```

Update the per-engineer cert loop body (currently lines 114-119) to use `requiredItemIds`:
```ts
    for (let i = 0; i < certDefs.length; i++) {
      const def = certDefs[i];
      const total = def.requiredItemIds.length;
      const doneCount = def.requiredItemIds.filter((id) => p.tasks[id]?.done).length;
      const ready = total > 0 && doneCount === total;
```

Update the `engineers_ready` comment on line 33 from `// ALL items done` to `// ALL required items done`.

- [ ] **Step 5: Update the existing cert test's fake registry to satisfy the new type**

In `worker/test/aggregate.test.ts`, the existing test "computes per-cert readiness and per-engineer cert progress, excluding disabled" has a fake registry (currently line 145). Add `requiredItemIds` so it type-checks and its assertions still hold (both items required):
```ts
      certList: () => [{ id: "claude-code", label: "Claude Code", itemIds: ["cc.a.1", "cc.a.2"], requiredItemIds: ["cc.a.1", "cc.a.2"] }],
```

- [ ] **Step 6: Bump the cache key**

In `worker/src/aggregate.ts`, update the comment block above `CACHE_KEY` (lines 154-160) to append `; v6 counts cert readiness against required (non-optional) items only` and change line 160:
```ts
export const CACHE_KEY = "aggregate-v6";
```

- [ ] **Step 7: Run the full worker test suite**

Run: `cd worker && npm test`
Expected: PASS — all files, including the new and existing aggregate cert tests.

- [ ] **Step 8: Typecheck**

Run: `cd worker && npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add worker/src/certifications.ts worker/src/aggregate.ts worker/test/aggregate.test.ts
git commit -m "feat(cert): readiness counts required (non-optional) items only"
```

---

### Task 3: Frontend — `optional` badge, `exam_note` line, provenance banner when not draft

**Files:**
- Modify: `public/cert.js:43-51` (renderBanner), `:73-74` (renderBody item markup)
- Modify: `public/styles.css:234` (add `.kind-tag.optional` + `.exam-note`)

**Interfaces:**
- Consumes: item fields `optional?: boolean`, `exam_note?: string`; path field `exam.notes` with `draft: false`.
- Produces: no exported API; DOM rendering only.

- [ ] **Step 1: Show the provenance note whether or not the path is a draft**

Replace `renderBanner` (lines 43-51) with:
```js
function renderBanner() {
  const box = document.getElementById("cert-banner");
  if (CURRENT && CURRENT.draft) {
    const note = CURRENT.exam && CURRENT.exam.notes ? CURRENT.exam.notes : "This path is a draft under review.";
    box.innerHTML = `<div class="move-on"><strong>Draft:</strong> ${note}</div>`;
  } else if (CURRENT && CURRENT.exam && CURRENT.exam.notes) {
    box.innerHTML = `<div class="move-on">${CURRENT.exam.notes}</div>`;
  } else {
    box.innerHTML = "";
  }
}
```

- [ ] **Step 2: Render the `optional` badge and `exam_note` line**

In `renderBody`, replace the item's title/desc lines (currently lines 73-74):
```js
            <div class="title">${it.title} <span class="kind-tag ${it.kind}">${it.kind}</span>${it.estimated_minutes ? `<span class="task-est">· ${formatEstimate(it.estimated_minutes)}</span>` : ""}</div>
            ${it.desc ? `<div class="desc">${it.desc}</div>` : ""}
```
with:
```js
            <div class="title">${it.title} <span class="kind-tag ${it.kind}">${it.kind}</span>${it.optional ? `<span class="kind-tag optional">optional</span>` : ""}${it.estimated_minutes ? `<span class="task-est">· ${formatEstimate(it.estimated_minutes)}</span>` : ""}</div>
            ${it.desc ? `<div class="desc">${it.desc}</div>` : ""}
            ${it.exam_note ? `<div class="exam-note">${it.exam_note}</div>` : ""}
```

- [ ] **Step 3: Add CSS for the optional badge and exam-note line**

In `public/styles.css`, after the `.kind-tag.video` rule (line 234), add:
```css
.kind-tag.optional   { background: #ede9fe; color: #5b21b6; }
.exam-note { color: #64748b; font-size: 12.5px; font-style: italic; margin-top: 4px; line-height: 1.5; }
```

- [ ] **Step 4: Visual smoke (deferred full check to Task 8)**

There is no automated frontend test harness in this repo. Full end-to-end verification happens in Task 8 against the restructured JSON (which sets `draft:false` + `exam.notes` and includes an `optional` item with an `exam_note`). For now, review the three edits for correctness. If you want an early visual check, temporarily set `draft:false` and add `exam.notes` + one `"optional": true` item with `"exam_note"` in the current JSON, serve with `npx http-server public -p 8080 -c-1`, sign in against a running worker, and confirm the badge/line/banner render — then revert the temporary JSON edit.

- [ ] **Step 5: Commit**

```bash
git add public/cert.js public/styles.css
git commit -m "feat(cert): optional badge, exam_note line, provenance banner when published"
```

---

### Task 4: Content — five domain study guides (organized by Task Statement)

**Files (create):**
- `docs/certifications/claude-code/domain-1-agentic-architecture.md` — Task Statements 1.1–1.7 (7 sections)
- `docs/certifications/claude-code/domain-2-tool-design-mcp.md` — 2.1–2.5 (5)
- `docs/certifications/claude-code/domain-3-claude-code-config.md` — 3.1–3.6 (6)
- `docs/certifications/claude-code/domain-4-prompt-structured-output.md` — 4.1–4.6 (6)
- `docs/certifications/claude-code/domain-5-context-reliability.md` — 5.1–5.6 (6)

**Interfaces:**
- Consumes: Exam Guide Task Statement text (`/tmp/exam-guide.txt` after extraction) and `notes/domains/domain{1..5}-summary.md` (source, absolute paths in Global Constraints).
- Produces: the 5 files linked by `cc.d1.1`/`cc.d3.1`/`cc.d4.1`/`cc.d2.1`/`cc.d5.1` in Task 7.

**Task Statement titles to cover (one H2 section each — do not omit any):**
- **Domain 1 (27%):** 1.1 Design & implement agentic loops · 1.2 Orchestrate multi-agent systems (coordinator-subagent) · 1.3 Configure subagent invocation/context passing/spawning · 1.4 Multi-step workflows with enforcement & handoff · 1.5 Agent SDK hooks for interception & normalization · 1.6 Task decomposition strategies · 1.7 Session state, resumption, forking
- **Domain 2 (18%):** 2.1 Effective tool interfaces (descriptions & boundaries) · 2.2 Structured error responses for MCP tools · 2.3 Distribute tools across agents & configure tool_choice · 2.4 Integrate MCP servers into Claude Code & agents · 2.5 Select & apply built-in tools (Read/Write/Edit/Bash/Grep/Glob)
- **Domain 3 (20%):** 3.1 CLAUDE.md hierarchy/scoping/modularity · 3.2 Custom slash commands & skills · 3.3 Path-specific rules (glob) · 3.4 Plan mode vs direct execution · 3.5 Iterative refinement techniques · 3.6 Claude Code in CI/CD
- **Domain 4 (20%):** 4.1 Explicit criteria to improve precision/reduce false positives · 4.2 Few-shot prompting · 4.3 Structured output via tool_use & JSON schemas · 4.4 Validation/retry/feedback loops · 4.5 Batch processing strategies · 4.6 Multi-instance & multi-pass review
- **Domain 5 (15%):** 5.1 Preserve critical info across long interactions · 5.2 Escalation & ambiguity resolution · 5.3 Error propagation across multi-agent systems · 5.4 Context in large codebase exploration · 5.5 Human review & confidence calibration · 5.6 Provenance & uncertainty in multi-source synthesis

**Per-file structure:**
1. `# Domain N: <Name> — <weight>%` + a 2–3 sentence "how to work this domain" intro (recommend the deep-dive method).
2. One `## Task Statement N.M — <title>` section per Task Statement, each following the **4-part template** below.
3. A closing `## Decision heuristics recap` — the domain's answer-elimination heuristics on one screen (adapt the "Решающие эвристики" section of the source note into second-person English).

**4-part template for every Task Statement section:**
- `### What's tested` — the guide's *Knowledge of* / *Skills in* bullets for that statement (paraphrased or quoted from `/tmp/exam-guide.txt` — public syllabus), then a one-line "Self-audit:" of what you should be able to explain/do.
- `### Distilled notes` — the practical synthesis for this sub-point, adapted from the matching part of `notes/domains/domainN-summary.md` (mental models, root-cause-vs-symptom, terminology). De-identified per Global Constraints; convert `[[wiki-links]]`.
- `### Deep-dive prompt` — a paste-ready prompt that drives an LLM to explain → give concrete examples/counter-examples → quiz the reader.
- `### Active-recall self-check` — 1–3 recall questions derived from the Knowledge/Skills bullets (not multiple choice).

**Worked example (match this shape exactly for all 30 statements):**
```markdown
## Task Statement 1.4 — Implement multi-step workflows with enforcement and handoff patterns

### What's tested
**Knowledge of:** programmatic enforcement (hooks, prerequisite gates) vs prompt-based
guidance for workflow ordering; that prompt instructions have a non-zero failure rate when
deterministic compliance is required (e.g. identity verification before financial operations);
structured handoff protocols for mid-process escalation (customer details, root cause,
recommended actions).
**Skills in:** blocking downstream tool calls until prerequisites complete (e.g. block
`process_refund` until `get_customer` returns a verified ID); decomposing multi-concern requests
and investigating each in parallel on shared context before synthesizing; compiling structured
handoff summaries for human agents who lack the transcript.
*Self-audit:* I can explain when a prompt is not enough and name a concrete rule that must be a hook.

### Distilled notes
A rule that is sharp, checkable, and consequential (money/safety) belongs in code — a
hook/prerequisite gate — because the action is physically blocked and the failure rate is zero.
A rule that is fuzzy and judgment-based (when to escalate, which tool in an ambiguous case)
belongs in the prompt plus few-shot examples: you are calibrating a probabilistic decision, not
enforcing an invariant. The trap runs both ways — "strengthen the prompt" for a financial
threshold is insufficient, and a hook on a fuzzy escalation decision is unworkable. Diagnose by
the nature of the rule, not the severity of the symptom.

### Deep-dive prompt
> I'm studying enforcement vs prompt guidance for agent workflows. (1) Explain the difference
> between a prerequisite/PreToolUse hook and a system-prompt instruction for ordering tool calls.
> (2) Give me three business rules where a hook is the only correct choice and one where a hook
> would be wrong, with reasoning. (3) Now quiz me: give five short scenarios and ask me
> "hook or prompt?" one at a time, then critique each answer.

### Active-recall self-check
1. Policy: "never auto-refund above $500." Hook or prompt? Why?
2. Your agent escalates frustrated-but-simple cases. Hook or prompt? Why?
3. What three elements must a mid-process escalation handoff include, and why does the human need each?
```

- [ ] **Step 1: Extract the Exam Guide Task Statement text**

Run: `/opt/homebrew/bin/pdftotext -layout "/Users/andrey/Documents/work/projects/ae-tracker-project/preparing_for_Claude_Certified_Architect/claude-pdf/Claude_Certified_Architect_-_Foundations_-_Exam_Guide.pdf" /tmp/exam-guide.txt`
Expected: `/tmp/exam-guide.txt` exists; Task Statements are around lines 170–877.

- [ ] **Step 2: Author `domain-1-agentic-architecture.md`** (7 Task Statement sections + intro + heuristics recap), following the template and the worked example. Source: `notes/domains/domain1-summary.md` + guide TS 1.1–1.7.

- [ ] **Step 3: Author `domain-3-claude-code-config.md`** (6 sections). Source: `notes/domains/domain3-summary.md` + guide TS 3.1–3.6.

- [ ] **Step 4: Author `domain-4-prompt-structured-output.md`** (6 sections). Source: `notes/domains/domain4-summary.md` + guide TS 4.1–4.6.

- [ ] **Step 5: Author `domain-2-tool-design-mcp.md`** (5 sections). Source: `notes/domains/domain2-summary.md` + guide TS 2.1–2.5.

- [ ] **Step 6: Author `domain-5-context-reliability.md`** (6 sections). Source: `notes/domains/domain5-summary.md` + guide TS 5.1–5.6.

- [ ] **Step 7: Verify structure and confidentiality**

Run:
```bash
for f in domain-1-agentic-architecture domain-2-tool-design-mcp domain-3-claude-code-config domain-4-prompt-structured-output domain-5-context-reliability; do
  echo "== $f =="; grep -c '^## Task Statement' docs/certifications/claude-code/$f.md
done
grep -rniE '\b[0-9]{2,4}/1000\b|\bq[0-9]{1,3}\b|my exam|on the exam|my attempt|attempt [0-9]|практическ|\[\[' docs/certifications/claude-code/ || echo "CLEAN"
```
Expected: counts `7, 5, 6, 6, 6` respectively; guard prints `CLEAN` (no scores, no `Qn`, no attempt/exam attribution, no leftover `[[wiki-links]]`).

- [ ] **Step 8: Commit**

```bash
git add docs/certifications/claude-code/domain-*.md
git commit -m "docs(cert): five domain study guides organized by Task Statement"
```

---

### Task 5: Content — six scenario docs

**Files (create):**
- `docs/certifications/claude-code/scenario-1-customer-support.md`
- `docs/certifications/claude-code/scenario-2-code-generation.md`
- `docs/certifications/claude-code/scenario-3-multi-agent-research.md`
- `docs/certifications/claude-code/scenario-4-developer-productivity.md`
- `docs/certifications/claude-code/scenario-5-cicd.md`
- `docs/certifications/claude-code/scenario-6-structured-extraction.md`

**Interfaces:**
- Consumes: `notes/scenarios/scenario{1..6}-*.md` + guide "Exam Scenarios" section (`/tmp/exam-guide.txt` ~lines 111–166).
- Produces: the 6 files linked by `cc.scn.1`–`cc.scn.6` in Task 7.

**Per-file structure:**
1. `# Scenario N: <Name>` + one-line setup (agent, tools, target metric) from the guide.
2. `## Primary domains` — the domains the guide lists for this scenario.
3. `## Signature failure modes` — each as *symptom → root cause → best practice*, **generalized** (strip any attempt/question-number framing present in the source notes).
4. `## Domain → this scenario` — a table mapping the relevant Task Statements to how they surface here.

**Critical confidentiality note:** `notes/scenarios/scenario1-support.md` contains `Q35`/`Q40`/`Q42`, "ошибка попытки", and "practice exam" references. These MUST be removed — port only the generalized concept (keyword-pattern → configured rule; self-critique for completeness; PostToolUse normalization), with new framing and no attribution.

- [ ] **Step 1: Author all six scenario docs** following the structure, adapting the matching `notes/scenarios/scenarioN-*.md` and the guide's scenario descriptions.

- [ ] **Step 2: Verify confidentiality guard**

Run:
```bash
grep -rniE '\b[0-9]{2,4}/1000\b|\bq[0-9]{1,3}\b|ошибка попытк|my exam|on the exam|attempt [0-9]|практическ|\[\[' docs/certifications/claude-code/scenario-*.md || echo "CLEAN"
ls docs/certifications/claude-code/scenario-*.md | wc -l
```
Expected: `CLEAN`; count `6`.

- [ ] **Step 3: Commit**

```bash
git add docs/certifications/claude-code/scenario-*.md
git commit -m "docs(cert): six exam scenario walkthroughs"
```

---

### Task 6: Content — cross-cutting docs (overview, scope, review artifacts, exercises)

**Files (create):**
- `docs/certifications/claude-code/exam-overview.md` — format facts from the guide's "Exam Details at a Glance" (60 questions, 120 min, 4-of-6 scenarios, 1 correct + 3 distractors, scaled 100–1000, pass 720, 12-month validity, $125, online-proctored or test-center) + registration pointer (Anthropic Academy) + **recommended study order by weight** (D1 27% → D3 20% → D4 20% → D2 18% → D5 15%) + a pointer to study the guide's 12 Sample Questions as a difficulty reference (do not reproduce them).
- `docs/certifications/claude-code/scope-map.md` — the guide's **In-Scope** and **Out-of-Scope** topic lists (`/tmp/exam-guide.txt` ~lines 1316–1375) + the Appendix "Technologies and Concepts" list. Lead with Out-of-Scope ("don't spend time on these").
- `docs/certifications/claude-code/heuristics-cheatsheet.md` — one-screen consolidation of the decisive answer-elimination heuristics across all five domains (root-cause-vs-symptom; determinism-for-critical / calibration-for-judgment; right-tool; proportionate-first-step). Derived from the five domain notes' "Решающие эвристики" sections.
- `docs/certifications/claude-code/glossary-and-synonyms.md` — terms + exam synonym pairs the reader must recognize: `orchestrator-workers` = hub-and-spoke; `primacy/recency` effect; `evaluator-optimizer`; `graceful degradation with transparency` = coverage annotations. Seed from the guide's Appendix concepts + `notes/progress.md` synonym list.
- `docs/certifications/claude-code/easy-to-confuse.md` — de-identified confusable pairs: self-review-for-bugs vs self-critique-for-completeness; poor tool descriptions vs clean descriptions overridden by keyword-sensitive system-prompt instructions; hook-for-critical-rules vs prompt-for-judgment; valid-empty-result vs access-failure; `tool_choice` `any` vs forced; plan mode vs direct execution; batch API vs synchronous API. Each pair: "looks the same → the deciding signal → the right call."
- `docs/certifications/claude-code/exercises.md` — the guide's 4 Preparation Exercises paraphrased (objective + numbered steps + domains reinforced), each under an anchor heading (`## Exercise 1 — Build a Multi-Tool Agent with Escalation Logic`, etc.) so `cc.ex.N` items can deep-link. Source: `/tmp/exam-guide.txt` ~lines 1175–1277.

**Interfaces:**
- Consumes: `/tmp/exam-guide.txt`, the five domain notes, `notes/progress.md`.
- Produces: files linked by `cc.start.1` (exam-overview), `cc.start.2` (scope-map), `cc.rev.1`/`cc.rev.2`/`cc.rev.3` (review artifacts), and `cc.ex.1`–`cc.ex.4` (exercises anchors) in Task 7.

- [ ] **Step 1: Author all six cross-cutting docs** per the descriptions above.

- [ ] **Step 2: Verify anchors and confidentiality**

Run:
```bash
grep -c '^## Exercise' docs/certifications/claude-code/exercises.md
grep -rniE '\b[0-9]{2,4}/1000\b|\bq[0-9]{1,3}\b|my exam|on the exam|attempt [0-9]|практическ|\[\[' docs/certifications/claude-code/{exam-overview,scope-map,heuristics-cheatsheet,glossary-and-synonyms,easy-to-confuse,exercises}.md || echo "CLEAN"
```
Expected: `4`; `CLEAN`.

- [ ] **Step 3: Commit**

```bash
git add docs/certifications/claude-code/exam-overview.md docs/certifications/claude-code/scope-map.md docs/certifications/claude-code/heuristics-cheatsheet.md docs/certifications/claude-code/glossary-and-synonyms.md docs/certifications/claude-code/easy-to-confuse.md docs/certifications/claude-code/exercises.md
git commit -m "docs(cert): exam overview, scope map, review artifacts, exercises"
```

---

### Task 7: Restructure `certification.claude-code.json` and reconcile the worker test

**Files:**
- Modify: `public/certification.claude-code.json` (full replace)
- Modify: `worker/test/certifications.test.ts` (new item ids + required/optional assertions)

**Interfaces:**
- Consumes: all docs from Tasks 4–6 (link targets must exist); the validator (Task 1) and worker fields (Task 2).
- Produces: a `draft:false` path with 23 items (22 required + 1 optional) in study order.

- [ ] **Step 1: Replace the JSON with the new study-order structure**

Overwrite `public/certification.claude-code.json` with exactly:
```json
{
  "certification": "claude-code",
  "draft": false,
  "exam": {
    "name": "Claude Certified Architect – Foundations",
    "link": "https://academy.anthropic.com/",
    "notes": "Reconciled against the official Exam Guide (v0.2) and a real exam pass. Domains, weights, task statements, and scenarios match the confirmed blueprint."
  },
  "sections": [
    {
      "id": "start",
      "title": "How to use this path",
      "items": [
        { "id": "cc.start.1", "kind": "reading", "title": "Exam overview & how to study", "desc": "Format, registration, and the recommended study order by domain weight (D1 → D3 → D4 → D2 → D5).", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/exam-overview.md", "estimated_minutes": 10 },
        { "id": "cc.start.2", "kind": "reading", "title": "What is and isn't tested", "desc": "The exam's In-Scope and Out-of-Scope topic lists — read before diving in so you don't study the wrong things.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/scope-map.md", "estimated_minutes": 10 },
        { "id": "cc.start.3", "kind": "course", "optional": true, "title": "Claude with the Anthropic API (official course)", "desc": "Anthropic's free, in-depth course covering the Messages API, tool use, and prompting fundamentals used throughout the exam. Long, but a high-leverage foundation before domain prep.", "link": "https://anthropic-partners.skilljar.com/claude-with-the-anthropic-api", "estimated_minutes": 240 }
      ]
    },
    {
      "id": "domain-1",
      "title": "Domain 1: Agentic Architecture & Orchestration (27%)",
      "items": [
        { "id": "cc.d1.1", "kind": "reading", "title": "Domain 1 study guide (Task Statements 1.1–1.7)", "desc": "Agentic loops, coordinator-subagent orchestration, context passing, enforcement/handoff, hooks, decomposition, and session management — each Task Statement with a deep-dive prompt and self-check.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/domain-1-agentic-architecture.md", "estimated_minutes": 90 }
      ]
    },
    {
      "id": "domain-3",
      "title": "Domain 3: Claude Code Configuration & Workflows (20%)",
      "items": [
        { "id": "cc.d3.1", "kind": "reading", "title": "Domain 3 study guide (Task Statements 3.1–3.6)", "desc": "CLAUDE.md hierarchy, slash commands & skills, path-specific rules, plan mode vs direct execution, iterative refinement, and CI/CD integration.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/domain-3-claude-code-config.md", "estimated_minutes": 75 }
      ]
    },
    {
      "id": "domain-4",
      "title": "Domain 4: Prompt Engineering & Structured Output (20%)",
      "items": [
        { "id": "cc.d4.1", "kind": "reading", "title": "Domain 4 study guide (Task Statements 4.1–4.6)", "desc": "Explicit criteria, few-shot prompting, tool_use/JSON-schema structured output, validation-retry loops, batch processing, and multi-pass review.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/domain-4-prompt-structured-output.md", "estimated_minutes": 75 }
      ]
    },
    {
      "id": "domain-2",
      "title": "Domain 2: Tool Design & MCP Integration (18%)",
      "items": [
        { "id": "cc.d2.1", "kind": "reading", "title": "Domain 2 study guide (Task Statements 2.1–2.5)", "desc": "Tool interface design, structured MCP error responses, tool distribution & tool_choice, MCP server integration, and built-in tool selection.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/domain-2-tool-design-mcp.md", "estimated_minutes": 60 }
      ]
    },
    {
      "id": "domain-5",
      "title": "Domain 5: Context Management & Reliability (15%)",
      "items": [
        { "id": "cc.d5.1", "kind": "reading", "title": "Domain 5 study guide (Task Statements 5.1–5.6)", "desc": "Context preservation, escalation & ambiguity, error propagation, large-codebase context, human review & confidence calibration, and provenance in synthesis.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/domain-5-context-reliability.md", "estimated_minutes": 60 }
      ]
    },
    {
      "id": "exercises",
      "title": "Hands-on exercises",
      "items": [
        { "id": "cc.ex.1", "kind": "practice", "title": "Exercise 1: Multi-tool agent with escalation logic", "desc": "Build an agentic loop with 3–4 differentiated MCP tools, structured errors, a compliance hook, and multi-concern decomposition.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/exercises.md#exercise-1--build-a-multi-tool-agent-with-escalation-logic", "exam_note": "Reinforces D1/D2/D5: agentic loop, tool descriptions, structured errors, hooks, escalation.", "estimated_minutes": 120 },
        { "id": "cc.ex.2", "kind": "practice", "title": "Exercise 2: Configure Claude Code for a team workflow", "desc": "Set up a CLAUDE.md hierarchy, glob-scoped .claude/rules/, a context:fork skill, MCP servers, and plan-vs-direct decisions.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/exercises.md#exercise-2--configure-claude-code-for-a-team-development-workflow", "exam_note": "Reinforces D3/D2: configuration hierarchy, rules, skills, MCP integration.", "estimated_minutes": 120 },
        { "id": "cc.ex.3", "kind": "practice", "title": "Exercise 3: Structured data extraction pipeline", "desc": "Design a JSON schema with nullable/enum fields, a validation-retry loop, few-shot for varied formats, batch processing, and confidence-based human review.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/exercises.md#exercise-3--build-a-structured-data-extraction-pipeline", "exam_note": "Reinforces D4/D5: tool_use schemas, retry loops, batch API, human review.", "estimated_minutes": 120 },
        { "id": "cc.ex.4", "kind": "practice", "title": "Exercise 4: Multi-agent research pipeline", "desc": "Orchestrate coordinator + subagents with explicit context passing, parallel Task calls, provenance-preserving structured output, error propagation, and conflict annotation.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/exercises.md#exercise-4--design-and-debug-a-multi-agent-research-pipeline", "exam_note": "Reinforces D1/D2/D5: orchestration, context passing, error propagation, provenance.", "estimated_minutes": 120 }
      ]
    },
    {
      "id": "scenarios",
      "title": "Exam scenarios (4 of 6 appear on the exam)",
      "items": [
        { "id": "cc.scn.1", "kind": "reading", "title": "Scenario 1: Customer Support Resolution Agent", "desc": "Agent SDK + MCP tools; 80%+ first-contact resolution. Draws on D1, D2, D5.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/scenario-1-customer-support.md", "estimated_minutes": 30 },
        { "id": "cc.scn.2", "kind": "reading", "title": "Scenario 2: Code Generation with Claude Code", "desc": "CLAUDE.md, slash commands, plan mode. Draws on D3, D5.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/scenario-2-code-generation.md", "estimated_minutes": 30 },
        { "id": "cc.scn.3", "kind": "reading", "title": "Scenario 3: Multi-Agent Research System", "desc": "Coordinator + search/analyze/synthesize/report subagents. Draws on D1, D2, D5.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/scenario-3-multi-agent-research.md", "estimated_minutes": 30 },
        { "id": "cc.scn.4", "kind": "reading", "title": "Scenario 4: Developer Productivity with Claude", "desc": "Built-in tools (Read/Write/Bash/Grep/Glob) + MCP. Draws on D2, D3, D1.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/scenario-4-developer-productivity.md", "estimated_minutes": 30 },
        { "id": "cc.scn.5", "kind": "reading", "title": "Scenario 5: Claude Code for CI/CD", "desc": "-p / --output-format json, automated PR review. Draws on D3, D4.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/scenario-5-cicd.md", "estimated_minutes": 30 },
        { "id": "cc.scn.6", "kind": "reading", "title": "Scenario 6: Structured Data Extraction", "desc": "JSON schema via tool_use, validation/retry, batch API. Draws on D4, D5.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/scenario-6-structured-extraction.md", "estimated_minutes": 30 }
      ]
    },
    {
      "id": "final-review",
      "title": "Final review",
      "items": [
        { "id": "cc.rev.1", "kind": "reading", "title": "Decision heuristics cheat-sheet", "desc": "One page: the answer-elimination heuristics across all five domains. Run through it the day before.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/heuristics-cheatsheet.md", "estimated_minutes": 20 },
        { "id": "cc.rev.2", "kind": "reading", "title": "Glossary & exam synonyms", "desc": "Terms and the synonym pairs the exam uses (orchestrator-workers = hub-and-spoke, primacy/recency, evaluator-optimizer, graceful degradation with transparency).", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/glossary-and-synonyms.md", "estimated_minutes": 20 },
        { "id": "cc.rev.3", "kind": "reading", "title": "Easy-to-confuse pairs", "desc": "The subtle distinctions that separate a pass from a high pass — self-review vs self-critique, hook vs prompt, empty-result vs access-failure, and more.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/certifications/claude-code/easy-to-confuse.md", "estimated_minutes": 20 }
      ]
    },
    {
      "id": "exam-day",
      "title": "Exam day",
      "items": [
        { "id": "cc.exam.1", "kind": "practice", "title": "Complete the official Anthropic Practice Exam", "desc": "The real calibration tool (unlimited attempts). Review every miss against the domain study guides above before booking the exam.", "link": "https://academy.anthropic.com/", "estimated_minutes": 120 },
        { "id": "cc.exam.2", "kind": "practice", "title": "Take the certification exam", "desc": "The finish line: register and sit the exam.", "link": "https://academy.anthropic.com/", "estimated_minutes": 120 }
      ]
    }
  ]
}
```

- [ ] **Step 2: Run the certification validator**

Run: `node schema/validate-certifications.mjs`
Expected: `Certifications OK: registry + 1 path file(s), 23 unique item ids.`

- [ ] **Step 3: Update the certifications worker test to the new ids**

In `worker/test/certifications.test.ts`, replace the first test body (lines 5-14) with:
```ts
  it("lists Claude Code with flattened item ids and required-only subset", () => {
    const list = certList();
    const cc = list.find((c) => c.id === "claude-code");
    expect(cc).toBeTruthy();
    expect(cc!.label).toBe("Claude Code");
    // ids exist under the new structure
    expect(cc!.itemIds).toContain("cc.d1.1");
    expect(cc!.itemIds).toContain("cc.exam.2");
    expect(cc!.itemIds).toContain("cc.start.3"); // the optional course
    // the optional course is in itemIds but excluded from requiredItemIds
    expect(cc!.requiredItemIds).toContain("cc.d1.1");
    expect(cc!.requiredItemIds).not.toContain("cc.start.3");
    expect(cc!.requiredItemIds.length).toBe(cc!.itemIds.length - 1);
    // ids are unique
    expect(new Set(cc!.itemIds).size).toBe(cc!.itemIds.length);
  });
```

- [ ] **Step 4: Run the worker test suite**

Run: `cd worker && npm test`
Expected: PASS (all files, including the reconciled certifications test).

- [ ] **Step 5: Commit**

```bash
git add public/certification.claude-code.json worker/test/certifications.test.ts
git commit -m "feat(cert): restructure Claude Code path to domain-aligned study order"
```

---

### Task 8: Final verification & deploy checklist

**Files:** none (verification + rollout only).

- [ ] **Step 1: Full static + type + test gate**

Run:
```bash
node schema/validate-certifications.mjs
node schema/validate-curriculum.mjs
cd worker && npm run typecheck && npm test
```
Expected: certifications OK (23 ids); curriculum OK; typecheck clean; all worker tests pass.

- [ ] **Step 2: Confirm every JSON doc link resolves to a real file**

Run from the repo root:
```bash
node -e "const p=require('./public/certification.claude-code.json');const fs=require('fs');let bad=0;for(const s of p.sections)for(const it of s.items){if(it.link&&it.link.includes('/docs/certifications/')){const rel=it.link.split('/blob/main/')[1].split('#')[0];if(!fs.existsSync(rel)){console.log('MISSING',rel);bad++;}}}console.log(bad?('FAIL '+bad):'ALL DOC LINKS OK');"
```
Expected: `ALL DOC LINKS OK`.

- [ ] **Step 3: Local visual smoke of the cert page**

Start the worker (`cd worker && npm run dev`) and serve the frontend (`npx http-server public -p 8080 -c-1`), open `http://localhost:8080/cert.html`, sign in, and confirm:
- 10 sections render **in study order**: start → Domain 1 → Domain 3 → Domain 4 → Domain 2 → Domain 5 → exercises → scenarios → final-review → exam-day.
- The provenance note shows under the header (no "Draft:" prefix, no score).
- `cc.start.3` shows an `optional` badge; the four `cc.ex.*` items show an `exam_note` line.
- Ticking `cc.start.3` (optional) changes the personal `done/total` count but ticking every **required** item is what should make the engineer "ready" (verified on the dashboard next).

- [ ] **Step 4: Deploy**

```bash
git push origin feature/certification-prep-paths   # or merge to main per the branch's PR #24
cd worker && npm run deploy
```
Pages redeploys `public/**` and `docs/certifications/**` on push to `main`; `wrangler deploy` is **required** for the `requiredItemIds` field, the aggregate semantics change, and the `CACHE_KEY` v6 bump.

- [ ] **Step 5: Post-deploy verification**

- Dashboard → Certifications tab: "Ready to pass exam" counts reflect **required** items only. Tick the optional course for a test engineer → their `ready` status does not change; tick all 22 required items → `ready` becomes true.
- Spot-check an engineer who had ticked legacy ids (`cc.fund.*`, `cc.flow.*`, `cc.ctx.*`, `cc.mcp.*`, `cc.orch.*`, old `cc.exam.*`): those orphaned ticks are ignored by the aggregate (no error), and their cert `done` count reflects only the new required items. This is expected (the path was `draft` pre-launch).

---

## Self-Review

**1. Spec coverage** (each spec section → task):
- Confidentiality boundary → Global Constraints + grep guards in Tasks 4/5/6.
- Content architecture (5 domain guides by Task Statement, 6 scenarios, cross-cutting docs, 4-part template, no MCQ) → Tasks 4, 5, 6.
- Study order & domain numbering (D1→D3→D4→D2→D5, official numbers kept) → Global Constraints + Task 7 JSON section order.
- JSON restructure (23 items, study order, resources→start, exercises, final-review, exam-day, neutral `exam.notes`) → Task 7.
- `optional`/`exam_note` fields → Task 1 (validator), Task 3 (frontend), Task 7 (JSON).
- Worker `requiredItemIds` + aggregate + cache bump → Task 2.
- Validator (`course` kind, type checks) → Task 1.
- Frontend badge/exam_note/banner → Task 3.
- Rollout + verify (+ orphaned ticks, aggregate vitest, scenario filenames) → Task 2 (test), Task 8 (verify/deploy), Task 5 (filenames pinned).
- Scope-map (In/Out-of-Scope) → Task 6. Deviation (exercises.md 17th doc) flagged in header.

**2. Placeholder scan:** no TBD/TODO; content tasks give a full worked example + enumerated Task Statement titles + exact sources + acceptance greps (the derivable-but-not-pasted prose is authored content, not a plan placeholder).

**3. Type consistency:** `requiredItemIds` is defined in `CertInfo` (Task 2 Step 3), added to the aggregate's `CertRegistry` return type (Step 4), provided by both test fakes (Steps 1, 5), and asserted in Task 7 Step 3 — consistent throughout. `CACHE_KEY` bumped once (v6). Field names consumed by the dashboard (`total_items`, `engineers_ready`, `{done,total,pct,ready}`) are unchanged, so no dashboard task is needed.
