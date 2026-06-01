---
title: "AE Progress Tracker — Dev/Prod Environments"
area: general
type: reference
owner: mmelnyk
last_reviewed: 2026-06-01
status: draft
---

# AE Progress Tracker — Dev/Prod Environments

> **TL;DR**: Make local development work alongside the live production deployment. Create a parallel dev environment with its own private data repo (`ae-tracker-data-dev`), its own GitHub OAuth App pointing at `localhost`, and its own bot PAT. The Worker stays a single deployed instance (`ae-tracker` on workers.dev) for production; local development runs against `wrangler dev` with overrides from `.dev.vars`. The frontend picks the right Worker URL at runtime by checking `window.location.hostname`.

## Context & Motivation

In Task 10.3 the production OAuth App's callback URL flipped from `http://localhost:8787/auth/callback` to the deployed Worker URL. That fixed production but broke local development: clicking "Sign in with GitHub" from `wrangler dev` redirects to a callback URL the OAuth App no longer accepts, and the flow fails.

A single shared OAuth App can register only one callback URL. To restore local dev without breaking production, we need two OAuth Apps. While we're separating identity providers, we should also separate the data backend: a dev mistake (a wrong commit message format, a regression that corrupts JSON, a typo that overwrites an engineer's `done: true` with `done: false`) currently writes straight into production engineers' progress files. Hard isolation costs ~10 minutes of one-time GitHub setup and removes that whole class of risk forever.

## Decisions Summary

| # | Decision | Rationale |
|---|---|---|
| 1 | Separate **data repo** `mykhailo-melnyk/ae-tracker-data-dev` | Hard isolation — dev writes can never touch a real engineer's progress file. |
| 2 | Separate **OAuth App** "AE Progress Tracker (dev)" with `localhost:8787/auth/callback` | One OAuth App can't have two callback URLs; only way for both to work simultaneously. |
| 3 | Separate **bot PAT** scoped to the dev data repo only | Same principle as #1; if a dev PAT leaks, blast radius is limited to dev data. |
| 4 | **Single Worker** on Cloudflare (`ae-tracker` = prod). Dev runs `wrangler dev` locally only. | Avoids the cost of a deployed dev Worker (extra Cloudflare entity, extra secrets to manage). The local Worker is the dev Worker. |
| 5 | **No dev KV namespace** | The Worker already degrades gracefully when `env.AGGREGATE_CACHE` is undefined. Dev simply computes the aggregate on every request — fine at single-digit user scale. |
| 6 | Frontend picks Worker URL by **runtime hostname detection** | One `public/` works in both contexts. `localhost`/`127.0.0.1` → local Worker, anything else → production. No build step, no file duplication. |
| 7 | Production wrangler config is unchanged; **all dev overrides go in `.dev.vars`** | `.dev.vars` is gitignored, so secrets and dev-only values stay off GitHub. Wrangler reads it automatically on `wrangler dev`. |
| 8 | Existing production OAuth App is **renamed** "AE Progress Tracker (prod)" for clarity | Cosmetic; the name was originally "(dev)" because at registration time the app pointed at localhost. Now misleading. |

## Architecture

