# Unit Leaders: Assignment, Filter & Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins assign a unit leader to each engineer, then filter the dashboard and export results by unit leader.

**Architecture:** `unit_leader` is a pure data attribute on the developer's `progress/<username>.json` (parallel to `competency`), set via a new admin-only `POST /api/user/<username>/leader`. The aggregate carries it per engineer; the dashboard uses it for a client-side filter and the export for a grouping dimension. No new role, no server-side scoping, no new config vars.

**Tech Stack:** Cloudflare Worker (TypeScript, `src/`), Vitest via `@cloudflare/vitest-pool-workers` (`worker/test/`), vanilla static frontend (`public/*.js`, no build step), GitHub Contents API as the store.

## Global Constraints

- Leader value must be a string matching `^[\w-]{1,39}$` (GitHub max username length 39) and **must not equal the target username** (no self-lead); empty/`null` clears it. Reject anything else with HTTP 400.
- `POST /api/user/<username>/leader` is **admin-only** (`isAdmin`, which already accepts super admins). Non-admin → 403.
- Exactly **one** unit leader per developer.
- Every leader write busts the aggregate cache: `await env.AGGREGATE_CACHE?.delete(CACHE_KEY)`.
- Aggregate shape changes → bump `CACHE_KEY` to `"aggregate-v7"`.
- **No new secrets or config vars.** The leader set is derived from assignments.
- Worker handlers keep the injected `fetchFn: typeof fetch` test seam.
- All `cd`-relative worker commands run from `worker/`.
- Commit messages end with the trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## File Structure

- `worker/src/types.ts` — add `unit_leader*` fields to `ProgressFile` (Task 1).
- `worker/src/api.ts` — `validateLeader`, `writeUnitLeader`, `handleApiUserLeader` (Task 1).
- `worker/src/index.ts` — route wiring for `/api/user/<u>/leader` (Task 1).
- `worker/test/api.test.ts` — leader endpoint tests (Task 1).
- `worker/src/aggregate.ts` — carry `unit_leader` per engineer; bump `CACHE_KEY` (Task 2).
- `worker/test/aggregate.test.ts` — aggregate-carries-`unit_leader` + cache-key tests (Task 2).
- `public/dashboard.html` — table header + toolbar filter control (Tasks 3, 4).
- `public/dashboard.js` — per-row assignment + leader filter (Tasks 3, 4).
- `public/export.js` — unit-leader dimension (Task 5).
- `CLAUDE.md` — docs (Task 6).

---

## Task 1: Backend — `POST /api/user/<username>/leader`

**Files:**
- Modify: `worker/src/types.ts`
- Modify: `worker/src/api.ts`
- Modify: `worker/src/index.ts`
- Test: `worker/test/api.test.ts`

**Interfaces:**
- Consumes: `requireSession`, `isAdmin`, `emptyProgress`, `progressPath`, `readJsonFile`, `writeJsonFile`, `RepoConfig`, `CACHE_KEY` (all already in `api.ts` or imported there).
- Produces:
  - `ProgressFile` gains `unit_leader?: string`, `unit_leader_set_by?: string`, `unit_leader_updated_at?: string`.
  - `handleApiUserLeader(request: Request, env: Env, fetchFn: typeof fetch, targetUsername: string): Promise<Response>` — returns the updated `ProgressFile` as JSON on success.

- [ ] **Step 1: Write the failing tests**

Append this describe block to the end of `worker/test/api.test.ts` (before the final line). Also add `handleApiUserLeader` to the import on line 2:

```ts
// line 2 becomes:
import { handleApiMe, handleApiMark, handleApiUser, handleApiCompetencies, handleApiUserCompetencies, handleApiUserDisabled, handleApiUserLeader } from "../src/api";
```

