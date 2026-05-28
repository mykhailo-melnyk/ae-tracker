import { describe, it, expect } from "vitest";
import { computeAggregate, handleApiAggregate } from "../src/aggregate";
import { signSession } from "../src/session";

const cfg = { owner: "x", repo: "y", token: "t" };

describe("computeAggregate", () => {
  it("computes current level distribution, per-task completion, and stalled count", async () => {
    const curriculum = {
      levels: [
        { id: "L1", tasks: [{ id: "L1.T1" }, { id: "L1.T2" }], level_complete_when: "all_tasks_done" },
        { id: "L2", tasks: [{ id: "L2.T1" }], level_complete_when: "all_tasks_done" },
      ],
    };

    const files: Record<string, any> = {
      "anna.json": {
        github_username: "anna", display_name: "Anna",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-27T00:00:00Z",
        tasks: { "L1.T1": { done: true, at: "2026-05-27T00:00:00Z" } },
      },
      "ben.json": {
        github_username: "ben", display_name: "Ben",
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-04-01T00:00:00Z", // stale > 14d (assume "now" is 2026-05-27)
        tasks: { "L1.T1": { done: true, at: "2026-04-01T00:00:00Z" },
                 "L1.T2": { done: true, at: "2026-04-01T00:00:00Z" } },
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
    const agg = await computeAggregate(cfg, curriculum as any, fetchMock, now);

    expect(agg.engineers_started).toBe(2);
    // anna at L1 (one of two L1 tasks done) -> current L1
    // ben completed all L1 tasks -> current L2
    expect(agg.by_current_level).toEqual({ L1: 1, L2: 1 });
    expect(agg.by_task["L1.T1"]).toBe(2);
    expect(agg.by_task["L1.T2"]).toBe(1);
    expect(agg.by_task["L2.T1"]).toBe(0);
    expect(agg.stalled_14d).toBe(1); // ben hasn't updated in >14d
    expect(agg.engineers).toHaveLength(2);
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

  const minimalCurriculum = { levels: [
    { id: "L1", tasks: [{ id: "L1.T1" }], level_complete_when: "all_tasks_done" },
  ] };

  it("returns 401 when no session cookie", async () => {
    const req = new Request("https://w.example/api/aggregate");
    const res = await handleApiAggregate(req, baseEnv, minimalCurriculum as any, globalThis.fetch);
    expect(res.status).toBe(401);
  });

  it("returns 403 when signed-in user is not an admin", async () => {
    const session = await signSession("bob", baseEnv.SESSION_SECRET, 3600);
    const req = new Request("https://w.example/api/aggregate", {
      headers: { Cookie: `session=${session}` },
    });
    const res = await handleApiAggregate(req, baseEnv, minimalCurriculum as any, globalThis.fetch);
    expect(res.status).toBe(403);
  });
});
