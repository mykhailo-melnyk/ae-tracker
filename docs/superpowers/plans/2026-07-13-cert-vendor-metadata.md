# Cert Vendor Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the certifications page explicitly state which exam a prep path targets and how many certifications that vendor currently offers in total, without hardcoding a number that only applies to Anthropic.

**Architecture:** Add a `vendors` map to the certifications registry (`public/certifications.json`), keyed by vendor id, holding `{label, total_available, source_url}`; each certification entry gains a `vendor` key pointing into that map. `public/cert.js` renders two new lines from data that's already loaded: a vendor-scoped "N of total" coverage note (computed from the registry) and the exam's official name (`exam.name`, already present in `certification.claude-code.json` but never rendered). `schema/validate-certifications.mjs` gains matching checks so a certification can never reference a non-existent vendor.

**Tech Stack:** Vanilla JS (no build step, no frontend test framework), Node (`schema/validate-certifications.mjs`, run via plain `node`, no test runner).

## Global Constraints

- Item/task IDs and progress storage are unaffected by this change — do not touch `worker/src/certifications.ts`, `worker/src/aggregate.ts`, or any `/api/mark`-related code.
- No new CSS classes: reuse `.comp-hint` (inside `.competency-picker`, defined `public/styles.css:363-366`) for the coverage note and `.move-on` (`public/styles.css:177-186`) for the exam-name line.
- No changes to `public/cert.html` — both new lines render into the existing `#cert-picker` and `#cert-banner` containers via innerHTML, same as the code already there.
- `vendors.<key>.total_available` is a manually-maintained fact about the vendor's public catalog (e.g. Anthropic's), independent of how many path files this repo has authored for that vendor — never derive it from `registry.certifications.length`.

---

### Task 1: Registry data model + validator + docs

**Files:**
- Modify: `public/certifications.json`
- Modify: `schema/validate-certifications.mjs`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: `public/certifications.json` now has a top-level `vendors: Record<string, {label: string, total_available: number, source_url: string}>` map, and each entry in `certifications[]` has a new required `vendor: string` field (a key into `vendors`). Task 2 reads both of these from the already-loaded `REGISTRY` global in `cert.js`.

- [ ] **Step 1: Add vendor validation to the validator (red)**

Open `schema/validate-certifications.mjs`. Find this block (near the top, right after `registry` is loaded):

```js
const registry = readJson(join(pub, "certifications.json"));
if (!registry.version) fail("certifications.json: missing version");
if (!Array.isArray(registry.certifications)) fail("certifications.json: certifications must be an array");
```

Replace it with:

```js
const registry = readJson(join(pub, "certifications.json"));
if (!registry.version) fail("certifications.json: missing version");
if (!Array.isArray(registry.certifications)) fail("certifications.json: certifications must be an array");

if (typeof registry.vendors !== "object" || registry.vendors === null || Array.isArray(registry.vendors)) {
  fail("certifications.json: vendors must be an object");
}
for (const [key, v] of Object.entries(registry.vendors ?? {})) {
  if (typeof v.label !== "string" || !v.label) fail(`vendor "${key}": missing/invalid "label"`);
  if (!Number.isInteger(v.total_available) || v.total_available <= 0) fail(`vendor "${key}": total_available must be a positive integer`);
  if (typeof v.source_url !== "string" || !v.source_url) fail(`vendor "${key}": missing/invalid "source_url"`);
}
```

Then find this line inside the `for (const cert of registry.certifications ?? [])` loop:

```js
  for (const k of ["id", "code", "label", "file"]) {
    if (typeof cert[k] !== "string" || !cert[k]) fail(`cert "${cert.id ?? "?"}": missing/invalid "${k}"`);
  }
```

Replace it with:

```js
  for (const k of ["id", "code", "label", "file", "vendor"]) {
    if (typeof cert[k] !== "string" || !cert[k]) fail(`cert "${cert.id ?? "?"}": missing/invalid "${k}"`);
  }
  if (cert.vendor && !(registry.vendors && registry.vendors[cert.vendor])) {
    fail(`cert "${cert.id}": vendor "${cert.vendor}" not found in registry vendors`);
  }
```

- [ ] **Step 2: Run the validator to verify it fails against the current (unmigrated) registry**

Run: `node schema/validate-certifications.mjs`

Expected output (exit code 1):

```
Certification validation FAILED:

certifications.json: vendors must be an object
cert "claude-code": missing/invalid "vendor"
```

- [ ] **Step 3: Migrate the registry data (green)**

Replace the full contents of `public/certifications.json` with:

```json
{
  "version": "1.0",
  "vendors": {
    "anthropic": {
      "label": "Anthropic",
      "total_available": 4,
      "source_url": "https://anthropic-partners.skilljar.com/page/partner-certifications"
    }
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

- [ ] **Step 4: Run the validator to verify it passes**

Run: `node schema/validate-certifications.mjs`

Expected output (exit code 0):

```
Certifications OK: registry + 1 path file(s), 25 unique item ids.
```

- [ ] **Step 5: Update `CLAUDE.md` docs**

In the "### Certifications" section, find this sentence:

```
Like the curriculum, it is a **registry + path files**: `public/certifications.json`
(the registry: `certifications[].{id,code,label,file}`) and one
```

Replace it with:

```
Like the curriculum, it is a **registry + path files**: `public/certifications.json`
(the registry: `certifications[].{id,code,label,vendor,file}` plus a top-level
`vendors` map of `{label,total_available,source_url}` per vendor — `total_available`
is that vendor's total public catalog size, e.g. Anthropic's, kept up to date by
hand and unrelated to how many path files this repo has) and one
```

In the "Common operations" table, find this row:

```
| Add a certification | Add `public/certification.<id>.json`, add an entry (with `file`, short `code`) to `public/certifications.json`, add a static import in `worker/src/certifications.ts`, then push (CI validates, Pages redeploys) and `wrangler deploy`. |
```

Replace it with:

```
| Add a certification | Add `public/certification.<id>.json`, add an entry (with `file`, short `code`, `vendor` — add a new `vendors` entry too if it's a new vendor) to `public/certifications.json`, add a static import in `worker/src/certifications.ts`, then push (CI validates, Pages redeploys) and `wrangler deploy`. |
| Update a vendor's certification count | Edit `vendors.<key>.total_available` in `public/certifications.json` when that vendor's public catalog size changes (e.g. Anthropic adds a 5th certification); push (CI validates, Pages redeploys). No Worker redeploy needed. |
```

- [ ] **Step 6: Commit**

```bash
git add public/certifications.json schema/validate-certifications.mjs CLAUDE.md
git commit -m "Add vendor-scoped certification count metadata to the registry"
```

---

### Task 2: Render exam name + vendor coverage on the cert page

**Files:**
- Modify: `public/cert.js`

**Interfaces:**
- Consumes: `REGISTRY.vendors: Record<string, {label, total_available, source_url}>` and `REGISTRY.certifications[].vendor: string` (Task 1). `CURRENT.exam.name: string | undefined` (already present in `public/certification.claude-code.json`, unchanged by this plan).
- Produces: no new exported functions consumed elsewhere — `renderPicker()` and `renderBanner()` keep their existing signatures (called from `renderCert()`, unchanged).

- [ ] **Step 1: Add the vendor coverage note to the picker**

In `public/cert.js`, replace the existing `renderPicker` function:

```js
function renderPicker() {
  const box = document.getElementById("cert-picker");
  const certs = REGISTRY.certifications || [];
  const chips = certs.map((c) => {
    const on = CURRENT && CURRENT.certification === c.id;
    return `<button type="button" class="comp-chip ${on ? "on" : ""}" data-cert="${c.id}">${c.label}</button>`;
  }).join("");
  box.innerHTML = `<div class="comp-label">Certification</div><div class="comp-chips">${chips}</div>`;
  box.querySelectorAll(".comp-chip").forEach((el) =>
    el.addEventListener("click", () => selectCert(el.dataset.cert)));
}
```

with:

```js
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
```

- [ ] **Step 2: Add the exam-name line to the banner**

In `public/cert.js`, replace the existing `renderBanner` function:

```js
function renderBanner() {
  const box = document.getElementById("cert-banner");
  if (CURRENT && CURRENT.draft) {
    const note = CURRENT.exam && CURRENT.exam.notes ? CURRENT.exam.notes : "This path is a draft under review.";
    box.innerHTML = `<div class="move-on"><strong>Draft:</strong> ${note}</div>`;
  } else if (CURRENT && CURRENT.exam && CURRENT.exam.notes) {
    box.innerHTML = `<div class="move-on">${CURRENT.exam.notes}</div>`;
  } else {
    box.innerHTML = "";
  }
}
```

with:

```js
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

- [ ] **Step 3: Manually verify in a browser (no auth/build step exists for this frontend)**

`public/cert.js` has no unit tests and no build step (per `CLAUDE.md`); the project's own convention for frontend changes is manual verification via a static server. Reaching `cert.html` normally requires GitHub OAuth login, which isn't available in an automated check, so use a temporary fixture that exercises the real `cert.js` render pipeline directly, without auth.

Create `public/_verify-cert.html` (temporary — not committed, deleted in Step 5):

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
    <div id="cert-banner"></div>
    <div class="competency-picker" id="cert-picker"></div>
    <div id="cert-body"></div>
  </div>
  <script src="cert.js"></script>
  <script>
    (async function () {
      REGISTRY = await loadRegistry();
      PROGRESS = { tasks: {} };
      CURRENT = await loadPath(REGISTRY.certifications[0].id);
      renderCert();
    })();
  </script>
</body>
</html>
```

Run: `npx http-server public -p 8080 -c-1` (from the repo root — matches the command already documented in `CLAUDE.md`).

Open `http://localhost:8080/_verify-cert.html` in the Browser pane and confirm:
- Under the "Certification" picker: **"AE Tracker currently covers 1 of 4 Anthropic certifications — see all ↗"**, with the link pointing to `https://anthropic-partners.skilljar.com/page/partner-certifications`.
- Above the section list: **"Prep path for: Claude Certified Architect – Foundations"**.
- The existing `exam.notes` text still renders below it (unchanged behavior).
- The checklist sections below still render normally (unaffected by this change).

- [ ] **Step 4: Stop the static server**

Stop the `http-server` process started in Step 3.

- [ ] **Step 5: Delete the temporary fixture and confirm it isn't staged**

```bash
rm public/_verify-cert.html
git status --short
```

Expected: `public/_verify-cert.html` does not appear in the output (nothing to delete-then-see, since it was never `git add`ed).

- [ ] **Step 6: Commit**

```bash
git add public/cert.js
git commit -m "Show exam name and vendor certification coverage on the cert page"
```