```ts
describe("/api/user/:username/leader (admin only)", () => {
  const ADMIN_ENV = { ...ENV, ADMIN_USERNAMES: "mykhailo-melnyk" } as any;

  it("returns 403 when caller is not an admin", async () => {
    const session = await signSession("randomguy", ENV.SESSION_SECRET, 3600);
    const req = new Request("https://w.example/api/user/anna/leader", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ leader: "ben" }),
    });
    const res = await handleApiUserLeader(req, ADMIN_ENV, globalThis.fetch, "anna");
    expect(res.status).toBe(403);
  });

  it("an admin assigns a unit leader and is recorded as the setter", async () => {
    const session = await signSession("mykhailo-melnyk", ENV.SESSION_SECRET, 3600);
    const calls: any[] = [];
    const fetchMock = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body });
      if (init?.method === "PUT") return new Response(JSON.stringify({ content: { sha: "s" } }), { status: 200 });
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/user/anna/leader", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ leader: "ben" }),
    });
    const res = await handleApiUserLeader(req, ADMIN_ENV, fetchMock, "anna");
    expect(res.status).toBe(200);
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toContain("progress/anna.json");
    const written = JSON.parse(atob(JSON.parse(put.body).content));
    expect(written.unit_leader).toBe("ben");
    expect(written.unit_leader_set_by).toBe("mykhailo-melnyk");
    expect(written.unit_leader_updated_at).toBeTruthy();
  });

  it("clears the unit leader when given null", async () => {
    const session = await signSession("mykhailo-melnyk", ENV.SESSION_SECRET, 3600);
    const stored = { github_username: "anna", created_at: "x", updated_at: "y", unit_leader: "ben", tasks: {} };
    let putBody: string | undefined;
    const fetchMock = (async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") { putBody = init.body as string; return new Response(JSON.stringify({ content: { sha: "s" } }), { status: 200 }); }
      return new Response(JSON.stringify({ sha: "s", content: btoa(JSON.stringify(stored)), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/user/anna/leader", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ leader: null }),
    });
    const res = await handleApiUserLeader(req, ADMIN_ENV, fetchMock, "anna");
    expect(res.status).toBe(200);
    expect(JSON.parse(atob(JSON.parse(putBody!).content)).unit_leader).toBeUndefined();
  });

  it("rejects self-assignment with 400", async () => {
    const session = await signSession("mykhailo-melnyk", ENV.SESSION_SECRET, 3600);
    const req = new Request("https://w.example/api/user/anna/leader", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ leader: "anna" }),
    });
    const res = await handleApiUserLeader(req, ADMIN_ENV, globalThis.fetch, "anna");
    expect(res.status).toBe(400);
  });

  it("rejects a malformed username with 400", async () => {
    const session = await signSession("mykhailo-melnyk", ENV.SESSION_SECRET, 3600);
    const req = new Request("https://w.example/api/user/anna/leader", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ leader: "not a username!" }),
    });
    const res = await handleApiUserLeader(req, ADMIN_ENV, globalThis.fetch, "anna");
    expect(res.status).toBe(400);
  });

  it("retries on a 409 SHA-conflict and succeeds on re-read", async () => {
    const session = await signSession("mykhailo-melnyk", ENV.SESSION_SECRET, 3600);
    let putAttempts = 0;
    const stored = { github_username: "anna", created_at: "x", updated_at: "y", tasks: {} };
    const fetchMock = (async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        putAttempts += 1;
        if (putAttempts === 1) return new Response('{"message":"file does not match sha","status":"409"}', { status: 409 });
        return new Response(JSON.stringify({ content: { sha: "new-sha" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ sha: "fresh-sha", content: btoa(JSON.stringify(stored)), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/user/anna/leader", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ leader: "ben" }),
    });
    const res = await handleApiUserLeader(req, ADMIN_ENV, fetchMock, "anna");
    expect(res.status).toBe(200);
    expect(putAttempts).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd worker && npx vitest run test/api.test.ts -t "leader"`
Expected: FAIL — `handleApiUserLeader` is not exported / not a function.

- [ ] **Step 3: Add the `ProgressFile` fields**

In `worker/src/types.ts`, add three fields after the `competency_updated_at?` line (line 9):

```ts
  competency_updated_at?: string;
  unit_leader?: string;               // github_username of the assigned unit leader (an engineer)
  unit_leader_set_by?: string;        // admin github_username who set it (audit)
  unit_leader_updated_at?: string;    // ISO timestamp of the last change
```

- [ ] **Step 4: Add `validateLeader`, `writeUnitLeader`, `handleApiUserLeader`**

In `worker/src/api.ts`, add the following. Place `validateLeader` + `writeUnitLeader` next to `validateCompetency`/`writeCompetency`, and `handleApiUserLeader` after `handleApiUserCompetencies`:

