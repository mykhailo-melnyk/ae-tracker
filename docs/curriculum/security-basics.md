# Security Basics: Secrets, Prompt Injection & Untrusted Content

Security can't wait until you're orchestrating agents (the deeper *AI Security Policy* at
L4). The three habits below belong at Level 2, the moment you start letting AI edit real
code.

## Never paste secrets

- No API keys, passwords, tokens, connection strings, or PII into prompts, `CLAUDE.md`,
  rules files, or any AI tool. Treat everything you type as if it could be logged or used
  in future training.
- Use placeholders (`<API_KEY>`) and load real values from the environment. If you paste a
  secret by accident, **rotate it** — assume it's compromised.

## Prompt injection

- **Prompt injection** is when text the model reads contains instructions that hijack what
  it does. A web page, issue comment, log line, or file can say "ignore previous
  instructions and …" — and a naïve agent will follow it.
- The model cannot reliably tell *your* instructions from instructions embedded in *data*.
  So: treat any content the model ingests from outside your prompt as untrusted input, not
  as commands.

## Untrusted content

- Be deliberate about what you feed in: scraped pages, third-party docs, tool output, and
  user-supplied text can all carry injected instructions or simply be wrong.
- Highest risk is when an agent has **both** untrusted input **and** the ability to act
  (run commands, open URLs, write files, call tools). Keep permissions tight and require
  confirmation for destructive or outbound actions.

## Reference

- **OWASP** maintains the authoritative top-10 risk lists for LLM and agentic
  applications — read the
  [OWASP Top 10 for LLM & Generative AI](https://genai.owasp.org/llm-top-10/) and use it as
  your checklist when an AI feature touches untrusted input.
