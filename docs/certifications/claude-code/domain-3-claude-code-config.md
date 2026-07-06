# Domain 3: Claude Code Configuration & Workflows — 20%

This domain is about *where* configuration lives and *when* a mechanism fires — the recurring theme is choosing a deterministic control (a path glob, a hook, a non-interactive flag, an isolated review instance) over a probabilistic one (a prompt, a hope that the model behaves). For each Task Statement below, read *What's tested*, run the *Self-audit* honestly, then paste the *Deep-dive prompt* into an LLM to have it teach the concept, generate concrete examples and counter-examples, and quiz you until you can answer the *Active-recall self-check* from memory. The distinctions the exam rewards are almost all "which file / which flag / which scope" — so drill the exact locations and their sharing semantics.

## Task Statement 3.1 — Configure CLAUDE.md files with appropriate hierarchy, scoping, and modular organization

### What's tested
**Knowledge of:** the CLAUDE.md configuration hierarchy — user-level (`~/.claude/CLAUDE.md`), project-level (`.claude/CLAUDE.md` or a root `CLAUDE.md`), and directory-level (a `CLAUDE.md` inside a subfolder); that user-level settings apply only to that one user and are *not* shared with teammates through version control; the `@import` syntax for pulling external files into a CLAUDE.md to keep it modular (e.g. importing the standards file relevant to each package); the `.claude/rules/` directory as an alternative to one monolithic CLAUDE.md.
**Skills in:** diagnosing hierarchy issues (a new teammate not receiving instructions because they live in user-level rather than project-level config); using `@import` to selectively include the relevant standards in each package's CLAUDE.md; splitting a large CLAUDE.md into focused topic files under `.claude/rules/` (e.g. `testing.md`, `api-conventions.md`, `deployment.md`); using the `/memory` command to verify which memory files are actually loaded and to diagnose behavior that differs across sessions.
*Self-audit:* You can name the three hierarchy levels with their exact paths, and state the one rule that decides whether a config is shared with the team.

### Distilled notes
There are three levels and they read top-down into context: user (`~/.claude/CLAUDE.md`) → project (root `CLAUDE.md` or `.claude/CLAUDE.md`) → directory (a `CLAUDE.md` living inside a subfolder, which applies when you work in that folder). The single fact that resolves most questions here is the **sharing rule: sharing is decided by *location*, not by `.gitignore`.** Anything under the project's `.claude/` (or the root `CLAUDE.md`) is committed and therefore shared with everyone who clones; anything under `~/.claude/` is physically outside the repo and therefore personal. So the classic failure — "a new team member isn't getting the instructions after cloning" — means the instructions were placed at user level; the fix is to move them to project level.

Keep a CLAUDE.md modular in two complementary ways. `@import` references an external file so a package's CLAUDE.md pulls in only the standards its maintainer knows are relevant, instead of duplicating them. `.claude/rules/` splits a monolith into topic files (`testing.md`, `api-conventions.md`, `deployment.md`) — easier to maintain and, with path scoping (see 3.3), loaded only when relevant. When behavior is inconsistent between sessions, use `/memory` to see exactly which memory files loaded — it turns "why is it ignoring my convention?" into a checkable fact rather than a guess.

One trap to retire: there is **no `.claude/config.json` with a `commands` array**. Settings live in `settings.json` / `settings.local.json`; commands live in `.claude/commands/`; memory lives in CLAUDE.md and `.claude/rules/`. If an answer invents a config file to register commands, it's wrong.

### Deep-dive prompt
> I'm studying the Claude Code CLAUDE.md hierarchy. (1) List the three levels with their exact file paths and explain the load order and what each level is for. (2) State the rule that decides whether a piece of configuration is shared with teammates, and walk through the "new team member didn't get the instructions after cloning" scenario — where the config was, and where it should go. (3) Contrast `@import` with `.claude/rules/` for keeping CLAUDE.md modular, with a concrete example of each. (4) Tell me what `/memory` is for. (5) Now quiz me: give me five short "where should this configuration live — user, project, or directory level — and will it be shared?" scenarios one at a time and critique my answers.

### Active-recall self-check
1. A teammate clones the repo but Claude ignores a convention you rely on every day. Where did you most likely put it, and what's the fix?
2. What single property — not `.gitignore` — determines whether a CLAUDE.md is shared with the team?
3. You have one 800-line CLAUDE.md and behavior that varies session to session. Name two ways to make it modular and the command that tells you which memory files actually loaded.

## Task Statement 3.2 — Create and configure custom slash commands and skills