```ts
/**
 * Validate a unit-leader assignment. `null`/`undefined`/`""` clears it. Otherwise the
 * value must be a GitHub-username-shaped string (≤ 39 chars) that isn't the target
 * themselves (no self-lead). Not verified to be an existing engineer — the UI only
 * offers existing engineers, and we avoid a directory read on every write (mirrors how
 * competency validates against the bundled taxonomy only). Returns `{ value }` (value
 * = username or undefined to clear), or null if the input is invalid.
 */
function validateLeader(input: unknown, targetUsername: string): { value: string | undefined } | null {
  if (input === undefined || input === null || input === "") return { value: undefined };
  if (typeof input !== "string") return null;
  if (!/^[\w-]{1,39}$/.test(input)) return null;
  if (input === targetUsername) return null; // no self-lead
  return { value: input };
}

/**
 * Read-modify-write an engineer's unit_leader with the same optimistic-concurrency
 * retry as writeCompetency (re-read fresh SHA, re-apply, retry up to 4× on 409).
 * Admin-only path, so it never stamps a display name.
 */
async function writeUnitLeader(
  cfg: RepoConfig,
  targetUsername: string,
  leader: string | undefined,
  setBy: string,
  fetchFn: typeof fetch,
): Promise<ProgressFile> {
  const msg = `unit_leader(${targetUsername}) set by ${setBy}`;
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const existing = await readJsonFile<ProgressFile>(cfg, progressPath(targetUsername), fetchFn);
    const progress = existing?.data ?? emptyProgress(targetUsername);
    const now = new Date().toISOString();
    if (leader === undefined) delete progress.unit_leader;
    else progress.unit_leader = leader;
    progress.unit_leader_set_by = setBy;
    progress.unit_leader_updated_at = now;
    progress.updated_at = now;
    try {
      await writeJsonFile(cfg, progressPath(targetUsername), progress, existing?.sha ?? null, msg, fetchFn);
      return progress;
    } catch (e) {
      const errStr = e instanceof Error ? e.message : String(e);
      const isConflict = errStr.includes("writeJsonFile 409");
      if (!isConflict || attempt === MAX_ATTEMPTS) {
        console.error(`unit_leader write failed: target=${targetUsername} attempt=${attempt}/${MAX_ATTEMPTS} conflict=${isConflict} err=${errStr.slice(0, 300)}`);
        throw e;
      }
      console.warn(`unit_leader 409 conflict: target=${targetUsername} attempt=${attempt}/${MAX_ATTEMPTS}, retrying`);
      await new Promise((r) => setTimeout(r, 50 * attempt));
    }
  }
  // Unreachable — loop either returns or throws.
  throw new Error("unreachable");
}

/** POST /api/user/{username}/leader — an admin sets or clears an engineer's unit leader. */
export async function handleApiUserLeader(
  request: Request,
  env: Env,
  fetchFn: typeof fetch,
  targetUsername: string,
): Promise<Response> {
  const auth = await requireSession(request, env);
  if (auth instanceof Response) return auth;
  if (!isAdmin(auth.username, env)) return new Response("forbidden", { status: 403 });

  let body: { leader?: unknown };
  try { body = await request.json(); } catch { return new Response("invalid json", { status: 400 }); }
  const parsed = validateLeader(body.leader, targetUsername);
  if (parsed === null) return new Response("invalid body", { status: 400 });

  const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  const progress = await writeUnitLeader(cfg, targetUsername, parsed.value, auth.username, fetchFn);
  await env.AGGREGATE_CACHE?.delete(CACHE_KEY); // so the dashboard reflects the change on next load
  return Response.json(progress);
}
```

- [ ] **Step 5: Run the leader tests to verify they pass**

Run: `cd worker && npx vitest run test/api.test.ts -t "leader"`
Expected: PASS (6 tests).

- [ ] **Step 6: Wire the route in `index.ts`**

In `worker/src/index.ts`, add `handleApiUserLeader` to the import on line 2:

```ts
import { handleApiMe, handleApiMark, handleApiUser, handleApiCompetencies, handleApiUserCompetencies, handleApiUserDisabled, handleApiUserLeader, handleApiFeedback } from "./api";
```

Then add the route **before** the generic `userMatch` block (i.e. right after the `disabledMatch` block, ~line 75):

```ts
    const leaderMatch = url.pathname.match(/^\/api\/user\/([\w-]+)\/leader$/);
    if (leaderMatch) return withCors(
      await handleApiUserLeader(request, env, fetch, leaderMatch[1]),
      env, request,
    );
```

- [ ] **Step 7: Typecheck and run the full worker test suite**

Run: `cd worker && npm run typecheck && npm test`
Expected: typecheck clean; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add worker/src/types.ts worker/src/api.ts worker/src/index.ts worker/test/api.test.ts
git commit -m "feat(worker): admin endpoint to set an engineer's unit leader

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Backend — carry `unit_leader` in the aggregate

**Files:**
- Modify: `worker/src/aggregate.ts`
- Test: `worker/test/aggregate.test.ts`

**Interfaces:**
- Consumes: `ProgressFile.unit_leader` (from Task 1).
- Produces: each `Aggregate["engineers"]` entry gains `unit_leader?: string`; `CACHE_KEY === "aggregate-v7"`.

- [ ] **Step 1: Write the failing tests**

Add `CACHE_KEY` to the import on line 2 of `worker/test/aggregate.test.ts`:

```ts
import { computeAggregate, handleApiAggregate, CACHE_KEY } from "../src/aggregate";
```

Add these two tests inside the existing `describe("computeAggregate", ...)` block:

```ts
  it("carries each engineer's unit_leader through to the aggregate", async () => {
    const registry = registryOf({ web: WEB });
    const files: Record<string, any> = {
      "anna.json": { github_username: "anna", created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-27T00:00:00Z", competency: "web", unit_leader: "ben", tasks: {} },
      "ben.json": { github_username: "ben", created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-27T00:00:00Z", competency: "web", tasks: {} },
    };
    const fetchMock = (async (url: string) => {
      if (url.endsWith("/contents/progress")) {
        return new Response(JSON.stringify([
          { name: "anna.json", type: "file", path: "progress/anna.json" },
          { name: "ben.json", type: "file", path: "progress/ben.json" },
        ]), { headers: { "content-type": "application/json" } });
      }
      const name = url.split("/").pop()!;
      return new Response(JSON.stringify({ sha: "s", content: btoa(JSON.stringify(files[name])), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const agg = await computeAggregate(cfg, registry, fetchMock, new Date("2026-05-27T12:00:00Z"));
    expect(agg.engineers.find((e) => e.username === "anna")!.unit_leader).toBe("ben");
    expect(agg.engineers.find((e) => e.username === "ben")!.unit_leader).toBeUndefined();
  });

  it("uses the v7 cache key", () => {
    expect(CACHE_KEY).toBe("aggregate-v7");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd worker && npx vitest run test/aggregate.test.ts`
