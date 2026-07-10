# Super Admin: Delete Engineers — Design

**Date:** 2026-07-10
**Status:** Approved (pending implementation plan)

## Summary

Add a super-admin power to **permanently delete** an engineer's progress file
(`progress/<username>.json`) from the private data repo. This is a **hard
delete** intended for data hygiene / GDPR-style removal — someone who left the
company, or a bogus/test/duplicate row. It complements the existing
**soft-disable** (reversible, keeps the data) rather than replacing it: disable
is the reversible middle state; delete is the final, irreversible removal.

Deletion is guarded by a **typed-username confirmation** on the dashboard and
gated to super admins. Only the file is removed; the deleter's/target's admin
rights (which live in `wrangler.toml`) are untouched.

## Goals

- Super admin can hard-delete any engineer's progress file directly (no
  disable-first requirement).
- Strong confirmation: the operator must type the target `@username` back before
  the delete fires.
- Delete removes only `progress/<username>.json`; the private data repo's git
  history still retains the content (the only recovery path).
- Dashboard drops the deleted row on next load (aggregate cache busted).

## Non-goals

- Preventing a deleted person from re-appearing if they log in again later — see
  Accepted Behavior.
- Deleting anything other than the progress file (no cross-repo cleanup; there is
  no other per-engineer state).
- A bulk-delete or an undo. Single engineer, one at a time; recovery is via git
  history only.
- Changing admin/super-admin membership (config-driven in `wrangler.toml`).

## Roles & guards

- **Super-admin only** — same gate as soft-disable (`isSuperAdmin`); admins and
  regular engineers get `403`.
- **Self-delete blocked** — a super admin cannot delete their own account
  (`targetUsername === auth.username` → `403`). Deleting yourself mid-session is
  almost always a mistake and leaves a confusing half-state. No protection for
  the admin/super-admin tier otherwise — delete only removes progress *data*, not
  anyone's admin rights.
- **Must exist** — deleting a username with no progress file returns `404`
  ("no such engineer"), mirroring `handleApiUserDisabled`.

## HTTP surface

`POST /api/user/<username>/delete` — matches the existing admin sub-action
convention (`/disabled`, `/leader`, `/competencies`) exactly, so no CORS method
change is needed. Routed in `index.ts` with a new regex match placed **before**
the bare `userMatch` (same ordering as the other sub-actions).

## Backend

### `github.ts` — new `deleteFile`

```
deleteFile(cfg, path, sha, message, fetchFn = fetch): Promise<void>
  → DELETE /repos/{owner}/{repo}/contents/{path}
    body: { message, sha }
```

The GitHub Contents API requires the file's current `sha` to delete. Mirrors
`writeJsonFile`'s shape and header handling; throws `deleteFile <status>: <body>`
on non-OK so callers can detect a `409` (stale SHA). Preserves the injected
`fetchFn` test seam.

### `api.ts` — new `handleApiUserDelete(request, env, fetchFn, targetUsername)`

Follows `handleApiUserDisabled` closely:

1. `requireSession`; `isSuperAdmin` gate → `403` otherwise.
2. Self-delete block: `targetUsername === auth.username` → `403 "cannot delete yourself"`.
3. Read `progress/<username>.json`. Missing → `404 "no such engineer"`.
4. `deleteFile` with the current SHA; commit message `delete(<target>) by <admin>`.
5. **409 optimistic-concurrency retry** — up to 4×, re-reading the fresh SHA each
   time (a concurrent `/api/mark` could move the SHA between read and delete).
   Identical control flow to the existing write paths. If a retry's re-read now
   returns missing (a racing delete already removed the file), return `404` — the
   same not-found response as step 3.
6. Bust `AGGREGATE_CACHE` (`CACHE_KEY`) so the dashboard drops the row next load.
7. Return `200 { deleted: true, username }`.

## Frontend (`dashboard.js`)

- Per-row **Delete** button rendered next to the existing Disable button, gated
  by `AGG.is_superadmin` (same flag the Disable button uses).
- On click: `prompt()` asking the operator to type the exact `@username` (or bare
  username) to confirm. Mismatch or cancel → abort silently.
- On success: remove the engineer from `AGG.engineers`, then `renderKpis()` +
  `renderTable()` (both the counts and which rows show change).
- On failure: re-enable the button and `alert()` a retry message, mirroring
  `toggleDisabled`'s error handling.
- Styling: a red/danger variant reusing the existing `.disable-btn` shape.

## Accepted behavior

If a deleted person logs in again afterward, they are treated as brand-new — an
empty progress file is created on their first mark, exactly as if they had never
started. This is acceptable for the departure/GDPR use case (the person is not
expected to return) and avoids maintaining a separate tombstone/blocklist.

## Tests (`worker/test/`)

- **`deleteFile`**: issues a `DELETE` to the contents endpoint with `{message, sha}`
  in the body and the auth headers; throws on a non-OK response.
- **`handleApiUserDelete`**:
  - `403` for a non-super-admin (regular admin and plain engineer).
  - `403` on self-delete.
  - `404` when the target has no progress file.
  - Happy path: deletes the file and busts the aggregate cache.
  - `409` then success: stale SHA on first attempt, re-read + retry succeeds.

## Docs

- `CLAUDE.md`: note the delete power in the super-admin paragraph (alongside
  disable/enable), and add a **"Delete an engineer"** row to the Common
  Operations table (super admin; dashboard Delete button or
  `POST /api/user/<username>/delete`; irreversible, recoverable only via data-repo
  git history).
