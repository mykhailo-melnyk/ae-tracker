# Cert Vendor Picker Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the certifications page's flat certification picker with a two-tier vendor → certification-pill-card structure that mirrors the tracker's competency → level-pill pattern, and remove the prior task's now-unwanted "N of total" coverage line and its supporting registry fields.

**Architecture:** `public/certifications.json`'s `vendors` map shrinks to `{label}` only (no `total_available`/`source_url`). `public/cert.js` gains a vendor picker (reusing `.competency-picker`/`.comp-chip`) and a certification pill bar (reusing the tracker's `.pill`/`.pill-num`/`.pill-name`/`.pill-count`/`.pill-bar-mini`, plus one new CSS rule for the container's grid since `.pill-bar`'s column count is hardcoded to 5). Selecting a vendor eagerly loads every one of its certifications' path files in parallel (supplies both per-card progress and each card's `exam.name` — no data denormalization needed); selecting a card focuses that certification and renders its existing checklist view unchanged.

**Tech Stack:** Vanilla JS (no build step, no frontend test framework), Node (`schema/validate-certifications.mjs`, run via plain `node`).

## Global Constraints

- Do not touch `worker/src/certifications.ts`, `worker/src/aggregate.ts`, `worker/src/api.ts`, or any `/api/mark`-related code — this is a pure frontend rendering change over already-loaded data.
- Do not change `renderBody`, `renderTotals`, or the checklist markup in `public/cert.js` themselves. `toggleItem` gets one narrow addition (Task 2 Step 4a below) so the new pill card's count/progress bar stay live — without it, the pill bar would visibly lag the existing "items done" counter until the next full re-render, a regression the redesign must not introduce. `renderCert()` gets a null-`CURRENT` guard (Task 2 Step 8a, added after task review) so a vendor with zero certifications shows an empty state instead of crashing — this guards the *call site*, not `renderTotals`/`renderBody` themselves.
- `renderTotals()` stays scoped to the focused certification only — do not sum across the vendor's certifications (explicit user decision; the tracker's analogous "sum across all levels" behavior is deliberately NOT mirrored here).
- The only new CSS in this plan is one rule for the pill-bar container's grid (`.pill-bar.cert-pill-bar`) — do not add any other new CSS classes; individual card styles (`.pill`, `.pill-num`, `.pill-name`, `.pill-count`, `.pill-bar-mini`) and the vendor chip styles (`.comp-label`, `.comp-chips`, `.comp-chip`, `.comp-chip.on`) are reused completely unchanged.
- `public/cert.js` has no unit tests and no build step; frontend changes are verified manually via a temporary local fixture and a static server (same approach as the prior cert task), never claimed working from the diff alone.

---

### Task 1: Registry cleanup — drop `total_available`/`source_url`

**Files:**
- Modify: `public/certifications.json`
- Modify: `schema/validate-certifications.mjs`

