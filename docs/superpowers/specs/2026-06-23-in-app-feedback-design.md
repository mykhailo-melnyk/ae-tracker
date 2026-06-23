# In-App Feedback → GitHub Issues — Design

**Date:** 2026-06-23
**Status:** Approved (pending implementation plan)

## Summary

Give engineers a place inside the tracker to **report a bug** or **suggest an
improvement** — both per-task (a confusing or broken lesson) and app-wide (login,
dashboard, etc.). A new authenticated endpoint `POST /api/feedback` takes a short
report and the Worker synchronously creates a **GitHub issue** in the public code
repo (`mykhailo-melnyk/ae-tracker`). The created issue URL is returned so the
engineer gets a "thanks — tracked here ↗" confirmation. GitHub Issues becomes the
triage board (labels, assignees, comments); there is no new admin UI and no new
storage.

This mirrors the existing `handleApiMark` shape: request in → GitHub write → JSON
out, with the same `requireSession` gate and injected `fetchFn` test seam.

## Goals

- Engineers can submit a bug report or improvement suggestion from the tracker.
- Per-task feedback auto-captures the task ID, level, and competency so triage
  knows exactly which lesson is implicated.
- A general (app-wide) feedback channel for issues not tied to a task.
- Each submission becomes a GitHub issue in the public `ae-tracker` repo, returning
  the issue URL to the submitter.
- The submitter's GitHub identity appears in the issue (publicly visible — accepted
  trade-off) so admins can follow up.

## Non-goals

- No in-app triage / admin view of feedback — triage happens in GitHub.
- No new storage (no JSON files, no DB, no KV requirement).
- No async queue / retry pipeline — issue creation is synchronous in the request.
- No editing or listing of past feedback from the app.
- No KV-backed rate limiting in v1 (see Abuse guard below).

## Privacy note (accepted)

The `ae-tracker` repo is public (it backs GitHub Pages), so every feedback issue —
including the submitter's `@username` and message text — is world-visible. This was
chosen deliberately over the private data repo so bugs live next to the code.
Engineers should be told (modal helper text) that submissions are public.

## Configuration

- New non-secret vars in `worker/wrangler.toml` under `[vars]`:
  - `FEEDBACK_REPO_OWNER` = `mykhailo-melnyk`
  - `FEEDBACK_REPO_NAME` = `ae-tracker`
- New **secret** `FEEDBACK_PAT`: a fine-grained PAT scoped **only** to
  `mykhailo-melnyk/ae-tracker` with **Issues: Read & Write** (least privilege —
  kept separate from `BOT_PAT`, which stays scoped to the data repo with Contents
  R/W). Set via `wrangler secret put FEEDBACK_PAT`; also added to
  `worker/.dev.vars` for local dev.
  - *Rationale:* fine-grained PAT permissions apply to **all** selected repos, so
    widening `BOT_PAT` to the code repo would also grant it Contents-write there. A
    separate token avoids that.
- Add `FEEDBACK_REPO_OWNER`, `FEEDBACK_REPO_NAME`, and `FEEDBACK_PAT: string` to the
  `Env` interface in `index.ts`.

## Storage layer — new `createIssue` (`worker/src/github.ts`)

A small sibling to `writeJsonFile`, keeping `github.ts` the single storage module:

```ts
export async function createIssue(
  cfg: RepoConfig,
  issue: { title: string; body: string; labels?: string[] },
  fetchFn: typeof fetch = fetch,
): Promise<{ url: string }>;
```

- `POST /repos/{owner}/{repo}/issues` with `{ title, body, labels }`, reusing the
  existing `headers(token)` helper.
- On non-OK, throws `Error("createIssue <status>: <body>")` (same convention as
  `writeJsonFile`).
- Returns `{ url: html_url }` from the response.

## New endpoint — `POST /api/feedback` (`worker/src/api.ts`)

- Gated by `requireSession` (401 if no valid token).
- Body: `{ type: "bug" | "improvement", message: string, task_id?: string }`.
- Validation (400 on any failure):
  - `type` is exactly `"bug"` or `"improvement"`.
  - `message` is a non-empty string, trimmed length 1–2000.
  - `task_id`, if present, is a string ≤ 32 chars **and** a known curriculum task ID
    (validated against the bundled curriculum — see below). Unknown IDs are
    rejected so titles/labels can't be poisoned.
- Disabled-engineer lock: read the submitter's own progress file; if `disabled`,
  return `403 { error: "disabled" }` (consistent with `/api/mark`; they can't reach
  the UI, but defense-in-depth).
- Builds the issue (title/body/labels — see below) and calls `createIssue` against
  the feedback repo config (`FEEDBACK_REPO_OWNER/NAME`, `FEEDBACK_PAT`).
