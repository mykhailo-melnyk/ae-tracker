# Dev/Prod Environments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore working local development for the AE Progress Tracker by setting up a parallel dev environment (separate data repo, OAuth App, bot PAT) and making the frontend pick its Worker URL at runtime. Production is unchanged throughout.

**Architecture:** Implementation matches `meta/specs/2026-06-01-dev-prod-environments-design.md`. The Cloudflare-deployed Worker stays as production; local dev runs `wrangler dev` against `.dev.vars` overrides. Dev's GitHub-side artifacts (data repo, OAuth App, bot PAT) are siblings of the production ones, scoped only to dev. The frontend's two HTML files swap their hardcoded production URL for a 3-line hostname-detection block, so the same `public/` works in both contexts without a build step.

**Tech Stack:** Vanilla HTML/JS · Cloudflare Workers · `wrangler dev` · GitHub OAuth · Fine-grained GitHub PATs.

---

## Conventions for this plan

- **Repo paths:** Production source is at `~/Projects/solvd/ae-tracker/`. The implementation spec is at `~/Projects/solvd/agentic-engineering/meta/specs/2026-06-01-dev-prod-environments-design.md`.
- **`<owner>`:** `mykhailo-melnyk` for this pilot.
- **No new tests.** Per the original tracker spec, the frontend has no automated tests in v1. The Worker's existing 30 unit tests remain valid (they don't depend on which OAuth App or data repo is in use) — re-run them after the change as a regression check. Verification of the new dev flow is manual.
- **Production safety:** every code change in Part 1 is backwards-compatible — the new hostname-detection block resolves to the same production URL when loaded from `mykhailo-melnyk.github.io`. You can push without breaking production.

---

## Part 0 — Manual GitHub Prereqs (no code)

These tasks happen entirely in the GitHub UI. An agent cannot do them for you.

### Task 0.1: Create the dev data repo

**Files:** none (UI work on github.com)

- [ ] **Step 1:** Open <https://github.com/new>.
- [ ] **Step 2:** Fill in:
  - **Owner:** `mykhailo-melnyk`
  - **Repository name:** `ae-tracker-data-dev`
  - **Visibility:** **Private** (critical — same as the production data repo)
  - **Initialize this repository with:** leave everything unchecked
- [ ] **Step 3:** Click **Create repository**.
- [ ] **Step 4:** Clone and seed the `progress/` directory so it exists:
  ```bash
  cd ~/Projects/solvd
  git clone git@github.com:mykhailo-melnyk/ae-tracker-data-dev.git
  cd ae-tracker-data-dev
  mkdir progress
  printf "Dev-only progress JSON files committed by the AE Tracker dev bot.\n" > progress/README.md
  git add progress/README.md
  git commit -m "chore: initial structure"
  git push -u origin main
  ```
- [ ] **Step 5:** Verify on github.com that the repo exists, is private, and contains `progress/README.md`.

### Task 0.2: Create a new OAuth App for dev

**Files:** none (UI work on github.com)

- [ ] **Step 1:** Open <https://github.com/settings/developers> → **OAuth Apps** → **New OAuth App**.
- [ ] **Step 2:** Fill in:
  - **Application name:** `AE Progress Tracker (dev)`
  - **Homepage URL:** `http://localhost:8080`
  - **Authorization callback URL:** `http://localhost:8787/auth/callback`
  - **Enable Device Flow:** leave unchecked