**Interfaces:**
- Produces: `public/certifications.json`'s `vendors.<key>` shape shrinks to `{label: string}` only. Task 2's `cert.js` reads only `REGISTRY.vendors[id].label` — it never reads `total_available` or `source_url` (they're being removed, not renamed).

- [ ] **Step 1: Remove the two fields from the registry data**

Replace the full contents of `public/certifications.json` with:

```json
{
  "version": "1.0",
  "vendors": {
    "anthropic": { "label": "Anthropic" }
  },
  "certifications": [
    {
      "id": "claude-code",
      "code": "cc",
      "label": "Claude Code",
      "vendor": "anthropic",
      "file": "certification.claude-code.json"
    }
  ]
}
```

- [ ] **Step 2: Remove the matching validator checks**

In `schema/validate-certifications.mjs`, find:

```js
for (const [key, v] of Object.entries(registry.vendors ?? {})) {
  if (typeof v.label !== "string" || !v.label) fail(`vendor "${key}": missing/invalid "label"`);
  if (!Number.isInteger(v.total_available) || v.total_available <= 0) fail(`vendor "${key}": total_available must be a positive integer`);
  if (typeof v.source_url !== "string" || !v.source_url) fail(`vendor "${key}": missing/invalid "source_url"`);
}
```

Replace it with:

```js
for (const [key, v] of Object.entries(registry.vendors ?? {})) {
  if (typeof v.label !== "string" || !v.label) fail(`vendor "${key}": missing/invalid "label"`);
}
```

Leave everything else in the file unchanged — the `vendors` object-shape check above this loop, and the per-certification `vendor` cross-check below it (`if (cert.vendor && !(registry.vendors && registry.vendors[cert.vendor])) ...`), both still apply and are unaffected by this removal.

- [ ] **Step 3: Run the validator to confirm it still passes**

Run: `node schema/validate-certifications.mjs`

Expected output (exit code 0):

```
Certifications OK: registry + 1 path file(s), 25 unique item ids.
```

This confirms the removal didn't break the still-required `label` check or the `vendor` cross-check (both exercised by the one real registry entry).

- [ ] **Step 4: Commit**

```bash
git add public/certifications.json schema/validate-certifications.mjs
git commit -m "Drop unused vendor total_available/source_url fields from cert registry"
```

---

### Task 2: Two-tier vendor/certification picker on the cert page

**Files:**
- Modify: `public/cert.html`
- Modify: `public/styles.css`
- Modify: `public/cert.js`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `REGISTRY.vendors: Record<string, {label: string}>` and `REGISTRY.certifications[].{id, code, label, vendor, file}` (Task 1's shape; `code`/`label`/`file` unchanged from before).
- Produces: no functions from this file are consumed elsewhere (`cert.js` is a page-local script) — internal renames are safe as long as `init()` still runs on load and `toggleItem`/`renderBody`/`renderTotals` keep their existing behavior.

- [ ] **Step 1: Reorder and extend `public/cert.html`'s app container**

Find:

```html
  <div id="cert-app" class="container hidden">
    <div class="greeting">
      <div>
        <h1>Certification prep</h1>
        <div class="lede">Self-paced paths toward external certification exams. Your ticks are saved to your account.</div>
      </div>
      <div class="totals" id="cert-totals"></div>
    </div>
    <div id="cert-banner"></div>
    <div class="competency-picker" id="cert-picker"></div>
    <div id="cert-body"></div>
  </div>
```

Replace it with:

```html
  <div id="cert-app" class="container hidden">
    <div class="greeting">
      <div>
        <h1>Certification prep</h1>
        <div class="lede">Self-paced paths toward external certification exams. Your ticks are saved to your account.</div>
      </div>
      <div class="totals" id="cert-totals"></div>
    </div>
    <div class="competency-picker" id="cert-picker"></div>
    <div class="pill-bar-wrap" id="cert-pill-bar-wrap"><div class="pill-bar cert-pill-bar" id="cert-pill-bar"></div></div>
    <div id="cert-banner"></div>
    <div id="cert-body"></div>
  </div>
```

(`#cert-picker` now renders vendor chips instead of certification chips; `#cert-banner` moved after the new pill bar, matching the tracker's picker → pill-bar → focus-content order.)

- [ ] **Step 2: Add the pill-bar grid override to `public/styles.css`**

Find:

```css
.pill-bar {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}
```

Add immediately after it:

```css
.pill-bar.cert-pill-bar {
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
}
```

(`.pill-bar`'s 5-column grid is tuned for the tracker's fixed 5 competency levels; the cert page has a variable number of certifications per vendor — 1 today, up to 4 for Anthropic — so this override replaces only the column count, keeping `.pill-bar`'s `display: grid` and `gap`.)

- [ ] **Step 3: Add vendor/certification state and rewrite the picker + banner in `public/cert.js`**

Find:

```js
const WORKER = window.WORKER_URL;
let REGISTRY = null;    // certifications.json
let PROGRESS = null;    // the engineer's progress file
let CURRENT = null;     // the loaded path file for the selected cert
```

Replace it with:

```js
const WORKER = window.WORKER_URL;
let REGISTRY = null;      // certifications.json
let PROGRESS = null;      // the engineer's progress file
let CURRENT = null;       // the loaded path file for the focused certification
let VENDOR_ID = null;     // selected vendor key (into REGISTRY.vendors)
let VENDOR_CERTS = [];    // [{ meta, path }] for every certification of the selected vendor
```

Find:

```js
// Uses the tracker's competency-picker markup (.comp-label / .comp-chips / .comp-chip.on),
// all defined under `.competency-picker` in styles.css — the only stylesheet cert.html loads.
function renderPicker() {
  const box = document.getElementById("cert-picker");
  const certs = REGISTRY.certifications || [];
  const chips = certs.map((c) => {
    const on = CURRENT && CURRENT.certification === c.id;
    return `<button type="button" class="comp-chip ${on ? "on" : ""}" data-cert="${c.id}">${c.label}</button>`;
  }).join("");
  box.innerHTML = `<div class="comp-label">Certification</div><div class="comp-chips">${chips}</div>${renderVendorCoverage(certs)}`;
  box.querySelectorAll(".comp-chip").forEach((el) =>
    el.addEventListener("click", () => selectCert(el.dataset.cert)));
}

// Vendor-scoped "N of total" note for the currently selected certification.
// Vendor totals live in REGISTRY.vendors, not on the certification itself,
// because unrelated vendors (Anthropic, AWS, ...) have unrelated catalog sizes.
function renderVendorCoverage(certs) {
  const current = certs.find((c) => CURRENT && CURRENT.certification === c.id);
  const vendor = current && REGISTRY.vendors && REGISTRY.vendors[current.vendor];
  if (!vendor) return "";
  const covered = certs.filter((c) => c.vendor === current.vendor).length;
  return `<div class="comp-hint">AE Tracker currently covers ${covered} of ${vendor.total_available} ${vendor.label} certifications — <a href="${vendor.source_url}" target="_blank" rel="noopener">see all ↗</a></div>`;
}

function renderBanner() {
  const box = document.getElementById("cert-banner");
  const parts = [];
  if (CURRENT && CURRENT.exam && CURRENT.exam.name) {
    parts.push(`<div class="move-on">Prep path for: <strong>${CURRENT.exam.name}</strong></div>`);
  }
  if (CURRENT && CURRENT.draft) {
    const note = CURRENT.exam && CURRENT.exam.notes ? CURRENT.exam.notes : "This path is a draft under review.";
    parts.push(`<div class="move-on"><strong>Draft:</strong> ${note}</div>`);
  } else if (CURRENT && CURRENT.exam && CURRENT.exam.notes) {
    parts.push(`<div class="move-on">${CURRENT.exam.notes}</div>`);
  }
  box.innerHTML = parts.join("");
}
```

Replace it with:

```js
// Vendor picker — uses the tracker's competency-picker markup (.comp-label /
// .comp-chips / .comp-chip.on), all defined under `.competency-picker` in
// styles.css — the only stylesheet cert.html loads.
function renderVendorPicker() {
  const box = document.getElementById("cert-picker");
  const vendorIds = Object.keys(REGISTRY.vendors || {});
  const chips = vendorIds.map((id) => {
    const on = VENDOR_ID === id;
    return `<button type="button" class="comp-chip ${on ? "on" : ""}" data-vendor="${id}">${REGISTRY.vendors[id].label}</button>`;
  }).join("");
  box.innerHTML = `<div class="comp-label">Vendor</div><div class="comp-chips">${chips}</div>`;
  box.querySelectorAll(".comp-chip").forEach((el) =>
    el.addEventListener("click", () => selectVendor(el.dataset.vendor)));
}

// Certification pill bar for the selected vendor — one .pill per certification,
// mirroring the tracker's renderPillBar (app.js) for competency levels. VENDOR_CERTS
// is fully loaded (every certification's path file) before this renders, so both
// progress counts and exam.name are available without extra fetches per card.
function renderCertPillBar() {
  const bar = document.getElementById("cert-pill-bar");
  bar.innerHTML = "";
  for (const { meta, path } of VENDOR_CERTS) {
    const items = allItems(path);
    const done = items.filter((it) => PROGRESS.tasks[it.id]?.done).length;
    const total = items.length;
    const complete = total > 0 && done === total;
    const isFocus = CURRENT && CURRENT.certification === meta.id;
    const cls = complete ? "complete" : (isFocus ? "current" : "");
    const pill = document.createElement("div");
    pill.className = "pill " + cls;
    pill.innerHTML = `
      <div class="pill-num">${meta.code.toUpperCase()}</div>
      <div class="pill-name">${(path.exam && path.exam.name) || meta.label}</div>
      <div class="pill-count">${complete ? "✓ " : ""}${done} / ${total}</div>
      <div class="pill-bar-mini"><div style="width:${total ? (done / total) * 100 : 0}%"></div></div>
    `;
    pill.addEventListener("click", () => focusCert(meta.id));
    bar.appendChild(pill);
  }
}

function renderBanner() {
  const box = document.getElementById("cert-banner");
  const parts = [];
  if (CURRENT && CURRENT.draft) {
    const note = CURRENT.exam && CURRENT.exam.notes ? CURRENT.exam.notes : "This path is a draft under review.";
    parts.push(`<div class="move-on"><strong>Draft:</strong> ${note}</div>`);
  } else if (CURRENT && CURRENT.exam && CURRENT.exam.notes) {
    parts.push(`<div class="move-on">${CURRENT.exam.notes}</div>`);
  }
  box.innerHTML = parts.join("");
}
```

- [ ] **Step 4: Replace `renderCert`/`selectCert` with vendor-scoped selection in `public/cert.js`**

Find:

```js
function renderCert() {
  renderPicker();
  renderBanner();
  renderTotals();
  renderBody();
}

async function selectCert(certId) {
  CURRENT = await loadPath(certId);
  renderCert();
}
```

Replace it with:

```js
function renderCert() {
  renderVendorPicker();
  renderCertPillBar();
  renderBanner();
  renderTotals();
  renderBody();
}

// Loads every certification's path file for the given vendor in parallel, then
// focuses the vendor's first certification (same zero-extra-click default the
// page had with a single certification before this redesign).
async function selectVendor(vendorId) {
  VENDOR_ID = vendorId;
  const certs = (REGISTRY.certifications || []).filter((c) => c.vendor === vendorId);
  VENDOR_CERTS = await Promise.all(certs.map(async (meta) => ({ meta, path: await loadPath(meta.id) })));
  CURRENT = VENDOR_CERTS.length ? VENDOR_CERTS[0].path : null;
  renderCert();
}

// Switches the focused certification within the already-loaded VENDOR_CERTS —
// no fetch needed, every vendor certification was loaded by selectVendor.
function focusCert(certId) {
  const entry = VENDOR_CERTS.find((v) => v.meta.id === certId);
  if (!entry) return;
  CURRENT = entry.path;
  renderCert();
}
```

- [ ] **Step 4a: Keep the pill bar's per-card progress live in `toggleItem`**

The new `renderCertPillBar()` computes each card's done/total count from
`PROGRESS.tasks`, but `toggleItem` currently only re-renders `renderTotals()`
(the top "items done" counter) and `renderBody()` (the checklist) — the pill
card would keep showing its stale pre-tick count until the next full
`renderCert()`. Find:

```js
async function toggleItem(itemId) {
  const currentlyDone = PROGRESS.tasks[itemId]?.done === true;
  const newDone = !currentlyDone;
  PROGRESS.tasks[itemId] = { done: newDone, at: new Date().toISOString() }; // optimistic
  renderTotals();
  renderBody();
  try {
    const res = await apiFetch(WORKER + "/api/mark", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task_id: itemId, done: newDone }),
    });
    if (!res.ok) throw new Error("mark failed: " + res.status);
    PROGRESS = await res.json();
  } catch (e) {
    PROGRESS.tasks[itemId] = { done: currentlyDone }; // roll back
    renderTotals();
    renderBody();
    alert("Could not save your change. Try again in a moment.");
  }
}
```

Replace it with:

```js
async function toggleItem(itemId) {
  const currentlyDone = PROGRESS.tasks[itemId]?.done === true;
  const newDone = !currentlyDone;
  PROGRESS.tasks[itemId] = { done: newDone, at: new Date().toISOString() }; // optimistic
  renderCertPillBar();
  renderTotals();
  renderBody();
  try {
    const res = await apiFetch(WORKER + "/api/mark", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task_id: itemId, done: newDone }),
    });
    if (!res.ok) throw new Error("mark failed: " + res.status);
    PROGRESS = await res.json();
  } catch (e) {
    PROGRESS.tasks[itemId] = { done: currentlyDone }; // roll back
    renderCertPillBar();
    renderTotals();
    renderBody();
    alert("Could not save your change. Try again in a moment.");
  }
}
```

(Only the two `renderCertPillBar()` calls are new — everything else in this function is unchanged, including the optimistic-update/rollback flow.)

- [ ] **Step 5: Update `init()`'s default selection in `public/cert.js`**

Find:

```js
  REGISTRY = await loadRegistry();
  document.getElementById("cert-app").classList.remove("hidden");
  const first = (REGISTRY.certifications || [])[0];
  if (first) await selectCert(first.id);
```

Replace it with:

```js
  REGISTRY = await loadRegistry();
  document.getElementById("cert-app").classList.remove("hidden");
  const firstVendor = Object.keys(REGISTRY.vendors || {})[0];
  if (firstVendor) await selectVendor(firstVendor);
```

- [ ] **Step 6: Manually verify in a browser**

`public/cert.js` has no unit tests and no build step; reaching `cert.html` normally requires GitHub OAuth login. Use the same temporary-fixture approach as the prior cert task: create `public/_verify-cert.html` (temporary — not committed, deleted in Step 8):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>cert.js verify fixture</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <div class="greeting">
      <div><h1>Certification prep</h1></div>
      <div class="totals" id="cert-totals"></div>
    </div>
    <div class="competency-picker" id="cert-picker"></div>
    <div class="pill-bar-wrap" id="cert-pill-bar-wrap"><div class="pill-bar cert-pill-bar" id="cert-pill-bar"></div></div>
    <div id="cert-banner"></div>
    <div id="cert-body"></div>
  </div>
  <script src="cert.js"></script>
  <script>
    // toggleItem() calls apiFetch (defined in auth.js, not loaded by this fixture) —
    // stub it so clicking a checklist item exercises the real render path (including
    // the new renderCertPillBar() call) without a real network/auth dependency.
    window.apiFetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      PROGRESS.tasks[body.task_id] = { done: body.done, at: "2026-01-01T00:00:00Z" };
      return { ok: true, json: async () => PROGRESS };
    };
    (async function () {
      REGISTRY = await loadRegistry();
      PROGRESS = { tasks: {} };
      const firstVendor = Object.keys(REGISTRY.vendors || {})[0];
      if (firstVendor) await selectVendor(firstVendor);
    })();
  </script>
</body>
</html>
```

Run: `npx http-server public -p 8080 -c-1` (from the repo root).

Open `http://localhost:8080/_verify-cert.html` in the Browser pane and confirm:
- Under a "Vendor" label: a single chip **"Anthropic"**, shown as selected (`.on`).
- Below it, one pill card: kicker **"CC"**, name **"Claude Certified Architect – Foundations"**, count **"0 / 25"**, an (empty) mini progress bar. The card sits at the left of a row with no dead whitespace forced by a 5-column grid (confirm via the Browser pane's layout, e.g. `zoom` or `read_page`, that the card's width is governed by `minmax(160px, 1fr)`, not stretched to 1/5 of the row).
- No "Prep path for:" line anywhere (removed).
- The existing `exam.notes` text still renders in the banner area below the pill bar.
- Clicking the pill card is a no-op visually (it's already focused) but doesn't error.
- Click a checklist item's checkbox and confirm the pill card's count updates immediately (e.g. to "1 / 25") and its mini progress bar grows — this exercises the `renderCertPillBar()` call added to `toggleItem` in Step 4a. Click it again to un-tick and confirm the count/bar revert.

- [ ] **Step 7: Stop the static server**

Stop the `http-server` process started in Step 6.

- [ ] **Step 8: Delete the temporary fixture and confirm it isn't staged**

```bash
rm public/_verify-cert.html
git status --short
```

Expected: `public/_verify-cert.html` does not appear in the output.

- [ ] **Step 8a: Guard against a vendor with zero certifications (added after task review)**

Task review flagged a real crash path introduced by Step 4's `selectVendor`:
if a vendor has no matching `REGISTRY.certifications[]` entries yet (e.g. its
`vendors` entry was added before its first certification file), `CURRENT`
stays `null`, but `renderCert()` still calls `renderTotals()`/`renderBody()`,
both of which dereference `CURRENT` directly and throw. Doesn't happen with
today's single-vendor/single-certification data, but is a real regression the
first time this ordering occurs. Find:

```js
function renderCert() {
  renderVendorPicker();
  renderCertPillBar();
  renderBanner();
  renderTotals();
  renderBody();
}
```

Replace it with:

```js
function renderCert() {
  renderVendorPicker();
  renderCertPillBar();
  if (!CURRENT) {
    document.getElementById("cert-totals").innerHTML = "";
    document.getElementById("cert-banner").innerHTML = "";
    document.getElementById("cert-body").innerHTML =
      `<div class="empty-path">This vendor has no certification prep paths yet.</div>`;
    return;
  }
  renderBanner();
  renderTotals();
  renderBody();
}
```

(`.empty-path` is the tracker's existing pre-selection-empty-state class,
`public/styles.css:395` — reused here rather than adding a new one. `renderTotals`
and `renderBody` themselves stay untouched; the guard lives in the one place
that decides whether to call them.)

Run: `node -e "require('fs')"` is not applicable here (no Node test for this
file); instead re-run the Step 6 browser fixture with a temporary edit
simulating an empty vendor — after loading the fixture, run this in the
Browser pane's JS console (or via the fixture's own inline script) to confirm
no crash and the empty-state message appears:

```js
VENDOR_CERTS = [];
CURRENT = null;
renderCert();
```

Confirm `#cert-body` shows "This vendor has no certification prep paths yet."
and no error appears in the console. Then reload the fixture (or re-run
`selectVendor(firstVendor)`) to restore the normal single-certification view
before continuing.

- [ ] **Step 9: Fix `CLAUDE.md`'s now-stale vendor field docs**

Task 1 already removed `total_available`/`source_url` from the registry, but
`CLAUDE.md` still describes them and still documents an operation for
maintaining them. Find:

```
(the registry: `certifications[].{id,code,label,vendor,file}` plus a top-level
`vendors` map of `{label,total_available,source_url}` per vendor — `total_available`
is that vendor's total public catalog size, e.g. Anthropic's, kept up to date by
hand and unrelated to how many path files this repo has) and one
```

Replace it with:

```
(the registry: `certifications[].{id,code,label,vendor,file}` plus a top-level
`vendors` map of `{label}` per vendor, used to group certifications by vendor
in the cert page's two-tier picker — vendor chips, then one pill card per
certification of the selected vendor) and one
```

Then find this row in the Common Operations table:

```
| Update a vendor's certification count | Edit `vendors.<key>.total_available` in `public/certifications.json` when that vendor's public catalog size changes (e.g. Anthropic adds a 5th certification); push (CI validates, Pages redeploys). No Worker redeploy needed. |
```

Delete this row entirely (the operation it describes no longer exists — there
is no `total_available` field to maintain).

- [ ] **Step 10: Commit**

```bash
git add public/cert.html public/styles.css public/cert.js CLAUDE.md
git commit -m "Replace flat cert picker with vendor + certification-pill-card structure"
```
