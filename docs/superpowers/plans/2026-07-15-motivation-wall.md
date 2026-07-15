# Motivation Wall + Personal Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Motivate engineers to finish, re-engage, and show up weekly via a public "positives-only" recognition wall, a personal motivation panel on the tracker, and a "Needs a nudge" dashboard tab for unit leaders.

**Architecture:** A new Worker module `wall.ts` reads every engineer's progress file (same plumbing as `aggregate.ts`) and computes six recognition lists — emitting *only* positives, never rankings/completion. A new signed-in (non-admin) endpoint `GET /api/wall` serves it, KV-cached like the aggregate. The wall renders on a new static page; the personal panel is computed client-side in `app.js` from data already fetched; the dashboard gains a third tab built from existing aggregate data.

**Tech Stack:** Cloudflare Workers (TypeScript), `@cloudflare/vitest-pool-workers` for Worker tests, vanilla static HTML/CSS/JS frontend (no build, no framework), GitHub Contents API as storage.

## Global Constraints

- **No schema change** — `ProgressFile` is unchanged; only read-side computations are added.
- **Positives only** — the wall payload has **no field** for completion %, ranking, current level, or inactivity. This is the privacy boundary and is asserted by a test.
- **Disabled engineers excluded** — from every wall card and from the "Needs a nudge" tab (consistent with the aggregate's headline counts).
- **Cap 8 per card**; `longest_streak` has a **2-week floor**.
- **Weekly streak** = consecutive ISO weeks (Mon–Sun, UTC) with ≥1 completed task, counting the current run up to (or one grace-week before) now.
- **Rolling 7-day window** for the "recent" event cards; a timestamp counts if `0 ≤ now − at ≤ 7 days`.
- **Graceful KV degradation** — when `env.AGGREGATE_CACHE` is undefined, recompute per request (local dev needs no KV).
- **Worker functions take an injected `fetchFn: typeof fetch = fetch`** (test seam) and a `now: Date = new Date()` where time matters — preserve these.
- **Adding the endpoint requires `wrangler deploy`** (manual, not in CI); frontend deploys via Pages on push.
- Frontend has **no automated test harness** — frontend tasks are verified manually against `wrangler dev` + the dev data repo (`ae-tracker-data-dev`).

---

### Task 1: `computeWall` — the six recognition cards (pure computation)

**Files:**
- Create: `worker/src/wall.ts`
- Test: `worker/test/wall.test.ts`

**Interfaces:**
- Consumes: `listDirectory`, `readJsonFile`, `RepoConfig` from `./github`; `ProgressFile` from `./types`; `ResolvedCurriculum` from `./curriculum`.
- Produces (relied on by Task 2 and the frontend):
  - `weekIndex(d: Date): number` — Monday-aligned UTC week index; consecutive weeks differ by exactly 1.
  - `currentStreak(weeks: Set<number>, now: Date): number` — length of the current consecutive-week run.
  - `interface Wall` with `{ as_of: string; cards: { on_a_roll, leveled_up, cert_ready, longest_streak, just_started, welcome_back } }` (entry shapes below).
  - `computeWall(cfg: RepoConfig, registry: CurriculumRegistry, fetchFn?: typeof fetch, now?: Date, certRegistry?: CertRegistry): Promise<Wall>`.

- [ ] **Step 1: Write the failing test file**

Create `worker/test/wall.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeWall, weekIndex, currentStreak } from "../src/wall";
import type { ResolvedCurriculum } from "../src/curriculum";

const cfg = { owner: "x", repo: "y", token: "t" };
const NOW = new Date("2026-07-15T12:00:00Z"); // a Wednesday

// Fake curriculum registry (mirrors ./curriculum's pathFor).
function registryOf(paths: Record<string, ResolvedCurriculum>) {
  return { pathFor: (id?: string) => (id && paths[id]) || null };
}
const WEB: ResolvedCurriculum = {
  levels: [
    { id: "L1", tasks: [{ id: "web-L1.T1" }, { id: "web-L1.T2" }] },
    { id: "L2", tasks: [{ id: "web-L2.T1" }] },
  ],
};
const CERTS = {
  certList: () => [{
    id: "claude-code", label: "Claude Code",
    itemIds: ["cc.a.1", "cc.a.2"], requiredItemIds: ["cc.a.1", "cc.a.2"],
  }],
};

// Build a progress file with sensible defaults.
function prog(username: string, tasks: Record<string, { done: boolean; at?: string }>, extra: any = {}) {
  return {
    github_username: username, display_name: username,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    competency: "web", tasks, ...extra,
  };
}

// Fake GitHub fetch serving a progress/ listing + each file, from a name->file map.
function mockFetch(files: Record<string, any>): typeof fetch {
  return (async (url: string) => {
    if (url.endsWith("/contents/progress")) {
      return new Response(JSON.stringify(
        Object.keys(files).map((name) => ({ name, type: "file", path: `progress/${name}` })),
      ), { headers: { "content-type": "application/json" } });
    }
    const name = url.split("/").pop()!;
    return new Response(JSON.stringify({ sha: "s", content: btoa(JSON.stringify(files[name])), encoding: "base64" }),
      { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

describe("week helpers", () => {
  it("buckets Monday-aligned weeks so consecutive weeks differ by 1", () => {
    const a = weekIndex(new Date("2026-07-15T12:00:00Z")); // Wed
    const b = weekIndex(new Date("2026-07-13T00:00:00Z")); // Mon of same week
    const c = weekIndex(new Date("2026-07-08T12:00:00Z")); // prior week
    expect(a).toBe(b);
    expect(a - c).toBe(1);
  });

  it("currentStreak counts the run ending at the current or grace week", () => {
    const cw = weekIndex(NOW);
    expect(currentStreak(new Set([cw, cw - 1, cw - 2]), NOW)).toBe(3);
    expect(currentStreak(new Set([cw - 1, cw - 2]), NOW)).toBe(2);   // at-risk still counts
    expect(currentStreak(new Set([cw - 2, cw - 3]), NOW)).toBe(0);   // gap since 2 weeks ago
    expect(currentStreak(new Set(), NOW)).toBe(0);
  });
});

describe("computeWall", () => {
  it("ranks on_a_roll by recent count and caps at 8", async () => {
    const files: Record<string, any> = {};
    // 9 engineers each with N recent tasks (N = 1..9) → cap keeps top 8.
    for (let n = 1; n <= 9; n++) {
      const tasks: Record<string, any> = {};
      for (let i = 0; i < n; i++) tasks[`web-L1.T${i}`] = { done: true, at: "2026-07-14T00:00:00Z" };
      files[`u${n}.json`] = prog(`u${n}`, tasks);
    }
    const wall = await computeWall(cfg, registryOf({ web: WEB }), mockFetch(files), NOW, CERTS);
    expect(wall.cards.on_a_roll).toHaveLength(8);
    expect(wall.cards.on_a_roll[0]).toEqual({ username: "u9", display_name: "u9", count: 9 });
  });

  it("celebrates a recent level-up (all tasks of a level done within 7d)", async () => {
    const files = {
      "leveler.json": prog("leveler", {
        "web-L1.T1": { done: true, at: "2026-07-10T00:00:00Z" },
        "web-L1.T2": { done: true, at: "2026-07-11T00:00:00Z" },
      }),
    };
    const wall = await computeWall(cfg, registryOf({ web: WEB }), mockFetch(files), NOW, CERTS);
    expect(wall.cards.leveled_up).toContainEqual({ username: "leveler", display_name: "leveler", level: "L1" });
  });

  it("celebrates becoming cert-ready within 7d", async () => {
    const files = {
      "cr.json": prog("cr", {
        "cc.a.1": { done: true, at: "2026-07-12T00:00:00Z" },
        "cc.a.2": { done: true, at: "2026-07-13T00:00:00Z" },
      }),
    };
    const wall = await computeWall(cfg, registryOf({ web: WEB }), mockFetch(files), NOW, CERTS);
    expect(wall.cards.cert_ready).toContainEqual(
      { username: "cr", display_name: "cr", cert_id: "claude-code", cert_label: "Claude Code" });
  });

  it("ranks longest_streak and excludes streaks under 2 weeks", async () => {
    const files = {
      // 5 consecutive weeks incl. this one → streak 5
      "streaker.json": prog("streaker", {
        "web-L1.T1": { done: true, at: "2026-07-15T00:00:00Z" },
        "web-L1.T2": { done: true, at: "2026-07-08T00:00:00Z" },
        "web-L2.T1": { done: true, at: "2026-07-01T00:00:00Z" },
        "x.4": { done: true, at: "2026-06-24T00:00:00Z" },
        "x.5": { done: true, at: "2026-06-17T00:00:00Z" },
      }),
      // only this week → streak 1, below the floor
      "solo.json": prog("solo", { "web-L1.T1": { done: true, at: "2026-07-14T00:00:00Z" } }),
    };
    const wall = await computeWall(cfg, registryOf({ web: WEB }), mockFetch(files), NOW, CERTS);
    expect(wall.cards.longest_streak).toContainEqual({ username: "streaker", display_name: "streaker", weeks: 5 });
    expect(wall.cards.longest_streak.some((e) => e.username === "solo")).toBe(false);
  });

  it("distinguishes just_started (no prior activity) from welcome_back (>=14d gap)", async () => {
    const files = {
      "newbie.json": prog("newbie", { "web-L1.T1": { done: true, at: "2026-07-14T00:00:00Z" } }),
      "returner.json": prog("returner", {
        "web-L1.T1": { done: true, at: "2026-06-01T00:00:00Z" },
        "web-L1.T2": { done: true, at: "2026-07-13T00:00:00Z" },
      }),
    };
    const wall = await computeWall(cfg, registryOf({ web: WEB }), mockFetch(files), NOW, CERTS);
    expect(wall.cards.just_started.some((e) => e.username === "newbie")).toBe(true);
    expect(wall.cards.just_started.some((e) => e.username === "returner")).toBe(false);
    expect(wall.cards.welcome_back).toContainEqual(
      { username: "returner", display_name: "returner", weeks_away: 6 });
    expect(wall.cards.welcome_back.some((e) => e.username === "newbie")).toBe(false);
  });

  it("excludes disabled engineers from every card", async () => {
    const files = {
      "ghost.json": prog("ghost", { "web-L1.T1": { done: true, at: "2026-07-14T00:00:00Z" } }, { disabled: true }),
    };
    const wall = await computeWall(cfg, registryOf({ web: WEB }), mockFetch(files), NOW, CERTS);
    const all = Object.values(wall.cards).flat();
    expect(all.some((e: any) => e.username === "ghost")).toBe(false);
  });

  it("ignores tasks with no `at` timestamp without crashing", async () => {
    const files = {
      "noat.json": prog("noat", { "web-L1.T1": { done: true }, "web-L1.T2": { done: true } }),
    };
    const wall = await computeWall(cfg, registryOf({ web: WEB }), mockFetch(files), NOW, CERTS);
    const all = Object.values(wall.cards).flat();
    expect(all.some((e: any) => e.username === "noat")).toBe(false);
  });

  it("returns all-empty cards for an empty progress dir", async () => {
    const wall = await computeWall(cfg, registryOf({ web: WEB }), mockFetch({}), NOW, CERTS);
    expect(wall.cards).toEqual({
      on_a_roll: [], leveled_up: [], cert_ready: [], longest_streak: [], just_started: [], welcome_back: [],
    });
  });

  it("never leaks completion, ranking, or inactivity fields (privacy boundary)", async () => {
    const files = {
      "u.json": prog("u", { "web-L1.T1": { done: true, at: "2026-07-14T00:00:00Z" } }),
    };
    const wall = await computeWall(cfg, registryOf({ web: WEB }), mockFetch(files), NOW, CERTS);
    const body = JSON.stringify(wall);
    for (const forbidden of ["completion", "pct", "current_level", "stalled", "last_active", "disabled"]) {
      expect(body).not.toContain(forbidden);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd worker && npx vitest run test/wall.test.ts`
Expected: FAIL — `Failed to resolve import "../src/wall"` (module doesn't exist yet).

- [ ] **Step 3: Implement `worker/src/wall.ts` (compute only — the handler comes in Task 2)**

```ts
import { listDirectory, readJsonFile, type RepoConfig } from "./github";
import type { ProgressFile } from "./types";
import type { ResolvedCurriculum } from "./curriculum";

// Structural registries (the ./curriculum and ./certifications modules satisfy these;
// tests pass fakes) — mirrors aggregate.ts.
interface CurriculumRegistry {
  pathFor(competencyId?: string): ResolvedCurriculum | null;
}
interface CertRegistry {
  certList(): Array<{ id: string; label: string; itemIds: string[]; requiredItemIds: string[] }>;
}
const EMPTY_CERT_REGISTRY: CertRegistry = { certList: () => [] };

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export interface Wall {
  as_of: string;
  cards: {
    on_a_roll: Array<{ username: string; display_name?: string; count: number }>;
    leveled_up: Array<{ username: string; display_name?: string; level: string }>;
    cert_ready: Array<{ username: string; display_name?: string; cert_id: string; cert_label: string }>;
    longest_streak: Array<{ username: string; display_name?: string; weeks: number }>;
    just_started: Array<{ username: string; display_name?: string }>;
    welcome_back: Array<{ username: string; display_name?: string; weeks_away: number }>;
  };
}

// Monday-aligned week index (UTC). Consecutive calendar weeks differ by exactly 1.
// 1970-01-01 (epoch day 0) was a Thursday, so +3 shifts the boundary to Monday.
export function weekIndex(d: Date): number {
  const days = Math.floor(d.getTime() / DAY_MS);
  return Math.floor((days + 3) / 7);
}

// Length of the current consecutive-weeks run: anchored at the current week, or one
// grace week before (streak alive but not yet extended this week). 0 if neither is active.
export function currentStreak(weeks: Set<number>, now: Date): number {
  const cw = weekIndex(now);
  let anchor: number;
  if (weeks.has(cw)) anchor = cw;
  else if (weeks.has(cw - 1)) anchor = cw - 1;
  else return 0;
  let n = 0;
  for (let w = anchor; weeks.has(w); w--) n++;
  return n;
}

// Ascending completion timestamps (ms) for a progress file; tasks without a valid `at`
// are dropped (never crash).
function doneTimestamps(p: ProgressFile): number[] {
  return Object.values(p.tasks)
    .filter((t) => t.done && t.at)
    .map((t) => Date.parse(t.at as string))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
}

export async function computeWall(
  cfg: RepoConfig,
  registry: CurriculumRegistry,
  fetchFn: typeof fetch = fetch,
  now: Date = new Date(),
  certRegistry: CertRegistry = EMPTY_CERT_REGISTRY,
): Promise<Wall> {
  const entries = await listDirectory(cfg, "progress", fetchFn);
  const progresses: ProgressFile[] = [];
  for (const e of entries) {
    const r = await readJsonFile<ProgressFile>(cfg, e.path, fetchFn);
    if (r) progresses.push(r.data);
  }

  const nowMs = now.getTime();
  const within7d = (t: number) => t <= nowMs && nowMs - t <= WEEK_MS;
  const certDefs = certRegistry.certList();

  const onARoll: Wall["cards"]["on_a_roll"] = [];
  const leveledUp: Array<{ username: string; display_name?: string; level: string; _t: number }> = [];
  const certReady: Array<{ username: string; display_name?: string; cert_id: string; cert_label: string; _t: number }> = [];
  const longestStreak: Wall["cards"]["longest_streak"] = [];
  const justStarted: Array<{ username: string; display_name?: string; _t: number }> = [];
  const welcomeBack: Array<{ username: string; display_name?: string; weeks_away: number; _t: number }> = [];

  for (const p of progresses) {
    if (p.disabled) continue;
    const username = p.github_username;
    const display_name = p.display_name;
    const ts = doneTimestamps(p);
    if (ts.length === 0) continue;

    // on_a_roll — tasks completed in the last 7 days
    const recentCount = ts.filter(within7d).length;
    if (recentCount > 0) onARoll.push({ username, display_name, count: recentCount });

    // leveled_up — a whole level finished within 7 days (dated by its last task)
    const path = registry.pathFor(p.competency);
    if (path) {
      for (const lvl of path.levels) {
        const ids = lvl.tasks.map((t) => t.id);
        if (ids.length === 0 || !ids.every((id) => p.tasks[id]?.done)) continue;
        const times = ids.map((id) => Date.parse(p.tasks[id]?.at ?? ""));
        if (times.some((n) => Number.isNaN(n))) continue;
        const completedAt = Math.max(...times);
        if (within7d(completedAt)) leveledUp.push({ username, display_name, level: lvl.id, _t: completedAt });
      }
    }

    // cert_ready — all required items of a cert done within 7 days
    for (const c of certDefs) {
      const req = c.requiredItemIds;
      if (req.length === 0 || !req.every((id) => p.tasks[id]?.done)) continue;
      const times = req.map((id) => Date.parse(p.tasks[id]?.at ?? ""));
      if (times.some((n) => Number.isNaN(n))) continue;
      const readyAt = Math.max(...times);
      if (within7d(readyAt)) certReady.push({ username, display_name, cert_id: c.id, cert_label: c.label, _t: readyAt });
    }

    // longest_streak — current consecutive-weeks run (>= 2)
    const weeks = new Set(ts.map((t) => weekIndex(new Date(t))));
    const streak = currentStreak(weeks, now);
    if (streak >= 2) longestStreak.push({ username, display_name, weeks: streak });

    // just_started — first-ever activity within the last 7 days
    if (within7d(ts[0])) justStarted.push({ username, display_name, _t: ts[0] });

    // welcome_back — activity in the last 7 days after a >= 14-day gap
    const recent = ts.filter(within7d);
    if (recent.length > 0) {
      const recentStart = recent[0];
      let prior: number | undefined;
      for (const t of ts) { if (t < recentStart) prior = t; else break; }
      if (prior !== undefined && recentStart - prior >= 2 * WEEK_MS) {
        welcomeBack.push({ username, display_name, weeks_away: Math.floor((recentStart - prior) / WEEK_MS), _t: recentStart });
      }
    }
  }

  const CAP = 8;
  const strip = <T extends { _t: number }>(arr: T[]) =>
    arr.sort((a, b) => b._t - a._t).slice(0, CAP).map(({ _t, ...rest }) => rest);

  return {
    as_of: now.toISOString(),
    cards: {
      on_a_roll: onARoll.sort((a, b) => b.count - a.count).slice(0, CAP),
      leveled_up: strip(leveledUp),
      cert_ready: strip(certReady),
      longest_streak: longestStreak.sort((a, b) => b.weeks - a.weeks).slice(0, CAP),
      just_started: strip(justStarted),
      welcome_back: strip(welcomeBack),
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd worker && npx vitest run test/wall.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Typecheck**

Run: `cd worker && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add worker/src/wall.ts worker/test/wall.test.ts
git commit -m "feat(worker): computeWall — six positives-only recognition cards"
```

---

### Task 2: `GET /api/wall` endpoint (auth gate + KV cache + route)

**Files:**
- Modify: `worker/src/wall.ts` (append the handler + cache constants)
- Modify: `worker/src/index.ts:2-5` (import) and near `:62-65` (route)
- Test: `worker/test/wall.test.ts` (append a handler describe block)

**Interfaces:**
- Consumes: `computeWall` (Task 1); `verifySession`, `tokenFromRequest` from `./session`; `Env` from `./index`.
- Produces: `handleApiWall(request, env, registry, fetchFn?, certRegistry?): Promise<Response>`; `WALL_CACHE_KEY = "wall-v1"`.

- [ ] **Step 1: Write the failing handler tests**

Append to `worker/test/wall.test.ts`:

```ts
import { handleApiWall, WALL_CACHE_KEY } from "../src/wall";
import { signSession } from "../src/session";

describe("handleApiWall", () => {
  const baseEnv = {
    SESSION_SECRET: "test-secret-32-bytes-long-padding-ok",
    DATA_REPO_OWNER: "x", DATA_REPO_NAME: "y", BOT_PAT: "t",
  } as any;
  const registry = registryOf({});

  it("uses the wall-v1 cache key", () => {
    expect(WALL_CACHE_KEY).toBe("wall-v1");
  });

  it("returns 401 without a session", async () => {
    const req = new Request("https://w.example/api/wall");
    const res = await handleApiWall(req, baseEnv, registry, globalThis.fetch, CERTS);
    expect(res.status).toBe(401);
  });

  it("returns 200 for any signed-in user (not admin-gated)", async () => {
    const session = await signSession("rando", baseEnv.SESSION_SECRET, 3600);
    const fetchMock = (async (url: string) => {
      if (url.endsWith("/contents/progress")) return new Response("[]", { headers: { "content-type": "application/json" } });
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/wall", { headers: { Cookie: `session=${session}` } });
    const res = await handleApiWall(req, baseEnv, registry, fetchMock, CERTS);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.cards.on_a_roll).toEqual([]);
  });

  it("serves the cached body without recomputing", async () => {
    const store = new Map<string, string>();
    store.set("wall-v1", JSON.stringify({ as_of: "cached", cards: { on_a_roll: [{ username: "z" }] } }));
    const kv = { get: async (k: string) => store.get(k) ?? null, put: async () => {} } as any;
    const env = { ...baseEnv, AGGREGATE_CACHE: kv };
    const session = await signSession("rando", env.SESSION_SECRET, 3600);
    const throwFetch = (async () => { throw new Error("should not fetch when cached"); }) as typeof fetch;
    const req = new Request("https://w.example/api/wall", { headers: { Cookie: `session=${session}` } });
    const res = await handleApiWall(req, env, registry, throwFetch, CERTS);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.as_of).toBe("cached");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd worker && npx vitest run test/wall.test.ts -t handleApiWall`
Expected: FAIL — `handleApiWall`/`WALL_CACHE_KEY` are not exported.

- [ ] **Step 3: Append the handler to `worker/src/wall.ts`**

Add these imports at the top of `worker/src/wall.ts`:

```ts
import type { Env } from "./index";
import { verifySession, tokenFromRequest } from "./session";
```

Append at the end of the file:

```ts
export const WALL_CACHE_KEY = "wall-v1";
const WALL_CACHE_TTL_SECONDS = 300;

// The wall is for any signed-in engineer (NOT admin-gated). The payload is identical
// for every viewer, so the cached body is returned verbatim (unlike the aggregate,
// which stamps a per-viewer is_superadmin). Degrades gracefully without KV.
export async function handleApiWall(
  request: Request,
  env: Env,
  registry: CurriculumRegistry,
  fetchFn: typeof fetch = fetch,
  certRegistry: CertRegistry = EMPTY_CERT_REGISTRY,
): Promise<Response> {
  const token = tokenFromRequest(request);
  if (!token) return new Response("unauthenticated", { status: 401 });
  const session = await verifySession(token, env.SESSION_SECRET);
  if (!session.valid || !session.username) return new Response("unauthenticated", { status: 401 });

  if (env.AGGREGATE_CACHE) {
    const cached = await env.AGGREGATE_CACHE.get(WALL_CACHE_KEY);
    if (cached) return new Response(cached, { headers: { "content-type": "application/json" } });
  }
  const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  const wall = await computeWall(cfg, registry, fetchFn, new Date(), certRegistry);
  const body = JSON.stringify(wall);
  if (env.AGGREGATE_CACHE) {
    await env.AGGREGATE_CACHE.put(WALL_CACHE_KEY, body, { expirationTtl: WALL_CACHE_TTL_SECONDS });
  }
  return new Response(body, { headers: { "content-type": "application/json" } });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd worker && npx vitest run test/wall.test.ts`
Expected: PASS (all — compute + handler).

- [ ] **Step 5: Wire the route in `worker/src/index.ts`**

Add `handleApiWall` to the `./api`-adjacent imports. Change line 3:

```ts
import { handleApiAggregate } from "./aggregate";
import { handleApiWall } from "./wall";
```

Add the route immediately after the `/api/aggregate` block (after line 65):

```ts
    if (url.pathname === "/api/wall") return withCors(
      await handleApiWall(request, env, curriculum, fetch, certifications),
      env, request,
    );
```

- [ ] **Step 6: Typecheck + full test run**

Run: `cd worker && npm run typecheck && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Manually verify the live route**

Run the Worker in one terminal: `cd worker && npm run dev`.
Serve the frontend in another: `npx http-server public -p 8080 -c-1`.
Open `http://localhost:8080/tracker.html`, sign in, then in the browser DevTools console run:

```js
apiFetch(window.WORKER_URL + "/api/wall").then((r) => r.json()).then(console.log)
```

Expected: an object with `as_of` and a `cards` object holding the six keys (`on_a_roll`, `leveled_up`, `cert_ready`, `longest_streak`, `just_started`, `welcome_back`). A logged-out request (no token) returns 401.

- [ ] **Step 8: Commit**

```bash
git add worker/src/wall.ts worker/src/index.ts worker/test/wall.test.ts
git commit -m "feat(worker): GET /api/wall endpoint (signed-in, KV-cached)"
```

---

### Task 3: Recognition wall page (`wall.html` + `wall.js` + `wall.css`) and tracker nav link

**Files:**
- Create: `public/wall.html`, `public/wall.js`, `public/wall.css`
- Modify: `public/app.js:379-384` (add a "🏆 Wall" nav link to the tracker topbar)

**Interfaces:**
- Consumes: `GET /api/wall` (Task 2); `apiFetch`, `hidePageLoader`, `showPageError`, `clearAuthToken` from `auth.js`.
- Produces: a browsable page at `wall.html`; no exports consumed elsewhere.

- [ ] **Step 1: Create `public/wall.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AE Tracker — Wall of recognition</title>
  <link rel="stylesheet" href="styles.css">
  <link rel="stylesheet" href="wall.css">
</head>
<body>
  <div class="topbar">
    <div class="brand"><img class="brand-logo" src="assets/solvd-logo.svg" alt="Solvd"> AE Tracker <span class="tag">WALL</span></div>
    <div class="user"><span id="who"></span></div>
  </div>

  <div id="page-loader" class="page-loader">
    <div class="spinner"></div>
    <p>Loading…</p>
  </div>

  <div id="wall" class="container hidden">
    <div class="page-head">
      <div><h1>Wall of recognition</h1><div class="sub">This week's wins across the AE pilot 🎉</div></div>
      <div class="as-of" id="wall-asof"></div>
    </div>
    <div class="wall-grid" id="wall-grid"></div>
  </div>

  <script>
    window.WORKER_URL = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)
      ? "http://localhost:8787"
      : "https://ae-tracker.mihael-melnyk.workers.dev";
  </script>
  <script src="auth.js"></script>
  <script src="wall.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `public/wall.js`**

```js
const WORKER = window.WORKER_URL;

async function loadWall() {
  const res = await apiFetch(WORKER + "/api/wall");
  if (res.status === 401) { window.location = "tracker.html"; return null; }
  if (!res.ok) throw new Error("wall failed: " + res.status);
  return res.json();
}

function who(entry) {
  const avatar = `<img class="wall-avatar" src="https://github.com/${encodeURIComponent(entry.username)}.png" alt="" loading="lazy">`;
  return `${avatar}<span class="wall-name">${entry.display_name || entry.username}</span>`;
}

// Card definitions: order, icon, title, per-entry line, and a warm empty state.
const CARDS = [
  { key: "on_a_roll", icon: "🔥", title: "On a roll",
    empty: "No bursts of activity yet this week — be the first 👀",
    line: (e) => `${e.count} task${e.count === 1 ? "" : "s"} this week` },
  { key: "leveled_up", icon: "📈", title: "Leveled up",
    empty: "No level-ups this week — yours could be next.",
    line: (e) => `reached ${e.level}` },
  { key: "cert_ready", icon: "🎓", title: "Cert-ready",
    empty: "No new cert-ready engineers this week.",
    line: (e) => `ready for ${e.cert_label}` },
  { key: "longest_streak", icon: "⚡", title: "Longest streaks",
    empty: "No multi-week streaks yet — start one this week.",
    line: (e) => `${e.weeks}-week streak` },
  { key: "just_started", icon: "👋", title: "Just started",
    empty: "No new starters this week.",
    line: () => "just started" },
  { key: "welcome_back", icon: "🙌", title: "Welcome back",
    empty: "Nobody's returned this week — yet.",
    line: (e) => `back after ${e.weeks_away} week${e.weeks_away === 1 ? "" : "s"}` },
];

function renderWall(wall) {
  const grid = document.getElementById("wall-grid");
  grid.innerHTML = CARDS.map((c) => {
    const list = wall.cards[c.key] || [];
    const body = list.length
      ? list.map((e) => `<li class="wall-entry">${who(e)}<span class="wall-line">${c.line(e)}</span></li>`).join("")
      : `<li class="wall-empty">${c.empty}</li>`;
    return `<section class="wall-card">
      <h2 class="wall-card-title"><span class="wall-icon">${c.icon}</span>${c.title}</h2>
      <ul class="wall-list">${body}</ul>
    </section>`;
  }).join("");
}

async function init() {
  const wall = await loadWall();
  hidePageLoader();
  if (!wall) return;
  document.getElementById("wall").classList.remove("hidden");
  document.getElementById("wall-asof").textContent = "As of " + new Date(wall.as_of).toLocaleString();
  document.getElementById("who").innerHTML =
    `<a class="dashboard-link" href="tracker.html">My tracker</a>
     <a class="signout-link" href="${WORKER}/auth/logout" onclick="clearAuthToken()">Sign out</a>`;
  renderWall(wall);
}

init().catch((e) => showPageError(e, () => init()));
```

- [ ] **Step 3: Create `public/wall.css`**

```css
/* Recognition wall — responsive card grid. Reuses styles.css topbar/container. */
.page-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; gap: 16px; flex-wrap: wrap; }
.page-head h1 { font-size: 22px; }
.page-head .sub { color: #64748b; font-size: 14px; }
.page-head .as-of { color: #94a3b8; font-size: 12px; white-space: nowrap; }

.wall-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }

.wall-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 18px; }
.wall-card-title { font-size: 15px; display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.wall-icon { font-size: 18px; }

.wall-list { list-style: none; display: flex; flex-direction: column; gap: 10px; }
.wall-entry { display: flex; align-items: center; gap: 10px; }
.wall-avatar { width: 28px; height: 28px; border-radius: 50%; background: #e2e8f0; flex: none; }
.wall-name { font-weight: 600; font-size: 14px; }
.wall-line { color: #64748b; font-size: 13px; margin-left: auto; text-align: right; }
.wall-empty { color: #94a3b8; font-size: 13px; font-style: italic; }
```

- [ ] **Step 4: Add the tracker nav link**

In `public/app.js`, inside `init()`, the `userBox.innerHTML` block (currently lines ~379-384) — add the Wall link before the Certifications link:

```js
  userBox.innerHTML = `
    <span class="user-name">${PROGRESS.display_name || PROGRESS.github_username}</span>
    <a class="dashboard-link" href="wall.html">🏆 Wall</a>
    <a class="dashboard-link" href="cert.html">🎓 Certifications</a>
    ${dashboardLink}
    <a class="signout-link" href="${WORKER}/auth/logout" onclick="clearAuthToken()">Sign out</a>
  `;
```

- [ ] **Step 5: Manually verify**

Serve the frontend (`npx http-server public -p 8080 -c-1`) with `cd worker && npm run dev` running. Sign in, click **🏆 Wall** in the topbar. Expected: the wall page loads, six cards render, empty cards show their warm message, and avatars load from GitHub. Resize the window narrow → cards reflow to one column with no horizontal page scroll.

- [ ] **Step 6: Commit**

```bash
git add public/wall.html public/wall.js public/wall.css public/app.js
git commit -m "feat(web): recognition wall page + tracker nav link"
```

---

### Task 4: Personal motivation panel on the tracker (`app.js` + `tracker.html` + panel CSS)

**Files:**
- Modify: `public/tracker.html:43-44` (add the panel container)
- Modify: `public/app.js` (add helpers `weekIndexJs`, `motivationStats`, `renderMotivation`; a global `ON_WALL`; fetch the wall in `init()`; call `renderMotivation()` from `renderPath()` and after a successful toggle)
- Modify: `public/styles.css` (append `.motiv` styles)

**Interfaces:**
- Consumes: `PROGRESS`, `CURRICULUM`, `computeCurrentLevel()`, `READONLY` (existing globals in `app.js`); `GET /api/wall`.
- Produces: no exports; renders into `#motivation-panel`.

- [ ] **Step 1: Add the panel container to `tracker.html`**

In `public/tracker.html`, inside `#signed-in`, insert the panel between the greeting `</div>` and the competency picker (after line 42, before line 44):

```html
    <div id="motivation-panel" class="motiv hidden"></div>

    <div class="competency-picker" id="competency-picker"></div>
```

- [ ] **Step 2: Add the motivation helpers to `app.js`**

Near the top of `public/app.js`, after the global declarations (after line 8), add:

```js
let ON_WALL = false;        // does this engineer appear on any wall card this week?
const DAY_MS = 86400000, WEEK_MS = 7 * DAY_MS;

// Monday-aligned UTC week index — mirrors worker/src/wall.ts:weekIndex.
function weekIndexJs(ms) { return Math.floor((Math.floor(ms / DAY_MS) + 3) / 7); }

// Current consecutive-weeks streak + whether it's at risk (alive but not extended
// this week yet). Computed from the engineer's own completed-task timestamps.
function motivationStats() {
  const ts = Object.values(PROGRESS.tasks)
    .filter((t) => t.done && t.at)
    .map((t) => new Date(t.at).getTime())
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);
  const weeks = new Set(ts.map(weekIndexJs));
  const cw = weekIndexJs(Date.now());
  let anchor = weeks.has(cw) ? cw : (weeks.has(cw - 1) ? cw - 1 : null);
  let streak = 0;
  if (anchor !== null) { for (let w = anchor; weeks.has(w); w--) streak++; }
  return { streak, atRisk: anchor === cw - 1, ts };
}

// Title for a task id from the loaded path (null if not found).
function taskTitleById(id) {
  for (const lvl of (CURRICULUM ? CURRICULUM.levels : [])) {
    const t = lvl.tasks.find((x) => x.id === id);
    if (t) return t.title;
  }
  return null;
}

// Render the personal panel: streak, next milestone (nearest level), recent wins,
// and an "on the wall" badge. Hidden for read-only viewers or before a path loads.
function renderMotivation() {
  const box = document.getElementById("motivation-panel");
  if (READONLY || !CURRICULUM) { box.classList.add("hidden"); return; }

  const { streak, atRisk } = motivationStats();
  const streakLine = streak === 0
    ? "Start a streak — finish a task this week."
    : atRisk
      ? `${streak}-week streak — tick one task this week to keep it 🔥`
      : `${streak}-week streak 🔥`;

  const cur = CURRICULUM.levels.find((l) => l.id === computeCurrentLevel());
  const allDone = CURRICULUM.levels.every((l) => l.tasks.every((t) => PROGRESS.tasks[t.id]?.done));
  const remaining = cur ? cur.tasks.filter((t) => !PROGRESS.tasks[t.id]?.done).length : 0;
  const milestoneLine = allDone
    ? "You've completed every level 🎉"
    : `${remaining} task${remaining === 1 ? "" : "s"} from finishing ${cur.title}`;

  const wins = Object.entries(PROGRESS.tasks)
    .filter(([, v]) => v.done && v.at)
    .sort((a, b) => new Date(b[1].at) - new Date(a[1].at))
    .slice(0, 3)
    .map(([id]) => taskTitleById(id))
    .filter(Boolean);
  const winsLine = wins.length
    ? wins.map((w) => `“${w}”`).join(", ")
    : "No completed tasks yet — your first one starts the momentum.";

  const wallBadge = ON_WALL
    ? `<a class="motiv-wall-badge" href="wall.html">🎉 You're on the wall this week</a>`
    : "";

  box.innerHTML = `
    ${wallBadge}
    <div class="motiv-tiles">
      <div class="motiv-tile"><div class="motiv-icon">🔥</div><div><div class="motiv-label">Your streak</div><div class="motiv-text">${streakLine}</div></div></div>
      <div class="motiv-tile"><div class="motiv-icon">🎯</div><div><div class="motiv-label">Next milestone</div><div class="motiv-text">${milestoneLine}</div></div></div>
      <div class="motiv-tile"><div class="motiv-icon">🏅</div><div><div class="motiv-label">Recent wins</div><div class="motiv-text">${winsLine}</div></div></div>
    </div>`;
  box.classList.remove("hidden");
}
```

- [ ] **Step 3: Fetch the wall membership in `init()`**

In `public/app.js` `init()`, in the `if (!READONLY) { ... }` block (currently ~lines 387-390 where the feedback button is revealed), add a best-effort wall fetch:

```js
  if (!READONLY) {
    document.getElementById("feedback-open").classList.remove("hidden"); // reveal the floating button
    initFeedback();
    // Best-effort: light up the "on the wall" badge if this engineer appears anywhere.
    apiFetch(WORKER + "/api/wall")
      .then((r) => r.ok ? r.json() : null)
      .then((wall) => {
        if (!wall) return;
        const me = PROGRESS.github_username;
        ON_WALL = Object.values(wall.cards).some((list) => list.some((e) => e.username === me));
        renderMotivation();
      })
      .catch(() => {}); // non-fatal — the badge just stays hidden
  }
```

- [ ] **Step 4: Call `renderMotivation()` when the path renders and after a toggle**

In `renderPath()` (ends ~line 318), add `renderMotivation();` as the last line before the function closes:

```js
  renderTotals();
  renderPillBar();
  renderFocusCard();
  renderMotivation();
}
```

In `toggleTask()`, after the successful save updates `PROGRESS` and shows the toast (after `showUndoToast(taskId, newDone);` ~line 243), add:

```js
    PROGRESS = await res.json();
    showUndoToast(taskId, newDone);
    renderMotivation();
```

- [ ] **Step 5: Append `.motiv` styles to `styles.css`**

```css
/* ---- Personal motivation panel (tracker) ---- */
.motiv { margin: 0 4px 16px; }
.motiv-wall-badge {
  display: inline-block; margin-bottom: 10px; padding: 6px 12px; border-radius: 999px;
  background: linear-gradient(135deg, #2563eb, #7c3aed); color: #fff; font-size: 13px;
  font-weight: 600; text-decoration: none;
}
.motiv-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.motiv-tile {
  display: flex; align-items: flex-start; gap: 10px;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px;
}
.motiv-icon { font-size: 20px; line-height: 1.2; }
.motiv-label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #94a3b8; font-weight: 700; }
.motiv-text { font-size: 14px; color: #0f172a; margin-top: 2px; }
```

- [ ] **Step 6: Manually verify**

With `wrangler dev` + the frontend served, sign in as an engineer who has a competency and some completed tasks (use the dev data repo). Expected on the tracker: the panel shows above the competency picker with a streak line, a "N tasks from finishing <level>" milestone, and recent wins. Tick a task → the streak/milestone/wins update live (no reload). Load the tracker with `?as=<someone>` as an admin → the panel is hidden (read-only). If you appear on the wall, the "🎉 You're on the wall" badge shows and links to `wall.html`.

- [ ] **Step 7: Commit**

```bash
git add public/tracker.html public/app.js public/styles.css
git commit -m "feat(web): personal motivation panel (streak, milestone, wins, wall badge)"
```

---

### Task 5: "Needs a nudge" dashboard tab (`dashboard.html` + `dashboard.js` + `dashboard.css`)

**Files:**
- Modify: `public/dashboard.html:33-36` (add the tab button) and after the certs view `:74-91` (add `#view-nudge`)
- Modify: `public/dashboard.js` (generalize `wireTabs()`; add `renderNudge()`; call it in `renderAll()`)
- Modify: `public/dashboard.css` (append `.nudge` styles)

**Interfaces:**
- Consumes: `AGG.engineers` (with `last_active`, `unit_leader`, `disabled`, `current_level`, `competency`), `inLeaderScope`, `leaderName`, `competencyLabel`, `STALL_MS`, `LEADER_UNASSIGNED` (existing in `dashboard.js`).
- Produces: no exports; renders into `#nudge-list`.

- [ ] **Step 1: Add the tab button and view container to `dashboard.html`**

Change the `.dash-tabs` block (lines 33-36) to add a third tab:

```html
    <div class="dash-tabs">
      <button class="dash-tab active" data-view="levels">Level progress</button>
      <button class="dash-tab" data-view="certs">Certifications</button>
      <button class="dash-tab" data-view="nudge">Needs a nudge</button>
    </div>
```

Add a new view container after the `#view-certs` closing `</div>` (after line 91, before the closing `</div>` of `#admin`):

```html
    <div id="view-nudge" class="hidden">
      <div class="card">
        <div class="card-head"><h3>Engineers who've gone quiet</h3></div>
        <div class="card-sub">14+ days since last activity, grouped by unit leader · respects the unit-leader filter</div>
        <div id="nudge-list"></div>
      </div>
    </div>
```

- [ ] **Step 2: Generalize `wireTabs()` in `dashboard.js`**

Replace the existing `wireTabs()` (lines 455-465) with a version that handles all three views:

```js
// Top-level view switch across all dashboard tabs.
function wireTabs() {
  const views = ["levels", "certs", "nudge"];
  document.querySelectorAll(".dash-tab").forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll(".dash-tab").forEach((t) => t.classList.remove("active"));
      el.classList.add("active");
      const view = el.dataset.view;
      for (const v of views) document.getElementById("view-" + v).classList.toggle("hidden", v !== view);
    });
  });
}
```

- [ ] **Step 3: Add `renderNudge()` to `dashboard.js`**

Add near the other render functions (e.g. after `renderTable()`):

```js
// "Needs a nudge": quiet (14+ days) non-disabled engineers, grouped by unit leader,
// scoped by the unit-leader filter. Built entirely from aggregate data — no new fetch.
function renderNudge() {
  const box = document.getElementById("nudge-list");
  const now = Date.now();
  const quiet = AGG.engineers
    .filter((e) => !e.disabled && inLeaderScope(e))
    .filter((e) => now - new Date(e.last_active).getTime() >= STALL_MS)
    .map((e) => ({ e, days: Math.floor((now - new Date(e.last_active).getTime()) / 86400000) }));

  if (!quiet.length) {
    box.innerHTML = `<div class="empty-detail">Everyone's active — nothing to nudge 🎉</div>`;
    return;
  }

  const groups = new Map();
  for (const item of quiet) {
    const key = item.e.unit_leader || LEADER_UNASSIGNED;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === LEADER_UNASSIGNED) return 1;
    if (b === LEADER_UNASSIGNED) return -1;
    return leaderName(a).localeCompare(leaderName(b));
  });

  box.innerHTML = keys.map((key) => {
    const rows = groups.get(key).sort((a, b) => b.days - a.days);
    const heading = key === LEADER_UNASSIGNED ? "Unassigned" : leaderName(key);
    const items = rows.map(({ e, days }) => `
      <div class="nudge-row">
        <div class="who"><div class="avatar">${(e.display_name || e.username).slice(0, 2).toUpperCase()}</div>
          <div><div class="name">${e.display_name || e.username}</div><div class="handle">@${e.username}</div></div></div>
        <span class="level-chip ${e.current_level}">${e.current_level}</span>
        <span class="nudge-comp">${competencyLabel(e.competency)}</span>
        <span class="nudge-away">quiet ${days} day${days === 1 ? "" : "s"}</span>
        <button class="nudge-copy" data-handle="@${e.username}">Copy @handle</button>
      </div>`).join("");
    return `<div class="nudge-group"><h4 class="nudge-leader">${heading} <span class="nudge-count">${rows.length}</span></h4>${items}</div>`;
  }).join("");

  box.querySelectorAll(".nudge-copy").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigator.clipboard?.writeText(btn.dataset.handle);
      const orig = btn.textContent;
      btn.textContent = "Copied ✓";
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });
  });
}
```

- [ ] **Step 4: Call `renderNudge()` from `renderAll()`**

In `renderAll()` (lines 490-497), add `renderNudge();` at the end:

```js
async function renderAll() {
  renderKpis();
  renderBars();
  await renderLevelCompletion();
  renderCertReadiness();
  renderCertTable();
  renderTable();
  renderNudge();
}
```

- [ ] **Step 5: Append `.nudge` styles to `dashboard.css`**

```css
/* ---- "Needs a nudge" tab ---- */
.nudge-group { margin-bottom: 20px; }
.nudge-leader { font-size: 13px; color: #475569; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.nudge-count { background: #e2e8f0; color: #475569; border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 700; }
.nudge-row {
  display: flex; align-items: center; gap: 12px; padding: 8px 0;
  border-bottom: 1px solid #f1f5f9; flex-wrap: wrap;
}
.nudge-comp { color: #64748b; font-size: 13px; }
.nudge-away { color: #b45309; font-size: 13px; font-weight: 600; margin-left: auto; }
.nudge-copy {
  border: 1px solid #cbd5e1; background: #fff; color: #334155; border-radius: 8px;
  padding: 4px 10px; font-size: 12px; font-weight: 600; cursor: pointer;
}
.nudge-copy:hover { background: #f1f5f9; }
```

- [ ] **Step 6: Manually verify**

With `wrangler dev` + the frontend served, sign in as an admin. Click the **Needs a nudge** tab. Expected: engineers with 14+ days of inactivity, grouped under their unit-leader's name (and an "Unassigned" group), each showing level, competency, "quiet N days", and a working "Copy @handle" button. Change the unit-leader filter → the list rescopes. If nobody is quiet, the empty state shows. Confirm disabled engineers never appear.

- [ ] **Step 7: Commit**

```bash
git add public/dashboard.html public/dashboard.js public/dashboard.css
git commit -m "feat(web): 'Needs a nudge' dashboard tab for the human relay"
```

---

## Deployment (after all tasks land)

- `cd worker && npm test && npm run typecheck` — green.
- `cd worker && npm run deploy` — deploys the Worker (required for `/api/wall` to exist in production).
- Push `main` — Pages redeploys the frontend (`wall.html`, `wall.js`, `wall.css`, `tracker.html`, `app.js`, `styles.css`, `dashboard.*`).
- No data migration; no new secrets or vars; no KV namespace change (reuses `AGGREGATE_CACHE`).

## Notes / deliberate simplifications

- **Next-milestone is level-based only.** The spec mentioned "or whichever cert milestone is closer"; computing that would require loading cert data on the tracker page. To honor "keep the client computation small," this plan implements the level milestone only. Flag to the user if the cert milestone is wanted — it's a small follow-up.
- **Streak logic is duplicated** across `worker/src/wall.ts` (TS) and `public/app.js` (JS) because they run in different runtimes with no shared bundle. Both use the identical `Math.floor((floor(ms/DAY)+3)/7)` week index and the same anchor rule; keep them in sync if either changes.