Expected: FAIL — the two new tests fail (`unit_leader` is `undefined` on anna; `CACHE_KEY` is still `"aggregate-v6"`); the pre-existing tests still pass.

- [ ] **Step 3: Add `unit_leader` to the aggregate type and the pushed entry**

In `worker/src/aggregate.ts`, add `unit_leader?: string;` to the `engineers` array type in the `Aggregate` interface (after `competency?: string;`, ~line 41):

```ts
    competency?: string;
    unit_leader?: string;
    disabled?: boolean;
```

Then in the `engineers.push({ ... })` call (~line 126), add `unit_leader`:

```ts
    engineers.push({
      username: p.github_username,
      display_name: p.display_name,
      current_level: cl,
      completion_pct: totalTasks ? done / totalTasks : 0,
      last_active: la,
      competency: p.competency,
      unit_leader: p.unit_leader,
      disabled: p.disabled,
      certifications: certProgress,
    });
```

- [ ] **Step 4: Bump the cache key**

In `worker/src/aggregate.ts`, update the comment and value of `CACHE_KEY` (~line 154-160):

```ts
// Bump when the aggregate's shape changes so a deploy invalidates stale entries
// immediately (v2 adds per-engineer `competency`; v3 adds per-engineer `disabled`
// and excludes disabled engineers from the headline counts; v4 makes completion /
// current-level per the engineer's own competency path and keys by_task by the
// globally-unique prefixed task ids; v5 adds per-cert readiness + per-engineer
// cert progress; v6 counts cert readiness against required (non-optional) items only;
// v7 adds per-engineer `unit_leader`).
export const CACHE_KEY = "aggregate-v7";
```

- [ ] **Step 5: Run the aggregate tests to verify they pass**

Run: `cd worker && npx vitest run test/aggregate.test.ts`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 6: Typecheck and commit**

```bash
cd worker && npm run typecheck
```
Expected: clean.

```bash
git add worker/src/aggregate.ts worker/test/aggregate.test.ts
git commit -m "feat(worker): carry unit_leader per engineer in the aggregate (cache v7)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Dashboard — per-row unit-leader assignment

**Files:**
- Modify: `public/dashboard.html:58-60` (table header)
- Modify: `public/dashboard.js` (`renderTable`, event wiring, new `saveLeader`, `leaderName`)

**Interfaces:**
- Consumes: `AGG.engineers[].unit_leader` (Task 2), `apiFetch` (from `auth.js`), `POST /api/user/<u>/leader` (Task 1).
- Produces: `saveLeader(sel)` and `leaderName(username)` functions; a `.leader-select` control per row; `AGG.engineers[i].unit_leader` kept in sync client-side.

There are no frontend unit tests in this repo; verification is a JS syntax check plus manual inspection.

- [ ] **Step 1: Add the table header column**

In `public/dashboard.html`, change the `#view-levels` engineers header row (lines 58-60) to insert a "Unit leader" column after "Competency":

```html
        <table class="engineers"><thead><tr>
          <th>Engineer</th><th>Current</th><th>Completion</th><th>Competency</th><th>Unit leader</th><th>Last active</th><th></th>
        </tr></thead><tbody id="engineers-body"></tbody></table>
```

- [ ] **Step 2: Add the `leaderName` helper**

In `public/dashboard.js`, add near `competencyLabel` (~line 151):

```js
// Display name for a leader username, resolved from the engineers list (leaders are
// themselves engineers). Falls back to the raw username, or "—" when unset.
function leaderName(username) {
  if (!username) return "—";
  const e = AGG.engineers.find((x) => x.username === username);
  return e ? (e.display_name || e.username) : username;
}
```

- [ ] **Step 3: Render the per-row leader `<select>`**

In `public/dashboard.js` `renderTable`, inside the `filtered.map((e) => { ... })` body, build the leader options after the competency `options` are built (~line 229), and add a new `<td>` after the competency `<td>` (~line 243). The new cell:

```js
    const leaderOptions = [`<option value=""${!e.unit_leader ? " selected" : ""}>—</option>`]
      .concat(AGG.engineers
        .filter((o) => o.username !== e.username) // no self-lead
        .map((o) => `<option value="${o.username}"${e.unit_leader === o.username ? " selected" : ""}>${o.display_name || o.username}</option>`))
      .join("");
```

Insert this cell immediately after the competency `<td>...</td>` line:

```js
      <td><select class="leader-select" data-user="${e.username}" data-prev="${e.unit_leader || ""}">${leaderOptions}</select></td>
```

So the row's cell order is: Engineer, Current, Completion, Competency (`.comp-select`), **Unit leader (`.leader-select`)**, Last active, actions.

