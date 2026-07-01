# Your tools are portable (not just Claude Code)

This curriculum teaches with Claude Code because it's what Solvd standardizes on. But the
**skills** you're building are not Claude-specific — and it's worth knowing that early, so
you're not stranded if you land on a client who mandates a different stack.

## What's portable (almost everything)

The judgment this path trains transfers to any competent agentic tool:

- **Reading before writing** — using AI to understand code you don't know.
- **Diff review & simplification** — spotting overcomplicated output and pushing back.
- **Context engineering** — controlling what the model can see and when.
- **Plan-before-implement** — specs, plans, verifying against them.
- **Orchestration** — hooks, custom commands, subagents, feedback loops.

None of that depends on Claude. It's how you *work* with an agent, not which agent.

## What's tool-specific (a thin layer)

- The exact slash commands (`/btw`, `/branch`, Plan mode UI).
- The skills / plugin format and the MCP setup details.
- Some model-specific prompting habits.

These are the part you'd relearn on a different tool — a day, not a level.

## The main alternatives

- **OpenCode** — open-source and model-agnostic: it runs whatever model you point it at,
  including internal or locally-hosted ones. Useful when a client can't send code to a
  third-party API.
- **Codex** — OpenAI's equivalent of Claude Code, wired to their models.

Both do planning, review, and orchestration; the concepts in this curriculum map onto them
directly. If a project mandates one of these, you're not starting over — you're re-binding
commands you already understand.

## The takeaway

Learn the *habits* deeply and treat the *tool* as swappable. An engineer who only knows
"which button in Claude Code" is fragile; one who knows *why* each step matters can pick up
any agent in an afternoon.
