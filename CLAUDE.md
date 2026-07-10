# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A self-service progress tracker for engineers working through a 5-level agentic-engineering curriculum. Engineers tick off tasks on a static page; admins see aggregate adoption on a dashboard. Canonical curriculum source is the `solvdinc/agentic-engineering` knowledge base (`meta/specs/`, `meta/plans/`); copies under `docs/` here are kept for self-containment.

## Commands

All worker commands run from `worker/`:

```bash
cd worker
npm run dev          # wrangler dev → http://localhost:8787
npm test             # vitest run (one-shot)
npm run test:watch   # vitest watch
npm run typecheck    # tsc --noEmit
npm run deploy       # wrangler deploy (production)
```

Run a single test file or test:

```bash
cd worker
npx vitest run test/session.test.ts
npx vitest run -t "verifySession rejects expired"
```

Frontend (no build step — plain static files):

```bash
npx http-server public -p 8080 -c-1   # → http://localhost:8080
```

## Architecture

Two deployable pieces with **no shared registrable domain**, which drives several non-obvious design choices:

- **Frontend** (`public/`): vanilla HTML/CSS/JS, served by GitHub Pages at `mykhailo-melnyk.github.io/ae-tracker/`. No framework, no bundler. `tracker.html` is the engineer page (`app.js`), `dashboard.html` is the admin page (`dashboard.js`). Both pick the Worker URL at runtime via `window.WORKER_URL` — `localhost`/`127.0.0.1` → `http://localhost:8787`, anything else → the production Worker (see the inline `<script>` in each HTML file). There is no separate dev/prod frontend.
- **Backend** (`worker/`): a single Cloudflare Worker. `src/index.ts` is the only entry point — a hand-rolled `fetch` router. `/auth/*` routes are full-page redirects (no CORS); `/api/*` routes are wrapped in `withCors` against `FRONTEND_ORIGIN`.

### Data flow

There is no database. Per-engineer progress lives as one JSON file per engineer (`progress/<username>.json`) in a **separate private GitHub repo** (`mykhailo-melnyk/ae-tracker-data`), accessed via the GitHub Contents API using a bot PAT (`BOT_PAT`). `src/github.ts` is the entire storage layer (read / write / list). `src/types.ts:ProgressFile` is the on-disk shape. Engineers also carry an optional **`unit_leader`** (plus `unit_leader_set_by` / `unit_leader_updated_at` audit fields) — the GitHub username of the manager who tracks them. It is a **data attribute, not a role**: it grants no access and no scoped view; it only powers the dashboard's unit-leader filter and the export's unit-leader grouping. Anyone who needs dashboard access is added to `ADMIN_USERNAMES`.

The aggregate dashboard (`src/aggregate.ts`) lists the `progress/` directory, reads every file, and computes adoption stats. Results are cached in Cloudflare KV (`AGGREGATE_CACHE` binding) for 5 minutes. **The Worker degrades gracefully when `AGGREGATE_CACHE` is undefined** (recomputes every request) — this is why local dev needs no KV namespace.

### Auth

`src/auth.ts` runs GitHub OAuth (`read:user` scope). On callback success it mints an **HMAC-SHA256-signed session token** (`src/session.ts`, format `<payloadB64>.<macHex>`, 30-day TTL) — there is no session store, the token *is* the session. Admin status is checked by membership in the comma-separated `ADMIN_USERNAMES` var (see `isAdmin` in `api.ts` and the inline check in `aggregate.ts`). A second var `SUPERADMIN_USERNAMES` defines the **super admin** role (intended as a single user) — a superset of admin (`isAdmin` returns true for super admins too) with two extra powers, both super-admin-gated by `isSuperAdmin`: soft-disabling/re-enabling engineers via `POST /api/user/<username>/disabled` (`handleApiUserDisabled`), and **permanently deleting** an engineer's progress file via `POST /api/user/<username>/delete` (`handleApiUserDelete`). Delete is a hard delete — it removes `progress/<username>.json` outright (blocked for self-delete), so it is irreversible and recoverable only via the data repo's git history; disable is the reversible alternative that keeps the file.

