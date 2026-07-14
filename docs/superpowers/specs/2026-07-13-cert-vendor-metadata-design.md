# Design: Explicit exam name + vendor certification counts on the cert page

**Date:** 2026-07-13
**Status:** Approved (brainstorming)

## Summary

Anthropic's partner certification catalog changed: it now lists **4** distinct
certifications (Associate – Foundations, Developer – Foundations, Architect –
Foundations, Architect – Professional), reachable from
`https://anthropic-partners.skilljar.com/page/partner-certifications`. The
`ae-tracker` cert page currently ships prep content for exactly **one** of
those four (`claude-code` → targets "Claude Certified Architect –
Foundations"), but the page never says so explicitly:

- `certification.claude-code.json` already stores `exam.name` ("Claude
  Certified Architect – Foundations") but `cert.js` never renders it.
- Nothing on the page states how many certifications exist in total or how
  many this tracker currently covers.

This is a content/UI gap fix, not a new feature: surface data that mostly
already exists, plus a small vendor-scoped metadata addition for the "N of
total" count.

## Why vendor-scoped, not a flat total

The certifications axis is explicitly designed to extend beyond Anthropic
(`docs/superpowers/specs/2026-07-02-claude-code-cert-prep-design.md`: "Claude
Code is the first; the model is built to extend to AWS and others"). A single
flat `external_total` on the registry would be wrong the moment a
non-Anthropic certification is added — its vendor has its own unrelated
catalog size. So the "how many does this vendor offer, and where" fact is
grouped per vendor, keyed by a `vendor` field on each certification entry.

## Data model changes

### `public/certifications.json` — add a `vendors` map

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

- `vendors.<key>.label` — display name of the vendor.
- `vendors.<key>.total_available` — how many certifications that vendor
  currently offers (per their public catalog page), **not** how many this
  tracker has path files for. Updated by hand when the vendor's catalog
  changes.
- `vendors.<key>.source_url` — link to the vendor's certification catalog
  page, for the "see all" link.
- Each certification entry gains `"vendor"`, a key into `vendors`. Required
  for every entry.

No changes to `public/certification.<id>.json` path files — `exam.name`
already exists and is reused as-is.

## Frontend changes — `public/cert.js`

- `renderPicker()` (or a small new render step called alongside it): render a
  coverage line under the picker header sourced from the *selected*
  certification's vendor, e.g.:

  > AE Tracker currently covers 1 of 4 Anthropic certifications — see all ↗

  ("1" = `REGISTRY.certifications.filter(c => c.vendor === current.vendor).length`,
  "4" = `REGISTRY.vendors[current.vendor].total_available`; the link targets
  `source_url`.)
- `renderBanner()` (or the same render step): show the exam name explicitly
  above the sections, using the already-loaded `CURRENT.exam.name`, e.g.:

  > Prep path for: **Claude Certified Architect – Foundations**

  Rendered only when `CURRENT.exam?.name` is present (path files without an
  `exam` block, if any exist later, simply omit the line).
- No changes to `toggleItem`, progress math, or the picker's chip-selection
  behavior.

## HTML changes — `public/cert.html`

No new containers required — both new lines render into existing elements
(`#cert-picker` for the coverage line, `#cert-banner` or the top of
`#cert-body` for the exam-name line). Exact DOM wiring is an implementation
detail decided while coding, not a structural change worth pre-specifying.

## Validation — `schema/validate-certifications.mjs`

Extend the existing registry check:

- `vendors` object must exist; each vendor entry has `label` (string),
  `total_available` (positive integer), `source_url` (string).
- Every certification's `vendor` field must be a key present in `vendors`
  (new cross-check, same style as the existing `file` exists check).

## Worker — `worker/src/certifications.ts`

No changes. The Worker only consumes `{id, code, label}` for building the
aggregate; `vendor` and the new `vendors` map are frontend-only display
metadata and don't need to reach the Worker bundle.

## Docs — `CLAUDE.md`

Update the "Certifications" architecture note and the "Add a certification"
row in Common Operations to mention the new required `vendor` field and that
`vendors.<key>.total_available` needs manual updates when a vendor's public
catalog size changes.

## Out of scope

- Renaming the `claude-code` certification's registry `label` (currently
  "Claude Code") to match the exam name — not requested; left as-is.
- Adding the other 3 Anthropic certifications (Associate, Developer,
  Architect – Professional) as new path files — a separate, larger content
  effort.
- Any change to how progress is stored, ticked, or aggregated.

## Rollout

Push to `main` → Pages deploys `public/**`. No Worker redeploy needed (no
Worker-side change). Verify: cert page shows the "1 of 4 Anthropic
certifications" line and the exam name line for `claude-code`; schema
validation passes locally (`node schema/validate-certifications.mjs`).
