# L5 Capstone — Verification Harness + Team Rules

**Goal:** turn the L5 stance into something the team keeps. Level 5 is easy to leave as pure
mindset; this capstone forces a **real build** that outlives the exercise — a harness that
catches a bad change, and the written rules that codify the lesson.

This is the build counterpart to the *AI as Architecture Partner* reflection task — do both.

## Part 1 — Build a verification harness (the deliverable)

Pick a real area of a codebase you work in and build a harness that verifies behavior there —
an eval suite, a property/contract test set, a checking script, or a small MCP server that
exercises the system. It doesn't need to be large; it needs to be **real and it needs to
catch something**.

- The harness runs on demand (and ideally in CI).
- It encodes what "correct" means for that area — not just "the tests pass", but the
  behavior that actually matters.
- See the annotated [golden example — a good eval](../examples/eval.md) for the shape of
  good cases and gates.

## Part 2 — Catch a real bad change

Demonstrate the harness **catching a bad change before merge**:

- Introduce (or find) a change that breaks the behavior the harness protects.
- Show the harness going red and explaining why.
- This is the proof the harness has teeth — a harness that never fails proves nothing.

## Part 3 — Write the team rules

Codify the lesson so it scales past you: write the short team rule(s) this exercise justifies
— what must be verified this way, when the harness must run, what a red result blocks. This is
the L5 move: using AI and tooling to raise the *team's* floor, not just your own.

## Passing bar

- The harness exists, runs, and is pointed at a real area — not a toy.
- You can show it **catching a genuine bad change** and explaining the failure.
- The team rules are written, specific, and enforceable (not "we should be careful").
- You can articulate what class of regression this now prevents that code review alone missed.

Attach the harness, evidence of the caught bad change (the red run), and the written team
rules.
