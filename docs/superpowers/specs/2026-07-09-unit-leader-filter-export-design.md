# Unit Leaders: Assignment, Filter & Export — Design

**Date:** 2026-07-09
**Status:** Approved (pending implementation plan)

## Summary

Add a **unit leader** attribute to each engineer — the manager responsible for
tracking that engineer's progress (roughly one leader per ~10 engineers). Unit
leader is purely a **data attribute on the developer's progress file**, exactly
like `competency`. It is **not** a role or permission: it grants no access and
no scoped view. Admins use it to **filter the dashboard by unit leader** and to
**export results grouped by unit leader**. Anyone who needs dashboard access is
added to `ADMIN_USERNAMES` as today.

A "unit leader" is an ordinary engineer who has been assigned as the leader of
one or more developers. The set of leaders is **derived** from assignments —
there is no separate leader list or config var.

## Goals

- Store one unit leader per developer, set/cleared by an admin, with an audit
  trail (who set it, when) mirroring the `competency` fields.
- Assign the leader from a dropdown of existing engineers (leaders are always
  tracked engineers); reject self-assignment.
- On the dashboard, filter by unit leader — narrowing the engineer table and
  rescoping the KPIs and level-distribution bars to that pool.
- Export engineers grouped/filtered by unit leader (CSV and `.xlsx`), including
  a "Unit leader" column and a "By unit leader" summary block.

## Non-goals

- **No unit-leader role or permission.** No scoped dashboard, no server-side
  aggregate scoping, no `?leader=` query param, no per-viewer flags, no leader
  branch in `handleApiAggregate`. Leaders who need to view the dashboard are
  added to `ADMIN_USERNAMES` like any other admin.
- No change to `/api/me` (no tracker "Dashboard" link logic for leaders).
- No leader-can-edit-their-pool power — competency edits and disable/enable
  keep their current gating (admin / super-admin respectively).
- Multiple leaders per developer (exactly one; clean partition).
- Any new config var — the leader set is derived from assignments.

## Data model

Add three optional fields to `ProgressFile` (`worker/src/types.ts`), on the
**developer's** file, mirroring the `competency` audit trio:

```ts
unit_leader?: string;             // github_username of the assigned leader (an engineer)
unit_leader_set_by?: string;      // github_username of the admin who set it (audit)
unit_leader_updated_at?: string;  // ISO timestamp of the last change
```

There is no reverse/leader-side field — the leader set is always derived by
scanning `unit_leader` values.

## API

### New: `POST /api/user/<username>/leader` (admin-only)

Set or clear a developer's unit leader. Handler `handleApiUserLeader` in
`worker/src/api.ts`, wired in `index.ts` with a route matched **before** the
generic `/api/user/<username>` route (same ordering as the existing
`/competencies` and `/disabled` sub-routes).

- Auth: `requireSession` then `isAdmin` (accepts admins and super admins, as
  `isAdmin` already treats super admins as a superset). Non-admin → 403.
- Body: `{ leader?: string | null }`. Validation:
  - `null`/`undefined`/`""` → clear the assignment.
  - Otherwise must be a string matching `^[\w-]+$`, length ≤ 39 (GitHub's max
    username length), and `!== targetUsername` (no self-lead). Invalid → 400.
  - The value is **not** verified to be an existing engineer server-side (the
    UI only offers existing engineers via a dropdown; keeping the server lenient
    avoids a directory read on every write, matching how `competency` validates
    against the bundled taxonomy only).
- Read-modify-write with the same 4-attempt 409 optimistic-concurrency retry as
  `writeCompetency` / `handleApiMark`. Stamps `unit_leader`,
  `unit_leader_set_by` (= caller), `unit_leader_updated_at`, `updated_at`.
- Busts the aggregate cache (`env.AGGREGATE_CACHE?.delete(CACHE_KEY)`).
- Returns the updated `ProgressFile` (like the competency handlers).

Refactor note: the write loop is nearly identical to `writeCompetency`; extract
a shared field-writer or follow the existing copy-paste convention — decide
during planning, but do not regress the 409 retry behavior.

### Modified: `GET /api/aggregate`

The only change to the aggregate is additive:

- `computeAggregate` copies `unit_leader` onto each entry of the `engineers`
  array (alongside `competency`, `disabled`, etc.). No filtering, no new counts.
- Bump `CACHE_KEY` from `aggregate-v6` to `aggregate-v7` (shape change: per
  engineer `unit_leader`) so a deploy invalidates stale cached bodies. Add the
  v7 note to the comment above `CACHE_KEY`.

Everything else about `handleApiAggregate` is unchanged — admins/super-admins
see the full org aggregate; non-admins still get 403.

### Unchanged

`/api/me`, `/api/user/<u>/competencies`, `/api/user/<u>/disabled`, `/api/mark`,
`/api/feedback`. No new secrets or vars.

## Access control

Unchanged from today. Engineer / admin / super-admin only; "unit leader" is a
data attribute, not a role. Admin remains a superset (its checks run first). A
user who is both an admin and someone's assigned leader is simply an admin — no
special case, no restriction.

