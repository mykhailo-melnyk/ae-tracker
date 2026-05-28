# AE Progress Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the AE Progress Tracker as specified in `meta/specs/2026-05-27-progress-tracker-design.md`: a static HTML tracker + a Cloudflare Worker brokering GitHub OAuth and per-engineer JSON storage in a private repo, with an admin dashboard for aggregate visibility.

**Architecture:** Two GitHub repos owned by the project owner: `<owner>/ae-tracker` (public, contains both the frontend and the Worker source; GitHub Pages serves the frontend) and `<owner>/ae-tracker-data` (private, holds `progress/<username>.json`). A single Cloudflare Worker handles `/auth/*` and `/api/*` endpoints, signing HttpOnly session cookies and using a fine-grained PAT to read/write the data repo. KV caches the aggregate response for 5 minutes.

**Tech Stack:** TypeScript · Cloudflare Workers · Wrangler CLI · Cloudflare KV · Vitest (`@cloudflare/vitest-pool-workers`) · vanilla HTML/CSS/JS (no frontend framework) · GitHub Pages · GitHub REST API · HMAC-SHA256 for session cookies.

---

## Conventions for this plan

- **`<owner>`** is a parameter — substitute the project owner's GitHub username (`mykhailo-melnyk` for this pilot). The plan calls it `<owner>` everywhere so the migration story (pilot → `solvdinc`) stays in view.
- **Workspace:** all repo-creation tasks happen *outside* the `agentic-engineering` repo. Suggested local layout:
  ```
  ~/Projects/
    agentic-engineering/    # this repo — holds the spec + this plan
    ae-tracker/             # NEW — created in Task 1.1
  ```
- **Commits** follow Conventional Commits, mirroring the `agentic-engineering` repo style (`feat`, `fix`, `chore`, `test`, `docs`). Each task ends with one commit unless it explicitly says otherwise.
- **TDD where it makes sense.** Worker tasks are full red-green-refactor. Frontend tasks have no automated unit tests in v1 (per spec) — verification is manual in a real browser.

---

## File Structure

The implementation creates one new repo (`ae-tracker`) holding both the frontend and the Worker source, plus the data repo. The Worker is a TypeScript subproject under `worker/`; the frontend lives under `public/` (served by GitHub Pages).

```
~/Projects/ae-tracker/
├── README.md                        # Setup + ops instructions (Task 11.1)
├── .gitignore                       # node_modules, .wrangler, .dev.vars
├── public/                          # GitHub Pages serves from here
│   ├── tracker.html                 # Engineer page (Layout C — pill bar)
│   ├── dashboard.html               # Admin dashboard
│   ├── curriculum.json              # Curriculum content (5 levels, ~22 tasks)
│   ├── styles.css                   # Shared styles
│   └── app.js                       # Frontend logic (sign-in, render, mark)
├── schema/
│   └── curriculum.schema.json       # JSON Schema for curriculum.json
├── worker/
│   ├── src/
│   │   ├── index.ts                 # Worker entry: routes /auth/* and /api/*
│   │   ├── session.ts               # Sign/verify HMAC session cookies
│   │   ├── auth.ts                  # OAuth login + callback handlers
│   │   ├── github.ts                # GitHub API: read/write JSON files
│   │   ├── api.ts                   # /api/me, /api/mark, /api/user
│   │   ├── aggregate.ts             # /api/aggregate (with KV cache)
│   │   └── types.ts                 # Shared TypeScript types
│   ├── test/
│   │   ├── session.test.ts
│   │   ├── auth.test.ts
│   │   ├── github.test.ts
│   │   ├── api.test.ts
│   │   └── aggregate.test.ts
│   ├── wrangler.toml                # Cloudflare Workers config
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
└── .github/
    └── workflows/
        ├── validate-curriculum.yml  # CI: schema-validate curriculum.json
        └── deploy-worker.yml        # CI: deploy worker on tagged release
```

**One responsibility per file.** `session.ts` does only HMAC sign/verify. `github.ts` is the only file that calls the GitHub API. `aggregate.ts` owns KV caching. `index.ts` is just the router — no business logic.

---

## Part 0 — Manual Prerequisites (no code)

These tasks are setup the engineer does in the GitHub and Cloudflare UIs. The agent cannot do these for you — but the plan documents them so nothing is forgotten.

### Task 0.1: Create the GitHub OAuth App

**Files:** none (UI work on github.com)

