# Golden example — a good `CLAUDE.md`

A `CLAUDE.md` is the standing brief you hand the agent at the start of every session. A good
one is **short, specific, and durable** — it encodes what the agent can't infer from the code,
and nothing it can. Below is an annotated exemplar; the **▸ why** lines are commentary, not
part of the file.

---

```markdown
# CLAUDE.md

## What this is
A Cloudflare Worker that fronts a rate-limited public API. Single entry point:
`src/index.ts` (hand-rolled fetch router). No framework.
```

> **▸ why** — One paragraph of orientation beats a wall of prose. It tells the agent the
> shape of the system and where to start reading. "No framework" pre-empts the agent
> reaching for Express/Hono out of habit.

```markdown
## Commands
- `npm test` — vitest (run before every commit)
- `npm run typecheck` — tsc --noEmit
- `npm run deploy` — wrangler deploy (production; ask first)
```

> **▸ why** — The agent guesses commands wrong constantly. Listing the real ones — and
> flagging which are destructive ("ask first") — saves a round-trip every session.

```markdown
## Conventions
- Handlers take an injected `fetchFn: typeof fetch = fetch` for test seams. Preserve it.
- Secrets live in `.dev.vars` (gitignored) locally, Wrangler secrets in prod. Never inline.
- Errors return `Response` objects, never throw across the router boundary.
```

> **▸ why** — These are the **non-obvious, load-bearing rules** — the ones a new engineer
> would break on day one. This is the highest-value section: it transfers tacit knowledge the
> code doesn't announce.

```markdown
## Gotchas
- `AGGREGATE_CACHE` (KV) may be undefined in dev — code must degrade, not crash.
```

> **▸ why** — One well-chosen gotcha prevents a whole class of "works on my machine" bugs.

---

## What makes it good

- **It's about *this* repo.** Zero generic advice ("write clean code", "add tests"). Every
  line would be wrong for a different project — that's the test of a useful `CLAUDE.md`.
- **It's short.** Long briefs get skimmed and go stale. If it's over ~a screen, cut.
- **It states rules, not aspirations.** "Preserve the `fetchFn` seam" is checkable; "follow
  best practices" is noise.
- **It flags the dangerous and the surprising** — destructive commands, undefined bindings —
  so the agent doesn't learn them by breaking them.

## Smells to avoid

- Restating what the code already says (file lists the agent can read itself).
- Style rules a linter already enforces.
- Anything that will be false in a month (version numbers, ticket links, "currently we…").