- [ ] **Step 3:** Click **Register application**.
- [ ] **Step 4:** Copy the **Client ID** (starts with `Ov23li...`). Save it somewhere you'll find in ~10 minutes (password manager, a temporary text file). Hold onto these credentials only as long as you need to paste them into `.dev.vars`.
- [ ] **Step 5:** Click **Generate a new client secret** → copy the **Client Secret** immediately (it's shown only once). Save it next to the Client ID.

### Task 0.3: Create a fine-grained PAT for the dev bot

**Files:** none (UI work on github.com)

- [ ] **Step 1:** Open <https://github.com/settings/personal-access-tokens/new>.
- [ ] **Step 2:** Fill in:
  - **Token name:** `ae-tracker-bot-dev`
  - **Resource owner:** `mykhailo-melnyk`
  - **Expiration:** 90 days
  - **Description:** `Local-dev Worker token for AE Progress Tracker dev data repo` *(optional)*
  - **Repository access:** Select **Only select repositories** → choose **only** `mykhailo-melnyk/ae-tracker-data-dev`. **Do NOT** also select the production `ae-tracker-data` repo — the whole point is scope isolation.
- [ ] **Step 3:** Under **Repository permissions**, find **Contents** and set it to **Read and write**. Leave everything else at **No access** (Metadata is auto-granted).
- [ ] **Step 4:** Click **Generate token**. **Copy the token immediately** — it starts with `github_pat_...` and is shown only once. Save it next to the OAuth credentials.

### Task 0.4: Rename the existing OAuth App for clarity

**Files:** none (UI work on github.com)

- [ ] **Step 1:** Open <https://github.com/settings/developers> → **OAuth Apps**. Find the *existing* `AE Progress Tracker (dev)` app — the one whose callback URL is `https://ae-tracker.mihael-melnyk.workers.dev/auth/callback`. **Confirm the callback URL** before editing so you don't rename the wrong one.
- [ ] **Step 2:** Click the app → at the top, click the pencil icon next to **Application name** or use the **Update application** form near the bottom.
- [ ] **Step 3:** Change the name from `AE Progress Tracker (dev)` to `AE Progress Tracker (prod)`. Do not change anything else (callback URL, homepage, client ID).
- [ ] **Step 4:** Click **Update application**. This is purely a cosmetic label — it does not invalidate the Client ID or Secret, and the production Worker keeps working.

---

## Part 1 — Frontend hostname detection

A single code change applied to both HTML files. Production behavior is preserved (the new logic falls through to the production URL when hostname is not localhost).

### Task 1.1: Replace the hardcoded WORKER_URL with hostname-detection in both pages

**Files:**
- Modify: `~/Projects/solvd/ae-tracker/public/tracker.html`
- Modify: `~/Projects/solvd/ae-tracker/public/dashboard.html`

- [ ] **Step 1:** In `~/Projects/solvd/ae-tracker/public/tracker.html`, find the current production-URL block (around line 36–38):
  ```html
  <script>
    window.WORKER_URL = "https://ae-tracker.mihael-melnyk.workers.dev";
  </script>
  ```
  Replace it with:
  ```html
  <script>
    window.WORKER_URL = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
      ? "http://localhost:8787"
      : "https://ae-tracker.mihael-melnyk.workers.dev";
  </script>
  ```

- [ ] **Step 2:** In `~/Projects/solvd/ae-tracker/public/dashboard.html`, find the equivalent single-line block (around line 50):
  ```html
  <script>window.WORKER_URL = "https://ae-tracker.mihael-melnyk.workers.dev";</script>
  ```
  Replace it with the multi-line version:
  ```html
  <script>
    window.WORKER_URL = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
      ? "http://localhost:8787"
      : "https://ae-tracker.mihael-melnyk.workers.dev";
  </script>
  ```

- [ ] **Step 3:** Sanity-check both files. From the `ae-tracker` repo root:
  ```bash
  cd ~/Projects/solvd/ae-tracker
  grep -n "WORKER_URL" public/tracker.html public/dashboard.html
  ```
  Expected: 6 lines (3 per file) showing the new ternary expression. No stray hardcoded production URLs left as the sole assignment.

- [ ] **Step 4:** Lint each file's surrounding HTML still parses:
  ```bash
  python3 -c "from html.parser import HTMLParser; p = HTMLParser(); p.feed(open('public/tracker.html').read())"
  python3 -c "from html.parser import HTMLParser; p = HTMLParser(); p.feed(open('public/dashboard.html').read())"
  ```
  Both should exit 0.

- [ ] **Step 5:** Commit:
  ```bash
  git add public/tracker.html public/dashboard.html
  git commit -m "feat(frontend): detect localhost vs production at runtime for WORKER_URL

  Single public/ now works in both contexts:
  - Loaded from mykhailo-melnyk.github.io  -> uses production Worker
  - Loaded from localhost / 127.0.0.1 / [::1] -> uses http://localhost:8787

  Backwards-compatible: production behavior is unchanged because the
  hostname check falls through to the production URL on github.io."
  ```

- [ ] **Step 6:** Push:
  ```bash
  git push
  ```
  This triggers the **Deploy Pages** workflow at `.github/workflows/deploy-pages.yml`. Wait ~60 seconds.

- [ ] **Step 7:** Verify the Pages deploy succeeded:
  ```bash
  curl -s "https://api.github.com/repos/mykhailo-melnyk/ae-tracker/actions/runs?per_page=3" | jq -r '.workflow_runs[] | "\(.name) :: \(.status) :: \(.conclusion // \"in_progress\")"'
  ```
  Expected: most recent `Deploy Pages` run shows `completed :: success`.

- [ ] **Step 8:** Verify production is unaffected. In a browser, open <https://mykhailo-melnyk.github.io/ae-tracker/tracker.html> and open DevTools → Console:
  ```javascript
  window.WORKER_URL
  ```
  Expected: `"https://ae-tracker.mihael-melnyk.workers.dev"`. If you see anything else, stop and investigate before continuing.

---

## Part 2 — Local `.dev.vars` (no commits)

`.dev.vars` is gitignored. Each developer machine has its own copy with its own secrets. This task updates yours to point at the new dev artifacts from Part 0.

### Task 2.1: Rewrite `.dev.vars` for the new dev environment

**Files:**
- Modify: `~/Projects/solvd/ae-tracker/worker/.dev.vars` (locally, never committed)

- [ ] **Step 1:** Generate a fresh session secret for dev. Do not reuse the production one:
  ```bash
  openssl rand -base64 48
  ```
  Copy the output (a 64-character base64 string).

- [ ] **Step 2:** Replace the entire contents of `~/Projects/solvd/ae-tracker/worker/.dev.vars` with:
  ```
  # Secrets — replace each <bracketed> placeholder with the actual value.
  SESSION_SECRET=<paste the openssl output from Step 1>
  OAUTH_CLIENT_ID=<Client ID from the "AE Progress Tracker (dev)" OAuth App created in Task 0.2>
  OAUTH_CLIENT_SECRET=<Client Secret from the same OAuth App>
  BOT_PAT=<fine-grained PAT created in Task 0.3 — scoped to ae-tracker-data-dev only>

  # Var overrides — wrangler.toml has the production values; these override at dev time.
  DATA_REPO_NAME=ae-tracker-data-dev
  FRONTEND_ORIGIN=http://localhost:8080
  FRONTEND_BASE_PATH=
  ```
  Each `<placeholder>` must be replaced with the real value you saved in Part 0. `FRONTEND_BASE_PATH=` (intentionally empty after the `=`) makes the Worker redirect to `http://localhost:8080/tracker.html` after sign-in, not `http://localhost:8080/ae-tracker/tracker.html`.

- [ ] **Step 3:** Sanity-check the file. From the `worker/` directory:
  ```bash
  cd ~/Projects/solvd/ae-tracker/worker
  # confirm .dev.vars is gitignored — must produce a line showing the ignore rule
  git check-ignore -v .dev.vars
  ```
  Expected output (the file path must match `.dev.vars` line in `.gitignore`):
  ```
  ../.gitignore:7:.dev.vars	.dev.vars
  ```
  If `git check-ignore` produces NO output, `.dev.vars` is NOT ignored. Stop and investigate.

- [ ] **Step 4:** Verify the file has the expected keys:
  ```bash
  grep -c "^SESSION_SECRET=" .dev.vars
  grep -c "^OAUTH_CLIENT_ID=" .dev.vars
  grep -c "^OAUTH_CLIENT_SECRET=" .dev.vars
  grep -c "^BOT_PAT=" .dev.vars
  grep -c "^DATA_REPO_NAME=ae-tracker-data-dev$" .dev.vars
  grep -c "^FRONTEND_ORIGIN=http://localhost:8080$" .dev.vars
  grep -c "^FRONTEND_BASE_PATH=$" .dev.vars
  ```
  Each command must print `1`. If any prints `0`, the corresponding line is missing or wrong.

- [ ] **Step 5:** No commit. This file never gets committed.

---

## Part 3 — Verification

End-to-end manual verification of both environments. Stop and fix any failure before claiming the work done.

### Task 3.1: Verify local dev sign-in succeeds

**Files:** none (manual verification)

- [ ] **Step 1:** In terminal A, start the local frontend server:
  ```bash
  cd ~/Projects/solvd/ae-tracker
  npx http-server public -p 8080 -c-1
  ```
  Leave it running.

- [ ] **Step 2:** In terminal B, start the local Worker:
  ```bash
  cd ~/Projects/solvd/ae-tracker/worker
  npm run dev
  ```
  Expected: `Ready on http://localhost:8787`. Leave it running.

- [ ] **Step 3:** In a fresh / incognito browser window, open <http://localhost:8080/tracker.html>. Expected: the sign-in card renders ("Welcome to the AE Tracker… Sign in with GitHub").

- [ ] **Step 4:** Open DevTools → Console and run:
  ```javascript
  window.WORKER_URL
  ```
  Expected: `"http://localhost:8787"`. If you see the production URL, the hostname-detection branch is wrong; re-check Part 1.

- [ ] **Step 5:** Click **Sign in with GitHub**. You should be redirected to the *dev* OAuth App approval page (it will show "AE Progress Tracker (dev)" as the app name). Approve.

- [ ] **Step 6:** After approval, you should land back on `http://localhost:8080/tracker.html` with the engineer page rendered — pill bar, your name in the top-right, a "Sign out" button.

- [ ] **Step 7:** Click any task checkbox. It should turn green.

- [ ] **Step 8:** Open <https://github.com/mykhailo-melnyk/ae-tracker-data-dev/commits/main> in a browser. Expected: a new commit `progress(mykhailo-melnyk): ✓ L1.T1` (or whatever task you clicked) appears within seconds. This confirms the Worker is talking to the **dev** data repo, not production.

- [ ] **Step 9:** Verify production data was NOT touched. Open <https://github.com/mykhailo-melnyk/ae-tracker-data/commits/main> and confirm no new commits since your last production smoke test.

### Task 3.2: Verify production sign-in still works after the frontend change

**Files:** none (manual verification)

- [ ] **Step 1:** In a *different* fresh / incognito browser window, open <https://mykhailo-melnyk.github.io/ae-tracker/tracker.html>.

- [ ] **Step 2:** DevTools console:
  ```javascript
  window.WORKER_URL
  ```
  Expected: `"https://ae-tracker.mihael-melnyk.workers.dev"` (the production URL).

- [ ] **Step 3:** Click **Sign in with GitHub**. You should be redirected to the *production* OAuth App approval page ("AE Progress Tracker (prod)" after Task 0.4's rename).

- [ ] **Step 4:** After approval, you should land back on `https://mykhailo-melnyk.github.io/ae-tracker/tracker.html` signed in.

- [ ] **Step 5:** Click a task checkbox. Expected: it turns green and a new commit lands in <https://github.com/mykhailo-melnyk/ae-tracker-data/commits/main> (the **production** data repo).

If any step in Part 3 fails, do not claim completion. Common failure modes:

| Symptom | Likely cause | Fix |
|---|---|---|
| Dev sign-in redirects to "redirect_uri mismatch" | Task 0.2 callback URL is wrong (must be exactly `http://localhost:8787/auth/callback`) | Edit the dev OAuth App's callback URL on github.com. |
| Dev sign-in succeeds but `/api/me` returns 401 in console | `.dev.vars` SESSION_SECRET differs from what `wrangler dev` is using | Restart `wrangler dev` after editing `.dev.vars`. |
| Dev sign-in succeeds but task mark returns 502 | BOT_PAT in `.dev.vars` doesn't have Contents R/W on `ae-tracker-data-dev` | Regenerate PAT in Task 0.3; verify scope before saving. |
| Dev commit lands in production data repo `ae-tracker-data` | `DATA_REPO_NAME` not set in `.dev.vars` or wrangler dev didn't reload | Verify `.dev.vars` has `DATA_REPO_NAME=ae-tracker-data-dev`, restart `wrangler dev`. |
| Production `window.WORKER_URL` shows the dev localhost URL | Hostname-detection branch swapped (dev/prod conditions are reversed) | Re-check Task 1.1: the `?:` returns `localhost:8787` ONLY when hostname matches localhost; otherwise production. |
| Production sign-in fails after frontend deploy | Pages deploy didn't run, or production OAuth callback was changed | Check Actions tab for the Deploy Pages run; check the prod OAuth App's callback URL is still the workers.dev URL. |

---

## Self-Review (already run)

- **Spec coverage:** All 8 decisions from the spec map to plan tasks. Decisions 1–3 → Tasks 0.1, 0.2, 0.3. Decision 4 (single Worker) is implicit — no task because production stays as-is. Decision 5 (no dev KV) is implicit — no task because the Worker already degrades gracefully. Decision 6 (hostname detection) → Task 1.1. Decision 7 (`.dev.vars` overrides) → Task 2.1. Decision 8 (rename existing OAuth App) → Task 0.4.
- **Placeholder scan:** `<placeholders>` in this plan are *intentional human-fill-in slots* (Client ID, Client Secret, PAT, openssl-generated secret). None of them are agentic-instructions like "TBD" or "implement later".
- **Type consistency:** The function names `wrangler dev`, file names `.dev.vars`, `wrangler.toml`, `public/tracker.html`, `public/dashboard.html`, env var names (`DATA_REPO_NAME`, `FRONTEND_ORIGIN`, `FRONTEND_BASE_PATH`, `SESSION_SECRET`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `BOT_PAT`) all match the spec and the existing codebase.
- **Scope:** One cohesive change. No orphan tasks. Fits within a single execution session.

---

## Out of scope (deferred per spec)

- Deployable dev Worker on Cloudflare (`[env.dev]` section, second KV namespace).
- Automated PAT rotation for either environment.
- Frontend E2E tests covering the hostname-detection branch (deferred per the original tracker spec's Future Work).
