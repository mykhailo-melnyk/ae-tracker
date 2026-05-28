---
title: "AE Progress Tracker — Design Spec"
area: general
type: reference
owner: mmelnyk
last_reviewed: 2026-05-27
status: draft
---

# AE Progress Tracker — Design Spec

> **TL;DR**: A static HTML tracker on GitHub Pages where engineers self-report their progress through the 5 levels in `general/getting-started/levels.md`. A tiny Cloudflare Worker brokers GitHub OAuth and reads/writes per-engineer JSON files in a private data repo. A manager dashboard surfaces aggregate adoption and per-task completion rates. Built to run on the owner's personal GitHub first; designed so it can graduate to the `solvdinc` org without a rewrite.

## Context & Motivation

C-level has asked for visible progress turning the business unit's ~50–150 software engineers into "agent software engineers" — engineers fluent with AI-assisted development. This repo already publishes the curriculum (`general/getting-started/levels.md`, five competency levels with explicit checkpoints). What's missing is a way to *see who is where* across the unit.

The tracker is the missing visibility layer:

- **For the engineer:** a personal page that surfaces "what's next" inside the curriculum and lets them tick tasks off as they go.
- **For the manager and team leads:** an aggregate dashboard for adoption (engineers started, level distribution, stuck points, who's stalled).
- **For c-level reporting:** the dashboard's KPI row is the report — same numbers every week.

## Decisions Summary

| # | Decision | Rationale |
|---|---|---|
| 1 | Engineer self-tracks; admin views aggregate | Lowest-friction adoption. Honor-system trades verification rigor for participation. |
| 2 | Scale: 50–150 engineers, 6+ months, real tool | Justifies durable infra but not whole-company scaling work yet. |
| 3 | Granularity: per-task checklist within each of 5 levels | Best signal — identifies *which* tasks are sticky vs which engineers progress past. |
| 4 | Identity: GitHub OAuth | Engineers already have GitHub; no IT involvement; portable identity. |
| 5 | Hosting: GitHub-native | Frontend on GitHub Pages, data as JSON in a private repo, owned by the project owner (not `solvdinc`) for the pilot. |
| 6 | Architecture: static frontend + tiny Cloudflare Worker | Worker brokers OAuth and proxies all reads/writes. ~120 lines, free tier. |
| 7 | Engineer UI: Layout C — sticky pill bar + focused level | Mobile-friendly, fast level switching, full-width tasks. |
| 8 | Access gate: open — anyone with GitHub can sign in | Pilot trades a real gate for zero friction. Acceptable because data repo is private, Worker URL is unpublicized, and pollution can be filtered out at the dashboard. |
| 9 | Admin access: small username allowlist | Engineers see only their own data; only allowlisted GitHub usernames see the aggregate dashboard. |
| 10 | Aggregate access policy: admin-only | Engineers do not see each other's progress in the pilot. |

## Architecture

### Components

```
┌─────────────────────────┐    ┌─────────────────────────┐    ┌──────────────────────┐
│   Engineer's browser    │    │   Manager's browser     │    │     GitHub OAuth      │
│   tracker.html          │    │   dashboard.html        │    │   (identity provider) │
└──────────┬──────────────┘    └──────────┬──────────────┘    └───────────┬──────────┘
           │                              │                                │
           │  ▲ sign-in redirect ▼        │  ▲ sign-in redirect ▼          │
           ▼                              ▼                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         Cloudflare Worker (~120 lines)                              │
│  /auth/callback   /api/me   /api/mark   /api/aggregate                              │
│  Validates session cookies. Holds bot PAT. Caches aggregate in KV (5 min).          │
└──────────────────────────────────────────┬──────────────────────────────────────────┘
                                           │ GitHub API (via bot PAT)
                                           ▼
                          ┌────────────────────────────────────┐
                          │   Private data repo                │
                          │   <owner>/ae-tracker-data          │
                          │     progress/<github-username>.json│
                          └────────────────────────────────────┘
```

Two static pages on GitHub Pages, one Worker, one private data repo. That's it.

### Repositories

| Repo | Visibility | Purpose |
|---|---|---|
| `<owner>/ae-tracker` | Public | Frontend source (`tracker.html`, `dashboard.html`, `curriculum.json`, `worker/`). GitHub Pages serves from `main`. |
| `<owner>/ae-tracker-data` | **Private** | Holds `progress/<github-username>.json`. Only the bot PAT (held by the Worker) can write. |

`<owner>` is a parameter, not a hard-coded value. For the pilot, `<owner>` is the project owner's personal GitHub account (the org-membership check is deliberately skipped to avoid IT-onboarding delays). Future migration to `solvdinc` is a repo transfer plus a Worker-secret rotation — no application-code change.

### Sign-in flow

1. Engineer opens `tracker.html` → clicks "Sign in with GitHub".
2. Redirect to `github.com/login/oauth/authorize` with `read:user` scope.
3. GitHub redirects back to `worker.example.com/auth/callback?code=…`.
4. Worker exchanges code for an access token, fetches the GitHub user, then **mints a signed session cookie** (HMAC over `{username, exp}`) and redirects back to `tracker.html`.
5. The user's GitHub access token is **not stored** — only the username is. The session cookie is the only thing the browser carries from then on (HttpOnly, Secure, SameSite=Lax).

### Marking a task done

1. Engineer clicks a checkbox in `tracker.html`.
2. Frontend `POST /api/mark` with body `{ task_id, done }` and the session cookie.
3. Worker validates the session, reads `progress/<username>.json` via bot PAT, mutates, commits with message `progress(<username>): toggle <task_id>`.
4. Worker returns updated progress JSON; frontend reconciles.

### Reading own progress

1. Frontend `GET /api/me` with session cookie.
2. Worker fetches `progress/<username>.json` via bot PAT; returns it. Empty `{tasks: {}}` if the file does not yet exist.

### Viewing the aggregate (admin)

1. Manager opens `dashboard.html` → frontend `GET /api/aggregate`.
2. Worker validates session cookie, checks `ADMIN_USERNAMES` allowlist, returns aggregate (cached in KV up to 5 minutes).
3. Cache miss → Worker lists all files under `progress/` in the data repo, fetches each, computes aggregate, stores in KV.

## Data Model

### `curriculum.json` *(committed to the frontend repo, hand-maintained)*

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
      "tasks": [
        { "id": "L1.T1", "kind": "practice", "title": "Ask AI to explain code you already know",
          "desc": "Open a project you know well. Use @-references. Ask AI to walk you through the logic." },
        { "id": "L1.T2", "kind": "practice", "title": "Use /btw for side questions" },
        { "id": "L1.T3", "kind": "course",   "title": "AI Fluency: Framework & Foundations",
          "link": "https://www.anthropic.com/learn" },
        { "id": "L1.T4", "kind": "checkpoint","title": "Spot confident-correct vs confident-guessing AI",
          "self_assessment": true }
      ],
      "level_complete_when": "all_tasks_done"
    }
  ]
}
```

- **Hand-maintained**, not auto-extracted from `levels.md`. The owner of `levels.md` is also the natural owner of curriculum updates.
- **Task IDs are stable.** Renaming a title is fine. Removing a task is fine (consumers ignore unknown IDs).
- `level_complete_when` is `all_tasks_done` for v1. Could be extended to `checkpoint_done` or weighted later.

### `progress/<github-username>.json` *(per engineer, in the private data repo)*

```json
{
  "github_username": "mmelnyk",
  "display_name": "Mykhailo Melnyk",
  "created_at": "2026-05-27T10:00:00Z",
  "updated_at": "2026-05-28T14:30:00Z",
  "tasks": {
    "L1.T1": { "done": true,  "at": "2026-05-27T10:30:00Z" },
    "L1.T2": { "done": true,  "at": "2026-05-27T11:00:00Z" },
    "L2.T1": { "done": false }
  }
}
```

- **Created on first write.** Reads return an empty `{tasks: {}}` if the file does not exist.
- **No email stored.** Identity is the GitHub username.
- `display_name` is fetched from GitHub's user profile at sign-in time; refreshed on next sign-in.
- "Current level" is *computed*, not stored. Definition: the lowest level whose `level_complete_when` is **not yet** satisfied. If no tasks are done at all, current level is `L1`. If every level is complete, current level is `L5` (capped — there is no L6).
- "Last active" is `max(tasks[*].at)`. If the engineer has signed in but never marked anything, it falls back to `created_at`.
- "Stalled" means `now() - last_active >= 14 days` for any engineer who has a `progress/*.json` file.

### Aggregate response *(computed in Worker, returned to dashboard, cached in KV)*

```json
{
  "as_of": "2026-05-28T14:35:00Z",
  "engineers_started": 47,
  "by_current_level": { "L1": 8, "L2": 22, "L3": 12, "L4": 4, "L5": 1 },
  "by_task": { "L1.T1": 45, "L1.T2": 40, "L1.T3": 38, "L1.T4": 35, "L2.T1": 28 },
  "stalled_14d": 7,
  "engineers": [
    { "username": "mmelnyk", "display_name": "Mykhailo Melnyk",
      "current_level": "L2", "completion_pct": 0.40,
      "last_active": "2026-05-28T14:30:00Z" }
  ]
}
```

Never persisted to the data repo — always derived from individual `progress/*.json` files.

## UI Design

### Engineer page (`tracker.html`) — Layout C

- **Top bar:** brand + signed-in user.
- **Greeting row:** "Welcome back, Mykhailo. Currently at Level 2." + total ratio.
- **Sticky pill bar (5 pills):** one per level. Green = complete, blue = current, gray = upcoming. Each pill shows level number, name, count, and a mini progress bar. Clicking a pill switches the focused level.
- **Focus card:** the currently selected level. Shows title, subtitle, the level's `move_on_when` text, and the task list.
- **Task row:** checkbox + title + kind tag (practice / course / checkpoint) + description. Courses link out to Anthropic's free courses.
- **Prev / next level arrows** at the bottom of the focus card.

Reference mockup: `engineer-ui-C-pills.html` in the brainstorm artifacts.

### Manager dashboard (`dashboard.html`)

- **KPI row (4 cards):** Engineers started · At Level 2+ · Avg completion · Stalled (no activity in 14 days).
- **Distribution histogram:** one bar per level, height = number of engineers currently at that level.
- **Per-task completion list:** task ID + name + horizontal bar + % completed. Sorted by completion rate to surface stuck points.
- **Engineer table:** name + GitHub handle + current level chip + completion bar + last active. Filterable by level + "Stalled" filter. Search by name/handle. Per-row "View →" opens `tracker.html?as=<username>` — the same engineer page rendered in **read-only** mode (checkboxes disabled). Read-only mode is server-gated: the Worker only honors `?as=` if the requester is in `ADMIN_USERNAMES`.

Reference mockup: `manager-dashboard.html` in the brainstorm artifacts.

## Access Control

| Surface | Who can access |
|---|---|
| `tracker.html` | Any signed-in GitHub user. Sees **only their own** progress. |
| `dashboard.html` | Any signed-in GitHub user whose username is in `ADMIN_USERNAMES`. Non-admins get 403. |
| `/api/me` | Any signed-in user — returns only their own JSON. |
| `/api/mark` | Any signed-in user — writes only their own JSON. |
| `/api/aggregate` | Admin allowlist only. |

`ADMIN_USERNAMES` lives in the Worker's env config (Wrangler secret). Initial value: `["mmelnyk"]`. Adding a lead is a one-line env-var edit + redeploy (seconds).

**Pilot trade-off acknowledged:** "anyone with GitHub can sign in" means random people *could* create progress files. Mitigations:
- The data repo is private; URLs are not enumerable from the public internet.
- The Worker URL is shared only with the pilot group.
- The dashboard can show only allowlisted "known" engineers (a future setting: `KNOWN_USERS_ONLY = true`) if pollution ever becomes a problem.

## Error Handling

| Edge case | Handling |
|---|---|
| Session cookie expires (30 days) | Worker returns 401 → frontend redirects to OAuth re-login. Progress data is preserved (identity-keyed). |
| Two tabs open with conflicting writes | Last write wins; Worker re-reads JSON before mutating. Conflict probability is negligible for this data shape. |
| First-time visitor | Worker creates `progress/<username>.json` on first write. Reads before that return empty tasks. |
| Curriculum task renamed | Title-only change — no impact. Progress refs are by ID. |
| Curriculum task removed | Engineer progress retains the entry but it's not rendered. Aggregates ignore unknown IDs. |
| Curriculum task added | Defaults to `done: false` for all engineers. |
| Engineer leaves Solvd | No active enforcement in pilot. Manually remove from admin allowlist if applicable. Their JSON stays as history. |
| GitHub API rate limit on aggregate fetch | KV cache holds aggregate for 5 minutes. ~12 fetches/hour even if 100 admins refresh continuously. |
| Bot PAT leaked / rotation | Worker secret rotation via `wrangler secret put`; no code change. |
| Worker outage | Frontend shows "couldn't save, retry" toast. Mark progress queued in `localStorage`, replayed on reconnect. Dashboard shows last cached aggregate. |
| GitHub Pages outage (rare) | Static frontend keeps working in already-loaded tabs. Data is safe in the repo. |

## Testing

| Layer | Approach |
|---|---|
| Worker unit tests | Vitest via `@cloudflare/vitest-pool-workers`. Cover: OAuth code exchange, session cookie sign/verify, read/write endpoints, allowlist enforcement, aggregate computation. Mocked GitHub API. |
| Curriculum schema check | CI script validates `curriculum.json` against a JSON Schema on every commit to the frontend repo. |
| End-to-end smoke test | One scripted run against staging Worker + `ae-tracker-data-staging`: OAuth sign-in → mark a task → assert JSON in repo. Runs on every Worker deploy. |
| Manual QA before pilot launch | One pass as an engineer through all 5 levels; one pass as admin through the dashboard. ~30 min. |
| Frontend unit tests | None in v1. Frontend is mostly templated rendering; manual QA + visual review covers it. |

## Future Work (out of scope for v1)

- **Migrate to `solvdinc` org.** Transfer both repos to the org; rotate the bot PAT to come from an org-owned bot account; optionally add the org-membership check as a real gate. No code change beyond a config edit.
- **Email-domain verification.** If pollution from non-Solvd GitHub users becomes a problem, add a `read:user` scope on OAuth and require a verified `@solvd.com` email.
- **Engineer leaderboard (opt-in).** Some engineers may want to see aggregate; expose it behind a setting.
- **Time-series.** Persist a daily snapshot of aggregates so we can chart adoption over time.
- **Confluence/Teams integration.** Embed the dashboard or surface "your current level" via the existing Solvd AI Dev Guide bots.
- **Self-served admin allowlist.** Replace the Worker env var with a JSON file in the frontend repo so adding a lead is a PR rather than a redeploy.
- **Separate dev and prod environments.** v1 ships with a single Worker (`ae-tracker`) and a single OAuth App, whose callback URL points at production — so local development against `wrangler dev` is broken until either: (a) the callback URL is reverted to localhost, or (b) a second OAuth App is registered for local dev. Future: maintain two Wrangler environments (`[env.production]` and an implicit dev env), two OAuth Apps (prod + dev) with different Client IDs, and possibly two data repos (`ae-tracker-data` + `ae-tracker-data-staging`) so dev mutations never touch production engineers' progress files.

## Open Questions

- **Bot account vs personal PAT.** For the pilot, the Worker will use the project owner's personal fine-grained PAT to write to the data repo. Acceptable short-term, but creating a dedicated `ae-tracker-bot` GitHub account (free) is a one-hour task and produces cleaner commit history.
- **Pages domain.** Default is `<owner>.github.io/ae-tracker`. Custom subdomain (`tracker.solvd.com`) is nice but requires DNS — defer unless trivial.
- **Curriculum content ownership.** `levels.md` is owned by `lucas.kasprzyk`. The pilot uses a snapshot of that file as `curriculum.json`. We should agree on a refresh cadence (e.g. monthly) and an owner for `curriculum.json` updates.

## Related Resources

- [Building AI Skills — From Zero to Autonomy](../../general/getting-started/levels.md) — source of the curriculum
- [How We Work With AI](../../general/getting-started/start-here.md) — entry point for engineers
- [Repository ROADMAP](../ROADMAP.md) — broader knowledge-base roadmap this tracker supports
