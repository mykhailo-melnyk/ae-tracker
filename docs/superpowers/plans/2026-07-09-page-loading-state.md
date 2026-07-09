# Page-level Loading & Error States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a centered spinner while each page loads, and a friendly error card with Retry on fetch failure — replacing today's topbar-only blank screen and raw red `<pre>` crash.

**Architecture:** Static `#page-loader` markup visible by default on each page (paints pre-JS). Shared CSS in `styles.css`; shared `hidePageLoader()`/`showPageError()` helpers in `auth.js` (first script on every page). Each `init()` hides the loader once after its primary fetch and routes its top-level `.catch` through `showPageError`.

**Tech Stack:** Vanilla HTML/CSS/JS static site. No framework, no build step, no new dependency. Spec: `docs/superpowers/specs/2026-07-09-page-loading-state-design.md`.

## Global Constraints

- No framework, no bundler, no new dependency.
- Brand tokens (copy verbatim): accent `#2563eb`, page bg `#f8fafc`, text `#0f172a`, muted `#64748b`.
- Loader markup is **visible by default** — never `hidden`.
- Spinner animation must be wrapped in `@media (prefers-reduced-motion: reduce)` (static ring).
- No test framework exists for the frontend — verification is manual via `wrangler dev` + browser network throttling.

---

### Task 1: Shared CSS (spinner, loader, error card)

**Files:**
- Modify: `public/styles.css` (append a new block at end of file)

**Interfaces:**
- Produces: CSS classes `.page-loader`, `.spinner`, `.page-error`, `.page-error-retry` used by all HTML/JS tasks below.

- [ ] **Step 1: Append the CSS block** to the end of `public/styles.css`:

```css
/* ---- Page-level loading & error states ---- */
.page-loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 50vh;
  color: #64748b;
  font-size: 14px;
}
.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #e2e8f0;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .spinner { animation: none; }
}
.page-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 50vh;
  text-align: center;
  color: #475569;
}
.page-error .page-error-icon { font-size: 32px; }
.page-error h2 { font-size: 18px; color: #0f172a; margin: 0; }
.page-error p { margin: 0; color: #64748b; }
.page-error-retry {
  margin-top: 8px;
  padding: 8px 20px;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}
.page-error-retry:hover { background: #1d4ed8; }
```

- [ ] **Step 2: Verify** the file still loads (no syntax break): open `public/tracker.html` via `npx http-server public -p 8080 -c-1` and confirm the page renders (CSS parse errors would break all styling). No spinner yet — it's not wired.

- [ ] **Step 3: Commit**

```bash
git add public/styles.css
git commit -m "feat: add loading spinner & error-card styles"
```

---

### Task 2: Shared JS helpers in auth.js

**Files:**
- Modify: `public/auth.js` (append two functions)

**Interfaces:**
- Consumes: `.page-loader` / `.page-error` CSS from Task 1.
- Produces:
  - `hidePageLoader()` → removes `#page-loader` from the DOM (no-op if absent).
  - `showPageError(err, onRetry)` → removes `#page-loader`, appends a `.page-error` card to `document.body` (topbar untouched), wires its Retry button to call `onRetry()` after removing the card. If `onRetry` is falsy, no Retry button is rendered.

- [ ] **Step 1: Append to `public/auth.js`:**

```js
// Page-level loading / error UI. Shared by app.js, cert.js, dashboard.js — every
// page ships a visible-by-default #page-loader that init() clears once content is
// ready, and routes fatal load errors here instead of wiping the page to a red <pre>.
function hidePageLoader() {
  document.getElementById("page-loader")?.remove();
}

function showPageError(err, onRetry) {
  hidePageLoader();
  document.getElementById("page-error")?.remove(); // drop a prior error card on retry
  const card = document.createElement("div");
  card.id = "page-error";
  card.className = "page-error container";
  card.innerHTML = `
    <div class="page-error-icon">⚠</div>
    <h2>Couldn't load this page</h2>
    <p>${(err && err.message) || "Something went wrong. Check your connection."}</p>
  `;
  if (onRetry) {
    const btn = document.createElement("button");
    btn.className = "page-error-retry";
    btn.textContent = "Retry";
    btn.addEventListener("click", () => { card.remove(); onRetry(); });
    card.appendChild(btn);
  }
  document.body.appendChild(card);
}
```

- [ ] **Step 2: Commit**

```bash
git add public/auth.js
git commit -m "feat: add hidePageLoader & showPageError helpers"
```

---

### Task 3: Wire tracker page (tracker.html + app.js)

**Files:**
- Modify: `public/tracker.html` (add loader div after `.topbar`)
- Modify: `public/app.js` (`init` ~`:334`, top-level `.catch` `:390`; the 403 branch `:343-346`)

**Interfaces:**
- Consumes: `hidePageLoader`, `showPageError` (Task 2); `.page-loader`/`.spinner` (Task 1).

- [ ] **Step 1: Add loader markup** in `public/tracker.html` immediately after the closing `</div>` of `.topbar` (after line 13, before `<div id="signed-out" …>`):

```html
  <div id="page-loader" class="container">
    <div class="spinner"></div>
    <p>Loading…</p>
  </div>
```