- [ ] **Step 4: Wire the change handler**

In `public/dashboard.js` `renderTable`, after the existing `.comp-select` / `.disable-btn` wiring (~line 248-253), add:

```js
  document.querySelectorAll(".leader-select").forEach((sel) => {
    sel.addEventListener("change", () => saveLeader(sel));
  });
```

- [ ] **Step 5: Add `saveLeader`**

In `public/dashboard.js`, add after `saveCompetency` (~line 303):

```js
async function saveLeader(sel) {
  const username = sel.dataset.user;
  const leader = sel.value;
  sel.disabled = true;
  try {
    const res = await apiFetch(WORKER + "/api/user/" + encodeURIComponent(username) + "/leader", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leader: leader || null }),
    });
    if (!res.ok) throw new Error("save failed: " + res.status);
    const updated = await res.json();
    const eng = AGG.engineers.find((e) => e.username === username);
    if (eng) eng.unit_leader = updated.unit_leader;
    sel.dataset.prev = updated.unit_leader || "";
    sel.disabled = false;
  } catch (e) {
    sel.value = sel.dataset.prev; // roll back the selection
    sel.disabled = false;
    alert("Could not save unit leader for " + username + ". Try again in a moment.");
  }
}
```

- [ ] **Step 6: Syntax check**

Run: `node --check public/dashboard.js`
Expected: no output (exit 0).

- [ ] **Step 7: Manual verification**

Start the worker (`cd worker && npm run dev`) and serve the frontend (`npx http-server public -p 8080 -c-1`), sign in as an admin, open `dashboard.html`. Expected: each engineer row shows a "Unit leader" dropdown listing all other engineers; selecting one persists (reload the page — the selection sticks); selecting "—" clears it. If you cannot run a full local auth loop, at minimum confirm the column renders and the dropdown is populated.

- [ ] **Step 8: Commit**

```bash
git add public/dashboard.html public/dashboard.js
git commit -m "feat(dashboard): per-row unit-leader assignment control

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Dashboard — filter by unit leader (rescopes KPIs, bars, table)

**Files:**
- Modify: `public/dashboard.html` (toolbar, ~line 48-57)
- Modify: `public/dashboard.js` (`scopedActive`, `renderTable`, `renderLevelCompletion`, `init`, `wireFilters`, `saveLeader`, new `LEADER`/`NO_LEADER`/`inLeaderScope`/`populateLeaderFilter`)

**Interfaces:**
- Consumes: `AGG.engineers[].unit_leader`, `leaderName` (Task 3), `scopedActive`, `renderAll`.
- Produces: module-level `LEADER` scope; `inLeaderScope(e)` predicate; `populateLeaderFilter()`; a `#leader-filter` `<select>` in the toolbar.

Behavior **B** from the spec: selecting a leader rescopes KPIs + bars + table via `scopedActive`. The "Completion by level" task-detail panel keeps following the competency scope only (its `by_task` counts are server-side and cross-competency) — a note is shown when a leader filter is active.

- [ ] **Step 1: Add the filter control to the toolbar**

In `public/dashboard.html`, add a `<select>` to the `#view-levels` toolbar, after the "Disabled" filter pill (line 56), inside the same `.toolbar` div:

```html
          <div class="filter-pill" data-filter="disabled">Disabled</div>
          <select class="leader-filter" id="leader-filter" aria-label="Filter by unit leader">
            <option value="all">All unit leaders</option>
          </select>
```

- [ ] **Step 2: Add the scope state and predicate**

In `public/dashboard.js`, near the other module-level filter state (`let FILTER = "all";` etc., ~line 189-192), add:

```js
let LEADER = "all";               // "all" | "__unassigned__" | a leader username
const NO_LEADER = "__unassigned__";

function inLeaderScope(e) {
  if (LEADER === "all") return true;
  if (LEADER === NO_LEADER) return !e.unit_leader;
  return e.unit_leader === LEADER;
}
```

- [ ] **Step 3: Fold leader scope into `scopedActive`**

In `public/dashboard.js`, update `scopedActive` (~line 39) to also apply `inLeaderScope`:

```js
function scopedActive() {
  return AGG.engineers.filter((e) =>
    !e.disabled
    && (SCOPE === "all" || e.competency === SCOPE)
    && inLeaderScope(e));
}
```

- [ ] **Step 4: Apply leader scope in `renderTable`**

In `public/dashboard.js` `renderTable`, add the leader clause right after the existing `SCOPE` check (~line 217):

```js
    if (SCOPE !== "all" && e.competency !== SCOPE) return false;
    if (!inLeaderScope(e)) return false;
```

- [ ] **Step 5: Add the task-detail caveat note**

In `public/dashboard.js` `renderLevelCompletion`, replace the final `box.innerHTML = html;` (~line 119) with a version that prepends a note when a leader filter is active:

```js
  const leaderNote = LEADER !== "all"
    ? `<div class="empty-detail" style="margin-bottom:8px">Task detail reflects the whole competency, not the unit-leader filter.</div>`
    : "";
  box.innerHTML = leaderNote + html;
```

