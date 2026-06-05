import { describe, it, expect } from "vitest";
import { handleApiMe, handleApiMark, handleApiUser } from "../src/api";
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

  it("accepts a valid session token via Authorization: Bearer header (no cookie)", async () => {
    // Safari/Firefox block our cross-site session cookie, so the frontend sends the
    // token as a Bearer header instead. The Worker must accept it.
    const session = await signSession("mykhailo-melnyk", ENV.SESSION_SECRET, 3600);
    const req = new Request("https://w.example/api/me", {
      headers: { Authorization: `Bearer ${session}` },
    });
    const fetchMock = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    const res = await handleApiMe(req, ENV, fetchMock);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.github_username).toBe("mykhailo-melnyk");
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

  it("retries on a 409 SHA-conflict and succeeds on re-read", async () => {
    const session = await signSession("anna", ENV.SESSION_SECRET, 3600);
    let putAttempts = 0;
    const stored = { github_username: "anna", created_at: "x", updated_at: "y", tasks: {} };
    const fetchMock = (async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        putAttempts += 1;
        if (putAttempts === 1) {
          // First write: simulate the SHA-conflict 409 GitHub returns when another
          // writer beat us.
          return new Response('{"message":"file does not match sha","status":"409"}', { status: 409 });
        }
        return new Response(JSON.stringify({ content: { sha: "new-sha" } }), { status: 200 });
      }
      // Reads always succeed — simulating the file existing.
      return new Response(JSON.stringify({
        sha: "fresh-sha", content: btoa(JSON.stringify(stored)), encoding: "base64",
      }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/mark", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ task_id: "L1.T1", done: true }),
    });
    const res = await handleApiMark(req, ENV, fetchMock);
    expect(res.status).toBe(200);
    expect(putAttempts).toBe(2);
  });

  it("rejects task_id longer than 32 chars", async () => {
    const session = await signSession("anna", ENV.SESSION_SECRET, 3600);
    const req = new Request("https://w.example/api/mark", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ task_id: "A".repeat(33), done: true }),
    });
    const res = await handleApiMark(req, ENV, globalThis.fetch);
    expect(res.status).toBe(400);
  });
});

describe("/api/user/:username (admin only)", () => {
  it("returns 403 when caller is not in admin allowlist", async () => {
    const session = await signSession("randomguy", ENV.SESSION_SECRET, 3600);
    const env = { ...ENV, ADMIN_USERNAMES: "mykhailo-melnyk" };
    const req = new Request("https://w.example/api/user/mykhailo-melnyk", {
      headers: { Cookie: `session=${session}` },
    });
    const res = await handleApiUser(req, env, globalThis.fetch, "mykhailo-melnyk");
    expect(res.status).toBe(403);
  });

  it("returns the target user's progress when caller is an admin", async () => {
    const session = await signSession("mykhailo-melnyk", ENV.SESSION_SECRET, 3600);
    const env = { ...ENV, ADMIN_USERNAMES: "mykhailo-melnyk,anotheradmin" };
    const stored = { github_username: "anna", created_at: "x", updated_at: "y", tasks: {} };
    const fetchMock = (async () => new Response(JSON.stringify({
      sha: "s", content: btoa(JSON.stringify(stored)), encoding: "base64",
    }), { headers: { "content-type": "application/json" } })) as typeof fetch;
    const req = new Request("https://w.example/api/user/anna", {
      headers: { Cookie: `session=${session}` },
    });
    const res = await handleApiUser(req, env, fetchMock, "anna");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.github_username).toBe("anna");
  });
});
