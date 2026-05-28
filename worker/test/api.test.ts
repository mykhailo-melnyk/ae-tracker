import { describe, it, expect } from "vitest";
import { handleApiMe, handleApiMark } from "../src/api";
import { signSession } from "../src/session";

const ENV = {
  SESSION_SECRET: "test-secret-32-bytes-long-padding-ok",
  DATA_REPO_OWNER: "mykhailo-melnyk",
  DATA_REPO_NAME: "ae-tracker-data",
  BOT_PAT: "bot-token",
} as any;

describe("/api/me", () => {
  it("returns 401 when no session cookie", async () => {
    const req = new Request("https://w.example/api/me");
    const res = await handleApiMe(req, ENV, globalThis.fetch);
    expect(res.status).toBe(401);
  });

  it("returns empty progress when no file exists", async () => {
    const session = await signSession("mykhailo-melnyk", ENV.SESSION_SECRET, 3600);
    const req = new Request("https://w.example/api/me", {
      headers: { Cookie: `session=${session}` },
    });
    const fetchMock = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    const res = await handleApiMe(req, ENV, fetchMock);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.github_username).toBe("mykhailo-melnyk");
    expect(body.tasks).toEqual({});
  });

  it("returns existing progress when file exists", async () => {
    const session = await signSession("mykhailo-melnyk", ENV.SESSION_SECRET, 3600);
    const req = new Request("https://w.example/api/me", {
      headers: { Cookie: `session=${session}` },
    });
    const stored = {
      github_username: "mykhailo-melnyk",
      created_at: "2026-05-01T00:00:00Z",
      updated_at: "2026-05-27T00:00:00Z",
      tasks: { "L1.T1": { done: true, at: "2026-05-01T01:00:00Z" } },
    };
    const fetchMock = (async () => new Response(JSON.stringify({
      sha: "sha-1", content: btoa(JSON.stringify(stored)), encoding: "base64",
    }), { headers: { "content-type": "application/json" } })) as typeof fetch;
    const res = await handleApiMe(req, ENV, fetchMock);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.tasks["L1.T1"].done).toBe(true);
  });
});

describe("/api/mark", () => {
  it("returns 401 with no session", async () => {
    const req = new Request("https://w.example/api/mark", { method: "POST", body: "{}" });
    const res = await handleApiMark(req, ENV, globalThis.fetch);
    expect(res.status).toBe(401);
  });

  it("creates a progress file on first mark", async () => {
    const session = await signSession("anna", ENV.SESSION_SECRET, 3600);
    const calls: any[] = [];
    const fetchMock = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body });
      if (init?.method === "PUT") {
        return new Response(JSON.stringify({ content: { sha: "new-sha" } }), { status: 201 });
      }
      // First read: 404 (no existing file)
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/mark", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ task_id: "L1.T1", done: true }),
    });
    const res = await handleApiMark(req, ENV, fetchMock);
    expect(res.status).toBe(200);
    const put = calls.find((c) => c.method === "PUT")!;
    const putBody = JSON.parse(put.body);
    const written = JSON.parse(atob(putBody.content));
    expect(written.tasks["L1.T1"].done).toBe(true);
    expect(written.tasks["L1.T1"].at).toBeTruthy();
  });
});