### What's tested
**Knowledge of:** project-scoped commands in `.claude/commands/` (shared via version control) versus user-scoped commands in `~/.claude/commands/` (personal); skills in `.claude/skills/` with `SKILL.md` files that support frontmatter including `context: fork`, `allowed-tools`, and `argument-hint`; that `context: fork` runs a skill in an isolated sub-agent context so its output does not pollute the main conversation; personal skill customization — creating a personal variant in `~/.claude/skills/` under a *different name* so it doesn't affect teammates.
**Skills in:** creating project-scoped slash commands in `.claude/commands/` for team-wide availability; using `context: fork` to isolate skills that produce verbose output (codebase analysis) or exploratory context (brainstorming alternatives); configuring `allowed-tools` in skill frontmatter to restrict tool access during execution (e.g. limiting to file writes to prevent destructive actions); using `argument-hint` to prompt the developer for required parameters when they invoke a skill without arguments; choosing between skills (on-demand, task-specific) and CLAUDE.md (always-loaded universal standards).
*Self-audit:* You can state where a shared vs personal command lives, what `context: fork` buys you, and when to reach for a skill instead of adding to CLAUDE.md.

### Distilled notes
Slash commands are reusable prompt shortcuts invoked as `/name`, authored as Markdown files. The sharing rule from 3.1 carries over unchanged: `.claude/commands/review.md` → `/review` for the whole team (committed), while `~/.claude/commands/review.md` is personal. Commands and skills have effectively merged — both `.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md` give you `/deploy` — and skills are the recommended path because they carry richer frontmatter.

Two frontmatter behaviors are worth locking in. **`context: fork`** runs the skill in an isolated sub-agent context: the skill body becomes the sub-agent's prompt, and its (often verbose) output — a codebase analysis, a brainstorm of alternatives — returns as a summary instead of flooding the main conversation. It's declarative; you get sub-agent isolation with no orchestration code. **`argument-hint`** supplies the prompt shown when a developer invokes the skill without the arguments it needs. And `allowed-tools` in a skill *pre-approves* those tools (removes the permission prompt) — see the sharp caveat below.

Precedence when a project skill and a personal skill share a name: **project wins.** A personal skill named the same as a project command is shadowed by the project version. If you want your personal variant to coexist, give it a *different* name (`/my-commit`, not a second `/commit`). Finally, the skill-vs-CLAUDE.md choice: a skill is invoked on demand for a specific workflow; CLAUDE.md is always loaded and is for universal standards. Recurring background knowledge belongs in CLAUDE.md; a task you trigger belongs in a skill.

### Deep-dive prompt
> I'm studying Claude Code custom slash commands and skills. (1) Contrast a project-scoped command (`.claude/commands/`) with a user-scoped one (`~/.claude/commands/`) and tie it to the sharing rule. (2) Explain `context: fork`: what isolation it provides, why it's the right choice for a verbose codebase-analysis skill, and what "the skill body is the sub-agent's prompt" means. (3) Explain `argument-hint` and `allowed-tools` in skill frontmatter, and clarify whether `allowed-tools` *restricts* the tool pool or merely pre-approves. (4) A teammate wants a personal variant of the shared `/commit` — what breaks if they reuse the name, and what should they do instead? (5) Give me a rule for skill vs CLAUDE.md, then quiz me with five "skill or CLAUDE.md?" scenarios.

### Active-recall self-check
1. Where do a team-shared command and a personal command each live, and what invocation do both `.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md` produce?
2. What does `context: fork` protect the main conversation from, and how does it achieve that without orchestration code?
3. A personal skill has the same name as a project command and seems to be ignored. Why, and what's the one-word fix to the frontmatter/file that makes yours usable?

## Task Statement 3.3 — Apply path-specific rules for conditional convention loading

### What's tested
**Knowledge of:** `.claude/rules/` files with YAML frontmatter `paths:` fields containing glob patterns for conditional rule activation; how path-scoped rules load only when you edit a matching file, reducing irrelevant context and token usage; the advantage of glob-pattern rules over directory-level CLAUDE.md files for conventions that span multiple directories (test files scattered throughout a codebase).
**Skills in:** creating `.claude/rules/` files with YAML `paths:` scoping (e.g. `paths: ["terraform/**/*"]`) so rules load only when editing matching files; using glob patterns to apply conventions by file *type* regardless of directory (e.g. `**/*.test.tsx` for all test files); choosing path-specific rules over subdirectory CLAUDE.md files when a convention must apply to files spread across the tree.
*Self-audit:* You can explain why a glob-scoped rule beats a directory CLAUDE.md for cross-cutting conventions, and name the two costs it saves.