- [ ] **Step 6: Add `populateLeaderFilter`**

In `public/dashboard.js`, add near `buildCompetencyPills` (~line 194):

```js
function populateLeaderFilter() {
  const sel = document.getElementById("leader-filter");
  const leaders = [...new Set(AGG.engineers.map((e) => e.unit_leader).filter(Boolean))]
    .sort((a, b) => leaderName(a).localeCompare(leaderName(b)));
  sel.innerHTML = `<option value="all">All unit leaders</option>`
    + leaders.map((u) => `<option value="${u}">${leaderName(u)}</option>`).join("")
    + `<option value="${NO_LEADER}">Unassigned</option>`;
  // Keep the current selection if it's still a valid option; else fall back to "all".
  if (LEADER === "all" || LEADER === NO_LEADER || leaders.includes(LEADER)) sel.value = LEADER;
  else { LEADER = "all"; sel.value = "all"; }
}
```

- [ ] **Step 7: Wire the change handler**

In `public/dashboard.js` `wireFilters`, add after the search input wiring (~line 325):

```js
  document.getElementById("leader-filter").addEventListener("change", (e) => {
    LEADER = e.target.value;
    renderAll(); // leader scope drives KPIs + bars + table, like the competency scope
  });
```

- [ ] **Step 8: Populate the filter on init**

In `public/dashboard.js` `init`, add `populateLeaderFilter();` right after `buildCompetencyPills();` (~line 365):

```js
  buildCompetencyPills();
  populateLeaderFilter();
  buildCertPills();
```

- [ ] **Step 9: Refresh the filter after an assignment changes**

In `public/dashboard.js` `saveLeader` (from Task 3), add a call to `populateLeaderFilter()` on success, right after `sel.dataset.prev = updated.unit_leader || "";`:

```js
    if (eng) eng.unit_leader = updated.unit_leader;
    sel.dataset.prev = updated.unit_leader || "";
    populateLeaderFilter(); // a leader may have just appeared or disappeared from the pool
    sel.disabled = false;
```

- [ ] **Step 10: Syntax check**

Run: `node --check public/dashboard.js`
Expected: no output (exit 0).

- [ ] **Step 11: Manual verification**

With the worker + frontend running and signed in as admin: assign a couple of engineers to a leader, then pick that leader in the "All unit leaders" dropdown. Expected: the KPIs (Engineers started / Avg completion / etc.), the level-distribution bars, and the engineers table all narrow to that leader's pool; picking a single Competency shows the caveat note in "Completion by level"; choosing "Unassigned" shows only engineers with no leader; "All unit leaders" restores the full view.

- [ ] **Step 12: Commit**

```bash
git add public/dashboard.html public/dashboard.js
git commit -m "feat(dashboard): filter by unit leader (rescopes KPIs, bars, table)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Export — unit-leader dimension

**Files:**
- Modify: `public/export.js`

**Interfaces:**
- Consumes: `AGG.engineers[].unit_leader`.
- Produces: an extended export modal with a "Unit leaders to include" section, a "Unit leader" column in every row, and a "By unit leader" summary block. `__no_leader__` is the sentinel for the Unassigned checkbox (kept distinct from the competency `__unassigned__`).

- [ ] **Step 1: Add the leader sentinel and label helper**

In `public/export.js`, after the `UNASSIGNED` const (line 9), add:

```js
const NO_LEADER = "__no_leader__";

function leaderLabelFor(AGG, username) {
  if (!username) return "Unassigned";
  const e = AGG.engineers.find((x) => x.username === username);
  return e ? (e.display_name || e.username) : username;
}

