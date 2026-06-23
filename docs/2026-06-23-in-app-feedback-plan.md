# In-App Feedback → GitHub Issues — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Run `npm run typecheck` and `npm test` from `worker/` after each backend part; verify the frontend manually (no build step / no frontend tests, per the original tracker spec).

> **As shipped (2026-06-23):** two deltas from this plan — the general entry point is a fixed bottom-right "⚑ Feedback" FAB (not a topbar button), and issues are auto-assigned via a `FEEDBACK_ASSIGNEE` var. See the design doc's "Addendum — as shipped" section.

**Goal:** Let engineers report a bug or suggest an improvement from the tracker — per-task or app-wide. A new authenticated `POST /api/feedback` creates a GitHub issue in the public `mykhailo-melnyk/ae-tracker` repo and returns the issue URL. GitHub Issues is the triage board; no new storage, no admin UI.

**Architecture:** Implements `docs/superpowers/specs/2026-06-23-in-app-feedback-design.md`. The endpoint mirrors `handleApiMark` (request in → GitHub write → JSON out) with the same `requireSession` gate and injected `fetchFn`. A new `createIssue` lives in `github.ts`. Issue creation uses a separate least-privilege secret `FEEDBACK_PAT` (Issues:write on the code repo only); `BOT_PAT` is unchanged. The frontend adds a vanilla modal with per-task and general entry points.

**Tech Stack:** Vanilla HTML/JS · Cloudflare Workers (TypeScript) · `@cloudflare/vitest-pool-workers`.

---

## Conventions for this plan