### Distilled notes
A `.claude/rules/` file carries YAML frontmatter with a `paths:` glob (e.g. `paths: ["**/*.test.tsx"]` or `paths: ["terraform/**/*"]`); the rule activates **only when you edit a file matching the glob**. This is the deterministic, path-driven end of the domain's core heuristic — the rule loads because of *what file you touched*, not because the model decided it was relevant.

Compare the three homes for a convention. A **directory-level CLAUDE.md is anchored to one folder** — fine when the relevant files all live in that folder, but for files *scattered* across the tree (tests, migrations, every `*.tsx` component) you'd have to copy the same CLAUDE.md into every directory. A **glob rule matches by pattern regardless of location**, so one `**/*.test.tsx` rule covers every test file wherever it sits. That's the deciding factor: **scope by file type across directories → glob rule; scope by a single folder → directory CLAUDE.md.**

Path scoping also beats stuffing everything into the root CLAUDE.md, for two concrete reasons: (1) **token economy** — the rule is loaded only on a match, not on every turn; and (2) **it fights "lost in the middle"** — a rule delivered exactly when it's relevant is far more likely to be applied than one buried in the middle of a giant always-on file the model half-forgets.

### Deep-dive prompt
> I'm studying path-specific rules in `.claude/rules/`. (1) Show me a complete example file with YAML `paths:` frontmatter for all test files, and explain exactly when it loads. (2) Compare three ways to attach a convention — root CLAUDE.md, directory-level CLAUDE.md, and a glob rule — and give the deciding question for choosing among them. (3) Explain the two costs a glob rule saves versus a bloated root CLAUDE.md (token usage and the lost-in-the-middle effect). (4) Give me a scenario with test files scattered across five directories and walk through why a directory CLAUDE.md is the wrong tool. (5) Quiz me: for six conventions, ask "root CLAUDE.md, directory CLAUDE.md, or glob rule?" and critique my reasoning.

### Active-recall self-check
1. Your test files live in dozens of directories and all need the same convention. Why is a directory-level CLAUDE.md the wrong mechanism, and what do you use instead?
2. What in a `.claude/rules/` file decides *when* the rule is loaded, and what triggers activation?
3. Beyond covering scattered files, name the two costs a path-scoped rule saves compared with putting the same text in the root CLAUDE.md.

## Task Statement 3.4 — Determine when to use plan mode vs direct execution

### What's tested
**Knowledge of:** that plan mode is designed for complex tasks — large-scale changes, multiple valid approaches, architectural decisions, multi-file modifications; that direct execution suits simple, well-scoped changes (adding one validation check to one function); that plan mode enables safe exploration and design *before* committing to changes, preventing costly rework; the Explore subagent for isolating verbose discovery output and returning a summary to preserve main-conversation context.
**Skills in:** selecting plan mode for tasks with architectural implications (microservice restructuring, a library migration touching 45+ files, choosing between integration approaches with different infrastructure needs); selecting direct execution for well-understood changes with clear scope (a single-file bug fix with a clear stack trace, adding a date-validation conditional); using the Explore subagent for verbose discovery phases to avoid exhausting the context window during multi-phase work; combining plan mode for investigation with direct execution for implementation (plan the migration, then execute the planned approach).
*Self-audit:* You can place a given task on the plan/direct spectrum, and explain why "start direct, switch to plan if it gets hard" fails when the complexity is known up front.

### Distilled notes
Choose by scope and reversibility of the decision. **Plan mode** is for complex, multi-file work, several valid approaches, or an architectural call (monolith → microservices, REST → GraphQL, a migration touching dozens of files) — it lets you explore and design before touching code, so you don't commit to an expensive wrong turn. **Direct execution** is for a simple, well-scoped edit: change a button color, add one validation, fix a single-file bug with a clear stack trace. The frequently-correct third answer is **hybrid: plan mode for the investigation and design, then direct execution for the implementation** you just planned.

The subtle distractor is "just start with direct execution and switch to plan mode if it turns out complex." That's wrong precisely **when the complexity is knowable in advance from the requirements.** The cost of switching late is real: you throw away changes you already made (possibly the wrong ones) and you drag a context now polluted with a false start into the planning phase. If the requirements already tell you this is a 45-file migration, you plan first — you don't discover it the hard way.

Connect this to context economy: the **Explore subagent** isolates a verbose discovery phase (mapping a large codebase) in a sub-agent and returns only a summary, so the main conversation's context window survives a multi-phase task. It's the same isolation idea as `context: fork` from 3.2, applied to exploration.

