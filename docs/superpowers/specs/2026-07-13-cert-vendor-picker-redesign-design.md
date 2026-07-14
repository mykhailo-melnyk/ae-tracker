# Design: Two-tier vendor → certification picker on the cert page

**Date:** 2026-07-13
**Status:** Approved (brainstorming)

## Summary

The certifications page (`public/cert.html` + `cert.js`) currently has a single,
flat picker: one row of `.comp-chip` buttons, one per registry certification
(today just "Claude Code"). This mirrors the *look* of the tracker's
competency picker (`.competency-picker`/`.comp-chip`), but not its *structure*:
the tracker has two tiers — pick a competency (Web/Mobile/Backend), then see
that competency's levels as pill cards (Level 1–5, each showing progress).

The certifications axis is explicitly designed to extend to multiple vendors
(Claude Code first, "the model is built to extend to AWS and others" — see
`docs/superpowers/specs/2026-07-02-claude-code-cert-prep-design.md`). A prior
task (`2026-07-13-cert-vendor-metadata-design.md`, already implemented on this
branch) added a `vendors` map to the registry and a "N of total" coverage line
purely as flat-picker copy. This design **replaces that flat picker and its
coverage line** with a real two-tier structure: **vendor chips** (top) →
**certification pill cards** (below, one per certification of the selected
vendor, styled exactly like the tracker's Level cards) → the existing
section/checklist view (unchanged) when a card is selected.

This is a pure frontend restructuring: no Worker changes, no new registry
data beyond what already exists after the prior task (in fact this design
*removes* two registry fields the prior task added, per user decision below).

## Why two tiers, and why now

With only one vendor and one certification today, a flat picker and a
two-tier picker look almost the same. But the whole point of the vendor
axis is to survive a second Anthropic certification and a second vendor
(AWS, etc.) without a redesign. Building the two-tier structure now, while
there's only one of each, is cheaper than migrating a flat-picker mental
model later once there's real data to reshuffle around it.

## Reverting part of the prior task

The prior task's "AE Tracker currently covers 1 of 4 Anthropic
certifications — see all ↗" line is **removed entirely** (explicit user
decision — not replaced, not moved). Its supporting registry fields are
removed too, per YAGNI (nothing will read them):

- `vendors.<key>.total_available` — removed.
- `vendors.<key>.source_url` — removed.
- `schema/validate-certifications.mjs`'s checks for those two fields —
  removed.

What stays from the prior task: `vendors.<key>.label` (needed to render the
vendor chip text) and each certification's `vendor` field + the validator's
cross-check that it resolves to a real vendor (needed for grouping
certifications under their vendor chip).

## Data flow

`public/certifications.json` after this change:

```json
{
  "version": "1.0",
  "vendors": {
    "anthropic": { "label": "Anthropic" }
  },
  "certifications": [
    { "id": "claude-code", "code": "cc", "label": "Claude Code", "vendor": "anthropic", "file": "certification.claude-code.json" }
  ]
}
```

On selecting a vendor, `cert.js` fetches **every** certification's path file
for that vendor in parallel (today: 1 file; a 4-certification Anthropic
catalog would be 4 small JSON fetches) — this single load supplies both the
per-card progress (done/total items) and the card's display name
(`exam.name`), so there's no need to denormalize the exam name into the
registry. This mirrors how the tracker's `curriculum.<id>.json` already
carries per-level task lists needed to render the Level pill bar.

The currently-selected certification becomes the "focused" card (auto-set to
the vendor's first certification on vendor selection, same zero-extra-click
default as today's single-cert auto-select).

## Rendering — `public/cert.html`

Add one new container between the existing `#cert-picker` (now the vendor
picker) and `#cert-banner`:

```html
<div class="pill-bar-wrap" id="cert-pill-bar-wrap"><div class="pill-bar cert-pill-bar" id="cert-pill-bar"></div></div>
```

Structural analog of the tracker's `#pill-bar-wrap`/`#pill-bar`, with one
addition: `styles.css`'s `.pill-bar` hardcodes `grid-template-columns:
repeat(5, 1fr)` (tuned for exactly 5 competency levels), which would leave
dead whitespace for a vendor with 1–4 certifications. A new CSS rule,
`.pill-bar.cert-pill-bar { grid-template-columns: repeat(auto-fill,
minmax(160px, 1fr)); }`, overrides only the column count for this row —
the individual `.pill`/`.pill-num`/`.pill-name`/`.pill-count`/`.pill-bar-mini`
card styles are reused completely unchanged. This is the one new CSS rule in
an otherwise reuse-only design.

## Rendering — `public/cert.js`

- **Vendor picker** (existing `#cert-picker`, `renderPicker` renamed/repurposed
  to render vendors): chips built from `Object.keys(REGISTRY.vendors)`,
  reusing `.comp-label`/`.comp-chips`/`.comp-chip`/`.comp-chip.on` exactly as
  today. No hint line underneath (the coverage note is removed, per above).
- **Certification pill bar** (new `renderCertPillBar`): one `.pill` per
  certification whose `vendor` matches the selected vendor, reusing
  `.pill`/`.pill-num`/`.pill-name`/`.pill-count`/`.pill-bar-mini` verbatim:
  - `.pill-num`: the certification's short `code`, upper-cased (e.g. "CC").
  - `.pill-name`: that certification's `exam.name`.
  - `.pill-count` / `.pill-bar-mini`: done/total items for that certification
    (same math as today's `allItems(path)` + `PROGRESS.tasks[...].done`).
  - Class `complete` when done === total; class `current` when this card is
    the focused certification (simpler than the tracker's level logic, which
    also tracks a separate "actual current level" — certifications have no
    such notion, so `current` here means only "this is the selected card").
  - Click selects that certification (sets it focused, re-renders the pill
    bar for the updated `current` highlight, then banner/totals/body as
    today).
- **Banner** (`renderBanner`): drops the "Prep path for: {exam.name}" line
  added by the prior task (now redundant with the pill card's own name).
  `exam.notes` / draft-note behavior is unchanged.
- **Totals** (`renderTotals`): unchanged — stays scoped to the focused
  certification only, not summed across the vendor (explicit user decision;
  the tracker's analogous "sum across all levels of the competency" behavior
  is *not* mirrored here).
- No changes to `toggleItem`, `renderBody`, or the checklist markup.

## Out of scope

- Any Worker-side change (`worker/src/certifications.ts`, `aggregate.ts`) —
  this is a pure frontend rendering change over already-loaded data.
- Adding the other 3 Anthropic certifications as real path files — separate
  content effort.
- Any change to how progress is stored or ticked.

## Rollout

Push to `main` → Pages deploys `public/**`. No Worker redeploy needed.
Verify: cert page shows the Anthropic vendor chip, one certification pill
card underneath ("CC" / "Claude Certified Architect – Foundations" / done
count), clicking it shows the existing checklist unchanged, and the old
"Prep path for:" banner line and "N of total" coverage line are both gone.