```
                     ┌───────────────────────────────────────────────┐
                     │             GitHub OAuth                      │
                     │  ┌──────────────────────┐ ┌────────────────┐  │
                     │  │ AE Tracker (prod)    │ │ AE Tracker(dev)│  │
                     │  │ → workers.dev/cb     │ │ → localhost/cb │  │
                     │  └──────────────────────┘ └────────────────┘  │
                     └───────┬───────────────────────────┬───────────┘
                             │                           │
                             │                           │
   PRODUCTION                ▼              DEV          ▼
┌──────────────────────────────────┐   ┌─────────────────────────────────┐
│ Frontend (Pages)                 │   │ Frontend (npx http-server)      │
│ mykhailo-melnyk.github.io        │   │ localhost:8080                  │
│   /ae-tracker/                   │   │   serves public/ at root        │
│   tracker.html, dashboard.html   │   │   tracker.html, dashboard.html  │
└────────────┬─────────────────────┘   └──────────────┬──────────────────┘
             │                                        │
             ▼  (runtime: not-localhost → prod URL)   ▼  (runtime: localhost → dev URL)
┌──────────────────────────────────┐   ┌─────────────────────────────────┐
│ Worker (Cloudflare)              │   │ Worker (wrangler dev)           │
│ ae-tracker.mihael-melnyk         │   │ localhost:8787                  │
│   .workers.dev                   │   │ (same source, .dev.vars         │
│   wrangler.toml [vars]           │   │  overrides DATA_REPO_NAME etc.) │
└────────────┬─────────────────────┘   └──────────────┬──────────────────┘
             │ bot PAT (prod scope)                   │ bot PAT (dev scope)
             ▼                                        ▼
┌──────────────────────────────────┐   ┌─────────────────────────────────┐
│ Data repo                        │   │ Data repo                       │
│ mykhailo-melnyk/                 │   │ mykhailo-melnyk/                │
│   ae-tracker-data                │   │   ae-tracker-data-dev           │
│   (private)                      │   │   (private, NEW)                │
└──────────────────────────────────┘   └─────────────────────────────────┘
```

The same Worker source, same frontend source, same curriculum.json power both environments. What differs:

- Where the frontend is served (Pages vs. local http-server).
- Where the Worker runs (Cloudflare vs. local wrangler).
- Which OAuth App handles sign-in.
- Which data repo and which bot PAT the Worker talks to.

## Implementation Details

### Frontend: runtime Worker URL detection

The two HTML files currently have a hardcoded production Worker URL. Replace each `<script>` block that sets `window.WORKER_URL` with the same logic:

```html
<script>
  window.WORKER_URL = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
    ? "http://localhost:8787"
    : "https://ae-tracker.mihael-melnyk.workers.dev";
</script>
```

`[::1]` is the IPv6 loopback; some local dev setups (especially on macOS) resolve to IPv6 first.

That's the entire frontend change. The constants for both URLs are public — the production URL is already in committed HTML; the localhost URL is a well-known convention. No security implication.

### Worker: `.dev.vars` overrides everything dev-specific

The Worker source is unchanged. Production behavior is governed by `wrangler.toml`'s `[vars]` block and the four Cloudflare secrets. For local development, `.dev.vars` (gitignored) is read by `wrangler dev` and overrides matching keys at runtime. The final `.dev.vars` looks like:

```
# Secrets — production has different values (Cloudflare-managed)
SESSION_SECRET=<openssl rand -base64 48; do NOT reuse the prod secret>
OAUTH_CLIENT_ID=<from the NEW "AE Progress Tracker (dev)" OAuth App>
OAUTH_CLIENT_SECRET=<from the NEW OAuth App>
BOT_PAT=<NEW fine-grained PAT scoped to ae-tracker-data-dev>

# Var overrides — wrangler.toml has the prod values
DATA_REPO_NAME=ae-tracker-data-dev
FRONTEND_ORIGIN=http://localhost:8080
FRONTEND_BASE_PATH=
```

`DATA_REPO_OWNER` and `ADMIN_USERNAMES` don't need to be overridden — both happen to match prod (`mykhailo-melnyk`).

### Manual GitHub prereqs (one-time setup)

| # | Task | Where |
|---|---|---|
| 1 | Create private repo `mykhailo-melnyk/ae-tracker-data-dev`. Seed `progress/README.md` so the directory exists. | github.com/new |
| 2 | Create a new OAuth App: name "AE Progress Tracker (dev)", homepage `http://localhost:8080`, callback `http://localhost:8787/auth/callback`. Save the Client ID and Secret. | github.com/settings/developers |
| 3 | Create a new fine-grained PAT: name `ae-tracker-bot-dev`, repo access "Only select repositories" → `ae-tracker-data-dev`, Contents → Read & write, 90-day expiry. | github.com/settings/personal-access-tokens/new |
| 4 | Rename the existing OAuth App to "AE Progress Tracker (prod)". | Same OAuth Apps list |

