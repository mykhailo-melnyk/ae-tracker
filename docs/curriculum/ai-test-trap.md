# The AI-Test Trap

> If the same agent writes the code *and* the tests, a green suite proves only that the
> code does what the agent thought it should — including its bugs.

This is the single most common false-confidence trap in AI-assisted work. The tests
encode the *same misunderstanding* as the implementation, so they pass for the wrong
reason.

## Why it happens

- An LLM asked to "write tests for this" infers intent from the code it's looking at, not
  from an independent spec. Bug and test agree by construction.
- The tests look thorough — good names, many cases — which makes the green check feel like
  real coverage.

## How to break the loop

### Characterization tests
When you don't yet trust the behaviour, **pin the current behaviour first**, then read the
pinned values critically. A characterization test captures "what the code does today" so
you notice when a change alters it. Crucially, *you* assert the expected value — don't let
the AI fill it in from the code.

### Property-based testing
Instead of hand-picking examples (which the AI can cherry-pick to pass), state an
**invariant that must hold for all inputs** and let a generator throw hundreds of cases at
it. Examples:

- round-trip: `decode(encode(x)) == x`
- ordering: output is always sorted
- conservation: total in == total out

Property tests fail on inputs neither you nor the AI thought of — exactly the cases the
AI-written example tests miss.

## Practical rule

For anything load-bearing: **write or specify the test from intent, before or independent
of the implementation**, and prefer invariants over example outputs the AI can reverse-fit.
