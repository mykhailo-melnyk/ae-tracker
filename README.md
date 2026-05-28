# AE Progress Tracker

> See [the design spec](https://github.com/solvdinc/agentic-engineering/blob/main/meta/specs/2026-05-27-progress-tracker-design.md) for the full architecture and decisions.

## What this is

A static page where engineers self-report progress through the 5-level curriculum from `general/getting-started/levels.md` in the `agentic-engineering` knowledge base. An admin dashboard surfaces aggregate adoption for the project owner and a small allowlist of leads.

## How it's built

- **Frontend:** vanilla HTML/CSS/JS in `public/`, served by GitHub Pages.
- **Backend:** a single Cloudflare Worker (`worker/`) that brokers GitHub OAuth and reads/writes per-engineer JSON files in a private data repo (`mykhailo-melnyk/ae-tracker-data`).
- **Auth:** GitHub OAuth → HMAC-signed session cookie (HttpOnly, Secure, 30d TTL).
- **Storage:** GitHub Contents API. One JSON file per engineer.
- **Cache:** Cloudflare KV stores the aggregate response for 5 minutes.

## Operate

| Action | How |
|---|---|
| Add an admin | Edit `ADMIN_USERNAMES` (comma-separated GitHub usernames) in `worker/wrangler.toml`, then `wrangler deploy`. |
| Rotate the bot PAT | Issue a new fine-grained PAT scoped to `ae-tracker-data` (Contents R/W), run `wrangler secret put BOT_PAT`, revoke the old PAT. |
| Update the curriculum | Edit `public/curriculum.json` (CI schema-validates on push); push to `main`; Pages redeploys automatically. |
| Reset a stuck engineer | Delete or edit `progress/<username>.json` in the `ae-tracker-data` repo. |
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
FRONTEND_ORIGIN=http://localhost:8080
```

Do not commit `.dev.vars` — it's in `.gitignore`.

## Layout

```
public/                # Served by GitHub Pages
  tracker.html         # Engineer's self-tracking page (Layout C)
  dashboard.html       # Admin aggregate dashboard
  curriculum.json      # 5 levels × 22 tasks
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
    api.ts             # /api/me, /api/mark, /api/user/:username
    aggregate.ts       # /api/aggregate (with KV cache)
    types.ts           # Shared types
  test/                # Vitest + @cloudflare/vitest-pool-workers
  wrangler.toml        # Worker config (vars + KV binding)

schema/
  curriculum.schema.json   # JSON Schema, validated in CI

.github/workflows/
  validate-curriculum.yml  # CI runs ajv on every push
```