- Returns `{ url }` (the issue `html_url`) on success; a GitHub failure surfaces as
  a 5xx (logged via `console.error`, same as the mark path).
- Routed in `index.ts` as `if (url.pathname === "/api/feedback") ...`, wrapped in
  `withCors`.

### Curriculum task-ID validation

The Worker already imports the curriculum via the registry (`worker/src/curriculum.ts`,
`pathFor`/`MANIFEST`). The handler derives the set of valid task IDs from the bundled
path files (across all competencies) to validate `task_id`. If deriving the full set
is awkward, the minimum viable check is: `task_id` matches the `^<comp>-L<n>.T<m>$`
shape **and** `<comp>` is a known competency ID. The plan will pick the cleaner of
the two; the schema guarantees IDs are globally unique and competency-prefixed.

## Issue content & labels

- **Title:**
  - Per-task: `[bug] web-L2.T3 — <first ~60 chars of message>`
  - General: `[improvement] — <first ~60 chars of message>`
  - The `[bug]`/`[improvement]` prefix encodes type even if labels are absent.
- **Body (markdown):**

  ```
  **Type:** bug
  **From:** @username (Display Name)
  **Competency:** web
  **Task:** web-L2.T3 — <task title> (Level 2)   ← omitted for general feedback
  **Page:** <page URL>
  **Submitted:** <ISO timestamp>

  ---

  <the engineer's message, verbatim>
  ```

  Competency and task title/level are looked up from the bundled curriculum when a
  valid `task_id` is supplied; page URL and timestamp come from the request/server.
- **Labels:** a single **`feedback`** label (must be pre-created in the repo — the
  Issues API rejects unknown labels). Type is carried in the title prefix. Optional
  future enhancement: pre-create `bug` / `improvement` / `competency:<id>` labels
  for filterable triage — out of scope for v1.

## Abuse guard (v1: minimal)

Authenticated internal users make abuse low-risk, so v1 keeps it light:

- Server-side `message` length cap (≤ 2000) rejects oversized payloads.
- Frontend disables the submit button while a request is in flight (prevents
  double-submit).

Deferred (not built now): a per-user rate limit (e.g. 1 / 10 s) via a KV namespace
that degrades gracefully when unset, following the `AGGREGATE_CACHE` pattern. Add
only if spam becomes a real problem.

## Frontend (`public/app.js`, `public/tracker.html`, `public/styles.css`)

- **Per-task entry point:** a small "⚑ Report / suggest" link rendered inside each
  task's `.body` in `renderFocusCard`. Clicking opens the modal pre-filled with that
  task's `data-task` ID (and the task title/level for display). Hidden in `READONLY`
  (admin `?as=` view).
- **General entry point:** a "Send feedback" button in the topbar (`#user-box`
  area), opening the modal with no task context.
- **Modal** (new hidden block in `tracker.html`, vanilla JS/CSS — no deps):
  - Type toggle: **Bug** / **Improvement**.
  - Textarea for the message, with helper text noting submissions are public and
    a live char counter against the 2000 cap.
  - Submit → `apiFetch(WORKER + "/api/feedback", { method: "POST", ... })`.
  - Success: show "Thanks — tracked here ↗" linking the returned issue URL, then
    reset/close.
  - Failure: inline error message (same spirit as `toggleTask`'s alert), submit
    re-enabled.
- No feedback UI for disabled engineers (they already hit the locked screen) or in
  the read-only admin view.

## Tests

- **`worker/test/feedback.test.ts`** (new):
  - 401 when unauthenticated.
  - 400 on: missing/invalid `type`; empty message; message > 2000; unknown
    `task_id`.
  - Happy path (with and without `task_id`): asserts the `createIssue` payload —
    title prefix, body fields (submitter, competency, task line, message), and the
    `feedback` label — via a stub `fetchFn`; response carries the issue `url`.
  - `403 { error: "disabled" }` when the submitter is disabled.
  - GitHub failure → 5xx.
- **`worker/test/github.test.ts`** (extend): `createIssue` happy path (correct
  method/URL/body, returns `html_url`) and error path (non-OK throws).

## Docs

- Add `FEEDBACK_REPO_OWNER` / `FEEDBACK_REPO_NAME` to `worker/wrangler.toml` and the
  `Env` interface; note `FEEDBACK_PAT` in `.dev.vars` guidance.
- `CLAUDE.md`: add the `/api/feedback` route to the auth/routing description, and a
  "Common operations" row — *Set up / rotate the feedback PAT* and a note that the
  `feedback` label must exist in the `ae-tracker` repo before the feature works.
- Note in the deploy section that this needs a `wrangler deploy` (new route + var +
  secret) and the one-time `feedback` label creation.