- [ ] **Step 1:** Open <https://github.com/settings/developers> → "OAuth Apps" → "New OAuth App".
- [ ] **Step 2:** Fill in:
  - **Application name:** `AE Progress Tracker (dev)`
  - **Homepage URL:** `https://<owner>.github.io/ae-tracker/` (you'll create this Pages site later — placeholder is fine for now)
  - **Authorization callback URL:** `http://localhost:8787/auth/callback` (we'll update to production later)
- [ ] **Step 3:** Click "Register application". Copy the **Client ID** and click "Generate a new client secret" — copy the **Client Secret**. Save both somewhere you can find them in 30 minutes (e.g. a password manager).
- [ ] **Step 4:** Done. Note: you may need a *second* OAuth App for production with a different callback URL — defer to Task 10.3.

### Task 0.2: Create the private data repo

**Files:** none (UI work on github.com)

- [ ] **Step 1:** Open <https://github.com/new>.
- [ ] **Step 2:** Repo name `ae-tracker-data`, owner `<owner>`, visibility **Private**. **Do not** add a README. Click "Create repository".
- [ ] **Step 3:** Locally:
  ```bash
  cd ~/Projects
  git clone git@github.com:<owner>/ae-tracker-data.git
  cd ae-tracker-data
  mkdir progress
  echo "Progress JSON files committed by the AE Tracker bot." > progress/README.md
  git add . && git commit -m "chore: initial structure"
  git push -u origin main
  cd ..
  ```
- [ ] **Step 4:** Done. The repo now has `progress/README.md` as a single placeholder so the directory exists.

### Task 0.3: Create a fine-grained PAT for the bot

**Files:** none (UI work on github.com)

- [ ] **Step 1:** Open <https://github.com/settings/personal-access-tokens/new>.
- [ ] **Step 2:** Fill in:
  - **Token name:** `ae-tracker-bot`
  - **Expiration:** 90 days (set a calendar reminder to rotate)
  - **Repository access:** "Only select repositories" → choose `<owner>/ae-tracker-data`
  - **Permissions** → Repository permissions → set **Contents** to **Read and write**.
- [ ] **Step 3:** Click "Generate token". **Copy the token now** — it will not be shown again. Save it next to the OAuth secret from Task 0.1.
- [ ] **Step 4:** Done.

### Task 0.4: Cloudflare account + Wrangler install

**Files:** none

- [ ] **Step 1:** If you don't have a Cloudflare account, create one at <https://dash.cloudflare.com/sign-up>. Free tier is sufficient.
- [ ] **Step 2:** Install Wrangler globally:
  ```bash
  npm install -g wrangler@latest
  wrangler --version    # expect: ⛅️ wrangler 3.x or 4.x
  ```
- [ ] **Step 3:** Authenticate:
  ```bash
  wrangler login
  ```
  This opens a browser for OAuth. Complete it.
- [ ] **Step 4:** Verify:
  ```bash
  wrangler whoami    # expect: your Cloudflare email
  ```
- [ ] **Step 5:** Done.

---

## Part 1 — Project Scaffolding

### Task 1.1: Initialize the `ae-tracker` repo locally

**Files:**
- Create: `~/Projects/ae-tracker/README.md`
- Create: `~/Projects/ae-tracker/.gitignore`

- [ ] **Step 1:** Create the directory and initialize git:
  ```bash
  mkdir -p ~/Projects/ae-tracker
  cd ~/Projects/ae-tracker
  git init
  ```
- [ ] **Step 2:** Write `.gitignore`:
  ```gitignore
  # Node
  node_modules/
  npm-debug.log*

  # Wrangler
  .wrangler/
  .dev.vars        # local secrets, NEVER commit

  # Editor
  .DS_Store
  .vscode/
  *.swp
  ```
- [ ] **Step 3:** Write a stub `README.md`:
  ```markdown
  # AE Progress Tracker

  > See `meta/specs/2026-05-27-progress-tracker-design.md` in the `agentic-engineering` repo for the design.
  > Setup & ops instructions added in Task 11.1.
  ```
- [ ] **Step 4:** Commit:
  ```bash
  git add .gitignore README.md
  git commit -m "chore: initial scaffold"
  ```
- [ ] **Step 5:** Create the GitHub repo and push:
  ```bash
  # Use the gh CLI or the GitHub UI to create <owner>/ae-tracker as PUBLIC
  gh repo create <owner>/ae-tracker --public --source=. --remote=origin --push
  # OR manually: create on github.com, then:
  # git remote add origin git@github.com:<owner>/ae-tracker.git
  # git push -u origin main
  ```

### Task 1.2: Scaffold the Worker subproject

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/wrangler.toml`
- Create: `worker/vitest.config.ts`
- Create: `worker/src/index.ts`

- [ ] **Step 1:** Create the Worker directory and initialize npm:
  ```bash
  cd ~/Projects/ae-tracker
  mkdir worker && cd worker
  npm init -y
  ```
- [ ] **Step 2:** Install dependencies:
  ```bash
  npm install --save-dev wrangler typescript @cloudflare/workers-types \
    vitest @cloudflare/vitest-pool-workers @types/node
  ```
- [ ] **Step 3:** Replace `worker/package.json` contents with:
  ```json
  {
    "name": "ae-tracker-worker",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "scripts": {
      "dev": "wrangler dev",
      "deploy": "wrangler deploy",
      "test": "vitest run",
      "test:watch": "vitest",
      "typecheck": "tsc --noEmit"
    },
    "devDependencies": {
      "@cloudflare/vitest-pool-workers": "^0.5.0",
      "@cloudflare/workers-types": "^4.20240800.0",
      "@types/node": "^20.0.0",
      "typescript": "^5.4.0",
      "vitest": "^1.5.0",
      "wrangler": "^3.50.0"
    }
  }
  ```
  (Versions in your install may be newer; that's fine — leave them.)
- [ ] **Step 4:** Write `worker/tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "ES2022",
      "moduleResolution": "Bundler",
      "lib": ["ES2022"],
      "types": ["@cloudflare/workers-types", "vitest/globals"],
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "noEmit": true,
      "isolatedModules": true,
      "resolveJsonModule": true
    },
    "include": ["src/**/*.ts", "test/**/*.ts"]
  }
  ```
- [ ] **Step 5:** Write `worker/wrangler.toml`:
  ```toml
  name = "ae-tracker"
  main = "src/index.ts"
  compatibility_date = "2026-05-27"
  workers_dev = true

  # Vars (non-secret) — secrets are set via `wrangler secret put`
  [vars]
  DATA_REPO_OWNER = "<owner>"
  DATA_REPO_NAME = "ae-tracker-data"
  ADMIN_USERNAMES = "<owner>"  # comma-separated; e.g. "mykhailo-melnyk,jdoe"
  FRONTEND_ORIGIN = "https://<owner>.github.io"

  # KV namespace for aggregate cache (id filled in by Task 10.1)
  # [[kv_namespaces]]
  # binding = "AGGREGATE_CACHE"
  # id = "..."
  ```
- [ ] **Step 6:** Write `worker/vitest.config.ts`:
  ```typescript
  import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

  export default defineWorkersConfig({
    test: {
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.toml" },
        },
      },
    },
  });
  ```
- [ ] **Step 7:** Write a placeholder `worker/src/index.ts`:
  ```typescript
  export interface Env {
    DATA_REPO_OWNER: string;
    DATA_REPO_NAME: string;
    ADMIN_USERNAMES: string;
    FRONTEND_ORIGIN: string;

    // Secrets — set via `wrangler secret put`:
    SESSION_SECRET: string;       // HMAC key for session cookies
    OAUTH_CLIENT_ID: string;
    OAUTH_CLIENT_SECRET: string;
    BOT_PAT: string;              // Fine-grained PAT for the data repo

    // Bindings (set in wrangler.toml):
    AGGREGATE_CACHE?: KVNamespace;
  }

  export default {
    async fetch(request: Request, env: Env): Promise<Response> {
      return new Response("AE Tracker Worker — wire endpoints in Part 4+", {
        status: 200,
      });
    },
  };
  ```
- [ ] **Step 8:** Verify it typechecks:
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.
- [ ] **Step 9:** Verify Vitest runs (no tests yet → "No test files found" is fine):
  ```bash
  npm test
  ```
  Expected: exits 0 (or "no test files" — both OK).
- [ ] **Step 10:** Commit:
  ```bash
  cd ~/Projects/ae-tracker
  git add worker/ .gitignore
  git commit -m "feat(worker): scaffold TypeScript Worker subproject"
  ```

---

## Part 2 — Curriculum

The curriculum is the static content that drives the engineer UI. The exact contents come from `general/getting-started/levels.md` in the `agentic-engineering` repo.

### Task 2.1: Write the curriculum JSON Schema

**Files:**
- Create: `schema/curriculum.schema.json`

- [ ] **Step 1:** Create the schema file:
  ```json
  {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "AE Tracker Curriculum",
    "type": "object",
    "required": ["version", "source", "last_reviewed", "levels"],
    "properties": {
      "version": { "type": "string" },
      "source": { "type": "string" },
      "last_reviewed": { "type": "string", "format": "date" },
      "levels": {
        "type": "array",
        "minItems": 5,
        "maxItems": 5,
        "items": {
          "type": "object",
          "required": ["id", "title", "subtitle", "tasks", "level_complete_when"],
          "properties": {
            "id": { "type": "string", "pattern": "^L[1-5]$" },
            "title": { "type": "string" },
            "subtitle": { "type": "string" },
            "move_on_when": { "type": "string" },
            "level_complete_when": { "type": "string", "enum": ["all_tasks_done"] },
            "tasks": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "required": ["id", "kind", "title"],
                "properties": {
                  "id": { "type": "string", "pattern": "^L[1-5]\\.T[0-9]+$" },
                  "kind": { "type": "string", "enum": ["practice", "course", "checkpoint"] },
                  "title": { "type": "string" },
                  "desc": { "type": "string" },
                  "link": { "type": "string", "format": "uri" },
                  "self_assessment": { "type": "boolean" }
                }
              }
            }
          }
        }
      }
    }
  }
  ```
- [ ] **Step 2:** Commit:
  ```bash
  git add schema/curriculum.schema.json
  git commit -m "feat(schema): add curriculum JSON Schema"
  ```

### Task 2.2: Write `public/curriculum.json`

**Files:**
- Create: `public/curriculum.json`

- [ ] **Step 1:** Create `public/curriculum.json` populated from `levels.md`:
  ```json
  {
    "version": "1.0",
    "source": "general/getting-started/levels.md",
    "last_reviewed": "2026-05-12",
    "levels": [
      {
        "id": "L1",
        "title": "Understand",
        "subtitle": "Use AI to Read, Not Write",
        "move_on_when": "You can tell confident-correct from confident-guessing AI without checking every claim.",
        "level_complete_when": "all_tasks_done",
        "tasks": [
          { "id": "L1.T1", "kind": "practice",   "title": "Ask AI to explain code you already know",
            "desc": "Open a project you know well. Use @-references. Ask AI to walk you through the logic. The point is to build a baseline for spotting hallucinations." },
          { "id": "L1.T2", "kind": "practice",   "title": "Use /btw for side questions",
            "desc": "Try the /btw command mid-task to get quick factual answers without interrupting your flow." },
          { "id": "L1.T3", "kind": "course",     "title": "AI Fluency: Framework & Foundations",
            "desc": "Anthropic's foundational course — free with certificate.",
            "link": "https://www.anthropic.com/learn" },
          { "id": "L1.T4", "kind": "checkpoint", "title": "Spot confident-correct vs confident-guessing AI",
            "desc": "You've caught AI hallucinating a few times and know what that looks like.",
            "self_assessment": true }
        ]
      },
      {
        "id": "L2",
        "title": "Edit with Review",
        "subtitle": "Quality Is the Point — the target level for most engineers at Solvd",
        "move_on_when": "You instinctively review diffs, can look at AI-generated code and say 'this is overcomplicated, simplify' and get a better result.",
        "level_complete_when": "all_tasks_done",
        "tasks": [
          { "id": "L2.T1", "kind": "practice",   "title": "Practice weak vs strong prompts",
            "desc": "Pick a task you'd normally prompt vaguely. Rewrite the prompt with explicit constraints. Compare results." },
          { "id": "L2.T2", "kind": "practice",   "title": "Internalize the diff-review habit",
            "desc": "For one week, read every diff before accepting. Note one thing you caught that you would have missed." },
          { "id": "L2.T3", "kind": "practice",   "title": "Practice the 3-try rule",
            "desc": "When AI doesn't get it right in 3 attempts, the problem is your prompt or context. Reframe instead of retrying." },
          { "id": "L2.T4", "kind": "course",     "title": "Claude Code in Action",
            "desc": "Modes, context control, and the habits that make daily AI usage productive. Free with certificate.",
            "link": "https://www.anthropic.com/learn" },
          { "id": "L2.T5", "kind": "checkpoint", "title": "I instinctively review diffs and ask for simplification",
            "desc": "You no longer accept the first output without reading it.",
            "self_assessment": true }
        ]
      },
      {
        "id": "L3",
        "title": "Plan and Implement",
        "subtitle": "Think Before Building",
        "move_on_when": "You never start multi-file work without Plan mode.",
        "level_complete_when": "all_tasks_done",
        "tasks": [
          { "id": "L3.T1", "kind": "practice",   "title": "Use the 3-step workflow (Context → Plan → Implement) on a real change",
            "desc": "Be explicit about @-references in step 1." },
          { "id": "L3.T2", "kind": "practice",   "title": "Use /branch to compare two approaches",
            "desc": "Fork your session. Try approach A and B. Pick the better one." },
          { "id": "L3.T3", "kind": "course",     "title": "Claude Code in Action — Plan Mode chapters",
            "link": "https://www.anthropic.com/learn" },
          { "id": "L3.T4", "kind": "checkpoint", "title": "I never start >3-file work without a plan",
            "self_assessment": true }
        ]
      },
      {
        "id": "L4",
        "title": "Orchestrate",
        "subtitle": "Multiply Your Output",
        "move_on_when": "You have automated feedback loops; team has shared custom commands.",
        "level_complete_when": "all_tasks_done",
        "tasks": [
          { "id": "L4.T1", "kind": "practice",   "title": "Add a PostToolUse hook for type-checking",
            "desc": "Catch type errors automatically after every edit." },
          { "id": "L4.T2", "kind": "practice",   "title": "Create a team /review custom command",
            "desc": "Codify your team's review checklist." },
          { "id": "L4.T3", "kind": "practice",   "title": "Run a spec-driven implementation end-to-end" },
          { "id": "L4.T4", "kind": "course",     "title": "Agent Skills + Subagents (Anthropic Academy)",
            "link": "https://www.anthropic.com/learn" },
          { "id": "L4.T5", "kind": "checkpoint", "title": "I have an automated feedback loop catching bugs",
            "self_assessment": true }
        ]
      },
      {
        "id": "L5",
        "title": "AI as Architecture Partner",
        "subtitle": "Use AI for thinking, not just doing",
        "move_on_when": "There is no Level 6 — you are using AI to challenge your own assumptions.",
        "level_complete_when": "all_tasks_done",
        "tasks": [
          { "id": "L5.T1", "kind": "practice",   "title": "Run anti-sycophancy prompting on a real decision" },
          { "id": "L5.T2", "kind": "practice",   "title": "Use the evaluator-optimizer pattern" },
          { "id": "L5.T3", "kind": "course",     "title": "Building with the Claude API + MCP",
            "link": "https://www.anthropic.com/learn" },
          { "id": "L5.T4", "kind": "checkpoint", "title": "I use AI to challenge my own assumptions",
            "self_assessment": true }
        ]
      }
    ]
  }
  ```
- [ ] **Step 2:** Validate against the schema. Install `ajv-cli` once:
  ```bash
  npm install -g ajv-cli ajv-formats
  ```
  Then validate:
  ```bash
  ajv validate -s schema/curriculum.schema.json -d public/curriculum.json -c ajv-formats
  ```
  Expected: `public/curriculum.json valid`.
- [ ] **Step 3:** Count tasks (sanity check; spec assumes 22):
  ```bash
  jq '[.levels[].tasks | length] | add' public/curriculum.json
  # expect: 22
  ```
- [ ] **Step 4:** Commit:
  ```bash
  git add public/curriculum.json
  git commit -m "feat(curriculum): seed curriculum.json from levels.md"
  ```

### Task 2.3: CI workflow to schema-validate curriculum on every commit

**Files:**
- Create: `.github/workflows/validate-curriculum.yml`

- [ ] **Step 1:** Write `.github/workflows/validate-curriculum.yml`:
  ```yaml
  name: Validate curriculum

  on:
    push:
      paths:
        - "public/curriculum.json"
        - "schema/curriculum.schema.json"
        - ".github/workflows/validate-curriculum.yml"
    pull_request:
      paths:
        - "public/curriculum.json"
        - "schema/curriculum.schema.json"

  jobs:
    validate:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: "20"
        - run: npm install -g ajv-cli ajv-formats
        - run: ajv validate -s schema/curriculum.schema.json -d public/curriculum.json -c ajv-formats
  ```
- [ ] **Step 2:** Commit & push:
  ```bash
  git add .github/workflows/validate-curriculum.yml
  git commit -m "ci: schema-validate curriculum.json on every commit"
  git push
  ```
- [ ] **Step 3:** Verify CI passes by opening the repo on github.com → Actions tab → most recent run is green.

---

## Part 3 — Worker: Session Cookies (TDD)

The session cookie is the linchpin of auth. Format: `session=<payloadBase64>.<hmacHex>` where payload is `{"u":"<username>","e":<expUnix>}`. HMAC-SHA256 keyed with `SESSION_SECRET`.

### Task 3.1: Session cookie sign + verify (TDD)

**Files:**
- Create: `worker/src/session.ts`
- Create: `worker/test/session.test.ts`

- [ ] **Step 1: Write the failing test** in `worker/test/session.test.ts`:
  ```typescript
  import { describe, it, expect } from "vitest";
  import { signSession, verifySession } from "../src/session";

  const SECRET = "test-secret-32-bytes-long-padding-ok";

  describe("session cookies", () => {
    it("round-trips a username", async () => {
      const cookie = await signSession("mmelnyk", SECRET, 3600);
      const result = await verifySession(cookie, SECRET);
      expect(result).toEqual({ username: "mmelnyk", valid: true });
    });

    it("rejects a tampered payload", async () => {
      const cookie = await signSession("mmelnyk", SECRET, 3600);
      // Swap the payload portion for a different one (different username)
      const [payload, mac] = cookie.split(".");
      const evilPayload = btoa(JSON.stringify({ u: "attacker", e: 9_999_999_999 }));
      const tampered = `${evilPayload}.${mac}`;
      const result = await verifySession(tampered, SECRET);
      expect(result.valid).toBe(false);
    });

    it("rejects a tampered MAC", async () => {
      const cookie = await signSession("mmelnyk", SECRET, 3600);
      const [payload] = cookie.split(".");
      const tampered = `${payload}.deadbeefdeadbeefdeadbeefdeadbeef`;
      const result = await verifySession(tampered, SECRET);
      expect(result.valid).toBe(false);
    });

    it("rejects an expired cookie", async () => {
      // Sign with -1 second TTL → already expired
      const cookie = await signSession("mmelnyk", SECRET, -1);
      const result = await verifySession(cookie, SECRET);
      expect(result.valid).toBe(false);
    });

    it("rejects a wrong-secret cookie", async () => {
      const cookie = await signSession("mmelnyk", SECRET, 3600);
      const result = await verifySession(cookie, "different-secret-32-bytes-padding");
      expect(result.valid).toBe(false);
    });
  });
  ```
- [ ] **Step 2: Run the tests; verify they fail**:
  ```bash
  cd worker && npm test
  ```
  Expected: 5 failures, all "Cannot find module '../src/session'".
- [ ] **Step 3: Write the minimal implementation** in `worker/src/session.ts`:
  ```typescript
  // HMAC-SHA256 session cookie sign/verify.
  // Format: <payloadBase64>.<macHex>
  // Payload: { u: username, e: expUnixSeconds }

  interface Payload { u: string; e: number; }

  async function hmac(key: string, data: string): Promise<string> {
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(key),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  export async function signSession(username: string, secret: string, ttlSeconds: number): Promise<string> {
    const payload: Payload = { u: username, e: Math.floor(Date.now() / 1000) + ttlSeconds };
    const payloadB64 = btoa(JSON.stringify(payload));
    const mac = await hmac(secret, payloadB64);
    return `${payloadB64}.${mac}`;
  }

  export async function verifySession(cookie: string, secret: string): Promise<{ username?: string; valid: boolean }> {
    const parts = cookie.split(".");
    if (parts.length !== 2) return { valid: false };
    const [payloadB64, providedMac] = parts;
    const expectedMac = await hmac(secret, payloadB64);
    if (!timingSafeEqual(providedMac, expectedMac)) return { valid: false };
    let payload: Payload;
    try {
      payload = JSON.parse(atob(payloadB64));
    } catch {
      return { valid: false };
    }
    if (typeof payload.u !== "string" || typeof payload.e !== "number") return { valid: false };
    if (payload.e < Math.floor(Date.now() / 1000)) return { valid: false };
    return { username: payload.u, valid: true };
  }
  ```
- [ ] **Step 4: Run the tests; verify they pass**:
  ```bash
  npm test
  ```
  Expected: 5 passing.
- [ ] **Step 5: Typecheck**:
  ```bash
  npm run typecheck
  ```
  Expected: no errors.
- [ ] **Step 6: Commit**:
  ```bash
  git add worker/src/session.ts worker/test/session.test.ts
  git commit -m "feat(worker): HMAC-signed session cookies with verify"
  ```

---

## Part 4 — Worker: OAuth Flow (TDD)

Two endpoints: `GET /auth/login` redirects to GitHub, `GET /auth/callback` exchanges the code and mints a session cookie.

### Task 4.1: `/auth/login` redirect

**Files:**
- Create: `worker/src/auth.ts`
- Create: `worker/test/auth.test.ts`

- [ ] **Step 1: Write the failing test** for `handleLogin`:
  ```typescript
  // worker/test/auth.test.ts
  import { describe, it, expect } from "vitest";
  import { handleLogin } from "../src/auth";

  const ENV = {
    OAUTH_CLIENT_ID: "client-abc",
    FRONTEND_ORIGIN: "https://example.github.io",
  };

  describe("/auth/login", () => {
    it("redirects to GitHub OAuth authorize with correct params", () => {
      const req = new Request("https://worker.example.com/auth/login");
      const res = handleLogin(req, ENV as any);
      expect(res.status).toBe(302);
      const loc = res.headers.get("Location")!;
      expect(loc.startsWith("https://github.com/login/oauth/authorize")).toBe(true);
      const url = new URL(loc);
      expect(url.searchParams.get("client_id")).toBe("client-abc");
      expect(url.searchParams.get("scope")).toBe("read:user");
      expect(url.searchParams.get("redirect_uri")).toBe("https://worker.example.com/auth/callback");
      expect(url.searchParams.get("state")).toMatch(/^[a-f0-9]{32}$/);
    });
  });
  ```
- [ ] **Step 2: Run; verify failure**:
  ```bash
  npm test -- auth.test
  ```
  Expected: "Cannot find module '../src/auth'".
- [ ] **Step 3: Implement `handleLogin`** in `worker/src/auth.ts`:
  ```typescript
  import type { Env } from "./index";

  function randomState(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  export function handleLogin(request: Request, env: Env): Response {
    const url = new URL(request.url);
    const state = randomState();
    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", env.OAUTH_CLIENT_ID);
    authorizeUrl.searchParams.set("redirect_uri", `${url.origin}/auth/callback`);
    authorizeUrl.searchParams.set("scope", "read:user");
    authorizeUrl.searchParams.set("state", state);

    return new Response(null, {
      status: 302,
      headers: {
        Location: authorizeUrl.toString(),
        "Set-Cookie": `oauth_state=${state}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      },
    });
  }
  ```
- [ ] **Step 4: Run; verify pass**:
  ```bash
  npm test -- auth.test
  ```
  Expected: 1 passing.
- [ ] **Step 5: Commit**:
  ```bash
  git add worker/src/auth.ts worker/test/auth.test.ts
  git commit -m "feat(worker): /auth/login redirect to GitHub OAuth"
  ```

### Task 4.2: `/auth/callback` exchange + session mint

**Files:**
- Modify: `worker/src/auth.ts`
- Modify: `worker/test/auth.test.ts`

- [ ] **Step 1: Add failing tests** for `handleCallback` to `worker/test/auth.test.ts`:
  ```typescript
  import { handleCallback } from "../src/auth";

  describe("/auth/callback", () => {
    const baseEnv = {
      OAUTH_CLIENT_ID: "client-abc",
      OAUTH_CLIENT_SECRET: "secret-xyz",
      SESSION_SECRET: "test-secret-32-bytes-long-padding-ok",
      FRONTEND_ORIGIN: "https://example.github.io",
    } as any;

    function mockFetch(responses: Record<string, any>): typeof fetch {
      return async (url) => {
        const u = typeof url === "string" ? url : (url as Request).url;
        for (const [pattern, body] of Object.entries(responses)) {
          if (u.includes(pattern)) return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
        }
        return new Response("not mocked", { status: 500 });
      };
    }

    it("rejects when state cookie missing", async () => {
      const req = new Request("https://w.example/auth/callback?code=abc&state=foo");
      const res = await handleCallback(req, baseEnv, globalThis.fetch);
      expect(res.status).toBe(400);
    });

    it("rejects when state cookie does not match", async () => {
      const req = new Request("https://w.example/auth/callback?code=abc&state=foo", {
        headers: { Cookie: "oauth_state=bar" },
      });
      const res = await handleCallback(req, baseEnv, globalThis.fetch);
      expect(res.status).toBe(400);
    });

    it("on success: sets session cookie, redirects to frontend tracker", async () => {
      const fetchMock = mockFetch({
        "/login/oauth/access_token": { access_token: "gh-token-123", token_type: "bearer" },
        "api.github.com/user": { login: "mmelnyk", name: "Mykhailo Melnyk" },
      });
      const req = new Request("https://w.example/auth/callback?code=abc&state=goodstate", {
        headers: { Cookie: "oauth_state=goodstate" },
      });
      const res = await handleCallback(req, baseEnv, fetchMock);
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe("https://example.github.io/ae-tracker/tracker.html");
      const setCookie = res.headers.get("Set-Cookie")!;
      expect(setCookie).toMatch(/^session=[^;]+;/);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("Secure");
      expect(setCookie).toContain("SameSite=Lax");
    });
  });
  ```
- [ ] **Step 2: Run; verify failure**:
  ```bash
  npm test -- auth.test
  ```
  Expected: 3 new failures.
- [ ] **Step 3: Implement `handleCallback`** — append to `worker/src/auth.ts`:
  ```typescript
  import { signSession } from "./session";

  const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

  function parseCookies(header: string | null): Record<string, string> {
    if (!header) return {};
    const out: Record<string, string> = {};
    for (const part of header.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k) out[k] = v.join("=");
    }
    return out;
  }

  export async function handleCallback(
    request: Request,
    env: Env,
    fetchFn: typeof fetch = fetch,
  ): Promise<Response> {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookies = parseCookies(request.headers.get("Cookie"));
    const expectedState = cookies["oauth_state"];

    if (!code || !state || !expectedState || state !== expectedState) {
      return new Response("Invalid OAuth state", { status: 400 });
    }

    // Exchange code for access token
    const tokenRes = await fetchFn("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_id: env.OAUTH_CLIENT_ID,
        client_secret: env.OAUTH_CLIENT_SECRET,
        code,
      }),
    });
    if (!tokenRes.ok) return new Response("OAuth token exchange failed", { status: 502 });
    const tokenJson = await tokenRes.json() as { access_token?: string };
    const accessToken = tokenJson.access_token;
    if (!accessToken) return new Response("No access token in response", { status: 502 });

    // Fetch user identity
    const userRes = await fetchFn("https://api.github.com/user", {
      headers: {
        authorization: `Bearer ${accessToken}`,
        "user-agent": "ae-tracker-worker",
        accept: "application/vnd.github+json",
      },
    });
    if (!userRes.ok) return new Response("Failed to fetch GitHub user", { status: 502 });
    const user = await userRes.json() as { login: string; name?: string };

    // Mint session cookie
    const session = await signSession(user.login, env.SESSION_SECRET, SESSION_TTL_SECONDS);

    return new Response(null, {
      status: 302,
      headers: {
        Location: `${env.FRONTEND_ORIGIN}/ae-tracker/tracker.html`,
        "Set-Cookie": `session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`,
      },
    });
  }
  ```
- [ ] **Step 4: Run; verify pass**:
  ```bash
  npm test -- auth.test
  ```
  Expected: 4 passing total.
- [ ] **Step 5: Commit**:
  ```bash
  git add worker/src/auth.ts worker/test/auth.test.ts
  git commit -m "feat(worker): /auth/callback exchanges code and mints session"
  ```

---

## Part 5 — Worker: GitHub Data Repo Client (TDD)

`github.ts` is the only file that hits the GitHub Contents API. Pure functions; takes a `fetch` for testability.

### Task 5.1: Read a JSON file from the data repo

**Files:**
- Create: `worker/src/github.ts`
- Create: `worker/test/github.test.ts`

- [ ] **Step 1: Write failing test**:
  ```typescript
  // worker/test/github.test.ts
  import { describe, it, expect } from "vitest";
  import { readJsonFile } from "../src/github";

  const cfg = { owner: "<owner>", repo: "ae-tracker-data", token: "tok" };

  describe("readJsonFile", () => {
    it("returns parsed JSON and sha when file exists", async () => {
      const fetchMock = (async () => new Response(JSON.stringify({
        sha: "sha-1234",
        content: btoa('{"hello":"world"}'),
        encoding: "base64",
      }), { headers: { "content-type": "application/json" } })) as typeof fetch;

      const result = await readJsonFile(cfg, "progress/mmelnyk.json", fetchMock);
      expect(result).toEqual({ sha: "sha-1234", data: { hello: "world" } });
    });

    it("returns null when file does not exist (404)", async () => {
      const fetchMock = (async () => new Response("not found", { status: 404 })) as typeof fetch;
      const result = await readJsonFile(cfg, "progress/ghost.json", fetchMock);
      expect(result).toBeNull();
    });

    it("throws on other errors", async () => {
      const fetchMock = (async () => new Response("server error", { status: 500 })) as typeof fetch;
      await expect(readJsonFile(cfg, "progress/x.json", fetchMock)).rejects.toThrow();
    });
  });
  ```
- [ ] **Step 2: Run; verify failure**:
  ```bash
  npm test -- github.test
  ```
- [ ] **Step 3: Implement `readJsonFile`** in `worker/src/github.ts`:
  ```typescript
  export interface RepoConfig { owner: string; repo: string; token: string; }
  export interface JsonFile<T> { sha: string; data: T; }

  const API = "https://api.github.com";

  function headers(token: string) {
    return {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "ae-tracker-worker",
      "x-github-api-version": "2022-11-28",
    };
  }

  export async function readJsonFile<T = unknown>(
    cfg: RepoConfig,
    path: string,
    fetchFn: typeof fetch = fetch,
  ): Promise<JsonFile<T> | null> {
    const res = await fetchFn(`${API}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
      headers: headers(cfg.token),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`readJsonFile ${res.status}: ${await res.text()}`);
    const body = await res.json() as { sha: string; content: string; encoding: string };
    if (body.encoding !== "base64") throw new Error(`unexpected encoding: ${body.encoding}`);
    const decoded = atob(body.content.replace(/\n/g, ""));
    return { sha: body.sha, data: JSON.parse(decoded) as T };
  }
  ```
- [ ] **Step 4: Run; verify pass**:
  ```bash
  npm test -- github.test
  ```
  Expected: 3 passing.
- [ ] **Step 5: Commit**:
  ```bash
  git add worker/src/github.ts worker/test/github.test.ts
  git commit -m "feat(worker): GitHub Contents API JSON read"
  ```

### Task 5.2: Write a JSON file (create or update)

**Files:**
- Modify: `worker/src/github.ts`
- Modify: `worker/test/github.test.ts`

- [ ] **Step 1: Add failing tests**:
  ```typescript
  import { writeJsonFile } from "../src/github";

  describe("writeJsonFile", () => {
    it("PUTs content with the SHA when updating", async () => {
      let captured: { url: string; init: RequestInit } | null = null;
      const fetchMock = (async (url: string, init: RequestInit) => {
        captured = { url, init };
        return new Response(JSON.stringify({ content: { sha: "new-sha" } }), { status: 200 });
      }) as typeof fetch;

      await writeJsonFile(cfg, "progress/mmelnyk.json", { tasks: {} }, "old-sha", "msg", fetchMock);

      expect(captured!.init.method).toBe("PUT");
      const body = JSON.parse(captured!.init.body as string);
      expect(body.sha).toBe("old-sha");
      expect(body.message).toBe("msg");
      const decoded = atob(body.content);
      expect(JSON.parse(decoded)).toEqual({ tasks: {} });
    });

    it("omits SHA when creating a new file", async () => {
      let capturedBody: any = null;
      const fetchMock = (async (url: string, init: RequestInit) => {
        capturedBody = JSON.parse(init.body as string);
        return new Response(JSON.stringify({ content: { sha: "new-sha" } }), { status: 201 });
      }) as typeof fetch;

      await writeJsonFile(cfg, "progress/new.json", { tasks: {} }, null, "create", fetchMock);

      expect(capturedBody.sha).toBeUndefined();
    });
  });
  ```
- [ ] **Step 2: Run; verify failure**.
- [ ] **Step 3: Implement `writeJsonFile`** — append to `worker/src/github.ts`:
  ```typescript
  export async function writeJsonFile(
    cfg: RepoConfig,
    path: string,
    data: unknown,
    sha: string | null,
    message: string,
    fetchFn: typeof fetch = fetch,
  ): Promise<{ sha: string }> {
    const content = btoa(JSON.stringify(data, null, 2));
    const body: Record<string, unknown> = { message, content };
    if (sha) body.sha = sha;
    const res = await fetchFn(`${API}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
      method: "PUT",
      headers: { ...headers(cfg.token), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`writeJsonFile ${res.status}: ${await res.text()}`);
    const out = await res.json() as { content: { sha: string } };
    return { sha: out.content.sha };
  }
  ```
- [ ] **Step 4: Run; verify pass.**
- [ ] **Step 5: Commit**:
  ```bash
  git add worker/src/github.ts worker/test/github.test.ts
  git commit -m "feat(worker): GitHub Contents API JSON write (create or update)"
  ```

### Task 5.3: List files in `progress/` directory

**Files:**
- Modify: `worker/src/github.ts`
- Modify: `worker/test/github.test.ts`

- [ ] **Step 1: Add failing test**:
  ```typescript
  import { listDirectory } from "../src/github";

  describe("listDirectory", () => {
    it("returns file names with .json suffix only", async () => {
      const fetchMock = (async () => new Response(JSON.stringify([
        { name: "mmelnyk.json", type: "file", path: "progress/mmelnyk.json" },
        { name: "anna.json", type: "file", path: "progress/anna.json" },
        { name: "README.md", type: "file", path: "progress/README.md" },
        { name: "subdir", type: "dir", path: "progress/subdir" },
      ]), { headers: { "content-type": "application/json" } })) as typeof fetch;

      const result = await listDirectory(cfg, "progress", fetchMock);
      expect(result.map((f) => f.name).sort()).toEqual(["anna.json", "mmelnyk.json"]);
    });
  });
  ```
- [ ] **Step 2: Run; verify failure.**
- [ ] **Step 3: Implement** — append to `worker/src/github.ts`:
  ```typescript
  export interface DirEntry { name: string; path: string; }

  export async function listDirectory(
    cfg: RepoConfig,
    path: string,
    fetchFn: typeof fetch = fetch,
  ): Promise<DirEntry[]> {
    const res = await fetchFn(`${API}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
      headers: headers(cfg.token),
    });
    if (!res.ok) throw new Error(`listDirectory ${res.status}`);
    const body = await res.json() as Array<{ name: string; type: string; path: string }>;
    return body.filter((e) => e.type === "file" && e.name.endsWith(".json"))
               .map((e) => ({ name: e.name, path: e.path }));
  }
  ```
- [ ] **Step 4: Run; verify pass.**
- [ ] **Step 5: Commit**:
  ```bash
  git add worker/src/github.ts worker/test/github.test.ts
  git commit -m "feat(worker): list .json files under a directory"
  ```

---

## Part 6 — Worker: API Endpoints (TDD)

### Task 6.1: `GET /api/me` returns the engineer's progress

**Files:**
- Create: `worker/src/api.ts`
- Create: `worker/src/types.ts`
- Create: `worker/test/api.test.ts`

- [ ] **Step 1:** Write `worker/src/types.ts`:
  ```typescript
  export interface ProgressFile {
    github_username: string;
    display_name?: string;
    created_at: string;
    updated_at: string;
    tasks: Record<string, { done: boolean; at?: string }>;
  }
  ```
- [ ] **Step 2: Write the failing test** in `worker/test/api.test.ts`:
  ```typescript
  import { describe, it, expect } from "vitest";
  import { handleApiMe } from "../src/api";
  import { signSession } from "../src/session";

  const ENV = {
    SESSION_SECRET: "test-secret-32-bytes-long-padding-ok",
    DATA_REPO_OWNER: "<owner>",
    DATA_REPO_NAME: "ae-tracker-data",
    BOT_PAT: "bot-token",
  } as any;

  describe("/api/me", () => {
    it("returns 401 when no session cookie", async () => {
      const req = new Request("https://w.example/api/me");
      const res = await handleApiMe(req, ENV, globalThis.fetch);
      expect(res.status).toBe(401);
    });

    it("returns empty progress when no file exists", async () => {
      const session = await signSession("mmelnyk", ENV.SESSION_SECRET, 3600);
      const req = new Request("https://w.example/api/me", {
        headers: { Cookie: `session=${session}` },
      });
      const fetchMock = (async () => new Response("not found", { status: 404 })) as typeof fetch;
      const res = await handleApiMe(req, ENV, fetchMock);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.github_username).toBe("mmelnyk");
      expect(body.tasks).toEqual({});
    });

    it("returns existing progress when file exists", async () => {
      const session = await signSession("mmelnyk", ENV.SESSION_SECRET, 3600);
      const req = new Request("https://w.example/api/me", {
        headers: { Cookie: `session=${session}` },
      });
      const stored = {
        github_username: "mmelnyk",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-27T00:00:00Z",
        tasks: { "L1.T1": { done: true, at: "2026-05-01T01:00:00Z" } },
      };
      const fetchMock = (async () => new Response(JSON.stringify({
        sha: "sha-1", content: btoa(JSON.stringify(stored)), encoding: "base64",
      }), { headers: { "content-type": "application/json" } })) as typeof fetch;
      const res = await handleApiMe(req, ENV, fetchMock);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.tasks["L1.T1"].done).toBe(true);
    });
  });
  ```
- [ ] **Step 3: Run; verify failure.**
- [ ] **Step 4: Implement** `worker/src/api.ts`:
  ```typescript
  import type { Env } from "./index";
  import { verifySession } from "./session";
  import { readJsonFile } from "./github";
  import type { ProgressFile } from "./types";

  function parseCookie(header: string | null, name: string): string | null {
    if (!header) return null;
    for (const p of header.split(";")) {
      const [k, ...v] = p.trim().split("=");
      if (k === name) return v.join("=");
    }
    return null;
  }

  async function requireSession(request: Request, env: Env): Promise<string | Response> {
    const cookie = parseCookie(request.headers.get("Cookie"), "session");
    if (!cookie) return new Response("unauthenticated", { status: 401 });
    const result = await verifySession(cookie, env.SESSION_SECRET);
    if (!result.valid || !result.username) return new Response("unauthenticated", { status: 401 });
    return result.username;
  }

  function progressPath(username: string): string {
    return `progress/${username}.json`;
  }

  function emptyProgress(username: string): ProgressFile {
    const now = new Date().toISOString();
    return { github_username: username, created_at: now, updated_at: now, tasks: {} };
  }

  export async function handleApiMe(
    request: Request,
    env: Env,
    fetchFn: typeof fetch = fetch,
  ): Promise<Response> {
    const auth = await requireSession(request, env);
    if (auth instanceof Response) return auth;
    const username = auth;
    const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
    const existing = await readJsonFile<ProgressFile>(cfg, progressPath(username), fetchFn);
    const progress = existing?.data ?? emptyProgress(username);
    return Response.json(progress);
  }
  ```
- [ ] **Step 5: Run; verify pass.**
- [ ] **Step 6: Commit**:
  ```bash
  git add worker/src/api.ts worker/src/types.ts worker/test/api.test.ts
  git commit -m "feat(worker): GET /api/me returns engineer's progress"
  ```

### Task 6.2: `POST /api/mark` toggles a task

**Files:**
- Modify: `worker/src/api.ts`
- Modify: `worker/test/api.test.ts`

- [ ] **Step 1: Add failing test**:
  ```typescript
  import { handleApiMark } from "../src/api";

  describe("/api/mark", () => {
    it("returns 401 with no session", async () => {
      const req = new Request("https://w.example/api/mark", { method: "POST", body: "{}" });
      const res = await handleApiMark(req, ENV, globalThis.fetch);
      expect(res.status).toBe(401);
    });

    it("creates a progress file on first mark", async () => {
      const session = await signSession("anna", ENV.SESSION_SECRET, 3600);
      const calls: any[] = [];
      const fetchMock = (async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method ?? "GET", body: init?.body });
        if (init?.method === "PUT") {
          return new Response(JSON.stringify({ content: { sha: "new-sha" } }), { status: 201 });
        }
        // First read: 404 (no existing file)
        return new Response("not found", { status: 404 });
      }) as typeof fetch;
      const req = new Request("https://w.example/api/mark", {
        method: "POST",
        headers: { Cookie: `session=${session}`, "content-type": "application/json" },
        body: JSON.stringify({ task_id: "L1.T1", done: true }),
      });
      const res = await handleApiMark(req, ENV, fetchMock);
      expect(res.status).toBe(200);
      const put = calls.find((c) => c.method === "PUT")!;
      const putBody = JSON.parse(put.body);
      const written = JSON.parse(atob(putBody.content));
      expect(written.tasks["L1.T1"].done).toBe(true);
      expect(written.tasks["L1.T1"].at).toBeTruthy();
    });
  });
  ```
- [ ] **Step 2: Run; verify failure.**
- [ ] **Step 3: Implement** — append to `worker/src/api.ts`:
  ```typescript
  import { writeJsonFile } from "./github";

  export async function handleApiMark(
    request: Request,
    env: Env,
    fetchFn: typeof fetch = fetch,
  ): Promise<Response> {
    const auth = await requireSession(request, env);
    if (auth instanceof Response) return auth;
    const username = auth;

    let body: { task_id?: string; done?: boolean };
    try { body = await request.json(); } catch { return new Response("invalid json", { status: 400 }); }
    if (typeof body.task_id !== "string" || typeof body.done !== "boolean") {
      return new Response("invalid body", { status: 400 });
    }

    const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
    const existing = await readJsonFile<ProgressFile>(cfg, progressPath(username), fetchFn);
    const progress = existing?.data ?? emptyProgress(username);
    const sha = existing?.sha ?? null;

    const now = new Date().toISOString();
    progress.tasks[body.task_id] = body.done ? { done: true, at: now } : { done: false };
    progress.updated_at = now;

    await writeJsonFile(
      cfg,
      progressPath(username),
      progress,
      sha,
      `progress(${username}): ${body.done ? "✓" : "✗"} ${body.task_id}`,
      fetchFn,
    );

    return Response.json(progress);
  }
  ```
- [ ] **Step 4: Run; verify pass.**
- [ ] **Step 5: Commit**:
  ```bash
  git add worker/src/api.ts worker/test/api.test.ts
  git commit -m "feat(worker): POST /api/mark toggles task and persists"
  ```

### Task 6.3: Admin allowlist + `/api/user/:username` (read-only)

**Files:**
- Modify: `worker/src/api.ts`
- Modify: `worker/test/api.test.ts`

- [ ] **Step 1: Add failing tests**:
  ```typescript
  import { handleApiUser } from "../src/api";

  describe("/api/user/:username (admin only)", () => {
    it("returns 403 when caller is not in admin allowlist", async () => {
      const session = await signSession("randomguy", ENV.SESSION_SECRET, 3600);
      const env = { ...ENV, ADMIN_USERNAMES: "mmelnyk" };
      const req = new Request("https://w.example/api/user/mmelnyk", {
        headers: { Cookie: `session=${session}` },
      });
      const res = await handleApiUser(req, env, globalThis.fetch, "mmelnyk");
      expect(res.status).toBe(403);
    });

    it("returns the target user's progress when caller is an admin", async () => {
      const session = await signSession("mmelnyk", ENV.SESSION_SECRET, 3600);
      const env = { ...ENV, ADMIN_USERNAMES: "mmelnyk,anotheradmin" };
      const stored = { github_username: "anna", created_at: "x", updated_at: "y", tasks: {} };
      const fetchMock = (async () => new Response(JSON.stringify({
        sha: "s", content: btoa(JSON.stringify(stored)), encoding: "base64",
      }), { headers: { "content-type": "application/json" } })) as typeof fetch;
      const req = new Request("https://w.example/api/user/anna", {
        headers: { Cookie: `session=${session}` },
      });
      const res = await handleApiUser(req, env, fetchMock, "anna");
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.github_username).toBe("anna");
    });
  });
  ```
- [ ] **Step 2: Run; verify failure.**
- [ ] **Step 3: Implement** — append to `worker/src/api.ts`:
  ```typescript
  function isAdmin(username: string, env: Env): boolean {
    return env.ADMIN_USERNAMES.split(",").map((s) => s.trim()).includes(username);
  }

  export async function handleApiUser(
    request: Request,
    env: Env,
    fetchFn: typeof fetch,
    targetUsername: string,
  ): Promise<Response> {
    const auth = await requireSession(request, env);
    if (auth instanceof Response) return auth;
    if (!isAdmin(auth, env)) return new Response("forbidden", { status: 403 });

    const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
    const existing = await readJsonFile<ProgressFile>(cfg, progressPath(targetUsername), fetchFn);
    return Response.json(existing?.data ?? emptyProgress(targetUsername));
  }
  ```
- [ ] **Step 4: Run; verify pass.**
- [ ] **Step 5: Commit**:
  ```bash
  git add worker/src/api.ts worker/test/api.test.ts
  git commit -m "feat(worker): admin-gated /api/user/:username for read-only view"
  ```

### Task 6.4: `GET /api/aggregate` with KV cache

**Files:**
- Create: `worker/src/aggregate.ts`
- Create: `worker/test/aggregate.test.ts`

- [ ] **Step 1: Write failing test**:
  ```typescript
  // worker/test/aggregate.test.ts
  import { describe, it, expect } from "vitest";
  import { computeAggregate } from "../src/aggregate";

  const cfg = { owner: "x", repo: "y", token: "t" };

  describe("computeAggregate", () => {
    it("computes current level distribution, per-task completion, and stalled count", async () => {
      const curriculum = {
        levels: [
          { id: "L1", tasks: [{ id: "L1.T1" }, { id: "L1.T2" }], level_complete_when: "all_tasks_done" },
          { id: "L2", tasks: [{ id: "L2.T1" }], level_complete_when: "all_tasks_done" },
        ],
      };

      const files: Record<string, any> = {
        "anna.json": {
          github_username: "anna", display_name: "Anna",
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-27T00:00:00Z",
          tasks: { "L1.T1": { done: true, at: "2026-05-27T00:00:00Z" } },
        },
        "ben.json": {
          github_username: "ben", display_name: "Ben",
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-04-01T00:00:00Z", // stale > 14d (assume "now" is 2026-05-27)
          tasks: { "L1.T1": { done: true, at: "2026-04-01T00:00:00Z" },
                   "L1.T2": { done: true, at: "2026-04-01T00:00:00Z" } },
        },
      };

      const fetchMock = (async (url: string) => {
        if (url.endsWith("/contents/progress")) {
          return new Response(JSON.stringify([
            { name: "anna.json", type: "file", path: "progress/anna.json" },
            { name: "ben.json", type: "file", path: "progress/ben.json" },
          ]), { headers: { "content-type": "application/json" } });
        }
        const name = url.split("/").pop()!;
        const f = files[name];
        return new Response(JSON.stringify({
          sha: "s", content: btoa(JSON.stringify(f)), encoding: "base64",
        }), { headers: { "content-type": "application/json" } });
      }) as typeof fetch;

      const now = new Date("2026-05-27T12:00:00Z");
      const agg = await computeAggregate(cfg, curriculum as any, fetchMock, now);

      expect(agg.engineers_started).toBe(2);
      // anna at L1 (one of two L1 tasks done) -> current L1
      // ben completed all L1 tasks -> current L2
      expect(agg.by_current_level).toEqual({ L1: 1, L2: 1 });
      expect(agg.by_task["L1.T1"]).toBe(2);
      expect(agg.by_task["L1.T2"]).toBe(1);
      expect(agg.by_task["L2.T1"]).toBe(0);
      expect(agg.stalled_14d).toBe(1); // ben hasn't updated in >14d
      expect(agg.engineers).toHaveLength(2);
    });
  });
  ```
- [ ] **Step 2: Run; verify failure.**
- [ ] **Step 3: Implement** in `worker/src/aggregate.ts`:
  ```typescript
  import { listDirectory, readJsonFile, type RepoConfig } from "./github";
  import type { ProgressFile } from "./types";

  interface Curriculum {
    levels: Array<{ id: string; tasks: Array<{ id: string }>; level_complete_when: string }>;
  }

  export interface Aggregate {
    as_of: string;
    engineers_started: number;
    by_current_level: Record<string, number>;
    by_task: Record<string, number>;
    stalled_14d: number;
    engineers: Array<{
      username: string;
      display_name?: string;
      current_level: string;
      completion_pct: number;
      last_active: string;
    }>;
  }

  const STALLED_DAYS = 14;

  function currentLevel(progress: ProgressFile, curriculum: Curriculum): string {
    for (const lvl of curriculum.levels) {
      const allDone = lvl.tasks.every((t) => progress.tasks[t.id]?.done === true);
      if (!allDone) return lvl.id;
    }
    return curriculum.levels[curriculum.levels.length - 1].id;
  }

  function lastActive(progress: ProgressFile): string {
    const timestamps = Object.values(progress.tasks)
      .map((t) => t.at).filter((s): s is string => !!s);
    if (timestamps.length === 0) return progress.created_at;
    return timestamps.sort().slice(-1)[0];
  }

  export async function computeAggregate(
    cfg: RepoConfig,
    curriculum: Curriculum,
    fetchFn: typeof fetch,
    now: Date = new Date(),
  ): Promise<Aggregate> {
    const entries = await listDirectory(cfg, "progress", fetchFn);
    const progresses: ProgressFile[] = [];
    for (const e of entries) {
      const result = await readJsonFile<ProgressFile>(cfg, e.path, fetchFn);
      if (result) progresses.push(result.data);
    }
    const totalTasks = curriculum.levels.reduce((n, l) => n + l.tasks.length, 0);
    const allTaskIds = curriculum.levels.flatMap((l) => l.tasks.map((t) => t.id));

    const by_current_level: Record<string, number> = {};
    const by_task: Record<string, number> = Object.fromEntries(allTaskIds.map((id) => [id, 0]));
    let stalled_14d = 0;
    const engineers: Aggregate["engineers"] = [];

    const stallThresholdMs = STALLED_DAYS * 86_400_000;

    for (const p of progresses) {
      const cl = currentLevel(p, curriculum);
      by_current_level[cl] = (by_current_level[cl] ?? 0) + 1;
      for (const id of allTaskIds) {
        if (p.tasks[id]?.done) by_task[id] += 1;
      }
      const la = lastActive(p);
      const isStalled = now.getTime() - new Date(la).getTime() > stallThresholdMs;
      if (isStalled) stalled_14d += 1;
      const done = allTaskIds.filter((id) => p.tasks[id]?.done).length;
      engineers.push({
        username: p.github_username,
        display_name: p.display_name,
        current_level: cl,
        completion_pct: done / totalTasks,
        last_active: la,
      });
    }

    return {
      as_of: now.toISOString(),
      engineers_started: progresses.length,
      by_current_level,
      by_task,
      stalled_14d,
      engineers,
    };
  }
  ```
- [ ] **Step 4: Run; verify pass.**
- [ ] **Step 5: Now wire `/api/aggregate` with KV cache**: append to `worker/src/aggregate.ts`:
  ```typescript
  import type { Env } from "./index";
  import { verifySession } from "./session";

  const CACHE_KEY = "aggregate-v1";
  const CACHE_TTL_SECONDS = 300;

  export async function handleApiAggregate(
    request: Request,
    env: Env,
    curriculum: Curriculum,
    fetchFn: typeof fetch = fetch,
  ): Promise<Response> {
    const cookie = request.headers.get("Cookie")?.split(";")
      .map((p) => p.trim()).find((p) => p.startsWith("session="))?.slice(8);
    if (!cookie) return new Response("unauthenticated", { status: 401 });
    const session = await verifySession(cookie, env.SESSION_SECRET);
    if (!session.valid || !session.username) return new Response("unauthenticated", { status: 401 });
    const admins = env.ADMIN_USERNAMES.split(",").map((s) => s.trim());
    if (!admins.includes(session.username)) return new Response("forbidden", { status: 403 });

    if (env.AGGREGATE_CACHE) {
      const cached = await env.AGGREGATE_CACHE.get(CACHE_KEY);
      if (cached) return new Response(cached, { headers: { "content-type": "application/json" } });
    }
    const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
    const agg = await computeAggregate(cfg, curriculum, fetchFn);
    const body = JSON.stringify(agg);
    if (env.AGGREGATE_CACHE) {
      await env.AGGREGATE_CACHE.put(CACHE_KEY, body, { expirationTtl: CACHE_TTL_SECONDS });
    }
    return new Response(body, { headers: { "content-type": "application/json" } });
  }
  ```
- [ ] **Step 6: Commit**:
  ```bash
  git add worker/src/aggregate.ts worker/test/aggregate.test.ts
  git commit -m "feat(worker): aggregate computation + admin-gated endpoint with KV cache"
  ```

### Task 6.5: Wire all endpoints into `index.ts` router

**Files:**
- Modify: `worker/src/index.ts`

- [ ] **Step 1:** Replace `worker/src/index.ts`:
  ```typescript
  import { handleLogin, handleCallback } from "./auth";
  import { handleApiMe, handleApiMark, handleApiUser } from "./api";
  import { handleApiAggregate } from "./aggregate";
  import curriculum from "../../public/curriculum.json" assert { type: "json" };

  export interface Env {
    DATA_REPO_OWNER: string;
    DATA_REPO_NAME: string;
    ADMIN_USERNAMES: string;
    FRONTEND_ORIGIN: string;
    SESSION_SECRET: string;
    OAUTH_CLIENT_ID: string;
    OAUTH_CLIENT_SECRET: string;
    BOT_PAT: string;
    AGGREGATE_CACHE?: KVNamespace;
  }

  function corsHeaders(env: Env, request: Request): HeadersInit {
    return {
      "Access-Control-Allow-Origin": env.FRONTEND_ORIGIN,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      Vary: "Origin",
    };
  }

  function withCors(response: Response, env: Env, request: Request): Response {
    const newHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders(env, request))) newHeaders.set(k, v as string);
    return new Response(response.body, { status: response.status, headers: newHeaders });
  }

  export default {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(env, request) });
      }

      // /auth/* — no CORS needed (full-page redirects)
      if (url.pathname === "/auth/login") return handleLogin(request, env);
      if (url.pathname === "/auth/callback") return await handleCallback(request, env);

      // /api/*
      if (url.pathname === "/api/me") return withCors(await handleApiMe(request, env), env, request);
      if (url.pathname === "/api/mark") return withCors(await handleApiMark(request, env), env, request);
      if (url.pathname === "/api/aggregate") return withCors(
        await handleApiAggregate(request, env, curriculum as any),
        env, request,
      );
      const userMatch = url.pathname.match(/^\/api\/user\/([\w-]+)$/);
      if (userMatch) return withCors(
        await handleApiUser(request, env, fetch, userMatch[1]),
        env, request,
      );

      return new Response("not found", { status: 404 });
    },
  };
  ```
- [ ] **Step 2:** Update the json import in `worker/tsconfig.json` (`resolveJsonModule` is already true; no change needed).
- [ ] **Step 3: Typecheck + tests**:
  ```bash
  npm run typecheck && npm test
  ```
  Expected: all tests still pass; no type errors.
- [ ] **Step 4: Commit**:
  ```bash
  git add worker/src/index.ts
  git commit -m "feat(worker): route /auth/* and /api/* through one entry point"
  ```

### Task 6.6: Local dev sanity check with `wrangler dev`

**Files:** none (manual verification)

- [ ] **Step 1:** Create `worker/.dev.vars` (NOT committed — git-ignored):
  ```
  SESSION_SECRET=local-dev-secret-32-bytes-padding-ok
  OAUTH_CLIENT_ID=<from Task 0.1>
  OAUTH_CLIENT_SECRET=<from Task 0.1>
  BOT_PAT=<from Task 0.3>
  ```
- [ ] **Step 2:** Run the Worker locally:
  ```bash
  cd worker && npm run dev
  ```
  Expected: `Ready on http://localhost:8787`.
