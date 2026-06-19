import { describe, it, expect } from "vitest";
import { computeAggregate, handleApiAggregate } from "../src/aggregate";
import type { ResolvedCurriculum } from "../src/curriculum";
import { signSession } from "../src/session";

const cfg = { owner: "x", repo: "y", token: "t" };

// A fake registry that resolves a path per competency id (mirrors ./curriculum).
function registryOf(paths: Record<string, ResolvedCurriculum>) {
  return { pathFor: (id?: string) => (id && paths[id]) || null };
}

const WEB: ResolvedCurriculum = {
  levels: [
    { id: "L1", tasks: [{ id: "web-L1.T1" }, { id: "web-L1.T2" }] },
    { id: "L2", tasks: [{ id: "web-L2.T1" }] },
  ],
};

describe("computeAggregate", () => {
  it("computes current level distribution, per-task completion, and stalled count per the engineer's own path", async () => {
    const registry = registryOf({ web: WEB });

    const files: Record<string, any> = {
      "anna.json": {
        github_username: "anna", display_name: "Anna",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-27T00:00:00Z",
        competency: "web",
        tasks: { "web-L1.T1": { done: true, at: "2026-05-27T00:00:00Z" } },
      },
      "ben.json": {
        github_username: "ben", display_name: "Ben",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-04-01T00:00:00Z", // stale > 14d (assume "now" is 2026-05-27)
        competency: "web",
        tasks: { "web-L1.T1": { done: true, at: "2026-04-01T00:00:00Z" },
                 "web-L1.T2": { done: true, at: "2026-04-01T00:00:00Z" } },
      },
    };

    const fetchMock = (async (url: string) => {
      if (url.endsWith("/contents/progress")) {
        return new Response(JSON.stringify([
          { name: "anna.json", type: "file", path: "progress/anna.json" },
          { name: "ben.json", type: "file", path: "progress/ben.json" },
        ]), { headers: { "content-type": "application/json" } });
      }
      const name = url.split("/").pop()!;
      const f = files[name];
      return new Response(JSON.stringify({
        sha: "s", content: btoa(JSON.stringify(f)), encoding: "base64",
      }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const now = new Date("2026-05-27T12:00:00Z");
    const agg = await computeAggregate(cfg, registry, fetchMock, now);

    expect(agg.engineers_started).toBe(2);
    // anna at L1 (one of two L1 tasks done) -> current L1
    // ben completed all L1 tasks -> current L2
    expect(agg.by_current_level).toEqual({ L1: 1, L2: 1 });
    expect(agg.by_task["web-L1.T1"]).toBe(2);
    expect(agg.by_task["web-L1.T2"]).toBe(1);
    expect(agg.by_task["web-L2.T1"]).toBe(0);
    expect(agg.stalled_14d).toBe(1); // ben hasn't updated in >14d
    expect(agg.engineers).toHaveLength(2);
    expect(agg.engineers.find((e) => e.username === "anna")!.competency).toBe("web");
    // anna: 1 of 3 web tasks done
    expect(agg.engineers.find((e) => e.username === "anna")!.completion_pct).toBeCloseTo(1 / 3);
  });

  it("treats an engineer with no competency as L1 / 0% and excludes their ticks from by_task", async () => {
    const registry = registryOf({ web: WEB });
    const files: Record<string, any> = {
      "nora.json": {
        github_username: "nora", created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-27T00:00:00Z",
        // No competency. Even stray ticks (e.g. from a different path) must not count.
        tasks: { "web-L1.T1": { done: true, at: "2026-05-27T00:00:00Z" } },
      },
    };
    const fetchMock = (async (url: string) => {
      if (url.endsWith("/contents/progress")) {
        return new Response(JSON.stringify([{ name: "nora.json", type: "file", path: "progress/nora.json" }]),
          { headers: { "content-type": "application/json" } });
      }
      const name = url.split("/").pop()!;
      return new Response(JSON.stringify({ sha: "s", content: btoa(JSON.stringify(files[name])), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const agg = await computeAggregate(cfg, registry, fetchMock, new Date("2026-05-27T12:00:00Z"));

    expect(agg.engineers_started).toBe(1);
    expect(agg.by_current_level).toEqual({ L1: 1 });
    const nora = agg.engineers.find((e) => e.username === "nora")!;
    expect(nora.competency).toBeUndefined();
    expect(nora.current_level).toBe("L1");
    expect(nora.completion_pct).toBe(0);
    // no path -> no by_task contribution at all
    expect(agg.by_task["web-L1.T1"]).toBeUndefined();
  });

  it("excludes disabled engineers from headline counts but still lists them with a flag", async () => {
    const registry = registryOf({ web: { levels: [{ id: "L1", tasks: [{ id: "web-L1.T1" }] }] } });
    const files: Record<string, any> = {
      "anna.json": {
        github_username: "anna", created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-27T00:00:00Z",
        competency: "web",
        tasks: { "web-L1.T1": { done: true, at: "2026-05-27T00:00:00Z" } },
      },
      "cara.json": {
        github_username: "cara", created_at: "2026-05-01T00:00:00Z", updated_at: "2026-05-27T00:00:00Z",
        competency: "web", disabled: true,
        tasks: { "web-L1.T1": { done: true, at: "2026-05-27T00:00:00Z" } },
      },
    };
    const fetchMock = (async (url: string) => {
      if (url.endsWith("/contents/progress")) {
        return new Response(JSON.stringify([
          { name: "anna.json", type: "file", path: "progress/anna.json" },
          { name: "cara.json", type: "file", path: "progress/cara.json" },
        ]), { headers: { "content-type": "application/json" } });
      }
      const name = url.split("/").pop()!;
      return new Response(JSON.stringify({ sha: "s", content: btoa(JSON.stringify(files[name])), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const agg = await computeAggregate(cfg, registry, fetchMock, new Date("2026-05-27T12:00:00Z"));

    // cara is disabled: not counted, but cara's completion is not tallied either
    expect(agg.engineers_started).toBe(1);
    expect(agg.by_current_level).toEqual({ L1: 1 });
    expect(agg.by_task["web-L1.T1"]).toBe(1); // only anna
    // ...yet cara is still present in the list, flagged disabled (for the dashboard filter)
    expect(agg.engineers).toHaveLength(2);
    expect(agg.engineers.find((e) => e.username === "cara")!.disabled).toBe(true);
    expect(agg.engineers.find((e) => e.username === "anna")!.disabled).toBeUndefined();
  });
});

describe("handleApiAggregate (auth gate)", () => {
  const baseEnv = {
    SESSION_SECRET: "test-secret-32-bytes-long-padding-ok",
    DATA_REPO_OWNER: "x",
    DATA_REPO_NAME: "y",
    BOT_PAT: "t",
    ADMIN_USERNAMES: "alice",
  } as any;

  // No engineers in these gate tests, so pathFor is never reached.
  const registry = registryOf({});

  it("returns 401 when no session cookie", async () => {
    const req = new Request("https://w.example/api/aggregate");
    const res = await handleApiAggregate(req, baseEnv, registry, globalThis.fetch);
    expect(res.status).toBe(401);
  });

  it("returns 403 when signed-in user is not an admin", async () => {
    const session = await signSession("bob", baseEnv.SESSION_SECRET, 3600);
    const req = new Request("https://w.example/api/aggregate", {
      headers: { Cookie: `session=${session}` },
    });
    const res = await handleApiAggregate(req, baseEnv, registry, globalThis.fetch);
    expect(res.status).toBe(403);
  });

  it("allows a super admin who is NOT in ADMIN_USERNAMES, and stamps is_superadmin", async () => {
    const env = { ...baseEnv, ADMIN_USERNAMES: "alice", SUPERADMIN_USERNAMES: "sam" };
    const session = await signSession("sam", env.SESSION_SECRET, 3600);
    const fetchMock = (async (url: string) => {
      if (url.endsWith("/contents/progress")) return new Response("[]", { headers: { "content-type": "application/json" } });
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/aggregate", { headers: { Cookie: `session=${session}` } });
    const res = await handleApiAggregate(req, env, registry, fetchMock);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.is_superadmin).toBe(true);
  });

  it("a plain admin gets is_superadmin:false", async () => {
    const env = { ...baseEnv, ADMIN_USERNAMES: "alice", SUPERADMIN_USERNAMES: "sam" };
    const session = await signSession("alice", env.SESSION_SECRET, 3600);
    const fetchMock = (async (url: string) => {
      if (url.endsWith("/contents/progress")) return new Response("[]", { headers: { "content-type": "application/json" } });
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/aggregate", { headers: { Cookie: `session=${session}` } });
    const res = await handleApiAggregate(req, env, registry, fetchMock);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.is_superadmin).toBe(false);
  });
});
