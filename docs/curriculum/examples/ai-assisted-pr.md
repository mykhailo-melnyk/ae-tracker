# Golden example — a good AI-assisted PR

AI-assisted doesn't mean AI-authored-and-shipped. A good AI-assisted PR looks like careful
human work because the human did the part that matters: **reviewing, correcting, and owning**
the diff. Below is an annotated exemplar PR description; the **▸ why** lines are commentary.

---

```markdown
## What & why
Adds a per-client rate limit to `/api/search` (spec: docs/specs/search-rate-limit.md).
Fixes the upstream-quota exhaustion we hit twice in May.

## How
In-memory sliding-window counter keyed by client token, checked in the router before the
upstream call. Limit is env-configurable (`SEARCH_RPM`, default 60). Over-limit → 429 +
Retry-After.

## AI assistance & review notes
- Draft generated with Claude Code in Plan mode, then reviewed diff-by-diff.
- **Caught and fixed:** the first draft used a fixed 60s bucket (allows a 120-burst at the
  boundary). Replaced with a sliding window — see commit 3.
- **Caught and fixed:** draft added a `lodash` dependency for `throttle`; removed, used a
  plain Map (spec says no new deps).
- **Left as-is:** the counter map isn't bounded — acceptable per the spec's non-goal on
  persistence, noted as a follow-up (#412).

## Tests
- New: boundary test (61st request → 429), isolation test (second client unaffected),
  config test (env var changes the limit). All added by me after reviewing the AI's tests,
  which missed the boundary case.

## Verification
`npm test` green; manually curled 61 requests locally and confirmed 429 + Retry-After.
```

> **▸ why (the whole thing)** — What makes this PR trustworthy isn't that AI wrote it. It's
> that the description is **honest about what the AI got wrong and what the human did about
> it**. Three signals a reviewer looks for, all present here:
>
> - **The plausible-but-wrong parts were caught** (the boundary-burst bug, the needless
>   dependency). This is the #1 risk of AI code — code that looks right and passes a glance.
> - **The tests are the author's, not the AI's alone.** The author noticed the AI's tests
>   missed the boundary and added it. AI-written tests that only cover what the AI built are
>   a rubber stamp, not a check.
> - **Scope was held to the spec** — the unbounded-map "flaw" is a *declared non-goal*, linked
>   as a follow-up rather than silently gold-plated.

---

## What makes it good

- **Traceable to a spec** — reviewer can check the diff against an agreed contract.
- **The review trail is visible** — what the AI got wrong, and the fix, is in the description.
- **The diff is surgical** — no drive-by refactors, no unrequested changes.
- **The human owns the tests and the verification** — not delegated wholesale to the model.

## Smells to avoid

- "Generated with AI ✨" and nothing about what was reviewed or corrected.
- Tests that only assert what the AI already made pass.
- A diff far larger than the change described (scope creep the author didn't push back on).
- No evidence anyone ran it beyond the model saying it works.
