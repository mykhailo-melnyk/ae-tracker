# Certification Prep Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic, server-synced "certifications" axis (registry + per-cert prep paths) to the AE tracker — Claude Code first, extensible to AWS and others — with a signed-in prep page and admin dashboard readiness view.

**Architecture:** Cert prep is *additive* to the competency curriculum. A registry (`public/certifications.json`) + per-cert path files (`public/certification.<id>.json`) mirror the curriculum manifest/path split. Progress reuses the existing `progress/<username>.json` `tasks` map via the existing `POST /api/mark` / `GET /api/me` endpoints (no new endpoint, no new progress field). The Worker gains a cert registry module + an aggregate "cert pass" so admins see readiness. A new static page (`cert.html`/`cert.js`) renders the picker + checklists.

**Tech Stack:** Vanilla HTML/CSS/JS frontend (no build step); Cloudflare Worker (TypeScript) with `@cloudflare/vitest-pool-workers` tests; plain Node ESM validator scripts; GitHub Actions CI; GitHub Pages hosting.

## Global Constraints

- **Item IDs ≤ 32 characters.** `POST /api/mark` rejects `task_id` longer than 32 chars (`worker/src/api.ts:87`). Cert item IDs MUST fit.
- **Item ID pattern:** `^<code>\.[a-z0-9-]+\.\d+$` where `<code>` is the cert's short `code` (e.g. `cc.fund.1`). Globally unique across all cert path files and distinct from curriculum IDs (`web-L1.T1`).
- **`kind` ∈ `{reading, practice, video}`** (same set the curriculum uses, so existing `.kind-tag` CSS applies).
- **No new backend endpoint or `ProgressFile` field** — reuse the `tasks` map + `/api/mark` + `/api/me`.
- **Worker functions keep the injected `fetchFn: typeof fetch = fetch` test seam.**
- **Frontend picks the Worker URL at runtime** via the inline `window.WORKER_URL` script (localhost → `http://localhost:8787`, else the prod Worker).
- **Adding/editing cert data requires `wrangler deploy`** for the dashboard aggregate to reflect it (the Worker bundles the JSON).

---

## Task 1: Certification data files + validator + CI

**Files:**
- Create: `public/certifications.json`
- Create: `public/certification.claude-code.json`
- Create: `schema/validate-certifications.mjs`
- Create: `.github/workflows/validate-certifications.yml`

**Interfaces:**
- Produces: the registry shape `{ version, certifications: [{ id, code, label, file }] }` and the path shape `{ certification, draft?, exam: { name, link, notes }, sections: [{ id, title, items: [{ id, kind, title, desc, link?, estimated_minutes? }] }] }`. Later tasks (Worker registry, cert page, dashboard) consume these exact field names.

- [ ] **Step 1: Create the registry `public/certifications.json`**

```json
{
  "version": "1.0",
  "certifications": [
    {
      "id": "claude-code",
      "code": "cc",
      "label": "Claude Code",
      "file": "certification.claude-code.json"
    }
  ]
}
```

- [ ] **Step 2: Create the Claude Code path file `public/certification.claude-code.json`**

Starter content, flagged `"draft": true` (drives the on-page "under review" banner). Links reuse verified in-repo/KB material; exam-logistics items intentionally omit `link` (optional) rather than guess URLs.

