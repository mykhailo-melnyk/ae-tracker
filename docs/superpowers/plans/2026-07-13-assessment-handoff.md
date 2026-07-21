# Level-assessment handoff — implementation plan

**Design:** `docs/superpowers/specs/2026-07-13-assessment-handoff-design.md`
**Date:** 2026-07-13
**Status:** Implemented with this PR

## Steps

1. **Schema** — `schema/curriculum.path.schema.json`: optional boolean `assessment` on tasks.
2. **Curriculum** — append one `assessment: true` checkpoint task per level to
   `curriculum.web.json`, `curriculum.mobile.json`, `curriculum.backend.json`. IDs continue each
   level's numbering (web: L1.T20, L2.T19, L3.T13, L4.T19, L5.T11; mobile/backend: L1.T17,
   L2.T15, L3.T11, L4.T19, L5.T10 / T10). No existing IDs change.
3. **Worker** — `handleApiAssessment` in `src/api.ts`, routed as `POST /api/assessment` in
   `src/index.ts`; env `ASSESSMENT_URL` (vars) + `ASSESSMENT_SHARED_SECRET` (secret). Level
   completion check counts only non-`assessment` tasks; disabled-lock parity with other
   self-serve endpoints; injected `fetchFn` seam preserved.
4. **Tests** — `worker/test/api.test.ts`: 401 / invalid level / no competency 409 / incomplete
   level 409 (assessment task excluded from the requirement) / success relays the portal URL and
   sends the secret + engineer identity / upstream failure 502 / unconfigured 503 / disabled 403.
5. **Frontend** — `app.js`: `assessment` tasks render a Start assessment button (via `apiFetch`),
   disabled until the level's other tasks are done; shows the returned link. `styles.css` button
   styling.
6. **Docs** — CLAUDE.md (architecture + common operations) and this plan/design pair.

## Verification

- `cd worker && npm test && npm run typecheck`
- `node schema/validate-curriculum.mjs` (CI's check)
- Local E2E: portal `npm run dev` (localhost:3000) + `wrangler dev` with
  `ASSESSMENT_URL=http://localhost:3000` and a dev shared secret in `worker/.dev.vars`; complete
  a level, click Start assessment, land on the portal's `/take/<token>` page.
