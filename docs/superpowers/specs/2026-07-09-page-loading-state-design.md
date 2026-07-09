# Page-level loading & error states

**Date:** 2026-07-09
**Status:** Approved — ready for implementation plan

## Problem

Every frontend page (`tracker.html`, `cert.html`, `dashboard.html`) ships with all
its content containers set to `class="...hidden"` (`.hidden { display:none }`,
`styles.css:265`). On first paint only the static `.topbar` is visible; JS reveals
a container only *after* `init()` finishes its async fetches. There is no
spinner/skeleton/loader anywhere in the codebase.

This produces two bad-UX symptoms of the **same lifecycle gap**:

1. **The wait** — a topbar-only "blank screen" (gray `#f8fafc`) between page paint
   and the first API fetch resolving. Worst on a cold Worker start, slow network,
   or the dashboard's heavy `/api/aggregate` call.
2. **The crash** — if any fetch throws, each page's top-level
   `init().catch(...)` does `document.body.innerHTML = "<pre …red…>" + e.message`,
   wiping the whole page (topbar included) to a raw red error string
   (`app.js:390`, `cert.js:161`, `dashboard.js:458`).

## Goal

Show a **centered spinner** during the wait, and a **friendly error card with a
Retry button** on failure — on all three pages. No blank screen; no raw red dump.

## Non-goals

- **No per-section skeletons.** Secondary fetches that run *after* the page shell
  is already visible (tracker's `renderPath` filling `#pill-bar`/`#focus-card`,
  cert's `selectCert` filling `#cert-body`, dashboard's per-competency
  `renderLevelCompletion`) are out of scope — by then the page is no longer blank.
- No framework, no build step, no new dependency (matches the vanilla static-site
  conventions).

## Design

### Approach

The loader is **static markup that is visible by default** (not `hidden`), placed
right after the `.topbar` in each HTML. It therefore paints on the first byte —
before `app.js`/`cert.js`/`dashboard.js` even parse — killing the blank screen at
the earliest possible moment. `init()` removes it once real content is ready.
(Alternative considered: JS-injecting the loader from a shared helper — rejected
because it can't appear until the script runs, so it leaves a hair more blank time
for no real benefit.)

### 1. Shared CSS (`styles.css`)

All three pages already link `styles.css` (dashboard also links `dashboard.css`),
so one block covers everything. Add:

- `.page-loader` — centered flex column with a generous `min-height` so it fills
  the area under the topbar; matches the page background.
- `.spinner` + `@keyframes spin` — a lightweight pure-CSS ring spinner in the brand
  accent color (no image, no dependency). Wrap the animation in a
  `@media (prefers-reduced-motion: reduce)` guard so it renders a static ring
  (no spin) for users who opt out of motion.
- `.page-error` — the failure card: a ⚠ icon, a message line, and a styled
  **Retry** button.

### 2. Shared JS helpers (`auth.js`)

`auth.js` is the first script on every page, so helpers defined there are reusable
by `app.js`, `cert.js`, and `dashboard.js`.

- `hidePageLoader()` — removes the `#page-loader` element (no-op if already gone).
- `showPageError(err, onRetry)` — replaces the loader/content region with the
  `.page-error` card **without touching the `.topbar`**, and wires the Retry button
  to call `onRetry`. This is the replacement for today's
  `document.body.innerHTML = "<pre …>"` behavior.

### 3. HTML (×3)

Insert, immediately after the `.topbar` and ahead of the existing hidden
containers:

```html
<div id="page-loader" class="container">
  <div class="spinner"></div>
  <p>Loading…</p>
</div>
```

Note: **not** `hidden` — visible by default.

### 4. `init()` wiring (×3)

Two touch-points per page:

- **Hide once, before revealing content.** Call `hidePageLoader()` right after the
  primary fetch(es) resolve and before any container's `.hidden` is removed. Because
  every terminal branch (signed-out / disabled / signed-in / not-admin / forbidden)
  is downstream of that single point, one call covers all of them:
  - `app.js` — after `loadManifest()` + `loadProgress()` resolve (`init`, ~`:334`).
  - `cert.js` — after `/api/me` resolves (`init`, ~`:132`).
  - `dashboard.js` — after the `Promise.all([loadAgg(), loadCurriculum()])`
    resolves (`init`, ~`:430`).
- **Friendly error on throw.** Change each top-level
  `.catch(e => document.body.innerHTML = "<pre …red…>" + e.message)` to
  `.catch(e => showPageError(e, init))` (`app.js:390`, `cert.js:161`,
  `dashboard.js:458`).

### Data flow

```
first paint → #page-loader spinner visible (static, pre-JS)
  → init() awaits fetch(es)
      → success: hidePageLoader() + reveal the right container
      → throw:   showPageError(err, init) shows error card + Retry
                    → Retry re-runs init() from scratch
```

## Edge cases & notes

- **Retry idempotency.** Retry re-runs `init()` from the top. On pages that attach
  event listeners late (dashboard filters/tabs/export, tracker feedback), a retry
  only fires after a *failed early load* — the listener-attaching code runs near the
  end of `init()` and won't have executed on a failed run — so double-binding is not
  a practical risk. Documented here rather than guarded against.
- **403 forbidden on tracker** (`app.js:343`) currently also does a red
  `body.innerHTML` swap. Route it through `showPageError` too (message: admins-only),
  but with **no Retry** (retrying won't change authorization) — or keep it as a
  distinct static message. Implementation may keep it simple; the key requirement is
  it no longer shows a raw red `<pre>`. (dashboard's 403 already has a graceful
  `#not-admin` container and is untouched.)
- **dashboard 401** already redirects to `tracker.html` (`dashboard.js:8`); the
  loader is simply still on screen during the redirect — acceptable.

## Testing

Static-frontend behavior, no build. Verify manually by throttling/stopping the local
Worker (`wrangler dev`) or using browser devtools network throttling:

1. **Spinner during the wait** — on each of the three pages, confirm the centered
   spinner shows before content and disappears when content appears.
2. **Error + Retry** — kill the Worker, load each page, confirm the friendly error
   card (not a red `<pre>`) with the topbar intact; restart the Worker, click Retry,
   confirm the page loads.
3. **Reduced motion** — with `prefers-reduced-motion: reduce`, confirm the ring is
   static (no spin) and still visible.
```
