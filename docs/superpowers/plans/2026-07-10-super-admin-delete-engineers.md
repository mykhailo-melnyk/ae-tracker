# Super Admin: Delete Engineers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a super admin permanently delete an engineer's `progress/<username>.json` file (hard delete for data-hygiene/GDPR removal), gated by a typed-username confirmation on the dashboard.

**Architecture:** A new `deleteFile` storage primitive in `github.ts` (GitHub Contents API `DELETE`) is called by a new super-admin-gated `handleApiUserDelete` in `api.ts`, wired at `POST /api/user/<username>/delete` in `index.ts`. It mirrors the existing `handleApiUserDisabled` — super-admin gate, 404-when-absent, 409 optimistic-concurrency retry, aggregate-cache bust — but removes the file instead of flipping a flag. The dashboard gets a per-row **Delete** button (super-admin-only) that requires typing the target username before firing.

**Tech Stack:** TypeScript Cloudflare Worker, Vitest (`@cloudflare/vitest-pool-workers`), vanilla JS/CSS frontend. No build step.

## Global Constraints

- Worker handlers take an injected `fetchFn: typeof fetch = fetch` test seam — preserve it on every new handler.
- Tests run inside the Workers runtime via `@cloudflare/vitest-pool-workers`; run from `worker/` with `npx vitest run`.
- Session auth: callers are identified by `requireSession`; admin/super-admin membership comes from `ADMIN_USERNAMES` / `SUPERADMIN_USERNAMES` (comma-separated) via `isAdmin` / `isSuperAdmin` in `api.ts`.
- The aggregate is cached in KV under `CACHE_KEY` (imported from `aggregate.ts`); every mutating admin write busts it with `await env.AGGREGATE_CACHE?.delete(CACHE_KEY)`.
- Commit messages end with the trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Frontend must stay framework-free vanilla JS; the dashboard already exposes `AGG` (aggregate response), `WORKER` (Worker base URL), `apiFetch`, `renderKpis()`, `renderTable()`.

---

### Task 1: `deleteFile` storage primitive

**Files:**
- Modify: `worker/src/github.ts` (append after `writeJsonFile`, ~line 77)
- Test: `worker/test/github.test.ts` (add a `describe("deleteFile", …)` block)

**Interfaces:**
- Consumes: existing `RepoConfig`, `headers(token)`, and the `API` constant in `github.ts`.
- Produces: `deleteFile(cfg: RepoConfig, path: string, sha: string, message: string, fetchFn?: typeof fetch): Promise<void>` — issues `DELETE /repos/{owner}/{repo}/contents/{path}` with a JSON body `{ message, sha }`; resolves on success, throws `Error("deleteFile <status>: <body>")` on non-OK (so a `409` stale-SHA is detectable via `.message.includes("deleteFile 409")`).

- [ ] **Step 1: Write the failing tests**

Add to `worker/test/github.test.ts` (the `cfg` const at the top is already in scope; add `deleteFile` to the import on line 3):

```ts
describe("deleteFile", () => {
  it("DELETEs the path with message + sha in the body and auth headers", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchMock = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ commit: { sha: "c1" } }), { status: 200 });
    }) as typeof fetch;

    await deleteFile(cfg, "progress/anna.json", "old-sha", "delete(anna) by sam", fetchMock);

    expect(captured!.url).toBe("https://api.github.com/repos/mykhailo-melnyk/ae-tracker-data/contents/progress/anna.json");
    expect(captured!.init.method).toBe("DELETE");
    expect((captured!.init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    const body = JSON.parse(captured!.init.body as string);
    expect(body).toEqual({ message: "delete(anna) by sam", sha: "old-sha" });
  });

  it("throws with the status when GitHub rejects the delete (409 stale sha)", async () => {
    const fetchMock = (async () => new Response("Conflict", { status: 409 })) as typeof fetch;
    await expect(
      deleteFile(cfg, "progress/anna.json", "stale", "msg", fetchMock),
    ).rejects.toThrow("deleteFile 409");
  });
});
```

Update the import line (line 3) to:

```ts
import { readJsonFile, writeJsonFile, listDirectory, createIssue, deleteFile } from "../src/github";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd worker && npx vitest run test/github.test.ts -t deleteFile`
Expected: FAIL — `deleteFile` is not exported / not defined.

- [ ] **Step 3: Implement `deleteFile`**

