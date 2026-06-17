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

There is no database. Per-engineer progress lives as one JSON file per engineer (`progress/<username>.json`) in a **separate private GitHub repo** (`mykhailo-melnyk/ae-tracker-data`), accessed via the GitHub Contents API using a bot PAT (`BOT_PAT`). `src/github.ts` is the entire storage layer (read / write / list). `src/types.ts:ProgressFile` is the on-disk shape.

The aggregate dashboard (`src/aggregate.ts`) lists the `progress/` directory, reads every file, and computes adoption stats. Results are cached in Cloudflare KV (`AGGREGATE_CACHE` binding) for 5 minutes. **The Worker degrades gracefully when `AGGREGATE_CACHE` is undefined** (recomputes every request) — this is why local dev needs no KV namespace.

### Auth

`src/auth.ts` runs GitHub OAuth (`read:user` scope). On callback success it mints an **HMAC-SHA256-signed session token** (`src/session.ts`, format `<payloadB64>.<macHex>`, 30-day TTL) — there is no session store, the token *is* the session. Admin status is checked by membership in the comma-separated `ADMIN_USERNAMES` var (see `isAdmin` in `api.ts` and the inline check in `aggregate.ts`). A second var `SUPERADMIN_USERNAMES` defines the **super admin** role (intended as a single user) — a superset of admin (`isAdmin` returns true for super admins too) with the sole extra power of soft-disabling/re-enabling engineers via `POST /api/user/<username>/disabled` (`handleApiUserDisabled`, super-admin-gated by `isSuperAdmin`).

**Token transport is the key non-obvious bit.** Frontend (github.io) and Worker (workers.dev) are different registrable domains, so a session *cookie* is third-party and Safari blocks it outright (Firefox-Strict too). So auth is **token-in-header, not cookie**: the OAuth callback redirects to `tracker.html#t=<token>` (token in the URL *fragment* — never sent to a server, not in Referer); `public/auth.js` captures it, stores it in `localStorage`, strips the fragment, and its `apiFetch()` wrapper sends `Authorization: Bearer <token>` on every API call. The Worker reads the token via `tokenFromRequest()` (`session.ts`) which checks the `Authorization` header first, then falls back to a `session` cookie (still set, as a same-origin/Chrome fallback). CORS must allow the `authorization` header (`Access-Control-Allow-Headers` in `index.ts`). Trade-off vs. an HttpOnly cookie: the token is JS-readable, so logout must `clearAuthToken()` (the cookie has no server-side revocation either — it's stateless).

### Concurrency

`/api/mark` uses GitHub's optimistic-concurrency: a write carries the file's current SHA and GitHub returns 409 if it's stale. `handleApiMark` retries up to 4 times — re-read, re-apply, re-write with backoff — so two concurrent ticks by the same user don't clobber each other.

## Conventions & gotchas

- **`curriculum.json` is shared by both tiers.** It lives in `public/` (the frontend fetches it directly) AND is imported into the Worker (`index.ts` imports it as JSON to feed the aggregate). Edits to it are schema-validated in CI against `schema/curriculum.schema.json` (`ajv`). When changing curriculum structure, update the schema too.
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
| Add a super admin | Edit `SUPERADMIN_USERNAMES` in `worker/wrangler.toml`, then `wrangler deploy`. Super admins are a *superset* of admins (see the disable/enable controls on the dashboard) — they need not also be in `ADMIN_USERNAMES`. |
| Disable / re-enable an engineer | As a super admin, use the per-row **Disable / Enable** button on the dashboard (or `POST /api/user/<username>/disabled` with `{disabled:true\|false}`). Soft-disable only: it flips `disabled` in `progress/<username>.json` (never moves/deletes the file) — a disabled engineer is blocked from the tracker and hidden from default dashboard stats (surface them via the **Disabled** filter). |
| Update the curriculum | Edit `public/curriculum.json`; push to `main` (CI validates, Pages redeploys). |
| Rotate the bot PAT | New fine-grained PAT scoped to `ae-tracker-data` (Contents R/W), `wrangler secret put BOT_PAT`, revoke old. |
| Reset an engineer | Edit/delete `progress/<username>.json` in the `ae-tracker-data` repo. |
| Watch logs (live) | `wrangler tail`. |
| Query past logs | Dashboard → Workers → ae-tracker → Logs. Persisted via `[observability]` in `wrangler.toml` (Workers Logs; free tier 200k events/day, 3-day retention). |