### Deep-dive prompt
> I'm studying plan mode vs direct execution in Claude Code. (1) Give me the criteria that put a task in plan mode versus direct execution, with two example tasks for each. (2) Explain the hybrid pattern (plan to investigate/design, then direct to implement) and why it's often the best answer for a migration. (3) Take apart the distractor "start direct and switch to plan mode if it gets complex" — when is it wrong, and what does switching late actually cost? (4) Explain what the Explore subagent is for and how it relates to preserving the main context window. (5) Quiz me: for six tasks, ask "plan, direct, or hybrid?" and critique my answers.

### Active-recall self-check
1. A library migration will touch 45+ files and you know that from the requirements. Plan mode, direct execution, or hybrid — and why not "start direct and switch later"?
2. What two costs do you pay when you switch from direct execution to plan mode late in a task?
3. What is the Explore subagent for, and which earlier frontmatter option shares its core idea?

## Task Statement 3.5 — Apply iterative refinement techniques for progressive improvement

### What's tested
**Knowledge of:** concrete input/output examples as the most effective way to communicate an expected transformation when prose is interpreted inconsistently; test-driven iteration — writing the test suite first, then iterating by sharing the failures; the interview pattern — having Claude ask questions to surface considerations you hadn't anticipated before it implements; when to hand over all issues in a single message (interacting problems) versus fixing them sequentially (independent problems).
**Skills in:** providing 2–3 concrete input/output examples to clarify a transformation when natural-language descriptions produce inconsistent results; writing test suites for expected behavior, edge cases, and performance *before* implementation, then iterating on failures; using the interview pattern to surface design considerations (cache-invalidation strategy, failure modes) before implementing in an unfamiliar domain; giving specific test cases with example input and expected output to fix edge-case handling (null values in a migration script); addressing multiple *interacting* issues in one detailed message versus sequential iteration for *independent* issues.
*Self-audit:* You can pick the right refinement technique for a symptom, and state the rule for batching versus sequencing fixes.

### Distilled notes
This statement is a toolbox of refinement moves; the skill is matching the move to the symptom. **When prose is interpreted inconsistently, switch to examples** — 2–3 concrete input/output pairs pin down a transformation that adjectives never will. **When you want to steer behavior toward correctness, iterate on tests:** write the suite first (expected behavior, edge cases, performance), then feed the failures back as the guidance signal, so each pass is driven by a concrete, checkable gap rather than another round of vague description. **When you're in an unfamiliar domain, use the interview pattern:** ask Claude to interview *you* first, so it surfaces considerations you didn't think to specify (cache invalidation, failure modes) before it writes anything.

The batching-vs-sequencing rule is the one most likely to be tested as a discriminator: **if the problems interact, put them all in a single detailed message** so the fix can account for their coupling; **if the problems are independent, fix them one at a time** so each change is isolated and easy to verify. Applying the wrong one hurts — sequential fixes to interacting bugs cause the later fix to undo the earlier one, and cramming independent issues together muddies which change fixed what. Judge by whether the issues are coupled, not by how many there are.

### Deep-dive prompt
> I'm studying iterative refinement techniques in Claude Code. (1) Explain why 2–3 concrete input/output examples beat a prose description when results are inconsistent, and give an example transformation both ways. (2) Walk through test-driven iteration: write tests first, then iterate on failures — why is a failing test a better guidance signal than more description? (3) Explain the interview pattern and when to use it (unfamiliar domain), with a sample of the questions Claude might ask. (4) Give me the rule for putting all issues in one message vs fixing them sequentially, and an example of each getting it wrong. (5) Quiz me: for six situations, ask which technique I'd use and, for multi-issue ones, "one message or sequential?"

### Active-recall self-check
1. A prose spec keeps producing inconsistent transformations. What technique fixes it, and roughly how many examples?
2. You're about to implement in a domain you don't know well. Which pattern do you invoke first, and what does it buy you?
3. You have several bugs to fix. What single property decides whether you send them all in one message or one at a time — and what goes wrong if you choose incorrectly?

## Task Statement 3.6 — Integrate Claude Code into CI/CD pipelines

### What's tested
**Knowledge of:** the `-p` (or `--print`) flag for running Claude Code non-interactively in automated pipelines; the `--output-format json` and `--json-schema` CLI flags for enforcing structured output in CI; CLAUDE.md as the mechanism for supplying project context (testing standards, fixture conventions, review criteria) to CI-invoked Claude Code; session context isolation — why the same session that generated code is less effective at reviewing its own changes than an independent review instance.
**Skills in:** running Claude Code in CI with `-p` to prevent interactive-input hangs; using `--output-format json` with `--json-schema` to produce machine-parseable findings for automated posting as inline PR comments; including prior review findings in context when re-running after new commits, instructing Claude to report only new or still-unaddressed issues to avoid duplicate comments; providing existing test files in context so test generation avoids duplicating covered scenarios; documenting testing standards, valuable-test criteria, and available fixtures in CLAUDE.md to improve generated-test quality.
*Self-audit:* You can name the flag that makes CI non-interactive, the flags that make output parseable, and why a fresh instance reviews better than the generating session.