```json
{
  "certification": "claude-code",
  "draft": true,
  "exam": {
    "name": "Anthropic Claude Code Certification",
    "link": "https://docs.claude.com/en/docs/claude-code/overview",
    "notes": "Starter prep path — item list is under review against the official Anthropic exam blueprint. Verify the official registration page and domains before relying on this."
  },
  "sections": [
    {
      "id": "fundamentals",
      "title": "Fundamentals",
      "items": [
        { "id": "cc.fund.1", "kind": "reading", "title": "Install & set up Claude Code", "desc": "Install Claude Code (and iTerm2 on macOS). Know how to launch it and run the basic loop.", "link": "https://github.com/solvdinc/agentic-engineering/blob/main/general/getting-started/tool-setup.md", "estimated_minutes": 15 },
        { "id": "cc.fund.2", "kind": "reading", "title": "How we work with AI at Solvd", "desc": "Why AI fails the way it does and the core principles. Orientation before the tool specifics.", "link": "https://github.com/solvdinc/agentic-engineering/blob/main/general/getting-started/start-here.md", "estimated_minutes": 10 },
        { "id": "cc.fund.3", "kind": "reading", "title": "Claude Code best practices (reference)", "desc": "Modes, slash commands, @-references, MCP, custom commands. Skim now; return per section.", "link": "https://github.com/solvdinc/agentic-engineering/blob/main/general/tools/claude-code.md", "estimated_minutes": 30 }
      ]
    },
    {
      "id": "workflows",
      "title": "Core workflows",
      "items": [
        { "id": "cc.flow.1", "kind": "practice", "title": "Read before you write", "desc": "Use Claude Code to explain an unfamiliar file before changing it. Confirm claims against the code.", "estimated_minutes": 20 },
        { "id": "cc.flow.2", "kind": "practice", "title": "Diff review discipline", "desc": "Generate a change and review the diff hunk-by-hunk; reject overcomplicated output and ask for simpler.", "estimated_minutes": 20 },
        { "id": "cc.flow.3", "kind": "practice", "title": "Plan mode for multi-file work", "desc": "Use Plan mode before a multi-file edit; verify the plan before executing.", "estimated_minutes": 20 }
      ]
    },
    {
      "id": "context",
      "title": "Context & customization",
      "items": [
        { "id": "cc.ctx.1", "kind": "reading", "title": "A good CLAUDE.md (golden example)", "desc": "Annotated exemplar CLAUDE.md — what to include, what to leave out.", "link": "https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/curriculum/examples/claude-md.md", "estimated_minutes": 15 },
        { "id": "cc.ctx.2", "kind": "practice", "title": "Write a CLAUDE.md for a repo", "desc": "Author a focused CLAUDE.md for a project you know; keep it tight.", "estimated_minutes": 30 },
        { "id": "cc.ctx.3", "kind": "reading", "title": "Settings, permissions & hooks", "desc": "Understand settings.json, permission modes, and hooks at a level you can explain.", "estimated_minutes": 20 }
      ]
    },
    {
      "id": "mcp",
      "title": "MCP & extensions",
      "items": [
        { "id": "cc.mcp.1", "kind": "reading", "title": "What MCP is and when to use it", "desc": "MCP servers/tools and how Claude Code consumes them.", "estimated_minutes": 20 },
        { "id": "cc.mcp.2", "kind": "practice", "title": "Wire up one MCP server", "desc": "Connect a single MCP server and call one of its tools from Claude Code.", "estimated_minutes": 30 }
      ]
    },
    {
      "id": "orchestration",
      "title": "Orchestration & advanced",
      "items": [
        { "id": "cc.orch.1", "kind": "reading", "title": "Subagents & custom commands", "desc": "How subagents and reusable slash commands multiply output.", "estimated_minutes": 20 },
        { "id": "cc.orch.2", "kind": "practice", "title": "Build one automated feedback loop", "desc": "Set up a loop where Claude Code runs tests/lint and self-corrects.", "estimated_minutes": 30 }
      ]
    },
    {
      "id": "exam",
      "title": "Exam logistics & mock",
      "items": [
        { "id": "cc.exam.1", "kind": "reading", "title": "Confirm exam format & registration", "desc": "Read the official exam page: format, domains, cost, eligibility. Update this path if it differs.", "estimated_minutes": 15 },
        { "id": "cc.exam.2", "kind": "practice", "title": "Timed mock run", "desc": "Do a timed self-quiz across the domains above; note weak spots and revisit.", "estimated_minutes": 45 },
        { "id": "cc.exam.3", "kind": "practice", "title": "Take the certification exam", "desc": "The finish line: register and sit the exam.", "estimated_minutes": 60 }
      ]
    }
  ]
}
```

- [ ] **Step 3: Write the validator `schema/validate-certifications.mjs`**

Plain Node ESM (no ajv dependency — the surface is small). Enforces every Global Constraint on IDs.

```js
// Validates the certifications registry and every per-cert path file it points to.
// Registry-driven: adding a cert needs no change here — just a registry entry + its
// path file. Run locally with `node schema/validate-certifications.mjs`; CI runs the
// same script. Exits non-zero (and prints why) on any violation.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const KINDS = new Set(["reading", "practice", "video"]);
const errors = [];
const fail = (m) => errors.push(m);

const registry = readJson(join(pub, "certifications.json"));
if (!registry.version) fail("certifications.json: missing version");
if (!Array.isArray(registry.certifications)) fail("certifications.json: certifications must be an array");

const seenIds = new Map(); // itemId -> cert id that owns it

for (const cert of registry.certifications ?? []) {
  for (const k of ["id", "code", "label", "file"]) {
    if (typeof cert[k] !== "string" || !cert[k]) fail(`cert "${cert.id ?? "?"}": missing/invalid "${k}"`);
  }
  if (!cert.file || !existsSync(join(pub, cert.file))) {
    fail(`cert "${cert.id}": file public/${cert.file} is missing`);
    continue;
  }
  let path;
  try { path = readJson(join(pub, cert.file)); }
  catch { fail(`cert "${cert.id}": public/${cert.file} is not valid JSON`); continue; }

  if (path.certification !== cert.id) {
    fail(`public/${cert.file}: certification "${path.certification}" != registry id "${cert.id}"`);
  }
  if (!Array.isArray(path.sections)) { fail(`public/${cert.file}: sections must be an array`); continue; }

  const idRe = new RegExp("^" + cert.code + "\\.[a-z0-9-]+\\.\\d+$");
  for (const sec of path.sections) {
    if (!sec.id || !sec.title) fail(`public/${cert.file}: a section is missing id/title`);
    if (!Array.isArray(sec.items)) { fail(`public/${cert.file} section "${sec.id}": items must be an array`); continue; }
    for (const it of sec.items) {
      if (typeof it.id !== "string") { fail(`public/${cert.file} section "${sec.id}": item missing id`); continue; }
      if (it.id.length > 32) fail(`item id "${it.id}" exceeds 32 chars (POST /api/mark limit)`);
      if (!idRe.test(it.id)) fail(`item id "${it.id}" must match ${idRe} (cert code "${cert.code}")`);
      if (!KINDS.has(it.kind)) fail(`item "${it.id}": kind "${it.kind}" not in ${[...KINDS].join("|")}`);
      if (typeof it.title !== "string" || !it.title) fail(`item "${it.id}": missing title`);
      if (seenIds.has(it.id)) fail(`item id "${it.id}" duplicated (in ${cert.id} and ${seenIds.get(it.id)})`);
      else seenIds.set(it.id, cert.id);
    }
  }
}

if (errors.length) {
  console.error("Certification validation FAILED:\n\n" + errors.join("\n"));
  process.exit(1);
}
console.log(`Certifications OK: registry + ${(registry.certifications ?? []).length} path file(s), ${seenIds.size} unique item ids.`);
```