- [ ] **Step 3:** Smoke-check the auth flow in a real browser:
  - Open <http://localhost:8787/auth/login>. Should redirect to GitHub OAuth.
  - Approve. Should redirect to `<FRONTEND_ORIGIN>/ae-tracker/tracker.html` (the page doesn't exist yet — a 404 is expected; the cookie should be set).
  - In DevTools → Application → Cookies, verify `session=...` was set.
- [ ] **Step 4:** Smoke-check `/api/me`:
  ```bash
  # With the session cookie from step 3, curl the API
  curl -i http://localhost:8787/api/me \
    --cookie "session=<paste the value here>"
  ```
  Expected: 200 with `{"github_username":"<your>","tasks":{},...}`.
- [ ] **Step 5:** Smoke-check `/api/mark`:
  ```bash
  curl -i -X POST http://localhost:8787/api/mark \
    --cookie "session=<paste>" \
    -H "content-type: application/json" \
    -d '{"task_id":"L1.T1","done":true}'
  ```
  Expected: 200; verify a commit appeared in `<owner>/ae-tracker-data` on `progress/<your>.json`.
- [ ] **Step 6:** Stop wrangler (`Ctrl+C`). No commit — this is verification only.

---

## Part 7 — Frontend: Engineer Page (Layout C)

The mockup in `.superpowers/brainstorm/.../engineer-ui-C-pills.html` is the visual reference. Steal the CSS/markup from that file; replace mock data with real data from `/api/me`.

### Task 7.1: Skeleton `tracker.html` with sign-in stub

**Files:**
- Create: `public/tracker.html`
- Create: `public/styles.css`
- Create: `public/app.js`

- [ ] **Step 1:** Copy `tracker.html` structure from `engineer-ui-C-pills.html` mockup (in the brainstorm artifacts) into `public/tracker.html`. Strip the `<!DOCTYPE>` preview banner and inline styles; reference `styles.css` and `app.js` externally:
  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AE Tracker</title>
    <link rel="stylesheet" href="styles.css">
  </head>
  <body>
    <div class="topbar">
      <div class="brand">AE Tracker <span class="tag">SOLVD</span></div>
      <div id="user-box" class="user"></div>
    </div>

    <div id="signed-out" class="container hidden">
      <div class="signin-card">
        <h1>Welcome to the AE Tracker</h1>
        <p>Sign in with GitHub to see your personal progress through the 5 levels.</p>
        <a id="signin-link" class="signin-btn" href="">Sign in with GitHub</a>
      </div>
    </div>

    <div id="signed-in" class="container hidden">
      <div class="greeting">
        <div>
          <h1 id="greeting-title">Welcome back</h1>
          <div class="lede" id="greeting-sub"></div>
        </div>
        <div class="totals"><strong id="done-count">0</strong> / <span id="total-count">0</span> tasks done</div>
      </div>

      <div class="pill-bar-wrap"><div class="pill-bar" id="pill-bar"></div></div>
      <div class="focus-card" id="focus-card"></div>
    </div>

    <script>
      window.WORKER_URL = "https://ae-tracker.<your-subdomain>.workers.dev"; // updated in Task 10.1
    </script>
    <script src="curriculum-loader.js"></script>
    <script src="app.js"></script>
  </body>
  </html>
  ```
- [ ] **Step 2:** Copy the styles from the mockup into `public/styles.css`. Also add:
  ```css
  .hidden { display: none; }
  .signin-card { text-align: center; padding: 60px 40px; background: white;
                 border-radius: 12px; border: 1px solid #e2e8f0; max-width: 480px; margin: 80px auto; }
  .signin-btn { display: inline-block; background: #0f172a; color: white; padding: 12px 24px;
                border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 16px; }
  ```
- [ ] **Step 3:** Write `public/app.js` — minimal sign-in detection:
  ```javascript
  const WORKER = window.WORKER_URL;

  async function loadMe() {
    const res = await fetch(WORKER + "/api/me", { credentials: "include" });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error("loadMe failed: " + res.status);
    return res.json();
  }

  async function init() {
    const me = await loadMe();
    if (!me) {
      document.getElementById("signed-out").classList.remove("hidden");
      document.getElementById("signin-link").href = WORKER + "/auth/login";
      return;
    }
    document.getElementById("signed-in").classList.remove("hidden");
    // TODO: render pill bar + focus card (Task 7.3 / 7.4)
    document.getElementById("greeting-title").textContent = "Welcome back, " + me.github_username;
  }

  init().catch((e) => {
    document.body.innerHTML = "<pre style='padding:24px;color:#b91c1c'>" + e.message + "</pre>";
  });
  ```
- [ ] **Step 4:** Local preview. From `~/Projects/ae-tracker`, run a simple static server:
  ```bash
  npx http-server public -p 8080 -c-1
  ```
  Open <http://localhost:8080/tracker.html>. Expected: shows the sign-in card. Clicking "Sign in with GitHub" goes through OAuth (assuming Worker is also running on 8787 via `wrangler dev`).
- [ ] **Step 5:** Commit:
  ```bash
  git add public/tracker.html public/styles.css public/app.js
  git commit -m "feat(frontend): tracker.html skeleton with sign-in"
  ```

### Task 7.2: Load curriculum and render pill bar

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1:** Replace `public/app.js` body so it fetches curriculum.json and renders the 5 pills:
  ```javascript
  const WORKER = window.WORKER_URL;
  let CURRICULUM = null;
  let PROGRESS = null;
  let FOCUS_LEVEL = null;

  async function loadCurriculum() {
    const res = await fetch("curriculum.json");
    if (!res.ok) throw new Error("curriculum load failed");
    return res.json();
  }

  async function loadMe() {
    const res = await fetch(WORKER + "/api/me", { credentials: "include" });
    if (res.status === 401) return null;
    if (!res.ok) throw new Error("loadMe failed: " + res.status);
    return res.json();
  }

  function isLevelComplete(level) {
    return level.tasks.every((t) => PROGRESS.tasks[t.id]?.done);
  }

  function tasksDoneInLevel(level) {
    return level.tasks.filter((t) => PROGRESS.tasks[t.id]?.done).length;
  }

  function computeCurrentLevel() {
    for (const lvl of CURRICULUM.levels) {
      if (!isLevelComplete(lvl)) return lvl.id;
    }
    return CURRICULUM.levels[CURRICULUM.levels.length - 1].id;
  }

  function renderPillBar() {
    const bar = document.getElementById("pill-bar");
    bar.innerHTML = "";
    const currentLevel = computeCurrentLevel();
    for (const lvl of CURRICULUM.levels) {
      const done = tasksDoneInLevel(lvl);
      const total = lvl.tasks.length;
      const complete = done === total;
      const isCurrent = lvl.id === currentLevel;
      const isFocus = lvl.id === FOCUS_LEVEL;
      const cls = complete ? "complete" : (isCurrent && isFocus ? "current" : "");
      const pill = document.createElement("div");
      pill.className = "pill " + cls + (isFocus ? " focused" : "");
      pill.innerHTML = `
        <div class="pill-num">LEVEL ${lvl.id.slice(1)}</div>
        <div class="pill-name">${lvl.title}</div>
        <div class="pill-count">${complete ? "✓ " : ""}${done} / ${total}</div>
        <div class="pill-bar-mini"><div style="width:${(done / total) * 100}%"></div></div>
      `;
      pill.addEventListener("click", () => {
        FOCUS_LEVEL = lvl.id;
        renderPillBar();
        renderFocusCard();
      });
      bar.appendChild(pill);
    }
  }
  ```
- [ ] **Step 2:** Save. Reload the local browser preview. Verify: 5 pills render, the current level is highlighted.
- [ ] **Step 3:** Commit:
  ```bash
  git add public/app.js
  git commit -m "feat(frontend): render pill bar from curriculum + progress"
  ```

### Task 7.3: Render focus card with task list

**Files:**
- Modify: `public/app.js`

- [ ] **Step 1:** Append to `public/app.js`:
  ```javascript
  function renderFocusCard() {
    const card = document.getElementById("focus-card");
    const lvl = CURRICULUM.levels.find((l) => l.id === FOCUS_LEVEL);
    if (!lvl) { card.innerHTML = ""; return; }
    const done = tasksDoneInLevel(lvl);
    const total = lvl.tasks.length;

    const taskHtml = lvl.tasks.map((task) => {
      const isDone = PROGRESS.tasks[task.id]?.done === true;
      return `
        <div class="task ${isDone ? "done" : ""}" data-task="${task.id}">
          <div class="check"></div>
          <div class="body">
            <div class="title">${task.title} <span class="kind-tag ${task.kind}">${task.kind}</span></div>
            ${task.desc ? `<div class="desc">${task.desc}</div>` : ""}
            ${task.link ? `<a class="external" href="${task.link}" target="_blank" rel="noopener">${task.link} ↗</a>` : ""}
          </div>
        </div>`;
    }).join("");

    card.innerHTML = `
      <div class="focus-head">
        <div>
          <span class="level-tag">LEVEL ${lvl.id.slice(1)} · ${lvl.id === computeCurrentLevel() ? "CURRENT" : "PREVIEW"}</span>
          <h2>${lvl.title}</h2>
          <div class="sub">${lvl.subtitle}</div>
        </div>
        <div class="count">${done} / ${total}</div>
      </div>
      ${lvl.move_on_when ? `<div class="move-on"><strong>Move on when:</strong> ${lvl.move_on_when}</div>` : ""}
      ${taskHtml}
    `;
    card.querySelectorAll(".task").forEach((el) => {
      el.querySelector(".check").addEventListener("click", () => toggleTask(el.dataset.task));
    });
  }

  async function toggleTask(taskId) {
    const currentlyDone = PROGRESS.tasks[taskId]?.done === true;
    const newDone = !currentlyDone;
    // Optimistic
    PROGRESS.tasks[taskId] = { done: newDone, at: new Date().toISOString() };
    renderPillBar();
    renderFocusCard();
    // Persist
    try {
      const res = await fetch(WORKER + "/api/mark", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: taskId, done: newDone }),
      });
      if (!res.ok) throw new Error("mark failed: " + res.status);
      PROGRESS = await res.json();
    } catch (e) {
      // Roll back
      PROGRESS.tasks[taskId] = { done: currentlyDone };
      renderPillBar();
      renderFocusCard();
      alert("Could not save your change. Try again in a moment.");
    }
  }
  ```
- [ ] **Step 2:** Replace the `init()` function:
  ```javascript
  async function init() {
    CURRICULUM = await loadCurriculum();
    const me = await loadMe();
    if (!me) {
      document.getElementById("signed-out").classList.remove("hidden");
      document.getElementById("signin-link").href = WORKER + "/auth/login";
      return;
    }
    PROGRESS = me;
    FOCUS_LEVEL = computeCurrentLevel();
    document.getElementById("signed-in").classList.remove("hidden");
    document.getElementById("greeting-title").textContent =
      "Welcome back, " + (me.display_name || me.github_username);
    const lvl = CURRICULUM.levels.find((l) => l.id === FOCUS_LEVEL);
    document.getElementById("greeting-sub").textContent = "Currently at " + lvl.title;
    const totalTasks = CURRICULUM.levels.reduce((n, l) => n + l.tasks.length, 0);
    const done = CURRICULUM.levels.reduce((n, l) => n + tasksDoneInLevel(l), 0);
    document.getElementById("done-count").textContent = done;
    document.getElementById("total-count").textContent = totalTasks;
    renderPillBar();
    renderFocusCard();
  }
  ```
- [ ] **Step 3:** Reload preview. Toggle a checkbox — should flip green, update counters, and (with `wrangler dev` running) trigger a commit in the data repo.
- [ ] **Step 4:** Commit:
  ```bash
  git add public/app.js
  git commit -m "feat(frontend): focus card with task toggling + optimistic UI"
  ```

---

## Part 8 — Frontend: Manager Dashboard

The mockup is `.superpowers/brainstorm/.../manager-dashboard.html`. Strip the preview banner and mock data; replace with a fetch from `/api/aggregate`.

### Task 8.1: Skeleton `dashboard.html` + access check

**Files:**
- Create: `public/dashboard.html`
- Create: `public/dashboard.js`

- [ ] **Step 1:** Create `public/dashboard.html`. Copy the structure (top bar + container with sections for KPIs, bars, task completion, engineer table) from the mockup, swapping mock content for placeholder IDs:
  ```html
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>AE Tracker — Dashboard</title>
    <link rel="stylesheet" href="styles.css">
    <link rel="stylesheet" href="dashboard.css">
  </head>
  <body>
    <div class="topbar">
      <div class="brand">AE Tracker <span class="tag admin">ADMIN</span></div>
      <div class="user"><span id="who"></span></div>
    </div>

    <div id="not-admin" class="container hidden">
      <p style="padding:60px;text-align:center;color:#64748b">
        You do not have access to the dashboard.
        <a href="tracker.html">Go to your tracker →</a>
      </p>
    </div>

    <div id="admin" class="container hidden">
      <div class="page-head">
        <div><h1>Business unit progress</h1><div class="sub">All engineers in the AE pilot · self-reported</div></div>
        <div class="as-of" id="as-of"></div>
      </div>
      <div class="kpis" id="kpis"></div>
      <div class="two-col">
        <div class="card"><h3>Current level distribution</h3><div class="bars" id="bars"></div></div>
        <div class="card"><h3>Task completion rate</h3><div id="task-rates"></div></div>
      </div>
      <div class="card">
        <h3>Engineers</h3>
        <div class="toolbar">
          <input class="search" id="search" placeholder="🔍 Search by name or GitHub handle…">
          <div class="filter-pill active" data-filter="all">All</div>
          <div class="filter-pill" data-filter="L1">L1</div>
          <div class="filter-pill" data-filter="L2">L2</div>
          <div class="filter-pill" data-filter="L3">L3</div>
          <div class="filter-pill" data-filter="L4">L4+</div>
          <div class="filter-pill" data-filter="stalled">Stalled</div>
        </div>
        <table class="engineers"><thead><tr>
          <th>Engineer</th><th>Current</th><th>Completion</th><th>Last active</th><th></th>
        </tr></thead><tbody id="engineers-body"></tbody></table>
      </div>
    </div>

    <script>window.WORKER_URL = "https://ae-tracker.<your-subdomain>.workers.dev";</script>
    <script src="dashboard.js"></script>
  </body>
  </html>
  ```
- [ ] **Step 2:** Create `public/dashboard.css` — copy the dashboard-specific styles from the mockup (KPIs, bars, table).
- [ ] **Step 3:** Write `public/dashboard.js`:
  ```javascript
  const WORKER = window.WORKER_URL;
  let AGG = null;

  async function loadAgg() {
    const res = await fetch(WORKER + "/api/aggregate", { credentials: "include" });
    if (res.status === 401) { window.location = "tracker.html"; return null; }
    if (res.status === 403) { document.getElementById("not-admin").classList.remove("hidden"); return null; }
    if (!res.ok) throw new Error("aggregate failed: " + res.status);
    return res.json();
  }

  function renderKpis() {
    document.getElementById("kpis").innerHTML = `
      <div class="kpi"><div class="lbl">Engineers started</div><div class="val">${AGG.engineers_started}</div></div>
      <div class="kpi"><div class="lbl">At Level 2+</div><div class="val">${
        AGG.engineers.filter((e) => e.current_level !== "L1").length
      }</div></div>
      <div class="kpi"><div class="lbl">Avg completion</div><div class="val">${
        AGG.engineers.length
          ? Math.round(100 * AGG.engineers.reduce((n, e) => n + e.completion_pct, 0) / AGG.engineers.length)
          : 0
      }%</div></div>
      <div class="kpi"><div class="lbl">Stalled (14+ days)</div><div class="val">${AGG.stalled_14d}</div></div>
    `;
  }

  function renderBars() {
    const max = Math.max(...Object.values(AGG.by_current_level), 1);
    const order = ["L1", "L2", "L3", "L4", "L5"];
    const labels = { L1: "Understand", L2: "Edit w/ Review", L3: "Plan", L4: "Orchestrate", L5: "Architecture" };
    document.getElementById("bars").innerHTML = order.map((id) => {
      const v = AGG.by_current_level[id] ?? 0;
      const h = (v / max) * 100;
      return `<div class="bar"><div class="bar-val">${v}</div>
              <div class="bar-fill" style="height:${h}%"></div>
              <div class="bar-lbl"><strong>${id}</strong>${labels[id]}</div></div>`;
    }).join("");
  }

  function renderTaskRates() {
    const total = AGG.engineers_started || 1;
    const rows = Object.entries(AGG.by_task)
      .sort(([, a], [, b]) => b - a)
      .map(([id, n]) => {
        const pct = Math.round((n / total) * 100);
        return `<div class="task-row">
          <span class="tid">${id}</span>
          <span class="tname">${id}</span>
          <span class="tbar"><div style="width:${pct}%"></div></span>
          <span class="tpct">${pct}%</span>
        </div>`;
      }).join("");
    document.getElementById("task-rates").innerHTML = rows;
  }

  let FILTER = "all";
  let SEARCH = "";

  function renderTable() {
    const filtered = AGG.engineers.filter((e) => {
      if (FILTER === "stalled") {
        const ageMs = Date.now() - new Date(e.last_active).getTime();
        if (ageMs < 14 * 86400_000) return false;
      } else if (FILTER === "L4") {
        if (e.current_level !== "L4" && e.current_level !== "L5") return false;
      } else if (FILTER !== "all") {
        if (e.current_level !== FILTER) return false;
      }
      if (SEARCH) {
        const q = SEARCH.toLowerCase();
        return e.username.toLowerCase().includes(q)
            || (e.display_name || "").toLowerCase().includes(q);
      }
      return true;
    });
    document.getElementById("engineers-body").innerHTML = filtered.map((e) => `
      <tr>
        <td><div class="who"><div class="avatar">${(e.display_name || e.username).slice(0, 2).toUpperCase()}</div>
            <div><div class="name">${e.display_name || e.username}</div>
                 <div class="handle">@${e.username}</div></div></div></td>
        <td><span class="level-chip ${e.current_level}">${e.current_level}</span></td>
        <td><div class="pct-cell"><div class="pct-bar"><div style="width:${Math.round(e.completion_pct * 100)}%"></div></div>
            <span class="pct-num">${Math.round(e.completion_pct * 100)}%</span></div></td>
        <td><span class="last-active">${new Date(e.last_active).toLocaleDateString()}</span></td>
        <td style="text-align:right"><a href="tracker.html?as=${e.username}" style="color:#2563eb;font-weight:600">View →</a></td>
      </tr>`).join("");
  }

  function wireFilters() {
    document.querySelectorAll(".filter-pill").forEach((el) => {
      el.addEventListener("click", () => {
        document.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("active"));
        el.classList.add("active");
        FILTER = el.dataset.filter;
        renderTable();
      });
    });
    document.getElementById("search").addEventListener("input", (e) => {
      SEARCH = e.target.value;
      renderTable();
    });
  }

  async function init() {
    AGG = await loadAgg();
    if (!AGG) return;
    document.getElementById("admin").classList.remove("hidden");
    document.getElementById("as-of").textContent = "As of " + new Date(AGG.as_of).toLocaleString();
    renderKpis(); renderBars(); renderTaskRates(); renderTable();
    wireFilters();
  }

  init().catch((e) => {
    document.body.innerHTML = "<pre style='padding:24px;color:#b91c1c'>" + e.message + "</pre>";
  });
  ```
- [ ] **Step 4:** Local preview at <http://localhost:8080/dashboard.html>. With your account in `ADMIN_USERNAMES` and at least one progress file in the data repo, it should render. Otherwise you'll see "not admin" or empty data.
- [ ] **Step 5:** Commit:
  ```bash
  git add public/dashboard.html public/dashboard.css public/dashboard.js
  git commit -m "feat(frontend): admin dashboard with KPIs, distribution, task rates, table"
  ```

---

## Part 9 — Frontend: Read-Only `?as=` Mode

Admin "View →" on the dashboard links to `tracker.html?as=<username>`. The page detects the query param and renders that user's progress read-only.

### Task 9.1: Read-only mode in `tracker.html`

**Files:**
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [ ] **Step 1:** In `public/app.js`, replace `loadMe`:
  ```javascript
  async function loadProgress() {
    const params = new URLSearchParams(window.location.search);
    const as = params.get("as");
    if (as) {
      const res = await fetch(WORKER + "/api/user/" + encodeURIComponent(as), { credentials: "include" });
      if (res.status === 401) return { unauthenticated: true };
      if (res.status === 403) return { forbidden: true };
      if (!res.ok) throw new Error("loadProgress(as) failed: " + res.status);
      return { progress: await res.json(), readonly: true, viewingUsername: as };
    }
    const res = await fetch(WORKER + "/api/me", { credentials: "include" });
    if (res.status === 401) return { unauthenticated: true };
    if (!res.ok) throw new Error("loadMe failed: " + res.status);
    return { progress: await res.json(), readonly: false };
  }
  ```
- [ ] **Step 2:** Replace `init`:
  ```javascript
  let READONLY = false;

  async function init() {
    CURRICULUM = await loadCurriculum();
    const result = await loadProgress();
    if (result.unauthenticated) {
      document.getElementById("signed-out").classList.remove("hidden");
      document.getElementById("signin-link").href = WORKER + "/auth/login";
      return;
    }
    if (result.forbidden) {
      document.body.innerHTML = "<pre style='padding:24px;color:#b91c1c'>Forbidden — admins only.</pre>";
      return;
    }
    PROGRESS = result.progress;
    READONLY = result.readonly;
    FOCUS_LEVEL = computeCurrentLevel();
    document.getElementById("signed-in").classList.remove("hidden");

    const title = READONLY
      ? "Viewing " + (PROGRESS.display_name || PROGRESS.github_username)
      : "Welcome back, " + (PROGRESS.display_name || PROGRESS.github_username);
    document.getElementById("greeting-title").textContent = title;

    if (READONLY) document.body.classList.add("readonly");

    const lvl = CURRICULUM.levels.find((l) => l.id === FOCUS_LEVEL);
    document.getElementById("greeting-sub").textContent = "Currently at " + lvl.title;
    const totalTasks = CURRICULUM.levels.reduce((n, l) => n + l.tasks.length, 0);
    const done = CURRICULUM.levels.reduce((n, l) => n + tasksDoneInLevel(l), 0);
    document.getElementById("done-count").textContent = done;
    document.getElementById("total-count").textContent = totalTasks;
    renderPillBar();
    renderFocusCard();
  }
  ```
- [ ] **Step 3:** Guard `toggleTask`:
  ```javascript
  async function toggleTask(taskId) {
    if (READONLY) return;
    // ...rest unchanged
  }
  ```
- [ ] **Step 4:** Add a CSS rule in `public/styles.css`:
  ```css
  body.readonly .check { cursor: default; opacity: 0.7; }
  body.readonly .task .check:hover { background: inherit; }
  ```
- [ ] **Step 5:** Local preview: open `tracker.html?as=<another-engineer>` as an admin user. Expect: read-only view, no toggling.
- [ ] **Step 6:** Commit:
  ```bash
  git add public/app.js public/styles.css
  git commit -m "feat(frontend): tracker.html?as=<user> read-only mode for admins"
  ```

---

## Part 10 — Deploy

### Task 10.1: Create KV namespace and set Worker secrets

**Files:**
- Modify: `worker/wrangler.toml`

- [ ] **Step 1:** Create KV namespace:
  ```bash
  cd ~/Projects/ae-tracker/worker
  wrangler kv namespace create AGGREGATE_CACHE
  # Output includes an id like: { binding = "AGGREGATE_CACHE", id = "abc123..." }
  ```
- [ ] **Step 2:** Paste the binding into `worker/wrangler.toml`, uncommenting and filling in:
  ```toml
  [[kv_namespaces]]
  binding = "AGGREGATE_CACHE"
  id = "<paste-id-here>"
  ```
- [ ] **Step 3:** Set the four secrets:
  ```bash
  wrangler secret put SESSION_SECRET    # paste a freshly-generated 32+ byte string
  wrangler secret put OAUTH_CLIENT_ID   # from Task 0.1
  wrangler secret put OAUTH_CLIENT_SECRET
  wrangler secret put BOT_PAT           # from Task 0.3
  ```
  Generate a session secret with: `openssl rand -base64 48`.
- [ ] **Step 4:** Verify with `wrangler secret list` — expect 4 entries.
- [ ] **Step 5:** Commit (config only; no secrets):
  ```bash
  git add wrangler.toml
  git commit -m "chore(worker): bind AGGREGATE_CACHE KV namespace"
  ```

### Task 10.2: Deploy the Worker

**Files:** none

- [ ] **Step 1:** Deploy:
  ```bash
  wrangler deploy
  ```
  Expected output includes the Worker URL: `https://ae-tracker.<your-subdomain>.workers.dev`.
