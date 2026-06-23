# AE Progress Tracker

> **Design & plan:** [`docs/2026-05-27-progress-tracker-design.md`](docs/2026-05-27-progress-tracker-design.md) (architecture + decisions) · [`docs/2026-05-27-progress-tracker-plan.md`](docs/2026-05-27-progress-tracker-plan.md) (step-by-step implementation plan). Canonical source is the [`solvdinc/agentic-engineering`](https://github.com/solvdinc/agentic-engineering) knowledge base under `meta/specs/` and `meta/plans/`; copies in this repo are kept for self-containment.

## What this is

A static page where engineers self-report progress through the 5-level curriculum from `general/getting-started/levels.md` in the `agentic-engineering` knowledge base. An admin dashboard surfaces aggregate adoption for the project owner and a small allowlist of leads.

## How it's built

- **Frontend:** vanilla HTML/CSS/JS in `public/`, served by GitHub Pages.
- **Backend:** a single Cloudflare Worker (`worker/`) that brokers GitHub OAuth and reads/writes per-engineer JSON files in a private data repo (`mykhailo-melnyk/ae-tracker-data`).
- **Auth:** GitHub OAuth → HMAC-signed session token. Sent as an `Authorization: Bearer` header (stored in `localStorage`), because the frontend and Worker are on different domains and browsers block the cross-site cookie. See "Cross-domain auth" below.
- **Storage:** GitHub Contents API. One JSON file per engineer.
- **Cache:** Cloudflare KV stores the aggregate response for 5 minutes.

## Operate

| Action | How |
|---|---|
| Add an admin | Edit `ADMIN_USERNAMES` (comma-separated GitHub usernames) in `worker/wrangler.toml`, then `wrangler deploy`. |
| Rotate the bot PAT | Issue a new fine-grained PAT scoped to `ae-tracker-data` (Contents R/W), run `wrangler secret put BOT_PAT`, revoke the old PAT. |
| Update the curriculum | Edit `public/curriculum.json` (CI schema-validates on push); push to `main`; Pages redeploys automatically. |
| Reset a stuck engineer | Delete or edit `progress/<username>.json` in the `ae-tracker-data` repo. |
| Enable in-app feedback | Create a `feedback` label in `ae-tracker`, set `FEEDBACK_PAT` (a fine-grained PAT for `ae-tracker`, Issues R/W) via `wrangler secret put FEEDBACK_PAT`, then `wrangler deploy`. Auto-assignee(s) are set by `FEEDBACK_ASSIGNEE` in `wrangler.toml`. |
| Watch logs | `wrangler tail` (live Worker logs). |

## Local development

```bash
# Frontend (serves public/ on http://localhost:8080)
npx http-server public -p 8080 -c-1

# Worker (serves on http://localhost:8787)
cd worker && npm run dev

# Tests
cd worker && npm test
```

Set `worker/.dev.vars` with:

```
SESSION_SECRET=<openssl rand -base64 48>
OAUTH_CLIENT_ID=<from GitHub OAuth app>
OAUTH_CLIENT_SECRET=<from GitHub OAuth app>
BOT_PAT=<fine-grained PAT for ae-tracker-data, Contents R/W>
FEEDBACK_PAT=<fine-grained PAT for ae-tracker, Issues R/W — for /api/feedback>
FRONTEND_ORIGIN=http://localhost:8080
```

Do not commit `.dev.vars` — it's in `.gitignore`.

## Cross-domain auth

The frontend (`mykhailo-melnyk.github.io`) and the Worker (`ae-tracker.mihael-melnyk.workers.dev`) are on **different registrable domains** (`github.io` ≠ `workers.dev`). A session set as a *cookie* would be third-party on the frontend's cross-origin `fetch()`, and **Safari blocks all third-party cookies by default** (Firefox-Strict too) — so it never reaches the Worker and sign-in appears to bounce back to the sign-in card.

The auth model therefore avoids cross-site cookies entirely:

1. The OAuth callback redirects to `tracker.html#t=<token>` — the signed session token rides in the URL **fragment** (never sent to a server, not included in `Referer`).
2. `public/auth.js` reads the fragment on load, saves the token to `localStorage`, and strips it from the URL.
3. Its `apiFetch()` wrapper attaches `Authorization: Bearer <token>` to every API call. Headers aren't subject to any browser's third-party-cookie policy, so this works on Safari, Firefox (any mode), and Chrome.

The Worker still *sets* a `session` cookie as a same-origin fallback, and reads the token from the `Authorization` header **or** the cookie. Logout clears both (the localStorage token via `clearAuthToken()` and the cookie via `/auth/logout`).

**Trade-off:** a `localStorage` token is readable by JavaScript (unlike an HttpOnly cookie), so an XSS bug could exfiltrate it. Acceptable here — the site is static with no user-generated HTML, the token only grants `read:user` scope plus read/write to the user's own progress file, and there's no sensitive PII. If that ever changes, the alternative is a shared custom domain (e.g. `tracker.solvd.com` + `tracker-api.solvd.com`) which makes the cookie first-party and lets us return to the HttpOnly-cookie model.

## Layout

```
public/                # Served by GitHub Pages
  tracker.html         # Engineer's self-tracking page (Layout C)
  dashboard.html       # Admin aggregate dashboard
  curriculum.json      # 5 levels × 67 tasks
  styles.css           # Shared base styles
  dashboard.css        # Dashboard-specific styles
  app.js               # Engineer page logic
  dashboard.js         # Dashboard page logic

worker/                # Cloudflare Worker
  src/
    index.ts           # Router: /auth/*, /api/*
    session.ts         # HMAC-signed session cookies
    auth.ts            # GitHub OAuth login + callback
    github.ts          # GitHub Contents API client (read, write, list)
    api.ts             # /api/me, /api/mark, /api/feedback, /api/user/:username
    aggregate.ts       # /api/aggregate (with KV cache)
    types.ts           # Shared types
  test/                # Vitest + @cloudflare/vitest-pool-workers
  wrangler.toml        # Worker config (vars + KV binding)

schema/
  curriculum.schema.json   # JSON Schema, validated in CI

.github/workflows/
  validate-curriculum.yml  # CI runs ajv on every push
```