Append to `worker/src/github.ts` after `writeJsonFile` (after line 77):

```ts
export async function deleteFile(
  cfg: RepoConfig,
  path: string,
  sha: string,
  message: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchFn(`${API}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
    method: "DELETE",
    headers: { ...headers(cfg.token), "content-type": "application/json" },
    body: JSON.stringify({ message, sha }),
  });
  if (!res.ok) throw new Error(`deleteFile ${res.status}: ${await res.text()}`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd worker && npx vitest run test/github.test.ts -t deleteFile`
Expected: PASS (2 passing).

- [ ] **Step 5: Typecheck**

Run: `cd worker && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add worker/src/github.ts worker/test/github.test.ts
git commit -m "$(cat <<'EOF'
feat(worker): add deleteFile storage primitive

DELETE against the GitHub Contents API (message + sha body), mirroring
writeJsonFile. Throws "deleteFile <status>" on non-OK so callers can
detect a 409 stale-SHA conflict.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `handleApiUserDelete` endpoint + route

**Files:**
- Modify: `worker/src/api.ts` (add `deleteFile` to the `./github` import on line 3; append handler after `handleApiUserDisabled`, ~line 465)
- Modify: `worker/src/index.ts` (add `handleApiUserDelete` to the `./api` import on line 2; add a route before the bare `userMatch`, ~line 80)
- Test: `worker/test/api.test.ts` (add `handleApiUserDelete` to the import on line 2; add a `describe` block after the `/disabled` block, ~line 470)

**Interfaces:**
- Consumes: `deleteFile` (Task 1); existing `requireSession`, `isSuperAdmin`, `progressPath`, `readJsonFile`, `CACHE_KEY` in `api.ts`.
- Produces: `handleApiUserDelete(request: Request, env: Env, fetchFn: typeof fetch, targetUsername: string): Promise<Response>` — `403` non-super-admin, `403` self-delete, `404` when absent, `200 { deleted: true, username }` on success (busts the aggregate cache); retries a `409` up to 4× re-reading the fresh SHA. Routed at `POST /api/user/<username>/delete`.

- [ ] **Step 1: Write the failing tests**

Add `handleApiUserDelete` to the import on line 2 of `worker/test/api.test.ts`:

```ts
import { handleApiMe, handleApiMark, handleApiUser, handleApiCompetencies, handleApiUserCompetencies, handleApiUserDisabled, handleApiUserLeader, handleApiUserDelete } from "../src/api";
```

Add this block after the `/api/user/:username/disabled` describe (after line 470):

```ts
describe("/api/user/:username/delete (super-admin only)", () => {
  const SUPER_ENV = { ...ENV, ADMIN_USERNAMES: "alice", SUPERADMIN_USERNAMES: "sam" } as any;

  function delReq(session: string, target: string) {
    return new Request(`https://w.example/api/user/${target}/delete`, {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
    });
  }

  it("returns 403 when caller is a plain engineer", async () => {
    const session = await signSession("anna", SUPER_ENV.SESSION_SECRET, 3600);
    const res = await handleApiUserDelete(delReq(session, "ben"), SUPER_ENV, globalThis.fetch, "ben");
    expect(res.status).toBe(403);
  });

  it("returns 403 when caller is an admin but NOT a super admin", async () => {
    const session = await signSession("alice", SUPER_ENV.SESSION_SECRET, 3600);
    const res = await handleApiUserDelete(delReq(session, "ben"), SUPER_ENV, globalThis.fetch, "ben");
    expect(res.status).toBe(403);
  });

  it("returns 403 when a super admin tries to delete themselves", async () => {
    const session = await signSession("sam", SUPER_ENV.SESSION_SECRET, 3600);
    // No fetch should happen — a self-delete is rejected before any read.
    const fetchMock = (async () => { throw new Error("should not fetch"); }) as typeof fetch;
    const res = await handleApiUserDelete(delReq(session, "sam"), SUPER_ENV, fetchMock, "sam");
    expect(res.status).toBe(403);
  });

  it("returns 404 when the target engineer has no progress file", async () => {
    const session = await signSession("sam", SUPER_ENV.SESSION_SECRET, 3600);
    const fetchMock = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    const res = await handleApiUserDelete(delReq(session, "ghost"), SUPER_ENV, fetchMock, "ghost");
    expect(res.status).toBe(404);
  });

  it("a super admin deletes an engineer: DELETEs the file with its sha and returns {deleted:true}", async () => {
    const session = await signSession("sam", SUPER_ENV.SESSION_SECRET, 3600);
    const stored = { github_username: "ben", created_at: "x", updated_at: "y", tasks: {} };
    const calls: any[] = [];
    const fetchMock = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body });
      if (init?.method === "DELETE") return new Response(JSON.stringify({ commit: { sha: "c1" } }), { status: 200 });
      return new Response(JSON.stringify({ sha: "s1", content: btoa(JSON.stringify(stored)), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    let cacheBusted = false;
    const env = { ...SUPER_ENV, AGGREGATE_CACHE: { delete: async () => { cacheBusted = true; } } };
    const res = await handleApiUserDelete(delReq(session, "ben"), env, fetchMock, "ben");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, username: "ben" });
    const del = calls.find((c) => c.method === "DELETE");
    expect(del.url).toContain("/contents/progress/ben.json");
    expect(JSON.parse(del.body).sha).toBe("s1");
    expect(cacheBusted).toBe(true);
  });

  it("retries a 409 stale-SHA conflict: re-reads the fresh sha then succeeds", async () => {
    const session = await signSession("sam", SUPER_ENV.SESSION_SECRET, 3600);
    const stored = { github_username: "ben", created_at: "x", updated_at: "y", tasks: {} };
    let deleteAttempts = 0;
    let shaSeen: string | undefined;
    const fetchMock = (async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        deleteAttempts++;
        shaSeen = JSON.parse(init.body as string).sha;
        if (deleteAttempts === 1) return new Response("Conflict", { status: 409 });
        return new Response(JSON.stringify({ commit: { sha: "c2" } }), { status: 200 });
      }
      // First read returns sha s1; after the conflict the re-read returns fresh sha s2.
      const sha = deleteAttempts === 0 ? "s1" : "s2";
      return new Response(JSON.stringify({ sha, content: btoa(JSON.stringify(stored)), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const res = await handleApiUserDelete(delReq(session, "ben"), SUPER_ENV, fetchMock, "ben");
    expect(res.status).toBe(200);
    expect(deleteAttempts).toBe(2);
    expect(shaSeen).toBe("s2"); // second attempt used the re-read sha
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd worker && npx vitest run test/api.test.ts -t "delete (super-admin only)"`
Expected: FAIL — `handleApiUserDelete` is not exported.

- [ ] **Step 3: Implement the handler**

Add `deleteFile` to the `./github` import on line 3 of `worker/src/api.ts`:

```ts
import { readJsonFile, writeJsonFile, createIssue, deleteFile, type RepoConfig } from "./github";
```

Append after `handleApiUserDisabled` (after line 465):

```ts
/**
 * POST /api/user/{username}/delete — a super admin PERMANENTLY deletes an engineer's
 * progress file (hard delete, for data-hygiene / GDPR removal). Irreversible: only the
 * data repo's git history retains the content afterward. Distinct from disable, which
 * keeps the file. Same 409 optimistic-concurrency retry as the other write paths, since
 * a concurrent /api/mark could move the SHA between the read and the delete.
 */
export async function handleApiUserDelete(
  request: Request,
  env: Env,
  fetchFn: typeof fetch,
  targetUsername: string,
): Promise<Response> {
  const auth = await requireSession(request, env);
  if (auth instanceof Response) return auth;
  if (!isSuperAdmin(auth.username, env)) return new Response("forbidden", { status: 403 });
  // Deleting yourself mid-session leaves a confusing half-state and is almost always a
  // mistake. Admin rights live in config, not the progress file, so there's no need to
  // protect the admin tier otherwise.
  if (targetUsername === auth.username) return new Response("cannot delete yourself", { status: 403 });

  const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  const msg = `delete(${targetUsername}) by ${auth.username}`;
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const existing = await readJsonFile<ProgressFile>(cfg, progressPath(targetUsername), fetchFn);
    // Nothing to delete for someone who never started (or a racing delete already won).
    if (!existing) return new Response("no such engineer", { status: 404 });
    try {
      await deleteFile(cfg, progressPath(targetUsername), existing.sha, msg, fetchFn);
      await env.AGGREGATE_CACHE?.delete(CACHE_KEY); // so the dashboard drops the row on next load
      return Response.json({ deleted: true, username: targetUsername });
    } catch (e) {
      const errStr = e instanceof Error ? e.message : String(e);
      const isConflict = errStr.includes("deleteFile 409");
      if (!isConflict || attempt === MAX_ATTEMPTS) {
        console.error(`delete failed: target=${targetUsername} attempt=${attempt}/${MAX_ATTEMPTS} conflict=${isConflict} err=${errStr.slice(0, 300)}`);
        throw e;
      }
      console.warn(`delete 409 conflict: target=${targetUsername} attempt=${attempt}/${MAX_ATTEMPTS}, retrying`);
      await new Promise((r) => setTimeout(r, 50 * attempt));
    }
  }
  // Unreachable — loop either returns or throws.
  throw new Error("unreachable");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd worker && npx vitest run test/api.test.ts -t "delete (super-admin only)"`
Expected: PASS (6 passing).

- [ ] **Step 5: Wire the route in `index.ts`**

Add `handleApiUserDelete` to the `./api` import on line 2:

```ts
import { handleApiMe, handleApiMark, handleApiUser, handleApiCompetencies, handleApiUserCompetencies, handleApiUserDisabled, handleApiUserLeader, handleApiUserDelete, handleApiFeedback } from "./api";
```

Add this route immediately before the `leaderMatch` block (before line 76), so the `/delete` sub-action is matched before the bare `userMatch`:

```ts
    const deleteMatch = url.pathname.match(/^\/api\/user\/([\w-]+)\/delete$/);
    if (deleteMatch) return withCors(
      await handleApiUserDelete(request, env, fetch, deleteMatch[1]),
      env, request,
    );
```

- [ ] **Step 6: Typecheck and run the full worker suite**

Run: `cd worker && npm run typecheck && npx vitest run`
Expected: typecheck clean; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add worker/src/api.ts worker/src/index.ts worker/test/api.test.ts
git commit -m "$(cat <<'EOF'
feat(worker): super-admin delete engineer endpoint

POST /api/user/<username>/delete hard-deletes the progress file
(super-admin only, self-delete blocked, 404 when absent, 409 retry,
aggregate-cache bust). Irreversible — recoverable only via data-repo
git history.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Dashboard Delete button

**Files:**
- Modify: `public/dashboard.js` (add `deleteBtn` in `renderTable`'s row template ~line 274; wire it ~line 297; add `deleteEngineer` after `toggleDisabled` ~line 326)
- Modify: `public/dashboard.css` (add `.delete-btn` styles after `.disable-btn` rules, ~line 443)

**Interfaces:**
- Consumes: `handleApiUserDelete` route from Task 2 (`POST /api/user/<username>/delete`); existing `AGG`, `WORKER`, `apiFetch`, `renderKpis`, `renderTable`, `AGG.is_superadmin`.
- Produces: a per-row Delete button (super-admin-only) that confirms via typed username, then removes the engineer from `AGG.engineers` and re-renders.

- [ ] **Step 1: Add the Delete button to the row template**

In `public/dashboard.js`, just after the `toggleBtn` definition (after line 276), add:

```js
    // Delete is a super-admin-only, irreversible hard delete (typed-username confirm).
    const deleteBtn = AGG.is_superadmin
      ? `<button class="delete-btn" data-user="${e.username}">Delete</button>`
      : "";
```

Then change the actions cell (line 288) from:

```js
      <td style="text-align:right">${toggleBtn}<a href="tracker.html?as=${e.username}" style="color:#2563eb;font-weight:600">View →</a></td>
```

to:

```js
      <td style="text-align:right">${toggleBtn}${deleteBtn}<a href="tracker.html?as=${e.username}" style="color:#2563eb;font-weight:600">View →</a></td>
```

- [ ] **Step 2: Wire the click handler**

After the `.disable-btn` wiring block (after line 299), add:

```js
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteEngineer(btn));
  });
```

- [ ] **Step 3: Implement `deleteEngineer`**

In `public/dashboard.js`, add after the `toggleDisabled` function (after line 326):

```js
async function deleteEngineer(btn) {
  const username = btn.dataset.user;
  const typed = prompt(
    `This permanently deletes @${username}'s progress. This cannot be undone.\n\n`
    + `Type the username "${username}" to confirm:`);
  if (typed === null) return; // cancelled
  if (typed.trim().replace(/^@/, "") !== username) {
    alert("Username did not match — nothing was deleted.");
    return;
  }
  btn.disabled = true;
  try {
    const res = await apiFetch(WORKER + "/api/user/" + encodeURIComponent(username) + "/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) throw new Error("delete failed: " + res.status);
    // Drop the engineer locally so both the counts and the table update without a reload.
    AGG.engineers = AGG.engineers.filter((e) => e.username !== username);
    renderKpis();
    renderTable();
  } catch (e) {
    btn.disabled = false;
    alert("Could not delete @" + username + ". Try again in a moment.");
  }
}
```

- [ ] **Step 4: Add the button styling**

In `public/dashboard.css`, after line 443 (`.disable-btn:disabled { … }`), add:

```css
.delete-btn {
  background: #b91c1c;
  border: 1px solid #b91c1c;
  color: white;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  margin-right: 12px;
  font-family: inherit;
}
.delete-btn:hover { background: #991b1b; border-color: #991b1b; }
.delete-btn:disabled { opacity: 0.5; cursor: default; }
```

- [ ] **Step 5: Manually verify in the browser**

Run (two terminals):

```bash
cd worker && npm run dev          # Worker on :8787
npx http-server public -p 8080 -c-1   # frontend on :8080
```

Sign in as a super admin, open `http://localhost:8080/dashboard.html`. Expected:
- A red **Delete** button appears in each engineer row (only because you're a super admin).
- Clicking it prompts for the username; a wrong entry aborts with an alert; the exact username deletes the row and the KPI counts drop by one, with no page reload.
- Reloading the dashboard confirms the row stays gone.

- [ ] **Step 6: Commit**

```bash
git add public/dashboard.js public/dashboard.css
git commit -m "$(cat <<'EOF'
feat(dashboard): super-admin delete-engineer button

Per-row Delete (super-admin-only) with a typed-username confirm; on
success removes the engineer locally and re-renders KPIs + table.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Documentation

**Files:**
- Modify: `CLAUDE.md` (the super-admin paragraph in the `### Auth` section; the Common Operations table)

**Interfaces:**
- Consumes: nothing (docs only).
- Produces: documentation of the delete power.

- [ ] **Step 1: Update the Auth section**

In `CLAUDE.md`, find the sentence in the `### Auth` section describing the super admin's power:

```
A second var `SUPERADMIN_USERNAMES` defines the **super admin** role (intended as a single user) — a superset of admin (`isAdmin` returns true for super admins too) with the sole extra power of soft-disabling/re-enabling engineers via `POST /api/user/<username>/disabled` (`handleApiUserDisabled`, super-admin-gated by `isSuperAdmin`).
```

Replace it with:

```
A second var `SUPERADMIN_USERNAMES` defines the **super admin** role (intended as a single user) — a superset of admin (`isAdmin` returns true for super admins too) with two extra powers, both super-admin-gated by `isSuperAdmin`: soft-disabling/re-enabling engineers via `POST /api/user/<username>/disabled` (`handleApiUserDisabled`), and **permanently deleting** an engineer's progress file via `POST /api/user/<username>/delete` (`handleApiUserDelete`). Delete is a hard delete — it removes `progress/<username>.json` outright (blocked for self-delete), so it is irreversible and recoverable only via the data repo's git history; disable is the reversible alternative that keeps the file.
```

- [ ] **Step 2: Add a Common Operations table row**

In the Common Operations table in `CLAUDE.md`, add this row immediately after the "Disable / re-enable an engineer" row:

```
| Delete an engineer (permanent) | As a super admin, use the per-row **Delete** button on the dashboard (or `POST /api/user/<username>/delete`). Hard delete — removes `progress/<username>.json` entirely (self-delete blocked). Irreversible; recoverable only via the `ae-tracker-data` repo's git history. Use **Disable** instead if you may need the data back. |
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: document super-admin delete-engineer power

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Verification

After all tasks, from `worker/`:

```bash
cd worker && npm run typecheck && npx vitest run
```

Expected: typecheck clean, all tests pass (including the new `deleteFile` and `/api/user/:username/delete` suites).

**Deploy note (out of scope for the plan, per CLAUDE.md):** the Worker is deployed manually (`wrangler deploy` from `worker/`); the frontend auto-deploys via GitHub Actions on push to `main` when `public/**` changes.