- [ ] **Step 4: Run the validator — expect PASS**

Run: `node schema/validate-certifications.mjs`
Expected: `Certifications OK: registry + 1 path file(s), 16 unique item ids.`

- [ ] **Step 5: Prove the validator catches a bad ID (temporary edit)**

Temporarily change `cc.fund.1` to `cc.fundamentals.reading.number.one` (>32 chars) in `public/certification.claude-code.json`, then run:

Run: `node schema/validate-certifications.mjs`
Expected: FAIL, non-zero exit, message containing `exceeds 32 chars`. **Revert the edit** and re-run to confirm PASS again.

- [ ] **Step 6: Add CI workflow `.github/workflows/validate-certifications.yml`**

```yaml
name: Validate certifications

on:
  push:
    paths:
      - "public/certifications.json"
      - "public/certification.*.json"
      - "schema/validate-certifications.mjs"
      - ".github/workflows/validate-certifications.yml"
  pull_request:
    paths:
      - "public/certifications.json"
      - "public/certification.*.json"
      - "schema/validate-certifications.mjs"

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      # Plain-Node validator (no ajv): registry + every path file it points to,
      # plus cross-checks (file present, certification field matches, item ids
      # unique, ≤32 chars, and prefixed with the cert code).
      - run: node schema/validate-certifications.mjs
```

- [ ] **Step 7: Commit**

```bash
git add public/certifications.json public/certification.claude-code.json schema/validate-certifications.mjs .github/workflows/validate-certifications.yml
git commit -m "feat(cert): certification registry, Claude Code prep path, and validator"
```

---

## Task 2: Worker cert registry module

**Files:**
- Create: `worker/src/certifications.ts`
- Test: `worker/test/certifications.test.ts`

**Interfaces:**
- Consumes: `public/certifications.json`, `public/certification.claude-code.json` (Task 1).
- Produces:
  - `export interface CertInfo { id: string; label: string; itemIds: string[] }`
  - `export function certList(): CertInfo[]` — every cert with its flattened item IDs.
  - `export function certLabel(id: string): string | undefined`
  - The module object structurally satisfies the aggregate's `CertRegistry` (i.e. it has `certList`).

- [ ] **Step 1: Write the failing test `worker/test/certifications.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { certList, certLabel } from "../src/certifications";

describe("certifications registry", () => {
  it("lists Claude Code with flattened item ids", () => {
    const list = certList();
    const cc = list.find((c) => c.id === "claude-code");
    expect(cc).toBeTruthy();
    expect(cc!.label).toBe("Claude Code");
    expect(cc!.itemIds).toContain("cc.fund.1");
    expect(cc!.itemIds).toContain("cc.exam.3");
    // ids are unique
    expect(new Set(cc!.itemIds).size).toBe(cc!.itemIds.length);
  });

  it("resolves a cert label", () => {
    expect(certLabel("claude-code")).toBe("Claude Code");
    expect(certLabel("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd worker && npx vitest run test/certifications.test.ts`
Expected: FAIL — cannot find module `../src/certifications`.

- [ ] **Step 3: Implement `worker/src/certifications.ts`**

```ts
// Certification registry: the registry (cert list) and every per-cert prep path file,
// statically imported and flattened to item ids for the aggregate.
//
// Adding a NEW certification = add its path file, a registry entry, AND an import here,
// then redeploy the worker. Editing items within an existing cert = edit that JSON file
// + redeploy (the aggregate reads item ids from here).
import registry from "../../public/certifications.json";
import claudeCodePath from "../../public/certification.claude-code.json";

export interface CertInfo {
  id: string;
  label: string;
  itemIds: string[];
}

interface PathFile {
  certification: string;
  sections: Array<{ id: string; items: Array<{ id: string }> }>;
}

const PATHS: Record<string, PathFile> = {};
for (const p of [claudeCodePath] as PathFile[]) {
  PATHS[p.certification] = p;
}

const LIST: CertInfo[] = registry.certifications.map((c) => {
  const path = PATHS[c.id];
  const itemIds = path ? path.sections.flatMap((s) => s.items.map((it) => it.id)) : [];
  return { id: c.id, label: c.label, itemIds };
});

/** Every certification with its flattened prep-item ids. */
export function certList(): CertInfo[] {
  return LIST;
}

/** Human label for a cert id, or undefined if unknown. */
export function certLabel(id: string): string | undefined {
  return registry.certifications.find((c) => c.id === id)?.label;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd worker && npx vitest run test/certifications.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `cd worker && npm run typecheck`
Expected: no errors. (JSON module imports already work — `curriculum.ts` imports JSON the same way.)

- [ ] **Step 6: Commit**

```bash
git add worker/src/certifications.ts worker/test/certifications.test.ts
git commit -m "feat(cert): worker certification registry module"
```

---

## Task 3: Aggregate cert pass + dashboard API wiring

**Files:**
- Modify: `worker/src/aggregate.ts` (add `CertRegistry`, extend `Aggregate`, cert pass, bump cache key)
- Modify: `worker/src/index.ts:62` (pass the cert registry into `handleApiAggregate`)
- Test: `worker/test/aggregate.test.ts` (add cert assertions)

**Interfaces:**
- Consumes: `certList()` from Task 2 (`worker/src/certifications.ts`); the `CertInfo` shape.
- Produces (added to `Aggregate`):
  - `certifications: Array<{ id: string; label: string; total_items: number; engineers_started: number; engineers_ready: number }>`
  - each `engineers[]` entry gains `certifications: Record<string, { done: number; total: number; pct: number; ready: boolean }>`
  - `computeAggregate(cfg, registry, fetchFn?, now?, certRegistry?)` — `certRegistry` is a new **last, defaulted** parameter.
  - `handleApiAggregate(request, env, registry, fetchFn?, certRegistry?)` — `certRegistry` is a new **last, defaulted** parameter.

- [ ] **Step 1: Add the `CertRegistry` interface and empty default in `worker/src/aggregate.ts`**

Add near the top, after the existing `CurriculumRegistry` interface (around `aggregate.ts:8-10`):

```ts
// A cert registry is any object exposing certList() (the ./certifications module
// satisfies this structurally; tests pass a fake). Empty default = no cert pass.
interface CertRegistry {
  certList(): Array<{ id: string; label: string; itemIds: string[] }>;
}
const EMPTY_CERT_REGISTRY: CertRegistry = { certList: () => [] };
```

- [ ] **Step 2: Extend the `Aggregate` interface**

In `aggregate.ts`, add to the `Aggregate` interface — a top-level `certifications` array and a `certifications` field on each `engineers[]` entry:

```ts
  certifications: Array<{
    id: string;
    label: string;
    total_items: number;
    engineers_started: number;   // ≥1 item done
    engineers_ready: number;     // ALL items done
  }>;
  engineers: Array<{
    username: string;
    display_name?: string;
    current_level: string;
    completion_pct: number;
    last_active: string;
    competency?: string;
    disabled?: boolean;
    certifications: Record<string, { done: number; total: number; pct: number; ready: boolean }>;
  }>;