## Dashboard (`public/dashboard.js`, `public/dashboard.html`)

### Per-row leader assignment

Add a **"Unit leader"** column to the engineers table (in the `#view-levels`
table, between "Competency" and "Last active"). Each row renders a `<select>`
of all engineers (value = username, label = display name/handle) with a leading
"—" (unassigned) option, mirroring the existing `.comp-select` pattern:

- Options are built from `AGG.engineers` (username + display name), excluding the
  row's own engineer (no self-lead). The currently-assigned `unit_leader` is
  pre-selected.
- On `change`, call `POST /api/user/<username>/leader` with `{ leader }` (or
  `null` for "—"), mirroring `saveCompetency`: disable the control during the
  request, update `AGG.engineers[i].unit_leader` on success, roll back the
  selection and alert on failure.

### Filter by unit leader (behavior B)

Add a `Unit leader: [All ▾]` `<select>` to the `#view-levels` toolbar (next to
the search box / filter pills). Options: `All`, one per distinct `unit_leader`
value in `AGG.engineers` (label = leader's display name), and `Unassigned`.

- A module-level `LEADER = "all"` (parallel to `SCOPE`/`FILTER`), set on change.
- **Selecting a leader rescopes the whole level view like the competency
  `SCOPE`** (calls `renderAll()`), via `scopedActive()` gaining a `LEADER`
  clause: an engineer is in scope when `LEADER === "all"`, or
  `LEADER === "__unassigned__"` and `!e.unit_leader`, or `e.unit_leader === LEADER`.
  This narrows the KPIs, the level-distribution bars, and the engineers table.
- **Task-detail caveat:** `renderLevelCompletion` uses server-computed
  `AGG.by_task` counts, which are cross-competency and cannot be re-derived per
  pool client-side. When a leader filter is active, that one panel still reflects
  the selected **competency** scope only, not the leader pool. Add a small inline
  note in that panel when `LEADER !== "all"` (e.g. "Task detail reflects the
  whole competency, not the unit-leader filter."). This is an accepted
  limitation — the deliberate trade-off for keeping all scoping client-side.
- The existing table-only `FILTER` pills (L1…/stalled/disabled), the competency
  `SCOPE`, the search box, and the `LEADER` filter compose: `renderTable`
  applies all of them; `scopedActive` applies `SCOPE` + `LEADER`.

The Certifications tab (`#view-certs`) is unaffected.

## Export (`public/export.js`)

Extend the existing export modal (`openExportDialog(AGG, CUR)`) with a parallel
unit-leader dimension. Selection is the **intersection** of the competency and
unit-leader choices.

- **New checkbox section "Unit leaders to include"** below the competencies
  section: a "Select all", one checkbox per distinct leader in `AGG`
  (label = display name, value = leader username), and an "Unassigned" checkbox
  (`__no_leader__` sentinel; kept distinct from the competency `__unassigned__`).
  All checked by default.
- `selectedEngineers` gains a leader predicate: an engineer is included when it
  passes the existing competency test **and**
  `(e.unit_leader && chosenLeaders.has(e.unit_leader)) || (!e.unit_leader && includeNoLeader)`.
- **"Unit leader" column** added to `buildRows` (value = the leader's display
  name, or "Unassigned"). Resolving the leader's display name uses a lookup built
  from `AGG.engineers`.
- **Summary sheet** (`summaryAoa`) gains a **"By unit leader"** table (parallel
  to "By competency"), counting selected engineers per chosen leader plus
  Unassigned. Adjust the xlsx `!cols` widths for the new column.
- The live "N engineers selected" count reflects the combined selection.

## Configuration & docs

No new secrets or vars.

Update `CLAUDE.md`:

- Note the new `ProgressFile` fields (`unit_leader*`) and that unit leader is a
  data attribute, not a role.
- Common-operations table: new row **"Assign a unit leader" → As an admin, use
  the per-row Unit leader dropdown on the dashboard (or `POST
  /api/user/<username>/leader` with `{leader:"<username>"|null}`).**
- Bump the aggregate cache-version note to mention `v7` (per-engineer
  `unit_leader`).

## Testing

New `worker/test` coverage, following the existing `fetchFn`-stub /
`@cloudflare/vitest-pool-workers` pattern:

- `handleApiUserLeader`: admin sets a leader (fields + audit stamped, cache
  busted); admin clears (`null`) it; self-assignment rejected (400); malformed
  username rejected (400); non-admin caller rejected (403); 409 retry path
  behaves like the competency writer.
- `computeAggregate` / `handleApiAggregate`: each engineer entry carries
  `unit_leader`; `CACHE_KEY` is `aggregate-v7`.

Frontend logic (dashboard filter, export intersection) is covered manually /
by inspection, consistent with the current lack of frontend unit tests.

## Rollout

1. Land worker + frontend changes; `wrangler deploy` the Worker (aggregate shape
   changed → v7 cache key) and let Pages deploy `public/`.
2. Admins assign unit leaders via the dashboard dropdowns.
3. No data migration — absent `unit_leader` reads as "Unassigned" everywhere.
