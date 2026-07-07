# Design: Certification prep paths (Claude Code first)

**Date:** 2026-07-02
**Status:** Approved (brainstorming)

## Summary

Add a **generic "certifications" axis** to the AE tracker: server-synced,
self-service preparation paths toward external certification exams. **Claude
Code** is the first; the model is built to extend to **AWS and others** by
adding data files (and one Worker import), never by re-plumbing.

Key properties, decided during brainstorming:

- **Cross-cutting & additive.** Every engineer, regardless of competency, can
  prep for any certification. It supplements — never replaces — their
  competency path.
- **Server-synced progress** (cross-device, preserved), reusing the existing
  progress store and endpoints — *not* localStorage.
- **Admin-visible from day one:** the dashboard gains a certification-readiness
  view.
- **Extensible by data:** a certification registry mirrors the curriculum
  manifest + path-file split.

### Why this shape (rejected alternatives)

- **Cert as a competency** — rejected. An engineer has at most one competency
  (`worker/src/api.ts:230`) and the dashboard measures each engineer against
  that single path (`worker/src/aggregate.ts:73-75`); selecting a "cert
  competency" would hide the real path and zero the engineer out of adoption
  stats.
- **localStorage-only standalone page** — rejected once server-synced progress
  and multi-cert extensibility became requirements.

## Data model — a registry mirroring the curriculum

Two-tier, exactly like `curriculum.json` (manifest) + `curriculum.<id>.json`
(paths).

### `public/certifications.json` — the registry

```json
{
  "version": "1.0",
  "certifications": [
    {
      "id": "claude-code",
      "code": "cc",
      "label": "Claude Code",
      "file": "certification.claude-code.json"
    }
  ]
}
```

- `id` — stable slug (used in URLs / aggregate keys).
- `code` — **short** namespace prefix for item IDs (see the 32-char constraint
  below). `cc` for Claude Code.
- `label` — display name.
- `file` — the path file to load.

### `public/certification.<id>.json` — one cert's prep path

```json
{
  "certification": "claude-code",
  "sections": [
    {
      "id": "fundamentals",
      "title": "Fundamentals",
      "items": [
        {
          "id": "cc.fund.1",
          "kind": "reading",
          "title": "…",
          "desc": "…",
          "link": "https://…",
          "estimated_minutes": 15
        }
      ]
    }
  ]
}
```

- Grouped by **exam domain** (`sections[]`), each a flat checklist (`items[]`).
- `kind` ∈ `reading | practice | video` (same set the curriculum uses, so
  existing `.kind-tag` styles apply).
- `link`, `estimated_minutes` optional per item.

### Item ID scheme — and the 32-char constraint

Progress is stored via the existing `/api/mark`, which **caps `task_id` at 32
characters** (`worker/src/api.ts:87`). Therefore item IDs use the short cert
`code`, not the full slug:

- Pattern: `^<code>\.[a-z0-9-]+\.\d+$` — e.g. `cc.fund.1`, `cc.mcp.3`.
- Globally unique across all cert path files and **distinct from curriculum IDs**
  (`web-L1.T1`), so they coexist safely in one `tasks` map.
- IDs are **stable identifiers**: renaming an id silently orphans its saved
  ticks. Documented in-file; enforced-for-length by validation (below).

## Progress storage — reuse what exists

Certification prep items are ordinary entries in the engineer's existing
`progress/<username>.json` `tasks` map:

- **Tick:** existing `POST /api/mark` (`{ task_id, done }`). It does **not**
  validate ids against the curriculum — it accepts any string ≤ 32 chars and
  writes `progress.tasks[id]` — so cert ids work unchanged, with the same
  optimistic-concurrency retry.
- **Read:** existing `GET /api/me` (returns the whole progress file).
- **No new endpoint, no new `ProgressFile` field.**

The current aggregate only ever reads competency-path task ids, so cert items
are invisible to it until we deliberately add the cert pass (below) — no
pollution of existing adoption stats.

## Frontend — the certification page

New files under `public/`:

- `public/cert.html` — the page shell (reuses `styles.css`; same `.topbar`
  brand markup as the tracker).
- `public/cert.js` — renders the picker + checklists, ticks via `/api/mark`.

Modified:

- `public/tracker.html` — add a **"🎓 Certifications"** link in the topbar
  (with a back-link from `cert.html` to the tracker).

### Auth

- **Sign-in required** (the cost of server-synced progress). Reuses `auth.js`
  (`apiFetch`, `authToken`, the `#t=` hash capture) — the token lives in
  `localStorage` on the shared github.io origin, so signing in on the tracker
  carries over to `cert.html`.
- A signed-out visitor sees a "Sign in on the tracker" prompt linking to
  `tracker.html` (the OAuth callback redirects to `tracker.html#t=…`; the token
  then persists for `cert.html`). No new OAuth flow.

### Behaviour

1. Load progress via `GET /api/me` and the registry via `certifications.json`.
2. Render a **certification picker** (Claude Code today; auto-lists future
   entries).
3. On select, fetch that cert's path file and render its **sections** (domain
   headings), each a checklist: checkbox + title + `kind` tag + estimate + link.
4. Done-state comes from `PROGRESS.tasks[itemId]?.done`; toggling calls
   `/api/mark`, which returns the updated progress.
