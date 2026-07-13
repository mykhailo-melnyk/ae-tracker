# Level-assessment handoff (tracker → assessment portal) — design

**Date:** 2026-07-13
**Status:** Design

## Problem

Each level ends with an assessment, but today the tracker and the assessment portal
(`jackiehimel/ae-assessment`, the standalone level-assessment app) are not connected: an engineer
who finishes a level has no path from the tracker to their assessment, and interviewers create
sessions by hand. We want the last task of every level to launch the matching level assessment —
with the tracker verifying the engineer actually finished the level first.

## Goal

Add a final "Level assessment" task to every level of every path. Its **Start assessment** button
asks the Worker for the engineer's unique candidate link; the Worker verifies every task in that
level is done, then makes a server-to-server call (shared secret) to the assessment portal, which
creates — or returns the still-open — session for that engineer + level and hands back the
candidate URL.

```
engineer (tracker.html)                Worker                        assessment portal
  Start assessment (L2) ────────▶ POST /api/assessment {level}
                                  requireSession → username
                                  progress: all L2 tasks done? ──▶ POST /api/integrations/tracker/sessions
                                                                   Authorization: Bearer <shared secret>
                                                                   {githubUsername, displayName, competency, level}
                                                                   creates/reuses session ◀─ {url}
  link rendered ◀───────────────  {url}
```

## Non-goals

- **No assessment content in the tracker.** The Worker receives a URL, never questions or scoring
  keys; the portal's existing keyless candidate flow (`/take/<token>`) is what the engineer opens.
- **No unsupervised takes.** The button generates the link/session; the assessment itself is still
  a live, screen-shared session run by an interviewer (that is the portal's delivery model).
- No change to how any existing task, progress record, or the aggregate works.

## Design

### Curriculum (data)

- One new final task per level in each path file, e.g. `web-L1.T20` "Level assessment: live
  interview session", `kind: "checkpoint"`, with a new optional boolean **`assessment: true`**
  (added to `schema/curriculum.path.schema.json`). Task numbering continues above each level's
  current maximum, so **no existing task ID changes** and nobody's saved progress is touched.
- The assessment task is a normal task otherwise — the engineer still ticks it done after the
  session, and level completion / the aggregate count it like any other task.

### Worker: `POST /api/assessment`

Body `{ level: "L1"–"L5" }`. Authenticated via the normal session (`requireSession`), so the
Worker knows who is asking; CORS-wrapped like every other `/api/*` route.

1. 401 unauthenticated · 400 invalid level · 403 disabled engineer (self-write lock parity).
2. Read `progress/<username>.json`; resolve the path from their competency (`pathFor`); 409 if no
   competency is set.
3. Verify **every task in the requested level is done, excluding `assessment: true` tasks**
   (the launcher can't require itself). 409 `{error:"level incomplete", remaining}` otherwise.
4. Call the portal: `POST <ASSESSMENT_URL>/api/integrations/tracker/sessions` with
   `Authorization: Bearer <ASSESSMENT_SHARED_SECRET>` and
   `{githubUsername, displayName, competency, level}`. The portal is idempotent per
   engineer+level (repeated clicks return the same still-open session). 502 on upstream failure;
   503 when the integration env is not configured.
5. Return `{ url, reused }`.

Config: `ASSESSMENT_URL` in `wrangler.toml` `[vars]` (empty = integration off);
`ASSESSMENT_SHARED_SECRET` via `wrangler secret put` (mirrors `FEEDBACK_PAT`'s
separate-least-privilege-secret pattern — this secret can only mint assessment sessions).

### Frontend (`app.js`)

Tasks flagged `assessment` render a **Start assessment** button instead of a plain link. A plain
`<a href>` cannot carry the Bearer session token (the same Safari cross-site-cookie constraint
that motivated `apiFetch`), so the button calls the endpoint via `apiFetch` and then renders the
returned candidate URL as a link. When the level's other tasks aren't all done yet, the button is
disabled with a "finish the level first" hint (the Worker enforces this server-side regardless).
Hidden in read-only (`?as=`) views.

## Security

- The shared secret lives only in Worker secrets + the portal's env; it never reaches the browser.
- The Worker only ever requests a session for the **authenticated** engineer (username from the
  HMAC session token, never from the request body).
- The portal endpoint returns a URL only; scoring keys stay behind the portal's rater auth.

## Rollout

1. Portal side ships first (endpoint is live but inert without the secret).
2. Generate one secret: set it as the portal's `TRACKER_SHARED_SECRET` (Vercel env) and the
   Worker's `ASSESSMENT_SHARED_SECRET` (`wrangler secret put`).
3. Set `ASSESSMENT_URL` in `wrangler.toml`, deploy the Worker, push to `main` (CI validates the
   curriculum; Pages redeploys the frontend).
