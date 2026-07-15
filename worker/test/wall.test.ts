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

  it("celebrates crossing a task-count milestone in the last 7 days (highest crossed)", async () => {
    const tasks: Record<string, any> = {};
    for (let i = 0; i < 48; i++) tasks[`old.${i}`] = { done: true, at: "2026-06-01T00:00:00Z" };
    for (let i = 0; i < 5; i++) tasks[`new.${i}`] = { done: true, at: "2026-07-14T00:00:00Z" };
    const files = { "m.json": prog("m", tasks) }; // 48 -> 53 total, crosses 50 this week
    const wall = await computeWall(cfg, registryOf({ web: WEB }), mockFetch(files), NOW, CERTS);
    expect(wall.cards.milestones).toContainEqual({ username: "m", display_name: "m", tasks: 50 });
  });

  it("does not celebrate a milestone crossed before the 7-day window", async () => {
    const tasks: Record<string, any> = {};
    for (let i = 0; i < 55; i++) tasks[`old.${i}`] = { done: true, at: "2026-06-01T00:00:00Z" };
    const files = { "m.json": prog("m", tasks) }; // crossed 50 long ago, nothing recent
    const wall = await computeWall(cfg, registryOf({ web: WEB }), mockFetch(files), NOW, CERTS);
    expect(wall.cards.milestones.some((e) => e.username === "m")).toBe(false);
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
      on_a_roll: [], leveled_up: [], cert_ready: [], longest_streak: [], just_started: [], welcome_back: [], milestones: [],
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