- **Repo root:** `~/Projects/solvd/ae-tracker/`. Spec at `docs/superpowers/specs/2026-06-23-in-app-feedback-design.md`.
- **Branch:** `feature/in-app-feedback` (already created; the spec commit lives here).
- **Two GitHub repos in play:** `ae-tracker-data` (private, `BOT_PAT`, Contents R/W — for the disabled-check progress read) and `ae-tracker` (public, `FEEDBACK_PAT`, Issues R/W — for issue creation). Keep the two configs/tokens distinct.
- **Manual prerequisites (out of code, document them, don't block local unit tests):**
  1. Mint a fine-grained PAT scoped **only** to `mykhailo-melnyk/ae-tracker` with **Issues: Read & Write**; `wrangler secret put FEEDBACK_PAT` (prod) and add to `worker/.dev.vars` (local).
  2. Create a **`feedback`** label in the `ae-tracker` repo once (the Issues API rejects unknown labels).
- **Body caps:** `message` trimmed length 1–2000; `task_id` ≤ 32 chars (matches `/api/mark`'s cap at `api.ts:83`).
- **No deploy / no merge** until Part 5 verification passes. The feature needs a `wrangler deploy` (new route + vars + secret) plus the one-time label.

---

## Part 1 — Storage layer: `createIssue` (`worker/src/github.ts`)

### Task 1.1: Add `createIssue`

**Files:** Modify `worker/src/github.ts`

- [ ] **Step 1:** Add a sibling to `writeJsonFile`, reusing the existing `headers(token)` helper:
  ```ts
  export async function createIssue(
    cfg: RepoConfig,
    issue: { title: string; body: string; labels?: string[] },
    fetchFn: typeof fetch = fetch,
  ): Promise<{ url: string }> {
    const res = await fetchFn(`${API}/repos/${cfg.owner}/${cfg.repo}/issues`, {
      method: "POST",
      headers: { ...headers(cfg.token), "content-type": "application/json" },
      body: JSON.stringify({ title: issue.title, body: issue.body, labels: issue.labels }),
    });
    if (!res.ok) throw new Error(`createIssue ${res.status}: ${await res.text()}`);
    const out = await res.json() as { html_url: string };
    return { url: out.html_url };
  }
  ```
- [ ] **Step 2:** No other change to `github.ts` (it stays the single storage module).

### Task 1.2: Test `createIssue`

**Files:** Modify `worker/test/github.test.ts`

- [ ] **Step 1:** Happy path: stub `fetchFn` asserting `POST` to `…/repos/<owner>/<repo>/issues`, `authorization: Bearer <token>`, and a JSON body carrying `title`/`body`/`labels`; return `{ html_url: "https://github.com/…/issues/7" }`; assert the function returns `{ url: "…/issues/7" }`.
- [ ] **Step 2:** Error path: stub a `422` (e.g. unknown label) → `createIssue` throws with `"createIssue 422"` in the message.
- [ ] **Step 3:** `npm test` green; `npm run typecheck` clean.

---

## Part 2 — Worker: curriculum lookup + `/api/feedback`

### Task 2.1: Expose a task lookup from the registry

**Files:** Modify `worker/src/curriculum.ts`

- [ ] **Step 1:** Build a `taskIndex: Record<string, { competency: string; level: string; title: string }>` once at module load by iterating every path file's `levels[].tasks[]` (key = task `id`, `level` = the level `id`, `title` = task `title`). This gives both validation and body enrichment.
- [ ] **Step 2:** Export `taskInfo(taskId: string): { competency: string; level: string; title: string } | null` returning `taskIndex[taskId] ?? null`.
- [ ] **Step 3:** Export `competencyLabel(id: string): string | undefined` resolving from `MANIFEST.competencies` (id → label) for the issue body.
- [ ] **Step 4:** `npm run typecheck` passes. (Confirm path-file task objects expose `title`; per `curriculum.path.schema.json` `title` is required.)

### Task 2.2: Add config to `Env`

**Files:** Modify `worker/src/index.ts`

- [ ] **Step 1:** Add to the `Env` interface: `FEEDBACK_REPO_OWNER: string;`, `FEEDBACK_REPO_NAME: string;`, `FEEDBACK_PAT: string;`.

### Task 2.3: Implement `handleApiFeedback`

**Files:** Modify `worker/src/api.ts`

- [ ] **Step 1:** Add `handleApiFeedback(request, env, fetchFn = fetch)` following the `handleApiMark` shape:
  - `requireSession` → 401 on failure; keep `{ username, displayName }`.
  - Parse JSON (400 on failure). Body: `{ type?: unknown; message?: unknown; task_id?: unknown }`.
  - Validate (400 on any failure):
    - `type` is exactly `"bug"` or `"improvement"`.
    - `message` is a string; `message.trim().length` in `[1, 2000]`.
    - `task_id` absent **or** a string ≤ 32 chars with `curriculum.taskInfo(task_id) !== null` (reject unknown IDs).
  - Read the submitter's own progress from the **data repo** (`BOT_PAT`) via `readJsonFile<ProgressFile>(dataCfg, progressPath(username), fetchFn)`. If `existing?.data.disabled` → `403 { error: "disabled" }`. Use `existing?.data.competency` for the body (may be undefined).
- [ ] **Step 2:** Build the issue:
  - Look up `info = task_id ? curriculum.taskInfo(task_id) : null`.
  - **Title:** `` `[${type}] ${task_id ? task_id + " — " : ""}${summary}` `` where `summary` = message whitespace-collapsed, sliced to 60 chars, with `…` appended if truncated.
  - **Body (markdown):**
    ```
    **Type:** <type>
    **From:** @<username> (<displayName or username>)
    **Competency:** <competencyLabel(competency) ?? competency ?? "—">
    **Task:** <task_id> — <info.title> (Level <info.level slice>)   // only when info present
    **Page:** <Referer header or "—">
    **Submitted:** <new Date().toISOString()>

    ---

    <message verbatim>
    ```
  - **Labels:** `["feedback"]`.
- [ ] **Step 3:** `const feedbackCfg = { owner: env.FEEDBACK_REPO_OWNER, repo: env.FEEDBACK_REPO_NAME, token: env.FEEDBACK_PAT };` then `const { url } = await createIssue(feedbackCfg, { title, body, labels }, fetchFn);` wrapped in try/catch that `console.error`s and rethrows (becomes a 5xx, same as the mark path). Return `Response.json({ url })`.
- [ ] **Step 4:** Import `createIssue` from `./github` and `* as curriculum from "./curriculum"` in `api.ts` (or pass the registry in from `index.ts` — see Task 2.4; prefer passing it to keep the test seam, matching how `handleApiCompetencies` receives its taxonomy). Decide one approach and keep it consistent.

### Task 2.4: Route it

**Files:** Modify `worker/src/index.ts`

- [ ] **Step 1:** Import `handleApiFeedback` from `./api`.
- [ ] **Step 2:** Add, alongside the other `/api/*` routes: `if (url.pathname === "/api/feedback") return withCors(await handleApiFeedback(request, env), env, request);` (if passing the registry per 2.3 Step 4, thread `curriculum` through like `/api/aggregate` does).
- [ ] **Step 3:** No CORS change needed — `OPTIONS`, `POST`, `authorization`, and `content-type` are already allowed (`index.ts:25`).
- [ ] **Step 4:** `npm run typecheck` passes.

### Task 2.5: Test `/api/feedback`

**Files:** Create `worker/test/feedback.test.ts`

- [ ] **Step 1:** Helper: a stub `fetchFn` that routes by URL — `GET …/contents/progress/<user>.json` returns a base64 `ProgressFile`; `POST …/repos/<feedbackOwner>/<feedbackRepo>/issues` returns `{ html_url }`. Mint a valid session token (reuse the existing test helpers in `api.test.ts`).
- [ ] **Step 2:** Cases:
  - 401 unauthenticated (no token).
  - 400: missing/invalid `type`; empty/whitespace `message`; `message` > 2000; unknown `task_id`.
  - Happy path **with** `task_id`: assert the issue POST body — title starts `"[bug] web-L1.T1 — "`, body contains `@<user>`, the competency line, the task line with the looked-up title/level, and the verbatim message; label `feedback`; response `{ url }` matches the stub `html_url`.
  - Happy path **without** `task_id` (general): title starts `"[improvement] "`, no task line in body.
  - `403 { error: "disabled" }` when the progress read returns `disabled: true` (and assert **no** issue POST was made).
  - GitHub failure: issue POST returns `500` → handler responds 5xx.
- [ ] **Step 3:** `npm test` green; `npm run typecheck` clean.
- [ ] **Step 4:** Commit Part 1–2 (worker is self-consistent):
  ```bash
  git add worker/src worker/test
  git commit -m "feat(feedback): /api/feedback creates a GitHub issue

  Authenticated endpoint takes {type, message, task_id?}, validates against the
  bundled curriculum, reads the submitter's progress for the disabled-lock + competency,
  and opens a labelled issue in the public code repo via a least-privilege FEEDBACK_PAT.
  New createIssue in github.ts; task lookup in the curriculum registry.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```

---

## Part 3 — Frontend: feedback modal + entry points

### Task 3.1: Modal markup + styles

**Files:** Modify `public/tracker.html`, `public/styles.css`

- [ ] **Step 1:** Add a hidden modal block to `tracker.html` (sibling of the existing hidden blocks like `#signed-out`): an overlay + dialog containing a Bug/Improvement toggle, a `<textarea>` (with a live char counter to 2000), helper text **"Submissions are posted as public GitHub issues, including your username."**, a submit button, a cancel/close control, and a result area for the success link / inline error.
- [ ] **Step 2:** Add minimal styles in `styles.css` (overlay, dialog, toggle buttons, disabled-button state, error text), matching the existing visual language.

### Task 3.2: Modal logic + entry points

**Files:** Modify `public/app.js`

- [ ] **Step 1:** Add `openFeedback(taskId)` (taskId optional) that resets the modal, stores the current `taskId`, sets the dialog title (`"Report an issue with <taskId>"` vs `"Send feedback"`), and reveals the overlay. Add a close handler (hide + clear). No-op when `READONLY`.
- [ ] **Step 2:** Per-task entry point: in `renderFocusCard`, add a small `⚑ Report / suggest` control inside each task's `.body` (only when `!READONLY`); wire its click to `openFeedback(task.id)` in the same `querySelectorAll(".task")` loop that wires the checkbox (`app.js:139`). Stop propagation so it doesn't toggle the task.
- [ ] **Step 3:** General entry point: add a "Send feedback" button near `#user-box` (only when `!READONLY`) wired to `openFeedback(null)`.
- [ ] **Step 4:** Submit handler:
  - Read `type` (toggle) and `message`; client-guard non-empty and ≤ 2000.
  - Disable the submit button while in flight (prevents double-submit — the v1 abuse guard).
  - `apiFetch(WORKER + "/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, message, task_id: currentTaskId || undefined }) })`.
  - On success: parse `{ url }`, show **"Thanks — tracked here ↗"** linking `url` (`target="_blank" rel="noopener"`), then clear the textarea; re-enable submit.
  - On failure: show an inline error ("Could not send feedback. Try again in a moment."), re-enable submit (same spirit as `toggleTask`'s catch, but inline rather than `alert`).
- [ ] **Step 5:** Ensure no feedback UI renders in the read-only admin `?as=` view or the disabled-engineer locked screen (both already short-circuit before the tracker renders / set `READONLY`).

---

## Part 4 — Config + docs

### Task 4.1: Wrangler config

**Files:** Modify `worker/wrangler.toml`, `worker/.dev.vars` (local only, gitignored)

- [ ] **Step 1:** Under `[vars]`, add `FEEDBACK_REPO_OWNER = "mykhailo-melnyk"` and `FEEDBACK_REPO_NAME = "ae-tracker"`.
- [ ] **Step 2:** Add `FEEDBACK_PAT=<token>` to `worker/.dev.vars` for local dev (do not commit). Document that prod uses `wrangler secret put FEEDBACK_PAT`.

### Task 4.2: CLAUDE.md

**Files:** Modify `CLAUDE.md`

- [ ] **Step 1:** In the Auth/routing section, note `/api/feedback` (authenticated; creates a GitHub issue in the public code repo via `FEEDBACK_PAT`; not cookie/CORS-special — a normal `/api/*` route).
- [ ] **Step 2:** Add "Common operations" rows: *Set up / rotate the feedback PAT* (fine-grained PAT on `ae-tracker`, Issues R/W; `wrangler secret put FEEDBACK_PAT`) and a note that a **`feedback` label must exist** in `ae-tracker` before the feature works.
- [ ] **Step 3:** Note in Deployment that adding/changing this needs a `wrangler deploy` (new route + vars + secret).

---

## Part 5 — Verification

### Task 5.1: Backend checks

**Files:** none (verification)

- [ ] **Step 1:** From `worker/`: `npm run typecheck` (clean) and `npm test` (green), including the new `feedback.test.ts` and the `createIssue` cases.

### Task 5.2: End-to-end manual verification (local dev)

**Files:** none. Start `wrangler dev` (`worker/`, with `FEEDBACK_PAT` in `.dev.vars`) and `npx http-server public -p 8080 -c-1`. Requires the real `feedback` label to exist in `ae-tracker`.

- [ ] **Step 1 (per-task):** Sign in, pick a competency, open a level, click **⚑ Report / suggest** on a task → modal opens titled for that task. Submit a "bug" → success link appears; open it → a real issue exists in `ae-tracker` with the `[bug] <task-id> — …` title, the task/competency/`@username` body, and the `feedback` label.
- [ ] **Step 2 (general):** Click **Send feedback** in the topbar → modal with no task context. Submit an "improvement" → issue created with `[improvement] …` title and no task line.
- [ ] **Step 3 (validation):** Empty message is blocked client-side; a hand-crafted request with a bad `type`/oversized message/unknown `task_id` returns 400 (e.g. via `curl` with a valid token).
- [ ] **Step 4 (read-only):** Open the dashboard's `?as=<user>` view → no feedback controls render.
- [ ] **Step 5 (failure UX):** Temporarily point `FEEDBACK_REPO_NAME` at a repo without the `feedback` label (or a bad token) → submit shows the inline error and re-enables submit; no crash.
- [ ] **Step 6:** If any step fails, fix before claiming done. Do not `wrangler deploy` or merge until all pass.

### Task 5.3: Final commit + deploy notes

**Files:** none (the frontend/config/docs commits below)

- [ ] **Step 1:** Commit Parts 3–4:
  ```bash
  git add public/ worker/wrangler.toml CLAUDE.md docs/2026-06-23-in-app-feedback-plan.md
  git commit -m "feat(feedback): tracker feedback modal + config/docs

  Per-task and general feedback entry points open a modal that POSTs to /api/feedback.
  Adds FEEDBACK_REPO_* vars and documents the FEEDBACK_PAT secret + required feedback label.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```
- [ ] **Step 2:** Open a PR to `main`. After merge: ensure the `feedback` label exists in `ae-tracker`, `wrangler secret put FEEDBACK_PAT`, then `wrangler deploy` from `worker/`. Pages redeploys the frontend automatically on push.

---

## Self-Review (run after drafting)

- **Spec coverage:** Endpoint + validation + disabled lock → Part 2. `createIssue` storage → Part 1. Separate least-privilege `FEEDBACK_PAT` → Conventions + Task 4.1. Public-repo issue with `@username` → Task 2.3 body. Per-task + general entry points + modal → Part 3. Minimal abuse guard (length cap + in-flight disable) → Task 2.3 / Task 3.2 Step 4. `feedback` label prerequisite → Conventions + Task 4.2. Tests → Tasks 1.2, 2.5.
- **Scope:** One cohesive feature; no unrelated refactors. KV rate limit explicitly deferred.
- **Ordering:** Worker (storage → endpoint → route → tests) lands self-consistent in one commit; frontend + config + docs follow; deploy steps gated behind verification.

## Out of scope (per spec)

- KV-backed per-user rate limiting (deferred; add only if spam appears).
- Any in-app triage / listing / editing of feedback (triage is in GitHub).
- Pre-creating `bug` / `improvement` / `competency:<id>` labels for filterable triage (v1 uses only `feedback` + a title prefix).
- Routing feedback to the private data repo (deliberately chose the public code repo).
- Changes to auth/session/disable/aggregate/export features.