These four steps are documented in the implementation plan; the agent can't perform them.

### How a dev session works after setup

1. User runs `npx http-server public -p 8080 -c-1` in one terminal.
2. User runs `wrangler dev` in another. The Worker boots on `localhost:8787`, reads vars from `wrangler.toml`, overlays `.dev.vars`, gets dev OAuth credentials, dev bot PAT, dev data repo name.
3. User opens `http://localhost:8080/tracker.html`. The page's `<script>` block detects `localhost` and sets `window.WORKER_URL = "http://localhost:8787"`.
4. User clicks "Sign in with GitHub". Worker (dev) builds an authorize URL using the dev OAuth Client ID and the request origin (`http://localhost:8787`). GitHub authorizes against the dev OAuth App; callback to `localhost:8787/auth/callback` succeeds. Session cookie minted, redirect to `http://localhost:8080/tracker.html` (FRONTEND_ORIGIN + FRONTEND_BASE_PATH, both from `.dev.vars`).
5. Marks land in `ae-tracker-data-dev`, never touching production data.

Production behavior is identical to today.

## Error Handling

| Scenario | Behavior |
|---|---|
| User runs `wrangler dev` without filling in `.dev.vars` | Worker fails to start (or returns 502 on first OAuth callback): missing OAUTH_CLIENT_SECRET / BOT_PAT cause secret-undefined errors. Fix: complete `.dev.vars`. |
| User edits `.dev.vars` but didn't restart `wrangler dev` | Stale values in use. Wrangler usually hot-reloads, but secrets/vars sometimes need a restart. Fix: Ctrl+C and `npm run dev` again. |
| Frontend served from a non-recognized hostname (e.g. `192.168.x.x` for LAN testing, or a different localhost alias) | Falls through to production Worker URL — likely 401 + CORS errors. Fix: add the host to the hostname check, or stick to `localhost`/`127.0.0.1`/`[::1]`. |
| Dev OAuth App callback URL is wrong (e.g. user typed `https://` for localhost) | Sign-in fails with "OAuth state mismatch" or "redirect_uri mismatch". Fix: edit the OAuth App, set callback to exactly `http://localhost:8787/auth/callback`. |
| Dev PAT expires (90 days) | `/api/me`, `/api/mark` return 502 from the Worker. Fix: rotate via Step 3 above; `wrangler secret put BOT_PAT` is not relevant (this is for `.dev.vars`, not deployed secrets). |

## Testing

- The Worker's 30 existing unit tests cover the logic and don't depend on which OAuth App / data repo are in use. They continue to pass unchanged.
- The frontend's hostname-detection branch is testable manually: load `tracker.html` from `localhost` → confirm it tries the local Worker; load from `mykhailo-melnyk.github.io` → confirm it tries the production Worker. Both should be verified once after the change.
- New manual verification: a full sign-in → mark task → see commit in `ae-tracker-data-dev` flow, mirroring the original Task 10.5 production smoke test but locally.

## Future Work (out of scope here)

- **Deployable dev Worker.** If we ever want to share a dev build with someone before merging to prod (e.g. for review), add `[env.dev]` to `wrangler.toml` and run `wrangler deploy --env dev`. Would require another KV namespace and Cloudflare secrets. Skip until needed.
- **Auto-rotate PATs.** Both bot PATs expire on a 90-day cycle. Today this is a calendar reminder; future could be a small script + cron that creates the next PAT and uses the GitHub API to update both the local `.dev.vars` (for dev) and Worker secret (for prod).
- **CI for the frontend.** No automated check today catches a typo in the hostname detection JS. The deferred E2E tests (see prior spec) would cover this.

## Open Questions

- None. All decisions made.

## Related Resources

- [Original AE Progress Tracker design](2026-05-27-progress-tracker-design.md) — the system being extended.
- [Original AE Progress Tracker implementation plan](../plans/2026-05-27-progress-tracker-plan.md)
- [Wrangler `.dev.vars` docs](https://developers.cloudflare.com/workers/configuration/secrets/#local-development-with-secrets)
