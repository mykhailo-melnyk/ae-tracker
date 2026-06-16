# Team Practices for AI Code

Individual review habits (L2) scale to a team only with shared norms. This is how a team
keeps quality high when a large share of its diffs are AI-assisted.

## PR-review norms for AI-generated code

- **Review the diff, not the author's confidence.** AI code is fluent and looks finished;
  that is exactly what makes it dangerous. Apply the same Logic → Security → Performance →
  Maintainability → Style pass from the *Code Review with AI* reading.
- **Every changed line must trace to the request.** Surgical changes only — flag drive-by
  refactors, speculative abstractions, and unrelated reformatting.
- **Be extra skeptical of tests submitted with the feature.** See *The AI-Test Trap* — a
  test written by the same agent that wrote the code may only confirm the code's own bugs.

## CI gates for AI changes

- Type-check, lint, and the existing test suite must pass before review — non-negotiable,
  same as human code.
- Add gates that catch the failure modes AI introduces: dependency/license checks,
  secret-scanning, and (where you have them) characterization tests around code the agent
  touched but didn't write.

## AI-PR disclosure

- Note in the PR description when a change was substantially AI-generated, and which parts
  the author has personally verified. This sets reviewer expectations and concentrates
  scrutiny where the author is least certain — it is **not** a badge of shame.

## Reviewer-load balancing

- AI lets one engineer open more, larger PRs. Without balancing, review becomes the
  bottleneck and a few reviewers burn out. Rotate reviewers, cap in-flight PRs per author,
  and prefer several small PRs over one large one.

## The AI-assisted work checklist

Before you open a PR for AI-assisted work, confirm:

1. **I read every line of the diff** and understand why each change is there.
2. **Every change traces to the task** — no unrequested edits.
3. **I verified the claims** the AI made (ran it, checked the docs, not just "looks right").
4. **The tests actually test the behaviour** — they'd fail if the feature broke.
5. **No secrets, PII, or internal-only details** leaked into prompts, code, or config.
