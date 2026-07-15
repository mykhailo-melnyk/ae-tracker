# Motivation: recognition wall + personal panel

## Goal

Motivate engineers using the tracker toward three behaviors: **finishing**
tasks/levels they'd otherwise leave half-done, **starting/re-engaging** engineers
who've gone dormant, and showing up with **consistency** (a bit each week). This
is explicitly *not* about pushing the already-active top performers harder.

Deliver a **public recognition wall** (positives only — you can appear on it,
never be ranked last) plus a **personal motivation panel** on the tracker page,
and a **"Needs a nudge" dashboard tab** so unit leaders can reach the dormant
through existing human channels (Slack). No new infrastructure — no email, no
notifications, no schema change.

## Background

- Storage is one JSON file per engineer (`progress/<username>.json`) in the
  private data repo, read via the GitHub Contents API. `ProgressFile.tasks` is
  `Record<string, { done: boolean; at?: string }>` — each ticked task can carry
  an ISO completion timestamp `at`. That timestamp is the raw material for
  streaks, "recent" events, and "gone quiet" detection. **No schema change is
  needed.**
- `worker/src/aggregate.ts` already lists `progress/`, reads every file, and
  computes per-engineer stats (`last_active`, `stalled_14d`, completion, current
  level, cert readiness). It is **admin-only** (`/api/aggregate`) and returns
  full completion %, rankings, and the dormant tail — this must **not** be
  exposed to ordinary engineers.
- The wall therefore needs its own endpoint that emits **only** the positive
  recognition lists. The privacy boundary is structural: the wall payload has
  **no field** for completion %, ranking, or inactivity.
- The dashboard (`public/dashboard.html` / `dashboard.js`) already has tabs
  ("Level progress", "Certifications"), a "Stalled" filter pill, and a
  unit-leader dropdown. We add a third tab rather than overloading a filter.
- Curriculum registry: `worker/src/curriculum.ts` (`pathFor(competencyId)`).
  Cert registry: `worker/src/certifications.ts` (`certList()`). Both are already
  consumed by `aggregate.ts` and can be reused verbatim.

### Time notions

- **Rolling 7-day window** ("recent") — used by the event cards. An event counts
  if its timestamp is within `now - 7d .. now`.
- **Calendar weeks (ISO, Mon–Sun, UTC)** — used only by the streak. Activity is
  bucketed into ISO weeks; a streak is the length of the current run of
  consecutive weeks-with-activity ending at the current week.

### Disabled engineers

Excluded from the wall entirely, and from the "Needs a nudge" tab, consistent
with how they're dropped from headline aggregate counts.

## Tier 1 — Backend (`worker/`)

### `src/wall.ts` (new)

```
computeWall(cfg, curriculumRegistry, certRegistry, fetchFn, now): Promise<Wall>
```

Reuses the same `listDirectory("progress", ...)` / `readJsonFile(...)` plumbing
as `computeAggregate`. Reads every non-disabled engineer's progress file, then
computes the six recognition lists below. Preserves the injected
`fetchFn: typeof fetch = fetch` test seam and the `now: Date = new Date()`
parameter, matching `aggregate.ts`.

**Payload shape:**

```json
{
  "as_of": "2026-07-15T...",
  "cards": {
    "on_a_roll":      [{ "username": "...", "display_name": "...", "count": 7 }],
    "leveled_up":     [{ "username": "...", "display_name": "...", "level": "L3" }],
    "cert_ready":     [{ "username": "...", "display_name": "...", "cert_id": "cc", "cert_label": "Claude Code" }],
    "longest_streak": [{ "username": "...", "display_name": "...", "weeks": 5 }],
    "just_started":   [{ "username": "...", "display_name": "..." }],
    "welcome_back":   [{ "username": "...", "display_name": "...", "weeks_away": 3 }]
  }
}
```

`display_name` falls back to `username` at render time (frontend). The payload
carries **no** completion %, ranking, or inactivity field — this is the privacy
guarantee and is asserted by a test.

**Card computations** (each list capped at **8**; `at`-less tasks are ignored,
never crash):

| Card | Computation | Cap / floor |
|---|---|---|
| `on_a_roll` | Per engineer, count tasks with `at` in the last 7 days. Rank desc. | top 8, min count 1 |
| `leveled_up` | For each level in the engineer's path, its completion time = **max `at`** among that level's tasks, *only if all its tasks are done*. If that time is within 7 days → a level-up for that level id. **Every** level qualifies (L1→L2 included). | top 8 by recency |
| `cert_ready` | For each cert, ready = all **required** items done; became-ready time = **max `at`** among required items. Within 7 days → recent. | top 8 by recency |
| `longest_streak` | Bucket all `at` into ISO weeks; measure the current run of consecutive weeks-with-activity ending at the current week. Rank desc. | top 8, **min 2 weeks** |
| `just_started` | First-ever activity (**min `at`**) within the last 7 days. Not ranked (a welcome list). | first 8 |
| `welcome_back` | Has activity in the last 7 days **and** the gap between that and the prior activity was **≥14 days**. `weeks_away` = that gap in whole weeks. | first 8 |

An engineer may legitimately appear on multiple cards in one week — all are
positive, so no de-duplication across cards.

### `GET /api/wall` (in `src/index.ts`, under `withCors`)

- Auth: **any valid signed-in session** (not admin-gated). 401 without a valid
  session, 200 otherwise. Reuses `tokenFromRequest` + `verifySession`.
- Caching: KV via the existing `AGGREGATE_CACHE` binding, key `wall-v1`, 5-minute
  TTL. **Degrades gracefully when `AGGREGATE_CACHE` is undefined** (recompute per
  request), exactly like the aggregate — so local dev needs no KV namespace.