```

- [ ] **Step 3: Add the `certRegistry` parameter to `computeAggregate` and compute the cert pass**

Change the signature (add `certRegistry` **last**, defaulted) at `aggregate.ts:48-53`:

```ts
export async function computeAggregate(
  cfg: RepoConfig,
  registry: CurriculumRegistry,
  fetchFn: typeof fetch,
  now: Date = new Date(),
  certRegistry: CertRegistry = EMPTY_CERT_REGISTRY,
): Promise<Aggregate> {
```

Inside the function, before the `for (const p of progresses)` loop, seed cert accumulators:

```ts
  const certDefs = certRegistry.certList();
  const certAgg = certDefs.map((c) => ({
    id: c.id, label: c.label, total_items: c.itemIds.length,
    engineers_started: 0, engineers_ready: 0,
  }));
```

Inside the loop, after the existing per-engineer work and before `engineers.push({...})`, compute this engineer's cert progress:

```ts
    const certProgress: Record<string, { done: number; total: number; pct: number; ready: boolean }> = {};
    for (let i = 0; i < certDefs.length; i++) {
      const def = certDefs[i];
      const total = def.itemIds.length;
      const doneCount = def.itemIds.filter((id) => p.tasks[id]?.done).length;
      const ready = total > 0 && doneCount === total;
      certProgress[def.id] = { done: doneCount, total, pct: total ? doneCount / total : 0, ready };
      // Disabled engineers are excluded from headline cert counts, as elsewhere.
      if (!p.disabled) {
        if (doneCount > 0) certAgg[i].engineers_started += 1;
        if (ready) certAgg[i].engineers_ready += 1;
      }
    }
```

Add `certifications: certProgress,` to the `engineers.push({...})` object, and add `certifications: certAgg,` to the returned object literal.

- [ ] **Step 4: Bump the cache key**

At `aggregate.ts:122`, change:

```ts
export const CACHE_KEY = "aggregate-v5";
```

(Update the adjacent version comment to note: `v5 adds per-cert readiness + per-engineer cert progress`.)

- [ ] **Step 5: Add `certRegistry` to `handleApiAggregate` and pass it through**

Change the signature (add `certRegistry` **last**, defaulted) at `aggregate.ts:134-139`:

```ts
export async function handleApiAggregate(
  request: Request,
  env: Env,
  registry: CurriculumRegistry,
  fetchFn: typeof fetch = fetch,
  certRegistry: CertRegistry = EMPTY_CERT_REGISTRY,
): Promise<Response> {
```

And change the compute call inside it (currently `aggregate.ts` ~line 156 `const agg = await computeAggregate(cfg, registry, fetchFn);`) to:

```ts
  const agg = await computeAggregate(cfg, registry, fetchFn, new Date(), certRegistry);
```

- [ ] **Step 6: Wire the cert registry in `worker/src/index.ts`**

Add the import near `index.ts:4` (`import * as curriculum from "./curriculum";`):

```ts
import * as certifications from "./certifications";
```

Change the call at `index.ts:62` from:

```ts
      await handleApiAggregate(request, env, curriculum),
```

to:

```ts
      await handleApiAggregate(request, env, curriculum, fetch, certifications),
```

- [ ] **Step 7: Add cert assertions to `worker/test/aggregate.test.ts`**

Add a new test in the `describe("computeAggregate", ...)` block. It passes a fake cert registry so it doesn't depend on the shipped JSON:

```ts
  it("computes per-cert readiness and per-engineer cert progress, excluding disabled", async () => {
    const registry = registryOf({ web: WEB });
    const certRegistry = {
      certList: () => [{ id: "claude-code", label: "Claude Code", itemIds: ["cc.a.1", "cc.a.2"] }],
    };

    const files: Record<string, any> = {
      "anna.json": {
        github_username: "anna", created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-27T00:00:00Z",
        competency: "web",
        tasks: { "cc.a.1": { done: true, at: "2026-05-27T00:00:00Z" }, "cc.a.2": { done: true, at: "2026-05-27T00:00:00Z" } },
      },
      "ben.json": {
        github_username: "ben", created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-27T00:00:00Z",
        competency: "web",
        tasks: { "cc.a.1": { done: true, at: "2026-05-27T00:00:00Z" } },
      },
      "cara.json": {
        github_username: "cara", created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-27T00:00:00Z",
        competency: "web", disabled: true,
        tasks: { "cc.a.1": { done: true }, "cc.a.2": { done: true } },
      },
    };

    const fetchMock = (async (url: string) => {
      if (url.endsWith("/contents/progress")) {
        return new Response(JSON.stringify([
          { name: "anna.json", type: "file", path: "progress/anna.json" },
          { name: "ben.json", type: "file", path: "progress/ben.json" },
          { name: "cara.json", type: "file", path: "progress/cara.json" },
        ]), { headers: { "content-type": "application/json" } });
      }
      const name = url.split("/").pop()!;
      return new Response(JSON.stringify({ sha: "s", content: btoa(JSON.stringify(files[name])), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const now = new Date("2026-05-27T12:00:00Z");
    const agg = await computeAggregate(cfg, registry, fetchMock, now, certRegistry);

    const cc = agg.certifications.find((c) => c.id === "claude-code")!;
    expect(cc.total_items).toBe(2);
    expect(cc.engineers_started).toBe(2); // anna + ben (cara disabled, excluded)
    expect(cc.engineers_ready).toBe(1);   // anna only

    const anna = agg.engineers.find((e) => e.username === "anna")!;
    expect(anna.certifications["claude-code"]).toEqual({ done: 2, total: 2, pct: 1, ready: true });
    const ben = agg.engineers.find((e) => e.username === "ben")!;
    expect(ben.certifications["claude-code"].ready).toBe(false);
    expect(ben.certifications["claude-code"].pct).toBeCloseTo(0.5);
  });
```

- [ ] **Step 8: Run the aggregate tests to verify they pass**

Run: `cd worker && npx vitest run test/aggregate.test.ts`
Expected: PASS (existing tests still green — `certRegistry` defaults to empty for them — plus the new cert test).

- [ ] **Step 9: Full test suite + typecheck**

Run: `cd worker && npm test && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 10: Commit**

```bash
git add worker/src/aggregate.ts worker/src/index.ts worker/test/aggregate.test.ts
git commit -m "feat(cert): aggregate cert-readiness pass + dashboard API wiring"
```

---

## Task 4: Certification prep page (frontend)

**Files:**
- Create: `public/cert.html`
- Create: `public/cert.js`
- Modify: `public/app.js` (add a "🎓 Certifications" link to the signed-in topbar)

**Interfaces:**
- Consumes: `certifications.json` + `certification.<id>.json` (Task 1); `auth.js` globals `apiFetch`, `clearAuthToken` (already loaded); `GET /api/me` and `POST /api/mark` (existing).
- Produces: a standalone signed-in page; no exports consumed by other tasks.

- [ ] **Step 1: Create `public/cert.html`**

Mirrors the tracker shell (same stylesheet, same WORKER_URL script, loads `auth.js` then `cert.js`).

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AE Tracker — Certifications</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="topbar">
    <div class="brand"><img class="brand-logo" src="assets/solvd-logo.svg" alt="Solvd"> AE Tracker <span class="tag">CERTIFICATIONS</span></div>
    <div id="user-box" class="user"></div>
  </div>

  <div id="signed-out" class="container hidden">
    <div class="signin-card">
      <h1>Sign in to prep for certifications</h1>
      <p>Your certification progress is saved to your account. Sign in with GitHub to start.</p>
      <a id="signin-link" class="signin-btn" href="">Sign in with GitHub</a>
    </div>
  </div>

  <div id="disabled" class="container hidden">
    <div class="signin-card">
      <h1>Your account is disabled</h1>
      <p>Your access to the AE Tracker has been turned off. Please contact your direct manager about it.</p>
    </div>
  </div>

  <div id="cert-app" class="container hidden">
    <div class="greeting">
      <div>
        <h1>Certification prep</h1>
        <div class="lede">Self-paced paths toward external certification exams. Your ticks are saved to your account.</div>
      </div>
      <div class="totals" id="cert-totals"></div>
    </div>
    <div id="cert-banner"></div>
    <div class="competency-picker" id="cert-picker"></div>
    <div id="cert-body"></div>
  </div>

  <script>
    window.WORKER_URL = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
      ? "http://localhost:8787"
      : "https://ae-tracker.mihael-melnyk.workers.dev";
  </script>
  <script src="auth.js"></script>
  <script src="cert.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `public/cert.js`**

Reuses the tracker's optimistic-toggle pattern (`app.js:225-254`) against `/api/mark`, and the `formatEstimate` helper.

```js
const WORKER = window.WORKER_URL;
let REGISTRY = null;    // certifications.json
let PROGRESS = null;    // the engineer's progress file
let CURRENT = null;     // the loaded path file for the selected cert

function formatEstimate(min) {
  if (min < 60) return min + " min";
  const hrs = min / 60;
  return (Number.isInteger(hrs) ? hrs : hrs.toFixed(1)) + " hr";
}

async function loadRegistry() {
  const res = await fetch("certifications.json");
  if (!res.ok) throw new Error("registry load failed: " + res.status);
  return res.json();
}

async function loadPath(certId) {
  const res = await fetch("certification." + certId + ".json");
  if (!res.ok) throw new Error("path load failed: " + certId);
  return res.json();
}

// Flatten a path's items for progress math.
function allItems(path) {
  return path.sections.flatMap((s) => s.items);
}

// Uses the tracker's competency-picker markup (.comp-label / .comp-chips / .comp-chip.on),
// all defined under `.competency-picker` in styles.css — the only stylesheet cert.html loads.
function renderPicker() {
  const box = document.getElementById("cert-picker");
  const certs = REGISTRY.certifications || [];
  const chips = certs.map((c) => {
    const on = CURRENT && CURRENT.certification === c.id;
    return `<button type="button" class="comp-chip ${on ? "on" : ""}" data-cert="${c.id}">${c.label}</button>`;
  }).join("");
  box.innerHTML = `<div class="comp-label">Certification</div><div class="comp-chips">${chips}</div>`;
  box.querySelectorAll(".comp-chip").forEach((el) =>
    el.addEventListener("click", () => selectCert(el.dataset.cert)));
}

function renderBanner() {
  const box = document.getElementById("cert-banner");
  if (CURRENT && CURRENT.draft) {
    const note = CURRENT.exam && CURRENT.exam.notes ? CURRENT.exam.notes : "This path is a draft under review.";
    box.innerHTML = `<div class="move-on"><strong>Draft:</strong> ${note}</div>`;
  } else {
    box.innerHTML = "";
  }
}

function renderTotals() {
  const items = allItems(CURRENT);
  const done = items.filter((it) => PROGRESS.tasks[it.id]?.done).length;
  document.getElementById("cert-totals").innerHTML =
    `<strong>${done}</strong> / ${items.length} items done`;
}

function renderBody() {
  const body = document.getElementById("cert-body");
  const examLink = CURRENT.exam && CURRENT.exam.link
    ? `<div class="level-link"><a href="${CURRENT.exam.link}" target="_blank" rel="noopener">Official exam page ↗</a></div>` : "";

  const sectionsHtml = CURRENT.sections.map((sec) => {
    const done = sec.items.filter((it) => PROGRESS.tasks[it.id]?.done).length;
    const itemsHtml = sec.items.map((it) => {
      const isDone = PROGRESS.tasks[it.id]?.done === true;
      return `
        <div class="task ${isDone ? "done" : ""}" data-item="${it.id}">
          <div class="check"></div>
          <div class="body">
            <div class="title">${it.title} <span class="kind-tag ${it.kind}">${it.kind}</span>${it.estimated_minutes ? `<span class="task-est">· ${formatEstimate(it.estimated_minutes)}</span>` : ""}</div>
            ${it.desc ? `<div class="desc">${it.desc}</div>` : ""}
            ${it.link ? `<a class="external" href="${it.link}" target="_blank" rel="noopener">${it.link} ↗</a>` : ""}
          </div>
        </div>`;
    }).join("");
    return `
      <div class="focus-card">
        <div class="focus-head">
          <div><h2>${sec.title}</h2></div>
          <div class="count">${done} / ${sec.items.length}</div>
        </div>
        ${itemsHtml}
      </div>`;
  }).join("");

  body.innerHTML = examLink + sectionsHtml;
  body.querySelectorAll(".task").forEach((el) =>
    el.querySelector(".check").addEventListener("click", () => toggleItem(el.dataset.item)));
}

function renderCert() {
  renderPicker();
  renderBanner();
  renderTotals();
  renderBody();
}

async function selectCert(certId) {
  CURRENT = await loadPath(certId);
  renderCert();
}

async function toggleItem(itemId) {
  const currentlyDone = PROGRESS.tasks[itemId]?.done === true;
  const newDone = !currentlyDone;
  PROGRESS.tasks[itemId] = { done: newDone, at: new Date().toISOString() }; // optimistic
  renderTotals();
  renderBody();
  try {
    const res = await apiFetch(WORKER + "/api/mark", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task_id: itemId, done: newDone }),
    });
    if (!res.ok) throw new Error("mark failed: " + res.status);
    PROGRESS = await res.json();
  } catch (e) {
    PROGRESS.tasks[itemId] = { done: currentlyDone }; // roll back
    renderTotals();
    renderBody();
    alert("Could not save your change. Try again in a moment.");
  }
}

async function init() {
  const res = await apiFetch(WORKER + "/api/me");
  if (res.status === 401) {
    clearAuthToken();
    document.getElementById("signed-out").classList.remove("hidden");
    document.getElementById("signin-link").href = WORKER + "/auth/login";
    return;
  }
  if (!res.ok) throw new Error("loadMe failed: " + res.status);
  PROGRESS = await res.json();

  if (PROGRESS.disabled) {
    document.getElementById("disabled").classList.remove("hidden");
    document.getElementById("user-box").innerHTML =
      `<a class="signout-link" href="${WORKER}/auth/logout" onclick="clearAuthToken()">Sign out</a>`;
    return;
  }

  document.getElementById("user-box").innerHTML = `
    <span class="user-name">${PROGRESS.display_name || PROGRESS.github_username}</span>
    <a class="dashboard-link" href="tracker.html">← Tracker</a>
    <a class="signout-link" href="${WORKER}/auth/logout" onclick="clearAuthToken()">Sign out</a>
  `;

  REGISTRY = await loadRegistry();
  document.getElementById("cert-app").classList.remove("hidden");
  const first = (REGISTRY.certifications || [])[0];
  if (first) await selectCert(first.id);
}

init().catch((e) => {
  document.body.innerHTML = "<pre style='padding:24px;color:#b91c1c'>" + e.message + "</pre>";
});
```

- [ ] **Step 3: Add the "🎓 Certifications" link to the tracker topbar**

In `public/app.js`, in the `userBox.innerHTML` template (around `app.js:363-367`), add a link next to the dashboard link. Change:

```js
  userBox.innerHTML = `
    <span class="user-name">${PROGRESS.display_name || PROGRESS.github_username}</span>
    ${dashboardLink}
    <a class="signout-link" href="${WORKER}/auth/logout" onclick="clearAuthToken()">Sign out</a>
  `;
```

to:

```js
  userBox.innerHTML = `
    <span class="user-name">${PROGRESS.display_name || PROGRESS.github_username}</span>
    <a class="dashboard-link" href="cert.html">🎓 Certifications</a>
    ${dashboardLink}
    <a class="signout-link" href="${WORKER}/auth/logout" onclick="clearAuthToken()">Sign out</a>
  `;
```

- [ ] **Step 4: Manual verification (local, signed in)**

There is no frontend test framework — verify in the browser against the dev Worker.

1. Terminal A: `cd worker && npm run dev` (Worker at `http://localhost:8787`).
2. Terminal B: `npx http-server public -p 8080 -c-1`.
3. Open `http://localhost:8080/tracker.html`, sign in with GitHub (this stores the token in `localStorage` on `localhost`).
4. Confirm the topbar now shows **🎓 Certifications**; click it → lands on `cert.html`.
5. Expected: the **Claude Code** picker pill is active, the **Draft** banner shows, six sections render with checkboxes, and the totals line reads `0 / 16 items done`.
6. Tick `cc.fund.1`: the item gets the `done` style, section + totals counts increment. Open DevTools → Network: a `POST /api/mark` with `{ "task_id": "cc.fund.1", "done": true }` returns 200.
7. **Reload the page** → the tick persists (proves server-sync via `/api/me`). Untick it and confirm it clears.
8. Open in a private window / different browser signed in as the same user → the tick is visible there too (cross-device sync).

- [ ] **Step 5: Commit**

```bash
git add public/cert.html public/cert.js public/app.js
git commit -m "feat(cert): signed-in certification prep page + tracker link"
```

---

## Task 5: Dashboard certification-readiness view

**Files:**
- Modify: `public/dashboard.html` (add a Certifications card + a table column header)
- Modify: `public/dashboard.js` (render per-cert summary + per-engineer chips)

**Interfaces:**
- Consumes: `AGG.certifications` (top-level summary) and `e.certifications` (per-engineer) from Task 3's aggregate.
- Produces: no exports.

- [ ] **Step 1: Add a Certifications card + table column to `public/dashboard.html`**

Add a new card after the existing `two-col` block and before the `Engineers` card:

```html
    <div class="card">
      <h3>Certification readiness</h3>
      <div class="card-sub">Per external certification · non-disabled engineers</div>
      <div id="cert-readiness"></div>
    </div>
```

In the engineers table `<thead>`, add a `Certifications` header before the trailing empty `<th>`:

```html
      <table class="engineers"><thead><tr>
        <th>Engineer</th><th>Current</th><th>Completion</th><th>Competency</th><th>Certifications</th><th>Last active</th><th></th>
      </tr></thead><tbody id="engineers-body"></tbody></table>
```

- [ ] **Step 2: Render the per-cert readiness summary in `public/dashboard.js`**

Add a render function. It reuses the dashboard's own completion-row classes `.task-row` / `.tname` / `.tbar` / `.tpct` (defined in `dashboard.css`, used by `renderLevelCompletion` at `dashboard.js:100-106`) — the readiness bar shows the share of *started* engineers who are *ready*:

```js
function renderCertReadiness() {
  const box = document.getElementById("cert-readiness");
  const certs = AGG.certifications || [];
  if (!certs.length) { box.innerHTML = `<div class="empty-detail">No certifications configured.</div>`; return; }
  box.innerHTML = certs.map((c) => {
    const started = c.engineers_started || 0;
    const readyPct = started ? Math.round((c.engineers_ready / started) * 100) : 0;
    return `<div class="task-row">
      <span class="tname"><strong>${c.label}</strong></span>
      <span class="tbar"><div style="width:${readyPct}%"></div></span>
      <span class="tpct">${readyPct}%</span>
      <span class="lvl-count">${c.engineers_ready} ready / ${c.engineers_started} started of ${c.total_items} items</span>
    </div>`;
  }).join("");
}
```

- [ ] **Step 3: Add per-engineer cert chips to the table**

In `renderTable` (`dashboard.js:158-181`), inside the `.map((e) => {...})` row template, build a chips string from `e.certifications` (add this alongside the existing `const disabledBadge = …` / `const toggleBtn = …` lines):

```js
    const certChips = Object.entries(e.certifications || {})
      .map(([id, cp]) => {
        const label = (AGG.certifications.find((c) => c.id === id) || {}).label || id;
        const pct = Math.round((cp.pct || 0) * 100);
        return `<span class="cert-chip${cp.ready ? " ready" : ""}" title="${label}">${label}: ${pct}%</span>`;
      }).join(" ") || "—";
```

Then insert a new cell **between the Competency `<td>` (the `.comp-select`) and the Last-active `<td>`** in the returned row template:

```html
      <td><select class="comp-select" data-user="${e.username}" data-prev="${e.competency || ""}">${options}</select></td>
      <td>${certChips}</td>
      <td><span class="last-active">${new Date(e.last_active).toLocaleDateString()}</span></td>
```

- [ ] **Step 4: Call `renderCertReadiness()` from `renderAll`**

In `dashboard.js` `renderAll` (around `dashboard.js:277`), add the call alongside the other render functions:

```js
  renderCertReadiness();
```

- [ ] **Step 5: Add minimal chip styling to `public/dashboard.css`**

```css
.cert-chip { display:inline-block; font-size:11px; padding:1px 6px; border-radius:10px; background:#e2e8f0; color:#334155; white-space:nowrap; }
.cert-chip.ready { background:#dcfce7; color:#166534; }
```

- [ ] **Step 6: Manual verification (local, admin)**

With `npm run dev` + `http-server` running (as in Task 4) and signed in as an admin user (in `ADMIN_USERNAMES`):

1. Ensure your own progress has at least one `cc.*` item ticked (do it on `cert.html`).
2. Open `http://localhost:8080/dashboard.html`.
3. Expected: a **Certification readiness** card shows `Claude Code` with `X ready / Y started`; the **Engineers** table has a **Certifications** column showing a `Claude Code: N%` chip (green when 100%).
4. Tick more items on `cert.html`, wait for the 5-min cache or restart `npm run dev` (dev may have no KV, so it recomputes each request), reload the dashboard → the numbers update.

- [ ] **Step 7: Commit**

```bash
git add public/dashboard.html public/dashboard.js public/dashboard.css
git commit -m "feat(cert): dashboard certification-readiness view"
```

---

## Task 6: Documentation

**Files:**
- Modify: `CLAUDE.md` (architecture note + Common operations rows)

**Interfaces:** none (docs only).

- [ ] **Step 1: Add a "Certifications" architecture note to `CLAUDE.md`**

Under "## Architecture", after the "### Feedback" subsection, add:

```markdown
### Certifications

A **generic certifications axis** parallel to the competency curriculum, for
self-service prep toward external certification exams (Claude Code first). Like
the curriculum, it is a **registry + path files**: `public/certifications.json`
(the registry: `certifications[].{id,code,label,file}`) and one
`public/certification.<id>.json` per cert (`sections[].items[]`). **Progress
reuses the existing store** — cert prep items are ordinary entries in
`progress/<username>.json`'s `tasks` map, ticked via `POST /api/mark` (which
does not validate ids against the curriculum) and read via `GET /api/me`. Item
IDs are globally unique, prefixed with the cert `code`, and **must be ≤ 32
chars** (the `/api/mark` limit) — enforced by `schema/validate-certifications.mjs`
in CI. The frontend page is `public/cert.html` + `cert.js` (signed-in; token
shared from the tracker). The Worker imports the registry + every path file via
`worker/src/certifications.ts` (`certList()`), and `src/aggregate.ts` runs a
**cert pass** so the dashboard shows per-cert readiness (`engineers_started` /
`engineers_ready`) and per-engineer completion. **Editing cert data needs a
Worker redeploy** for the aggregate to reflect it; **adding a new certification**
additionally needs a new static import in `worker/src/certifications.ts`.
```

- [ ] **Step 2: Add Common operations rows to `CLAUDE.md`**

In the "## Common operations" table, add:

```markdown
| Add a certification | Add `public/certification.<id>.json`, add an entry (with `file`, short `code`) to `public/certifications.json`, add a static import in `worker/src/certifications.ts`, then push (CI validates, Pages redeploys) and `wrangler deploy`. |
| Update a cert's prep tasks | Edit that cert's `public/certification.<id>.json` (keep item ids `<code>.<section>.<n>`, ≤ 32 chars); push (CI validates, Pages redeploys). For the dashboard readiness to reflect it, also `wrangler deploy` (the Worker bundles the JSON). |
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(cert): certifications architecture note + common operations"
```

---

## Final verification (before opening the PR)

- [ ] **Step 1: Validators pass**

Run: `node schema/validate-certifications.mjs` → OK.
Run: `npm install ajv@8 ajv-formats@2 && node schema/validate-curriculum.mjs` → OK (unchanged).

- [ ] **Step 2: Worker suite + typecheck**

Run: `cd worker && npm test && npm run typecheck` → all pass.

- [ ] **Step 3: End-to-end smoke (browser)**

With `npm run dev` + `http-server`: sign in → tracker shows 🎓 Certifications → tick items on `cert.html` → reload persists → dashboard shows readiness card + chips.

- [ ] **Step 4: Deploy notes for the PR body**

The PR must call out that after merge, a **`wrangler deploy` from `worker/`** is required (the Worker bundles `certifications.json` + the cert path files and ships the new aggregate shape); Pages auto-deploys the frontend. Follow-up: reconcile Claude Code starter content against the confirmed official Anthropic exam blueprint.
```