**Token transport is the key non-obvious bit.** Frontend (github.io) and Worker (workers.dev) are different registrable domains, so a session *cookie* is third-party and Safari blocks it outright (Firefox-Strict too). So auth is **token-in-header, not cookie**: the OAuth callback redirects to `tracker.html#t=<token>` (token in the URL *fragment* — never sent to a server, not in Referer); `public/auth.js` captures it, stores it in `localStorage`, strips the fragment, and its `apiFetch()` wrapper sends `Authorization: Bearer <token>` on every API call. The Worker reads the token via `tokenFromRequest()` (`session.ts`) which checks the `Authorization` header first, then falls back to a `session` cookie (still set, as a same-origin/Chrome fallback). CORS must allow the `authorization` header (`Access-Control-Allow-Headers` in `index.ts`). Trade-off vs. an HttpOnly cookie: the token is JS-readable, so logout must `clearAuthToken()` (the cookie has no server-side revocation either — it's stateless).

### Concurrency

`/api/mark` uses GitHub's optimistic-concurrency: a write carries the file's current SHA and GitHub returns 409 if it's stale. `handleApiMark` retries up to 4 times — re-read, re-apply, re-write with backoff — so two concurrent ticks by the same user don't clobber each other.

### Feedback

`POST /api/feedback` (`handleApiFeedback` in `api.ts`) lets a signed-in engineer report a bug or suggest an improvement (per-task or general). It validates `{ type: "bug"|"improvement", message, task_id? }` (message ≤ 2000 chars; `task_id`, if present, must be a known curriculum ID), reads the submitter's progress for the disabled-lock and their competency, then opens a GitHub issue via `createIssue` (`github.ts`). Unlike every other write, this targets a **different repo and token**: the public code repo (`FEEDBACK_REPO_OWNER`/`FEEDBACK_REPO_NAME`) using a separate least-privilege secret **`FEEDBACK_PAT`** (Issues R/W), kept distinct from `BOT_PAT`. Issues carry a single `feedback` label (which **must pre-exist** in the repo — GitHub rejects unknown labels); the `[bug]`/`[improvement]` title prefix encodes the type. Every issue is auto-assigned to the comma-separated `FEEDBACK_ASSIGNEE` usernames (must be repo collaborators, else GitHub silently drops them). Submissions (including the `@username`) are publicly visible. The frontend entry points are the per-task "⚑ Report / suggest" link and a floating bottom-right "⚑ Feedback" button (`#feedback-open` in `tracker.html`, revealed for signed-in non-readonly engineers in `public/app.js`); both open the same modal.

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

## Conventions & gotchas

- **The curriculum is a manifest + per-competency path files.** `public/curriculum.json` is the **manifest**: the competency registry (`competencies[].file`) and the shared L1–L5 framework (level `id`/`title`/`subtitle`/`move_on_when`/`link`, **no tasks**). Each `public/curriculum.<id>.json` (e.g. `curriculum.web.json`) is a **path file**: per-level `tasks[]` (+ optional per-level `estimated_hours_*`). **Engineers follow the path for their competency** — there is no single shared task list. **Task IDs are globally unique, competency-prefixed** (`web-L1.T1`); progress is keyed by task ID, so switching competency never collides and preserves prior ticks. Both tiers consume these: the frontend fetches the manifest then the engineer's path file and composes them; the Worker imports the manifest + every path file via the registry (`worker/src/curriculum.ts`, `pathFor(competencyId)`) to compute the aggregate. CI validates everything via `node schema/validate-curriculum.mjs` (manifest → `schema/curriculum.manifest.schema.json`, each path file → `schema/curriculum.path.schema.json`, plus cross-checks: file present, `competency` matches, IDs globally unique + prefixed). When changing curriculum structure, update the relevant schema too. **Editing tasks in an existing path file needs a Worker redeploy** for the aggregate to reflect it (the Worker bundles the JSON); **adding a new competency** additionally needs a new static import in `worker/src/curriculum.ts`.
- **In-repo lesson content lives in `docs/curriculum/`.** Most tasks link to the external `solvdinc/agentic-engineering` KB, but content we can't put there is authored as markdown under `docs/curriculum/` (lesson notes) and `docs/curriculum/assessments/` (per-level rubrics), then linked from a task via its GitHub blob URL (`https://github.com/mykhailo-melnyk/ae-tracker/blob/main/docs/curriculum/<file>`). Every new task `link` must point to a file that actually exists.
- **Worker functions take an injected `fetchFn: typeof fetch = fetch`.** This is for test seams — tests in `worker/test/` pass a stub. Preserve this parameter when adding API handlers.
- **Tests use `@cloudflare/vitest-pool-workers`** (config in `worker/vitest.config.ts`) — they run inside the Workers runtime, not plain Node.
- **Secrets** (`SESSION_SECRET`, `OAUTH_CLIENT_*`, `BOT_PAT`) are Wrangler secrets in production and live in `worker/.dev.vars` for local dev (gitignored). Non-secret vars are in `worker/wrangler.toml` under `[vars]`.

## Deployment

- **Frontend**: GitHub Actions (`.github/workflows/deploy-pages.yml`) auto-deploys `public/` to Pages on push to `main` when `public/**` changes.
- **Worker**: deployed manually with `wrangler deploy` from `worker/` — it is *not* in CI. There is no deployed dev Worker; `wrangler dev` is the dev environment.

## Common operations

| Action | How |
|---|---|
| Add an admin | Edit `ADMIN_USERNAMES` (comma-separated GitHub usernames) in `worker/wrangler.toml`, then `wrangler deploy`. |
| Assign a unit leader | As an admin, use the per-row **Unit leader** dropdown on the dashboard (or `POST /api/user/<username>/leader` with `{leader:"<username>"|null}`). Stored on `progress/<username>.json`; busts the aggregate cache. |
| Add a super admin | Edit `SUPERADMIN_USERNAMES` in `worker/wrangler.toml`, then `wrangler deploy`. Super admins are a *superset* of admins (see the disable/enable controls on the dashboard) — they need not also be in `ADMIN_USERNAMES`. |
| Disable / re-enable an engineer | As a super admin, use the per-row **Disable / Enable** button on the dashboard (or `POST /api/user/<username>/disabled` with `{disabled:true\|false}`). Soft-disable only: it flips `disabled` in `progress/<username>.json` (never moves/deletes the file) — a disabled engineer is blocked from the tracker and hidden from default dashboard stats (surface them via the **Disabled** filter). |
| Delete an engineer (permanent) | As a super admin, use the per-row **Delete** button on the dashboard (or `POST /api/user/<username>/delete`). Hard delete — removes `progress/<username>.json` entirely (self-delete blocked). Irreversible; recoverable only via the `ae-tracker-data` repo's git history. Use **Disable** instead if you may need the data back. |
| Update a competency's tasks | Edit that competency's `public/curriculum.<id>.json` (keep task IDs prefixed `<id>-L<n>.T<m>`); push to `main` (CI validates, Pages redeploys the frontend). For the dashboard aggregate to reflect it, also `wrangler deploy` the Worker (it bundles the JSON). |
| Add a competency | Add `public/curriculum.<id>.json`, add an entry (with `file`) to `public/curriculum.json`'s `competencies`, add a static import for it in `worker/src/curriculum.ts`, then push (CI validates, Pages redeploys) and `wrangler deploy`. |
| Add a certification | Add `public/certification.<id>.json`, add an entry (with `file`, short `code`) to `public/certifications.json`, add a static import in `worker/src/certifications.ts`, then push (CI validates, Pages redeploys) and `wrangler deploy`. |
| Update a cert's prep tasks | Edit that cert's `public/certification.<id>.json` (keep item ids `<code>.<section>.<n>`, ≤ 32 chars); push (CI validates, Pages redeploys). For the dashboard readiness to reflect it, also `wrangler deploy` (the Worker bundles the JSON). |
| Validate the curriculum locally | `npm install ajv@8 ajv-formats@2 && node schema/validate-curriculum.mjs` (same check CI runs). |
| Rotate the bot PAT | New fine-grained PAT scoped to `ae-tracker-data` (Contents R/W), `wrangler secret put BOT_PAT`, revoke old. |
| Set up / rotate the feedback PAT | Fine-grained PAT scoped **only** to `ae-tracker` (Issues R/W), `wrangler secret put FEEDBACK_PAT`, revoke old. Used by `/api/feedback`. |
| Enable the feedback feature | Create a **`feedback` label** in the `ae-tracker` repo (one-time; the Issues API rejects unknown labels), set `FEEDBACK_PAT`, then `wrangler deploy`. |
| Reset an engineer | Edit/delete `progress/<username>.json` in the `ae-tracker-data` repo. |
| Watch logs (live) | `wrangler tail`. |
| Query past logs | Dashboard → Workers → ae-tracker → Logs. Persisted via `[observability]` in `wrangler.toml` (Workers Logs; free tier 200k events/day, 3-day retention). |
