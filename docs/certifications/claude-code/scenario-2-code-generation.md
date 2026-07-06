# Scenario 2: Code Generation with Claude Code

You are using Claude Code to accelerate development — generation, refactoring, debugging, and documentation — and need to integrate it into the team workflow with custom slash commands, `CLAUDE.md` configuration, and a correct choice between plan mode and direct execution. There's no single numeric target here; what's evaluated is whether the configuration and mode choices are correct.

## Primary domains

- **Domain 3 — Claude Code Configuration & Workflows.** The `CLAUDE.md` hierarchy, slash commands, path-scoped rules, skills, and plan mode vs. direct execution. This is the core of the scenario.
- **Domain 5 — Context Management & Reliability.** Managing context in long sessions and avoiding the lost-in-the-middle effect.

## Signature failure modes

**Symptom:** a custom command works for its author but isn't available to the rest of the team after they clone the repo.
**Root cause:** the command was placed in the user-level personal directory instead of the project-scoped one.
**Best practice:** put shared commands in the project-scoped `.claude/commands/` directory, which is version-controlled and available to everyone automatically. Watch for the classic distractor of a `commands` array inside a config file — that mechanism doesn't exist; the location of the file, not an entry in a manifest, is what determines whether a command is shared.

**Symptom:** a large architectural change — splitting a monolith into microservices, spanning many files with multiple valid ways to draw service boundaries — is attempted with direct execution and goes sideways.
**Root cause:** the complexity was knowable from the requirements up front, so starting in direct execution and switching only once trouble appears means redoing work on a context that's already been polluted.
**Best practice:** use plan mode to explore and design before touching code. The frequently-correct answer is a hybrid: plan mode for the design phase, then direct execution once the plan is settled, for the implementation phase.

**Symptom:** a testing convention (say, colocating a test file with its component) needs to apply consistently across files scattered throughout the codebase, regardless of which directory they live in.
**Best practice:** use `.claude/rules/` with YAML frontmatter specifying a glob `paths:` pattern, so the rule activates whenever a matching file is being edited, independent of location. A directory-level `CLAUDE.md` is the wrong tool here — it's tied to a single folder and would have to be duplicated everywhere the pattern occurs. Dumping the same convention into a bloated root `CLAUDE.md` costs tokens on every request and risks lost-in-the-middle. A skill would also miss the mark, since skills require an explicit invocation rather than triggering automatically on a file match.

**Symptom:** a single, ever-growing root `CLAUDE.md` holds every team convention, and the model starts missing content in the middle of it while every request pays the token cost of the whole file.
**Best practice:** break the file up with `@import`s and path-scoped rules, and keep the most load-bearing instructions at the beginning or end of the file, where attention is most reliable.

A few standing heuristics resolve most of the judgment calls in this scenario. The `CLAUDE.md` hierarchy runs user-level (`~/.claude/CLAUDE.md`) → project-level (root or `.claude/CLAUDE.md`) → directory-level, and "everyone needs this after cloning" is the signal for project-level — what determines sharing is the file's location inside `.claude/` (tracked by git), not a `.gitignore` entry. Skills and slash commands have converged on the same `/name` invocation, but skills are the recommended path going forward, since they add frontmatter capabilities like `context: fork` (isolated output), `allowed-tools`, and `argument-hint`. For long sessions, `/compact` shrinks accumulated context, `--resume <session>` continues a specific prior session, and `fork_session` explores several divergent approaches from one shared baseline.

## Domain → this scenario

| Task Statement | How it surfaces here |
|---|---|
| 3.1 — `CLAUDE.md` hierarchy | Project-level vs. user-level; "everyone needs this after clone" |
| 3.2 / 3.3 — rules & path scoping | `.claude/rules/` with glob `paths:` for scattered test-file conventions |
| 3.4 — skills vs. slash commands | Command scope (`.claude/commands/` vs. personal directory) |
| 3.6 — plan mode vs. direct execution | Monolith → microservices calls for plan mode; a small fix calls for direct execution; hybrid for both |
| 5.1 — lost-in-the-middle | Argument against one bloated root `CLAUDE.md` |