- [ ] **Step 2:** Smoke-check:
  ```bash
  curl -i https://ae-tracker.<your-subdomain>.workers.dev/api/me
  # Expected: 401 unauthenticated
  ```
- [ ] **Step 3:** Note the Worker URL — you'll paste it into the frontend in Task 10.4.

### Task 10.3: Update the OAuth App's production callback URL

**Files:** none (UI work)

- [ ] **Step 1:** Open <https://github.com/settings/developers>, select your OAuth App from Task 0.1.
- [ ] **Step 2:** Set **Authorization callback URL** to: `https://ae-tracker.<your-subdomain>.workers.dev/auth/callback`.
- [ ] **Step 3:** (Optional) Create a *second* OAuth App named `AE Progress Tracker (dev)` whose callback stays `http://localhost:8787/auth/callback`, and use different `OAUTH_CLIENT_ID`/`SECRET` values for `wrangler dev` vs production. This avoids constant flipping. For the pilot, one app reused is fine.
- [ ] **Step 4:** Click "Update application".

### Task 10.4: Wire frontend to production Worker + enable GitHub Pages

**Files:**
- Modify: `public/tracker.html`
- Modify: `public/dashboard.html`

- [ ] **Step 1:** In both `public/tracker.html` and `public/dashboard.html`, replace:
  ```html
  <script>window.WORKER_URL = "https://ae-tracker.<your-subdomain>.workers.dev";</script>
  ```
  …with the actual subdomain from Task 10.2.
