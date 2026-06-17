# Super Admin: Soft-Disable Engineers — Design

**Date:** 2026-06-17
**Status:** Approved (pending implementation plan)

## Summary

Add a **super admin** role — a single elevated user, distinct from the regular
reviewing admins — who can **soft-disable** (and re-enable) an engineer. A
disabled engineer is blocked from using the tracker and hidden from the default
dashboard view, but their `progress/<username>.json` file stays exactly where it
is so it can always be inspected later. "Delete" means deactivate, never destroy.

The first super admin is `mykhailo-melnyk`.

## Goals

- One super admin per system (config-driven), separate in intent from the admins
  who review competencies.
- Super admin can disable and re-enable any engineer.
- Disabled engineers are blocked from authenticating against the API (cannot mark
  tasks or set competency) and see an explanatory message.
- Disabled engineers are excluded from default dashboard stats and the engineer
  table, but can be surfaced on demand via a filter.
- The underlying JSON file is never moved or deleted — always findable.

## Non-goals

- Hard deletion of progress data.
- Disabling an engineer who has never started (no progress file exists yet).
- A separate super-admin page / UI surface — controls live inline on the existing
  dashboard.

## Roles & configuration

- New non-secret var **`SUPERADMIN_USERNAMES`** in `worker/wrangler.toml` under
  `[vars]`, comma-separated like `ADMIN_USERNAMES`. Intent is a single user, but
  the format matches the existing admin var and permits more if ever needed.
  Initial value: `mykhailo-melnyk`.
- Add `SUPERADMIN_USERNAMES: string` to the `Env` interface in `index.ts`.
- Add it to `.dev.vars` for local development.
- **Super admin is a superset of admin.** `isAdmin()` (in `api.ts`) and the inline
  admin check in `aggregate.ts` return true if the user is in `ADMIN_USERNAMES`
  **or** `SUPERADMIN_USERNAMES`. The super admin therefore sees the full dashboard
  without needing a separate entry in `ADMIN_USERNAMES`.
- New helper `isSuperAdmin(username, env)` in `api.ts`.

## Data model

Three optional fields added to `ProgressFile` (`worker/src/types.ts`):

```ts
disabled?: boolean;        // true = soft-disabled
disabled_by?: string;      // super-admin username of the last toggle
disabled_at?: string;      // ISO timestamp of the last toggle
```

The file remains at `progress/<username>.json`. Re-enabling sets
`disabled: false` and refreshes `disabled_by` / `disabled_at`, giving a one-line
audit trail of the most recent toggle in either direction. `updated_at` is bumped
on every toggle.

## New endpoint

`POST /api/user/{username}/disabled` with body `{ disabled: boolean }`.

- **Super-admin only** — returns `403` for everyone else (including regular admins
  and engineers).
- Reads the target's progress file, sets the disabled fields, writes back using
  the same 409 optimistic-concurrency retry pattern as `writeCompetency`
  (re-read fresh SHA, re-apply, retry up to 4× with back-off).
- If the target has **no progress file**, returns `404` — you can only disable an
  engineer who exists in the data (which is exactly who appears on the dashboard).
- Invalidates `AGGREGATE_CACHE` (`CACHE_KEY`) so the dashboard reflects the change
  on next load.
- Returns the updated progress JSON.
- Routed in `index.ts` via a new regex `^/api/user/([\w-]+)/disabled$`, ordered
  **before** the generic `^/api/user/([\w-]+)$` match (and after the
  `/competencies` match).

## Blocking a disabled engineer (server-side, defense-in-depth)

- **`/api/mark`** and **`/api/competencies` (self path)**: after reading the
  existing file, if `disabled` is true, return `403 { error: "disabled" }`
  *before* writing. This is the authoritative lock — even a hand-crafted API call
  cannot bypass it.
- **`/api/me`**: returns the progress object as today; it now carries `disabled`,
  which the frontend uses to render the locked screen.
- **Admin paths are not blocked**: `/api/user/{username}` (admin view), the admin
  competency override `POST /api/user/{username}/competencies`, and the disable
  endpoint itself must continue to work against disabled engineers so admins and
  the super admin can inspect and manage them.

## Aggregate (`worker/src/aggregate.ts`)

- Each entry in `engineers[]` gains `disabled?: boolean`. The array still contains
  **everyone** (active and disabled) so the dashboard filter can surface disabled
  users.
- Headline counts — `engineers_started`, `by_current_level`, `by_task`,
  `stalled_14d` — are computed over **active engineers only** (those not disabled),
  so disabled users no longer skew adoption numbers.
- The response gains **`is_superadmin: boolean`**, derived from the requesting
  session, so the dashboard knows whether to render disable/enable controls.
- Bump `CACHE_KEY` → `aggregate-v3` (the shape changed; the bump invalidates stale
  cached entries on deploy).

## Dashboard (`public/dashboard.js`)

- New **"Disabled" filter pill** alongside the existing filter pills. The default
  view **excludes** disabled engineers; selecting "Disabled" shows only them.
- Client-side KPIs (*At Level 2+*, *Avg completion*) are computed over active
  engineers (`!e.disabled`) so they agree with the worker's counts.
- When `is_superadmin` is true, each engineer row gets a **Disable / Enable**
  action with a confirmation prompt. It POSTs to `/api/user/{username}/disabled`,
  updates the local `AGG` entry, and re-renders. Regular admins do not see the
  control.

## Engineer page (`public/app.js` + `public/tracker.html`)

- In `init()`, on the self path (not the `?as=` admin view), if `PROGRESS.disabled`
  is true, render a **locked screen**: hide the pills / tasks / competency UI and
  show the message *"Your account is disabled. Please contact your direct
  manager."* via a new hidden `#disabled` block in `tracker.html`, following the
  same pattern as the existing `#signed-out` block.
- The admin read-only view (`?as=<username>`) still renders a disabled engineer's
  progress normally, with a small "disabled" note for context.

## Tests (`worker/test/`)

- Disable endpoint authorization: super-admin succeeds; a regular admin and a
  plain engineer both get `403`.
- Toggle disabled on and off; fields and `updated_at` are written correctly.
- `/api/mark` and `/api/competencies` return `403 { error: "disabled" }` when the
  engineer is disabled.
- `404` when the disable target has no progress file.
- Aggregate excludes disabled engineers from `engineers_started` /
  `by_current_level` / `by_task` / `stalled_14d`, but includes them in
  `engineers[]` with `disabled: true`.
- `is_superadmin` reflects the requesting session correctly.

## Docs

- Add `SUPERADMIN_USERNAMES` to `worker/wrangler.toml` and the `Env` interface; note
  it in `.dev.vars` guidance.
- Update `CLAUDE.md` "Common operations" table with *Add a super admin* and
  *Disable / re-enable an engineer* rows.