- Uses the same repo config (`DATA_REPO_OWNER` / `DATA_REPO_NAME` / `BOT_PAT`)
  and the same curriculum + cert registries as `handleApiAggregate`.

The wall body is fully shareable across viewers (no viewer-specific field like
the aggregate's `is_superadmin`), so the cached body is returned as-is.

## Tier 2 — Frontend: recognition wall (`public/`)

### `public/wall.html` + `public/wall.js` (new)

- Signed-in page; token shared from the tracker via `localStorage` (the existing
  `auth.js` pattern). Picks the Worker URL at runtime via the same inline
  `window.WORKER_URL` script as `tracker.html` / `dashboard.html`.
- Fetches `GET /api/wall` with `Authorization: Bearer <token>` (via
  `apiFetch()`). Renders the six cards as a responsive grid. Each entry shows the
  GitHub avatar (`https://github.com/<username>.png`, no API call),
  `display_name || username`, and the card-specific line ("7 tasks this week",
  "reached L3", "ready for Claude Code", "5-week streak", "just started", "back
  after 3 weeks").
- **Empty cards** render a warm empty state (e.g. "No new streaks this week —
  start one 👀"), never a blank or broken panel.
- Linked from a header nav element on `tracker.html`.

## Tier 3 — Frontend: personal panel (`public/app.js`, `tracker.html`)

A compact panel at the top of `tracker.html`, shown for signed-in non-readonly
engineers (same visibility gate as the feedback FAB). **Computed client-side**
from the `/api/me` tasks (already fetched) + the curriculum the page already
loads — no new backend call for the panel's core tiles. Three tiles:

- **🔥 Your streak** — current consecutive-weeks streak (same ISO-week bucketing
  as the wall, computed locally). Copy adapts:
  - safe this week: *"3-week streak 🔥"*
  - **at risk** (streak alive but nothing ticked in the current calendar week
    yet): *"3-week streak — tick one task this week to keep it 🔥"*
  - none: *"Start a streak — finish a task this week."*
- **🎯 Next milestone** — the nearest actionable target: tasks remaining in the
  current level (*"2 tasks from finishing L2"*), or, if a cert is in progress,
  whichever milestone is closer.
- **🏅 Recent wins** — the last 2–3 tasks completed, by `at`.

**"On the wall" tie-in:** the panel additionally fetches `GET /api/wall` and, if
the engineer's username appears on **any** card, shows a small *"🎉 You're on the
wall this week"* badge linking to `wall.html`. This closes the loop personal
effort → public recognition. It is the only extra fetch the tracker page makes;
failure is non-fatal (the badge simply doesn't show).

## Tier 4 — Dashboard: "Needs a nudge" tab (`public/dashboard.html`, `dashboard.js`)

A **third tab** alongside "Level progress" and "Certifications", admin-only,
built entirely from data the aggregate already returns (**no new endpoint**).

- Lists **only quiet engineers** — 14+ days since `last_active`, reusing the
  existing stalled logic — **grouped by unit leader**, with an **"Unassigned"**
  bucket for engineers with no `unit_leader`.
- Each row: name + avatar, **time away** (e.g. "quiet 23 days"), current level +
  competency, and the **`@username`** in copy-friendly form so a leader can paste
  it into Slack.
- Respects the existing **unit-leader dropdown** so a leader can narrow to their
  own group.
- Excludes disabled engineers.
- Warm empty state when nobody is quiet ("Everyone's active — nothing to nudge
  🎉").

## Testing

- **`worker/test/wall.test.ts`** (`@cloudflare/vitest-pool-workers`, stubbed
  `fetchFn` serving synthetic `progress/` files, fixed `now`):
  - one fixture per card: an on-a-roll engineer, a fresh level-up (all tasks of a
    level done, max `at` within 7d), a cert-ready engineer, a 5-week streak, a
    brand-new starter (min `at` within 7d), a returner with a ≥14-day gap;
  - **disabled engineers excluded** from every card;
  - empty `progress/` → all cards empty (no crash);
  - an engineer with `done` tasks but **no `at` timestamps** → ignored, no crash;
  - ISO-week boundary math (activity in the current vs prior week);
  - **privacy assertion**: the serialized payload contains no completion %,
    ranking, or inactivity field.
  - `caps`: a card with >8 qualifiers returns exactly 8.
- **Endpoint:** `/api/wall` returns 401 without a session, 200 with any valid
  (non-admin) session, and serves/writes the KV cache when the binding is present
  and recomputes when it is absent.
- **Frontend:** no automated harness exists for the static JS today. Keep
  `wall.js` and the personal-panel logic small and obvious; verify manually
  against `wrangler dev` + the dev data repo (`ae-tracker-data-dev`).

## Deployment & rollout

- **No schema change, no data migration.** `ProgressFile` is unchanged.
- Adding `/api/wall` requires a **`wrangler deploy`** of the Worker (manual, not
  in CI).
- Frontend (`wall.html`, `wall.js`, and edits to `tracker.html` / `app.js` /
  `dashboard.html` / `dashboard.js`) deploys via GitHub Pages on push to `main`.
- The KV cache key is `wall-v1`; bump it if the payload shape changes.

## Out of scope (YAGNI)

- Email / push notifications for the dormant (the human relay via the dashboard
  tab is the chosen reach mechanism; email is a possible future project).
- Raw named ranking / percentages visible to engineers (deliberately excluded —
  positives only).
- Any competition tuned for top performers (goal #3 was explicitly not chosen).
- Daily streaks (weekly only).
- Historical/time-series charts of the wall.
