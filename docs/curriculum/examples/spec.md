# Golden example — a good spec

A spec is the contract you agree on **before** the agent writes code. A good one is short
enough to read in two minutes and precise enough that "done" is not a matter of opinion.
Below is an annotated exemplar; the **▸ why** lines are commentary.

---

```markdown
# Spec: Rate-limit the public search endpoint

## Problem
`/api/search` has no rate limit. A single client can exhaust the upstream quota and
take search down for everyone. We saw this happen twice last month.
```

> **▸ why** — Leads with the *problem and its evidence*, not the solution. This lets the
> agent (and the reviewer) judge whether the proposed change actually addresses it, and
> catches "solving the wrong problem" before any code exists.

```markdown
## Desired outcome
Per-client limit of 60 requests/minute on `/api/search`. Over-limit requests get
HTTP 429 with a `Retry-After` header. Other endpoints are unaffected.
```

> **▸ why** — Concrete and measurable: a number, a status code, a header, an explicit
> blast radius. "Add rate limiting" would leave every one of those to chance.

```markdown
## Acceptance criteria
- [ ] 61st request within 60s from the same client key returns 429 + Retry-After.
- [ ] Requests from a different client key are unaffected.
- [ ] Limit is configurable via env var (no redeploy to tune).
- [ ] Existing search behaviour under the limit is byte-identical to today.
```

> **▸ why** — Each criterion is a **test you could write**. This is the heart of the spec:
> it turns "looks good" into pass/fail and becomes the checklist you verify the diff against.

```markdown
## Non-goals
- Not building a global/org-wide limit (per-client only).
- Not persisting counters across Worker restarts (in-memory window is acceptable).
- Not adding a dashboard for limit metrics.
```

> **▸ why** — **Non-goals are what stop scope creep.** They give the agent explicit
> permission to *not* build things, which is where AI most often over-delivers.

```markdown
## Constraints
- Preserve the injected `fetchFn` test seam.
- No new dependencies — use the platform primitives.
```

---

## What makes it good

- **Problem before solution.** Anchored in a real failure, so the fix is judged against it.
- **Acceptance criteria are executable.** Every checkbox maps to a test — no ambiguity about "done".
- **Non-goals are explicit.** The single most effective scope-control tool in a spec.
- **It's short.** A spec you won't read isn't a contract, it's decoration.

## Smells to avoid

- Describing implementation ("add a `RateLimiter` class with a token bucket") instead of
  outcome — that's the agent's job to propose in Plan mode, not yours to pre-decide.
- Vague criteria ("should be fast", "handle errors gracefully") that can't be checked.
- No non-goals — a spec with no boundaries invites a 40-file diff.