5. Show **per-section counts** and an **overall progress bar** for the selected
   cert (the same visual language as the level pills). Because progress is
   per-item in the shared map, an engineer can prep for **multiple certs**
   simultaneously — each view computes its own completion.
6. Disabled engineers are blocked from ticking (the mark endpoint already
   enforces the disabled lock).

## Worker cert registry — `worker/src/certifications.ts`

Mirrors `worker/src/curriculum.ts`:

- Static imports: `../../public/certifications.json` + each
  `../../public/certification.<id>.json`.
- Exposes: the cert list (`{ id, code, label }[]`) and each cert's item ids
  (`itemsFor(certId): string[]`), plus a label lookup.
- **Adding a certification later requires adding a static import here and a
  Worker redeploy** — the same tradeoff competencies already have.

## Aggregate extension — `worker/src/aggregate.ts`

The per-engineer loop already reads the full `tasks` map; it gains a cert pass
using the cert registry's item ids. Two additions to the `Aggregate` shape:

- **Per-cert summary:**

  ```ts
  certifications: Array<{
    id: string;              // "claude-code"
    label: string;          // "Claude Code"
    total_items: number;
    engineers_started: number;  // ≥1 item done
    engineers_ready: number;    // ALL items done
  }>;
  ```

- **Per-engineer:** each `engineers[]` entry gains

  ```ts
  certifications: Record<string, { done: number; total: number; pct: number; ready: boolean }>;
  ```

Definitions (simple, adjustable later): **started** = ≥1 prep item done;
**ready** = all prep items done. Disabled engineers are excluded from the cert
headline counts, consistent with existing behaviour. **Bump the KV cache
version constant** (v4 → v5) so the new shape invalidates on deploy. The Worker
still degrades gracefully when `AGGREGATE_CACHE` is undefined.

## Dashboard UI — `dashboard.html` / `dashboard.js`

A new **"Certifications" section**:

- Per certification: a readiness bar + "X started / Y ready of N engineers".
- Per-engineer cert completion surfaced in the existing engineers table — a
  small progress chip / column per certification (reusing progress-bar styling).

## Validation — `schema/validate-certifications.mjs`

Mirrors `schema/validate-curriculum.mjs`; runs in CI alongside it:

- Registry: valid JSON; `version`, `certifications[]`; each entry has
  `id`, `code`, `label`, `file`; `file` exists.
- Each path file: valid JSON; `certification` matches the registry id;
  `sections[]` with `items[]`.
- Every `item.id`: globally unique, **≤ 32 chars** (the `/api/mark` footgun),
  matches `^<code>\.[a-z0-9-]+\.\d+$` for its cert's `code`.
- `kind` ∈ the allowed set.

A JSON Schema pair (registry + path) may be added mirroring the curriculum
schemas; a hand-rolled check is acceptable given the small surface. No vitest
changes required; optionally add an aggregate unit test for the cert pass.

## Content seeding

Seed `certification.claude-code.json` with domain sections and starter items,
with a **visible on-page banner** and an in-file note that content is **to be
reviewed against the official Anthropic exam blueprint**. Proposed starter
sections (subject to the blueprint):

1. **Fundamentals** — what Claude Code is, install/setup, modes, the CLI loop.
2. **Core workflows** — read-before-write, diff review, planning,
   `@`-references, slash/custom commands.
3. **Context & customization** — `CLAUDE.md`, context engineering, settings,
   permissions/hooks.
4. **MCP & extensions** — MCP servers, tools, skills.
5. **Orchestration & advanced** — subagents, automated feedback loops.
6. **Exam logistics & mock** — registration, format, a practice/mock step, and
   the final "take the exam" checkbox.

Where possible, `link` reuses existing KB / in-repo material already referenced
by the curriculum (e.g. `general/tools/claude-code.md`, the `CLAUDE.md` golden
example) to avoid net-new content.

## Docs — `CLAUDE.md`

- New architecture note: the **Certifications axis** (registry + path files,
  server-synced via the shared `tasks` map + `/api/mark`, admin-visible via the
  aggregate cert pass).
- New "Common operations" rows, mirroring the competency rows:
  - **Add a certification** — add `certification.<id>.json`, a
    `certifications.json` entry, a static import in `worker/src/certifications.ts`,
    then push (CI validates, Pages redeploys) and `wrangler deploy`.
  - **Update a cert's prep tasks** — edit that cert's path file (keep item ids
    `<code>.<section>.<n>`, ≤ 32 chars); push; `wrangler deploy` for the
    dashboard to reflect it.

## Rollout

Push to `main` → Pages deploys the frontend (`public/**`). **`wrangler deploy`
required** — the Worker bundles the cert JSON and ships the new aggregate shape.
Verify: cert page loads and lists Claude Code; ticks persist across reload and
devices; the dashboard shows the Certifications section and per-engineer chips.

## Out of scope

- A dedicated cert-progress API endpoint or `ProgressFile` field (reusing the
  `tasks` map is sufficient).
- Cert-specific *level* framework / gating logic — prep paths are flat
  domain checklists, not L1–L5 progressions.
- Authoring net-new lesson content beyond short prep blurbs and links to
  existing / official material.
- A follow-up (separate): reconcile Claude Code starter content against the
  confirmed official Anthropic exam blueprint.