- [ ] **Step 2: Hide the loader in `init()`.** In `public/app.js`, after both awaits resolve (right after `const result = await loadProgress();`, ~`:334`) and before the `if (result.unauthenticated)` branch, insert:

```js
  hidePageLoader();
```

- [ ] **Step 3: Replace the 403 red `<pre>`.** In `public/app.js` the forbidden branch (`:343-346`) currently sets `document.body.innerHTML`. Replace its body with:

```js
  if (result.forbidden) {
    showPageError(new Error("Forbidden — admins only."), null);
    return;
  }
```

- [ ] **Step 4: Route the top-level catch through showPageError.** Replace `app.js:390-392`:

```js
init().catch((e) => {
  showPageError(e, () => init());
});
```

- [ ] **Step 5: Verify manually.** Run the Worker (`cd worker && npm run dev`) and serve the frontend (`npx http-server public -p 8080 -c-1`), open `http://localhost:8080/tracker.html`:
  - With devtools network throttling (Slow 3G), confirm the spinner shows before content, then disappears when the tracker appears.
  - Stop the Worker, reload: confirm the error card (⚠ + Retry) shows with the topbar intact — **not** a red `<pre>`. Restart the Worker, click Retry, confirm the tracker loads.
  - With `prefers-reduced-motion: reduce` (devtools Rendering tab), confirm the ring is static.

- [ ] **Step 6: Commit**

```bash
git add public/tracker.html public/app.js
git commit -m "feat: loading & error states on tracker page"
```

---

### Task 4: Wire cert page (cert.html + cert.js)

**Files:**
- Modify: `public/cert.html` (add loader div after `.topbar`)
- Modify: `public/cert.js` (`init` ~`:132`, top-level `.catch` `:161`)

**Interfaces:**
- Consumes: `hidePageLoader`, `showPageError` (Task 2).

- [ ] **Step 1: Add loader markup** in `public/cert.html` immediately after the `.topbar` closing `</div>` (after line 13, before `<div id="signed-out" …>`):

```html
  <div id="page-loader" class="container">
    <div class="spinner"></div>
    <p>Loading…</p>
  </div>
```

- [ ] **Step 2: Hide the loader in `init()`.** In `public/cert.js`, right after `const res = await apiFetch(WORKER + "/api/me");` (`:132`) and before the `if (res.status === 401)` check, insert:

```js
  hidePageLoader();
```

- [ ] **Step 3: Route the top-level catch through showPageError.** Replace `cert.js:161-163`:

```js
init().catch((e) => {
  showPageError(e, () => init());
});
```

- [ ] **Step 4: Verify manually.** Open `http://localhost:8080/cert.html`: spinner during load; error card + working Retry when the Worker is stopped; static ring under reduced-motion.

- [ ] **Step 5: Commit**

```bash
git add public/cert.html public/cert.js
git commit -m "feat: loading & error states on cert page"
```

---

### Task 5: Wire dashboard page (dashboard.html + dashboard.js)

**Files:**
- Modify: `public/dashboard.html` (add loader div after `.topbar`)
- Modify: `public/dashboard.js` (`init` ~`:430`, top-level `.catch` `:458`)

**Interfaces:**
- Consumes: `hidePageLoader`, `showPageError` (Task 2). Note: dashboard also links `dashboard.css`, but the loader/error CSS lives in `styles.css` which dashboard.html also links — no change to `dashboard.css`.

- [ ] **Step 1: Add loader markup** in `public/dashboard.html` immediately after the `.topbar` closing `</div>` (after line 14, before `<div id="not-admin" …>`):

```html
  <div id="page-loader" class="container">
    <div class="spinner"></div>
    <p>Loading…</p>
  </div>
```

- [ ] **Step 2: Hide the loader in `init()`.** In `public/dashboard.js`, right after `const [agg, cur] = await Promise.all([loadAgg(), loadCurriculum()]);` (`:430`) insert:

```js
  hidePageLoader();
```

This runs before the `if (!AGG) return;` branch (the 403 `#not-admin` path and 401 redirect both happen inside `loadAgg`), so the loader is cleared on every outcome.

- [ ] **Step 3: Route the top-level catch through showPageError.** Replace `dashboard.js:458-460`:

```js
init().catch((e) => {
  showPageError(e, () => init());
});
```

- [ ] **Step 4: Verify manually.** Open `http://localhost:8080/dashboard.html` as an admin: spinner during the (heavier) aggregate load; error card + working Retry when the Worker is stopped; static ring under reduced-motion. Confirm the `#not-admin` path (non-admin user) still shows its own message and the loader is gone.

- [ ] **Step 5: Commit**

```bash
git add public/dashboard.html public/dashboard.js
git commit -m "feat: loading & error states on dashboard page"
```

---

## Self-Review Notes

- **Spec coverage:** spinner during wait (Tasks 1,3,4,5) ✓; friendly error + Retry replacing red `<pre>` (Tasks 2,3,4,5) ✓; all three pages ✓; reduced-motion (Task 1) ✓; 403-forbidden no-Retry (Task 3, Step 3) ✓; retry re-runs init ✓.
- **No per-section skeletons** — out of scope per spec (secondary fetches run after shell is visible).
- **Type consistency:** `hidePageLoader()` / `showPageError(err, onRetry)` names identical across Tasks 2–5. Loader element id `page-loader`, error id `page-error` consistent throughout.
```