// Distinct leader usernames present in the aggregate, sorted by display name.
function leaderList(AGG) {
  return [...new Set(AGG.engineers.map((e) => e.unit_leader).filter(Boolean))]
    .sort((a, b) => leaderLabelFor(AGG, a).localeCompare(leaderLabelFor(AGG, b)));
}
```

- [ ] **Step 2: Extend `selectedEngineers` with the leader predicate**

In `public/export.js`, replace `selectedEngineers` (lines 19-23) with:

```js
// Engineers passing BOTH the competency selection and the unit-leader selection
// (intersection). chosenLeaders is a Set of leader usernames; includeNoLeader covers
// engineers with no leader assigned.
function selectedEngineers(AGG, chosenIds, includeUnassigned, chosenLeaders, includeNoLeader) {
  return AGG.engineers.filter((e) => {
    const compOk = (e.competency && chosenIds.has(e.competency)) || (!e.competency && includeUnassigned);
    const leaderOk = (e.unit_leader && chosenLeaders.has(e.unit_leader)) || (!e.unit_leader && includeNoLeader);
    return compOk && leaderOk;
  });
}
```

- [ ] **Step 3: Add the "Unit leader" column to `buildRows`**

In `public/export.js`, replace `buildRows` (lines 25-34) with a version that takes `AGG` and adds the column after Competency:

```js
function buildRows(AGG, engineers, CUR) {
  return engineers.map((e) => ({
    Name: e.display_name || e.username,
    GitHub: "@" + e.username,
    Competency: compLabel(CUR, e.competency),
    "Unit leader": leaderLabelFor(AGG, e.unit_leader),
    "Current level": e.current_level,
    "Completion %": Math.round(e.completion_pct * 100),
    "Last active": new Date(e.last_active).toLocaleDateString(),
  }));
}
```

- [ ] **Step 4: Update the CSV default-headers fallback**

In `public/export.js` `downloadCsv` (lines 47-50), add the "Unit leader" key to the empty-rows fallback header object so an empty export still has the right columns:

```js
function downloadCsv(rows) {
  const headers = Object.keys(rows[0] || {
    Name: "", GitHub: "", Competency: "", "Unit leader": "", "Current level": "", "Completion %": "", "Last active": "",
  });
```

- [ ] **Step 5: Add the "By unit leader" block to `summaryAoa`**

In `public/export.js`, change the `summaryAoa` signature and add the leader block. Replace the signature line (line 85) and add the block after the "By competency" block (after line 109, the `aoa.push([]);` that follows the competency loop):

```js
function summaryAoa(AGG, engineers, CUR, chosenIds, includeUnassigned, chosenLeaders, includeNoLeader) {
```

Insert after the existing `aoa.push([]);` that closes the "By competency" section (before `aoa.push(["By current level", "Count"]);`):

```js
  aoa.push(["By unit leader", "Count"]);
  for (const u of [...chosenLeaders].sort((a, b) => leaderLabelFor(AGG, a).localeCompare(leaderLabelFor(AGG, b)))) {
    aoa.push([leaderLabelFor(AGG, u), engineers.filter((e) => e.unit_leader === u).length]);
  }
  if (includeNoLeader) {
    aoa.push(["Unassigned", engineers.filter((e) => !e.unit_leader).length]);
  }
  aoa.push([]);
```

- [ ] **Step 6: Update `downloadXlsx` (signature, summary call, column widths)**

In `public/export.js`, replace `downloadXlsx` (lines 118-131) with:

```js
async function downloadXlsx(AGG, engineers, rows, CUR, chosenIds, includeUnassigned, chosenLeaders, includeNoLeader) {
  const XLSX = await loadSheetJs();
  const wb = XLSX.utils.book_new();

  const summary = XLSX.utils.aoa_to_sheet(summaryAoa(AGG, engineers, CUR, chosenIds, includeUnassigned, chosenLeaders, includeNoLeader));
  summary["!cols"] = [{ wch: 24 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, summary, "Summary");

  const people = XLSX.utils.json_to_sheet(rows);
  people["!cols"] = [{ wch: 24 }, { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 13 }, { wch: 12 }, { wch: 13 }];
  XLSX.utils.book_append_sheet(wb, people, "Engineers");

  XLSX.writeFile(wb, "ae-progress-" + fileDate() + ".xlsx");
}
```

- [ ] **Step 7: Add the "Unit leaders to include" checkbox section to the modal**

In `public/export.js` `openExportDialog`, build the leader list at the top (after `const comps = CUR.competencies || [];`, ~line 136):

```js
  const leaders = leaderList(AGG);
```

Then insert a new section in the modal's `.export-body`, right after the competency `.export-checks` block and its `#export-count` — i.e. insert this markup after the competencies `</div>` that closes `.export-checks` and before `<div class="export-count" id="export-count"></div>`:

```js
        <div class="export-section-label">Unit leaders to include</div>
        <div class="export-checks" id="export-leader-checks">
          <label class="export-check"><input type="checkbox" data-all-leaders> <span>Select all</span></label>
          ${leaders.map((u) => `<label class="export-check"><input type="checkbox" data-leader value="${u}" checked> <span>${leaderLabelFor(AGG, u)}</span></label>`).join("")}
          <label class="export-check"><input type="checkbox" data-leader value="${NO_LEADER}" checked> <span>Unassigned</span></label>
        </div>
```

- [ ] **Step 8: Read the leader selection and wire its controls**

In `public/export.js` `openExportDialog`, the existing `itemBoxes()` selector (`.export-checks input[value]`) would now also match the leader boxes — scope both selectors explicitly. Replace the `itemBoxes`/`allBox` lines (~line 168-169) and add leader equivalents:

```js
  const itemBoxes = () => Array.from(backdrop.querySelectorAll('.export-checks input[value]:not([data-leader])'));
  const leaderBoxes = () => Array.from(backdrop.querySelectorAll('.export-checks input[data-leader]'));
  const allBox = backdrop.querySelector("input[data-all]");
  const allLeadersBox = backdrop.querySelector("input[data-all-leaders]");
  const countEl = backdrop.querySelector("#export-count");
```

Replace `currentSelection` (~line 172-177) to include leaders:

```js
  function currentSelection() {
    const checked = itemBoxes().filter((b) => b.checked).map((b) => b.value);
    const includeUnassigned = checked.includes(UNASSIGNED);
    const chosenIds = new Set(checked.filter((v) => v !== UNASSIGNED));
    const checkedL = leaderBoxes().filter((b) => b.checked).map((b) => b.value);
    const includeNoLeader = checkedL.includes(NO_LEADER);
    const chosenLeaders = new Set(checkedL.filter((v) => v !== NO_LEADER));
    return { chosenIds, includeUnassigned, chosenLeaders, includeNoLeader };
  }
```

Replace `refreshCount` (~line 179-185) to sync both "select all" boxes and count with the full selection:

```js
  function refreshCount() {
    allBox.checked = itemBoxes().every((b) => b.checked);
    allLeadersBox.checked = leaderBoxes().every((b) => b.checked);
    const { chosenIds, includeUnassigned, chosenLeaders, includeNoLeader } = currentSelection();
    const n = selectedEngineers(AGG, chosenIds, includeUnassigned, chosenLeaders, includeNoLeader).length;
    countEl.textContent = n + (n === 1 ? " engineer selected" : " engineers selected");
  }
```

Add the leader "select all" wiring and per-box wiring, right after the existing competency `allBox` / `itemBoxes` wiring (~line 187-191):

```js
  allLeadersBox.addEventListener("change", () => {
    leaderBoxes().forEach((b) => { b.checked = allLeadersBox.checked; });
    refreshCount();
  });
  leaderBoxes().forEach((b) => b.addEventListener("change", refreshCount));
```

- [ ] **Step 9: Update the download handlers**

In `public/export.js`, replace the body of the `.export-dl` click handler (~line 194-214) so it threads the leader selection through:

```js
    btn.addEventListener("click", async () => {
      const { chosenIds, includeUnassigned, chosenLeaders, includeNoLeader } = currentSelection();
      const engineers = selectedEngineers(AGG, chosenIds, includeUnassigned, chosenLeaders, includeNoLeader);
      if (!engineers.length) { countEl.textContent = "No engineers match — widen your selection."; return; }
      const rows = buildRows(AGG, engineers, CUR);
      if (btn.dataset.fmt === "csv") {
        downloadCsv(rows);
      } else {
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Preparing…";
        try {
          await downloadXlsx(AGG, engineers, rows, CUR, chosenIds, includeUnassigned, chosenLeaders, includeNoLeader);
        } catch (e) {
          alert(e.message || "Excel export failed.");
        } finally {
          btn.disabled = false;
          btn.textContent = label;
        }
      }
    });
```

- [ ] **Step 10: Syntax check**

Run: `node --check public/export.js`
Expected: no output (exit 0).

- [ ] **Step 11: Manual verification**

With the dashboard running as admin and a few leaders assigned: click **⬇ Export**. Expected: a new "Unit leaders to include" section lists each leader plus "Unassigned"; unchecking a leader drops their engineers from the count; the CSV and `.xlsx` both include a "Unit leader" column, and the Excel Summary sheet has a "By unit leader" table.

- [ ] **Step 12: Commit**

```bash
git add public/export.js
git commit -m "feat(export): unit-leader dimension (filter, column, summary)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Docs — `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Note the data attribute in the Auth/Data section**

In `CLAUDE.md`, in the "Data flow" section (right after the `src/types.ts:ProgressFile` sentence), add a sentence:

```markdown
Engineers also carry an optional **`unit_leader`** (plus `unit_leader_set_by` / `unit_leader_updated_at` audit fields) — the GitHub username of the manager who tracks them. It is a **data attribute, not a role**: it grants no access and no scoped view; it only powers the dashboard's unit-leader filter and the export's unit-leader grouping. Anyone who needs dashboard access is added to `ADMIN_USERNAMES`.
```

- [ ] **Step 2: Add the Common-operations row**

In `CLAUDE.md`, add a row to the "Common operations" table (near the "Add an admin" row):

```markdown
| Assign a unit leader | As an admin, use the per-row **Unit leader** dropdown on the dashboard (or `POST /api/user/<username>/leader` with `{leader:"<username>"\|null}`). Stored on `progress/<username>.json`; busts the aggregate cache. |
```

- [ ] **Step 3: Bump the cache-version note**

In `CLAUDE.md`, if the aggregate cache version is referenced anywhere, update the mention to note `v7` adds per-engineer `unit_leader`. (Search: `grep -n "aggregate-v" CLAUDE.md` — if no hit, skip this step.)

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document unit-leader attribute, assignment, filter & export

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Step 1: Full worker suite + typecheck**

Run: `cd worker && npm run typecheck && npm test`
Expected: typecheck clean; all tests pass.

- [ ] **Step 2: Frontend syntax**

Run: `node --check public/dashboard.js && node --check public/export.js`
Expected: no output (exit 0) for both.

- [ ] **Step 3: Deploy note**

The aggregate shape changed (cache `v7`) — after merge, `cd worker && npm run deploy` so the dashboard reads the new shape; Pages auto-deploys `public/` on push to `main`. (Deploy is manual and out of scope for this plan's commits.)
