# Cost, and when *not* to use AI (intro)

Two instincts serve you from day one: a rough sense of what AI usage **costs**, and a sense
of when a task is **not worth handing to AI at all**. The full treatment (token accounting,
tracing, failure analysis) lives at Level 4 — this is the early version so the reflex forms
before you have expensive habits.

## Cost, in one minute

- You pay per **token** — roughly, per chunk of text in *and* out, including everything the
  model re-reads each turn. A long conversation isn't free just because you're not retyping;
  the whole context is re-billed every message.
- **Big context is the main cost driver.** Dumping an entire repo into every prompt is slow
  *and* expensive. Give the agent the few files that matter.
- Cheap habits that add up: start fresh sessions instead of dragging a bloated one; scope
  your `@`-references; don't ask a frontier model to do a `grep`'s job.

You don't need to count tokens yet. Just stop treating context as infinite and free.

## When *not* to use AI

Reach for AI by default, but recognize the cases where it's the wrong tool:

- **You can't verify the output.** If you couldn't tell a correct answer from a confident
  wrong one in this domain, AI multiplies risk instead of removing it. (This is the whole
  point of Level 1.)
- **The task is trivial and deterministic.** A rename, a known one-liner, a mechanical find-
  and-replace — doing it directly is faster than prompting and reviewing.
- **The stakes are high and the change is subtle.** Security-critical logic, money movement,
  irreversible migrations — AI can *draft*, but the burden of understanding stays on you.
- **You're using it to avoid thinking about a decision you own.** Offloading a hard
  architectural call to a confident model is how you ship a plausible mistake.

## The takeaway

AI is a strong default, not a universal one. Knowing its price and its blind spots early is
what separates leverage from a large bill and a subtle bug. Level 4 makes this quantitative;
for now, just build the instinct.