- [ ] **Step 2:** Commit & push:
  ```bash
  git add public/tracker.html public/dashboard.html
  git commit -m "feat(frontend): wire to production Worker URL"
  git push
  ```
- [ ] **Step 3:** Enable GitHub Pages on the `ae-tracker` repo: github.com → Settings → Pages → Source: "Deploy from a branch" → Branch: `main`, Folder: `/public` → Save.
- [ ] **Step 4:** Wait ~1 minute. Open `https://<owner>.github.io/ae-tracker/tracker.html`. Expected: sign-in card renders.

### Task 10.5: End-to-end smoke test in production

**Files:** none (manual)

- [ ] **Step 1:** Open the production tracker URL in an incognito browser. Click "Sign in with GitHub".
- [ ] **Step 2:** Approve OAuth. Verify you're redirected back and the engineer page renders.
- [ ] **Step 3:** Click a task checkbox. Verify it turns green. Refresh — verify the change persists.
- [ ] **Step 4:** Verify a commit appeared in `<owner>/ae-tracker-data` on `progress/<your>.json`.
- [ ] **Step 5:** Open the dashboard URL. Verify the KPIs, bars, task rates, and your row in the engineers table all render.
- [ ] **Step 6:** From the dashboard, click "View →" on your own row. Verify the read-only tracker view loads with your data.
- [ ] **Step 7:** Sign in from a *second* GitHub account (a coworker's, a personal alt). Mark a task. Verify the second user's row appears on the dashboard.

If anything fails, troubleshoot before continuing. Common issues:
- 401 on `/api/me` after sign-in → CORS or cookie issues. Check `FRONTEND_ORIGIN` matches the Pages origin exactly (no trailing slash).
- "OAuth state mismatch" → the callback URL in the OAuth App doesn't match the Worker URL.
- `/api/aggregate` returns 403 → your username isn't in `ADMIN_USERNAMES` (set via `wrangler secret put` or `[vars]` in wrangler.toml).

---

## Part 11 — Documentation

### Task 11.1: Write the project README

**Files:**
- Modify: `~/Projects/ae-tracker/README.md`

- [ ] **Step 1:** Replace `README.md` with:
  ```markdown
  # AE Progress Tracker

  > See [the design spec](https://github.com/solvdinc/agentic-engineering/blob/main/meta/specs/2026-05-27-progress-tracker-design.md) for the full architecture and decisions.

  ## What this is

  A static page where engineers self-report progress through the 5-level curriculum from `general/getting-started/levels.md` in the `agentic-engineering` knowledge base. An admin dashboard surfaces aggregate adoption for the project owner and a small allowlist of leads.

  ## How it's built

  - **Frontend:** vanilla HTML/CSS/JS in `public/`, served by GitHub Pages.
  - **Backend:** a single Cloudflare Worker (`worker/`) that brokers GitHub OAuth and reads/writes per-engineer JSON files in a private data repo (`<owner>/ae-tracker-data`).
  - **Auth:** GitHub OAuth → HMAC-signed session cookie (HttpOnly, Secure, 30d TTL).
  - **Storage:** GitHub Contents API. One JSON file per engineer.
  - **Cache:** Cloudflare KV stores the aggregate response for 5 minutes.

  ## Operate

  | Action | How |
  |---|---|
  | Add an admin | Edit `ADMIN_USERNAMES` (comma-separated GitHub usernames) in `worker/wrangler.toml`, then `wrangler deploy`. |
  | Rotate the bot PAT | Issue a new PAT (Task 0.3 in the implementation plan), `wrangler secret put BOT_PAT`, revoke the old PAT. |
  | Update the curriculum | Edit `public/curriculum.json` (CI schema-validates on push); push to `main`; Pages redeploys automatically. |
  | Reset a stuck engineer | Delete or edit `progress/<username>.json` in the `ae-tracker-data` repo. |
  | Watch logs | `wrangler tail` (live Worker logs). |

  ## Local development

  ```bash
  # Frontend
  npx http-server public -p 8080 -c-1   # http://localhost:8080

  # Worker
  cd worker && npm run dev               # http://localhost:8787

  # Tests
  cd worker && npm test
  ```

  Set `worker/.dev.vars` with `SESSION_SECRET`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `BOT_PAT`. Do not commit this file.
  ```
- [ ] **Step 2:** Commit & push:
  ```bash
  git add README.md
  git commit -m "docs: project README with ops + local-dev instructions"
  git push
  ```

---

## Self-Review (already run)

- **Spec coverage:** every section in the spec is implemented by at least one task. Architecture → Parts 1, 3-6. Data model → Tasks 2.1, 2.2, 6.1-6.4. UI Layout C → Tasks 7.1-7.3. Manager dashboard → Tasks 8.1. Access control → Task 6.3, 6.4. Error handling: most cases are covered by the code in Parts 5-6 (404 on missing file, last-write-wins via reading SHA, etc.); the leakage/rotation cases are in the README (Task 11.1). Testing → Worker unit tests interleaved throughout; manual QA scripted in Task 10.5.
- **Placeholder scan:** `<owner>` is used as a deliberate parameter (documented at top). `<your-subdomain>` is a real Cloudflare-issued value the engineer fills in after Task 10.2. No "TBD" or "fill in" lurking.
- **Type consistency:** `Env` interface is defined once in `index.ts` and imported by every consumer. `ProgressFile` is defined once in `types.ts`. `RepoConfig` is defined once in `github.ts`. Function names are consistent across tasks (`signSession`/`verifySession`, `readJsonFile`/`writeJsonFile`, `handleApiMe`/`handleApiMark`/`handleApiUser`).
- **Scope:** the plan touches one cohesive system; no orphan tasks.

---

## Out of scope (deferred to Future Work)

- Email-domain gate on sign-in
- Org migration to `solvdinc`
- Engineer leaderboard
- Time-series snapshots
- Self-served admin allowlist (PR-based)
- Confluence/Teams integration

Add these as separate plans when prioritized.