### Distilled notes
Two flags carry most of this. **`-p` / `--print`** is non-interactive mode: run, print the result to stdout, exit — no waiting for input, which is exactly what a pipeline needs (an interactive prompt would hang the job). The distractors here are invented or hacky: `CLAUDE_HEADLESS`, `--batch`, redirecting `< /dev/null` — none is the right answer. **`--output-format json`** (with `--json-schema` for the shape) gives machine-parseable output you can post as inline PR comments. Parsing free-form text with regexes is the anti-pattern the exam wants you to reject — natural-language phrasing is non-deterministic, so never build a pipeline on scraping it.

The reasoning-heavy point is **independent review over self-review.** The session that generated the code still holds the *reasoning context* of having written it, which biases it toward its own decisions and makes it poor at catching its own bugs. The fix is an independent instance or subagent with fresh context — not "tell it to be more critical," not extended thinking, not running it twice in the same polluted context. Those distractors all leave the bias in place.

Two more CI practices. For **iterative review** across commits, feed the *prior findings* into context and instruct Claude to report only new or still-unaddressed issues — otherwise it re-flags everything and floods the PR with duplicates. And **CLAUDE.md is the context channel for CI**: document testing standards, valuable-test criteria, and available fixtures there so generated tests are high-value and non-duplicative (and pass existing test files in so it doesn't re-cover scenarios already tested).

### Deep-dive prompt
> I'm studying Claude Code in CI/CD. (1) Explain the `-p`/`--print` flag and why an interactive session hangs a pipeline; then list common distractor "flags" and why they're wrong. (2) Explain `--output-format json` with `--json-schema` and why parsing free-text output with regexes is an anti-pattern. (3) Explain why the session that generated code is worse at reviewing it than an independent instance, and why "be more critical," extended thinking, and "run it twice" don't fix the bias. (4) Describe how to run iterative reviews across commits without posting duplicate comments, and how CLAUDE.md improves generated-test quality. (5) Quiz me: for six CI requirements, ask which flag or pattern I'd use and critique my answers.

### Active-recall self-check
1. Which flag makes Claude Code non-interactive for a pipeline, and what happens without it? Name two distractor flags that don't exist.
2. Why is the generating session a poor reviewer of its own code, and what actually fixes it — and why doesn't "tell it to be more critical" or running it twice work?
3. Re-running a review after new commits, how do you prevent duplicate PR comments, and what role does CLAUDE.md play for CI-invoked runs?

## Decision heuristics recap

Three heuristics eliminate most wrong answers in this domain:

1. **Sharing is decided by location, not by `.gitignore`.** Anything under the project's `.claude/` (or the root `CLAUDE.md`, `.claude/commands/`, `.claude/skills/`) is committed and shared with everyone who clones; anything under `~/.claude/` is personal. So "everyone should get this after cloning" → project level, and "a new teammate didn't receive the instructions" → they were at user level. The same rule governs commands and skills. And remember what doesn't exist: no `.claude/config.json` with a `commands` array — settings live in `settings.json`, commands in `.claude/commands/`.

2. **Deterministic (path/rule/flag/isolation) beats probabilistic (prompt/judgment).** When something must happen automatically or by structure, reach for the mechanism keyed to that structure: a glob-scoped `.claude/rules/` file loads by *which file you edited*; `-p` guarantees non-interactive execution; `--output-format json --json-schema` guarantees parseable output (never scrape free text); an independent review instance removes generation bias by *starting fresh* (not by being told to "be critical"). When something is situational or a matter of judgment, a skill invoked on demand, a prompt, or few-shot examples is the right tool.

3. **Match the tool to the shape of the task, not the size of the symptom.** Scope by file *type* across directories → glob rule; scope by one folder → directory CLAUDE.md; always-on universal standard → root CLAUDE.md; on-demand workflow → skill. Complexity known up front → plan mode (don't "start direct and switch late" and eat the rework); simple and well-scoped → direct execution; investigate-then-build → hybrid. Prose interpreted inconsistently → concrete examples; steering toward correctness → iterate on test failures; unfamiliar domain → interview pattern first; interacting bugs → one message, independent bugs → sequential.
