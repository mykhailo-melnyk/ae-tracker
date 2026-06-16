# Agentic Process Design

Orchestration is design, not luck. A reliable agent workflow comes from deliberately
choosing *which* pattern fits the task — not from one giant "do everything" prompt. These
are the building blocks.

## Reflection

- The agent reviews and critiques its own output before finishing: draft → critique →
  revise. A second pass catches errors the first pass made.
- Most effective when the critique step has a concrete rubric or runs real checks (tests,
  linters) rather than just "look again."

## Tool use

- Give the agent tools (run code, search, query an API, read files) so it acts on the world
  instead of guessing from frozen knowledge. The skill is **scoping** tools narrowly and
  describing them precisely — vague tools produce vague behaviour.
- Fewer, well-described tools beat a sprawling toolbox the model picks from poorly.

## Planning

- For multi-step work, have the agent produce an explicit plan first, then execute against
  it (this is L3's Plan mode, applied programmatically). Plans make the work inspectable and
  let you intervene before, not after, mistakes compound.

## Multi-agent patterns

- **Orchestrator–worker:** a coordinator decomposes a task and delegates sub-tasks to
  focused sub-agents, each with its own clean context window. Keeps the main thread focused
  and lets big migrations/audits fan out.
- **Evaluator–optimizer:** one agent produces, another scores against criteria, looping
  until the score clears a bar. Pairs naturally with your eval datasets.

## Choosing

Match the pattern to the task: single well-specified step → just prompt it; quality-critical
→ add reflection or evaluator–optimizer; multi-file / parallelizable → orchestrator–worker.
Adding agents adds cost and failure surface — reach for the simplest pattern that meets the
bar.
