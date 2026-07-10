import { describe, it, expect } from "vitest";
import { handleApiMe, handleApiMark, handleApiUser, handleApiCompetencies, handleApiUserCompetencies, handleApiUserDisabled, handleApiUserLeader, handleApiUserDelete } from "../src/api";
import { signSession } from "../src/session";

const ENV = {
  SESSION_SECRET: "test-secret-32-bytes-long-padding-ok",
  DATA_REPO_OWNER: "mykhailo-melnyk",
  DATA_REPO_NAME: "ae-tracker-data",
  BOT_PAT: "bot-token",
} as any;

const CUR = {
  competencies: [
    { id: "web", label: "Web" },
    { id: "mobile", label: "Mobile" },
    { id: "backend", label: "Backend" },
  ],
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

  it("returns the GitHub display name (from the token) when no file exists, without creating one", async () => {
    const session = await signSession("anna", ENV.SESSION_SECRET, 3600, "Anna Smith");
    const calls: any[] = [];
    const fetchMock = (async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET" });
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/me", { headers: { Authorization: `Bearer ${session}` } });
    const res = await handleApiMe(req, ENV, fetchMock);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.display_name).toBe("Anna Smith");
    expect(calls.some((c) => c.method === "PUT")).toBe(false); // no file created on a mere load
  });

  it("backfills the display name into an existing file that lacks one", async () => {
    const session = await signSession("anna", ENV.SESSION_SECRET, 3600, "Anna Smith");
    const stored = { github_username: "anna", created_at: "x", updated_at: "y", tasks: {} };
    const calls: any[] = [];
    const fetchMock = (async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET", body: init?.body });
      if (init?.method === "PUT") return new Response(JSON.stringify({ content: { sha: "s2" } }), { status: 200 });
      return new Response(JSON.stringify({ sha: "s1", content: btoa(JSON.stringify(stored)), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/me", { headers: { Authorization: `Bearer ${session}` } });
    const res = await handleApiMe(req, ENV, fetchMock);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.display_name).toBe("Anna Smith");
    const put = calls.find((c) => c.method === "PUT")!;
    expect(JSON.parse(atob(JSON.parse(put.body).content)).display_name).toBe("Anna Smith");
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

  it("stamps the GitHub display name (from the token) onto a newly created file", async () => {
    const session = await signSession("anna", ENV.SESSION_SECRET, 3600, "Anna Smith");
    let putBody: string | undefined;
    const fetchMock = (async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") { putBody = init.body as string; return new Response(JSON.stringify({ content: { sha: "new-sha" } }), { status: 201 }); }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/mark", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ task_id: "L1.T1", done: true }),
    });
    const res = await handleApiMark(req, ENV, fetchMock);
    expect(res.status).toBe(200);
    expect(JSON.parse(atob(JSON.parse(putBody!).content)).display_name).toBe("Anna Smith");
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

  it("returns 403 {error:disabled} and does NOT write when the engineer is disabled", async () => {
    const session = await signSession("anna", ENV.SESSION_SECRET, 3600);
    const stored = { github_username: "anna", created_at: "x", updated_at: "y", disabled: true, tasks: {} };
    const calls: any[] = [];
    const fetchMock = (async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET" });
      return new Response(JSON.stringify({ sha: "s", content: btoa(JSON.stringify(stored)), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/mark", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ task_id: "L1.T1", done: true }),
    });
    const res = await handleApiMark(req, ENV, fetchMock);
    expect(res.status).toBe(403);
    expect((await res.json() as any).error).toBe("disabled");
    expect(calls.some((c) => c.method === "PUT")).toBe(false); // never wrote
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

describe("/api/competencies (self)", () => {
  it("returns 401 with no session", async () => {
    const req = new Request("https://w.example/api/competencies", { method: "POST", body: "{}" });
    const res = await handleApiCompetencies(req, ENV, CUR, globalThis.fetch);
    expect(res.status).toBe(401);
  });

  it("writes the caller's competency and records who set it", async () => {
    const session = await signSession("anna", ENV.SESSION_SECRET, 3600);
    const calls: any[] = [];
    const fetchMock = (async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET", body: init?.body });
      if (init?.method === "PUT") return new Response(JSON.stringify({ content: { sha: "new-sha" } }), { status: 201 });
      return new Response("not found", { status: 404 }); // no existing file
    }) as typeof fetch;
    const req = new Request("https://w.example/api/competencies", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ competency: "web" }),
    });
    const res = await handleApiCompetencies(req, ENV, CUR, fetchMock);
    expect(res.status).toBe(200);
    const put = calls.find((c) => c.method === "PUT")!;
    const written = JSON.parse(atob(JSON.parse(put.body).content));
    expect(written.competency).toBe("web");
    expect(written.competency_set_by).toBe("anna");
  });

  it("clears the competency when given null", async () => {
    const session = await signSession("anna", ENV.SESSION_SECRET, 3600);
    const stored = { github_username: "anna", created_at: "x", updated_at: "y", competency: "web", tasks: {} };
    let putBody: string | undefined;
    const fetchMock = (async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") { putBody = init.body as string; return new Response(JSON.stringify({ content: { sha: "s" } }), { status: 200 }); }
      return new Response(JSON.stringify({ sha: "s", content: btoa(JSON.stringify(stored)), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/competencies", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ competency: null }),
    });
    const res = await handleApiCompetencies(req, ENV, CUR, fetchMock);
    expect(res.status).toBe(200);
    expect(JSON.parse(atob(JSON.parse(putBody!).content)).competency).toBeUndefined();
  });

  it("rejects an unknown competency id with 400", async () => {
    const session = await signSession("anna", ENV.SESSION_SECRET, 3600);
    const req = new Request("https://w.example/api/competencies", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ competency: "nonsense" }),
    });
    const res = await handleApiCompetencies(req, ENV, CUR, globalThis.fetch);
    expect(res.status).toBe(400);
  });

  it("rejects an array body with 400 (single-select only)", async () => {
    const session = await signSession("anna", ENV.SESSION_SECRET, 3600);
    const req = new Request("https://w.example/api/competencies", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ competency: ["web", "backend"] }),
    });
    const res = await handleApiCompetencies(req, ENV, CUR, globalThis.fetch);
    expect(res.status).toBe(400);
  });

  it("retries on a 409 SHA-conflict and succeeds on re-read", async () => {
    const session = await signSession("anna", ENV.SESSION_SECRET, 3600);
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
    const req = new Request("https://w.example/api/competencies", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ competency: "mobile" }),
    });
    const res = await handleApiCompetencies(req, ENV, CUR, fetchMock);
    expect(res.status).toBe(200);
    expect(putAttempts).toBe(2);
  });

  it("preserves existing tasks when setting a competency", async () => {
    const session = await signSession("anna", ENV.SESSION_SECRET, 3600);
    const stored = { github_username: "anna", created_at: "x", updated_at: "y",
      tasks: { "L1.T1": { done: true, at: "2026-05-01T00:00:00Z" } } };
    let putBody: string | undefined;
    const fetchMock = (async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") { putBody = init.body as string; return new Response(JSON.stringify({ content: { sha: "s" } }), { status: 200 }); }
      return new Response(JSON.stringify({ sha: "s", content: btoa(JSON.stringify(stored)), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/competencies", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ competency: "web" }),
    });
    const res = await handleApiCompetencies(req, ENV, CUR, fetchMock);
    expect(res.status).toBe(200);
    expect(JSON.parse(atob(JSON.parse(putBody!).content)).tasks["L1.T1"].done).toBe(true);
  });

  it("returns 403 {error:disabled} and does NOT write when the engineer is disabled", async () => {
    const session = await signSession("anna", ENV.SESSION_SECRET, 3600);
    const stored = { github_username: "anna", created_at: "x", updated_at: "y", disabled: true, tasks: {} };
    const calls: any[] = [];
    const fetchMock = (async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? "GET" });
      return new Response(JSON.stringify({ sha: "s", content: btoa(JSON.stringify(stored)), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/competencies", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ competency: "web" }),
    });
    const res = await handleApiCompetencies(req, ENV, CUR, fetchMock);
    expect(res.status).toBe(403);
    expect((await res.json() as any).error).toBe("disabled");
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });
});

describe("/api/user/:username/disabled (super-admin only)", () => {
  const SUPER_ENV = { ...ENV, ADMIN_USERNAMES: "alice", SUPERADMIN_USERNAMES: "sam" } as any;

  it("returns 403 when caller is a plain engineer", async () => {
    const session = await signSession("anna", SUPER_ENV.SESSION_SECRET, 3600);
    const req = new Request("https://w.example/api/user/ben/disabled", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ disabled: true }),
    });
    const res = await handleApiUserDisabled(req, SUPER_ENV, globalThis.fetch, "ben");
    expect(res.status).toBe(403);
  });

  it("returns 403 when caller is an admin but NOT a super admin", async () => {
    const session = await signSession("alice", SUPER_ENV.SESSION_SECRET, 3600);
    const req = new Request("https://w.example/api/user/ben/disabled", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ disabled: true }),
    });
    const res = await handleApiUserDisabled(req, SUPER_ENV, globalThis.fetch, "ben");
    expect(res.status).toBe(403);
  });

  it("returns 404 when the target engineer has no progress file", async () => {
    const session = await signSession("sam", SUPER_ENV.SESSION_SECRET, 3600);
    const fetchMock = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    const req = new Request("https://w.example/api/user/ghost/disabled", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ disabled: true }),
    });
    const res = await handleApiUserDisabled(req, SUPER_ENV, fetchMock, "ghost");
    expect(res.status).toBe(404);
  });

  it("a super admin disables an engineer, stamping disabled/by/at without touching tasks", async () => {
    const session = await signSession("sam", SUPER_ENV.SESSION_SECRET, 3600);
    const stored = { github_username: "ben", created_at: "x", updated_at: "y",
      tasks: { "L1.T1": { done: true, at: "2026-05-01T00:00:00Z" } } };
    let putBody: string | undefined;
    const fetchMock = (async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") { putBody = init.body as string; return new Response(JSON.stringify({ content: { sha: "s2" } }), { status: 200 }); }
      return new Response(JSON.stringify({ sha: "s1", content: btoa(JSON.stringify(stored)), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/user/ben/disabled", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ disabled: true }),
    });
    const res = await handleApiUserDisabled(req, SUPER_ENV, fetchMock, "ben");
    expect(res.status).toBe(200);
    const written = JSON.parse(atob(JSON.parse(putBody!).content));
    expect(written.disabled).toBe(true);
    expect(written.disabled_by).toBe("sam");
    expect(written.disabled_at).toBeTruthy();
    expect(written.tasks["L1.T1"].done).toBe(true); // progress preserved
  });

  it("re-enables an engineer (disabled:false)", async () => {
    const session = await signSession("sam", SUPER_ENV.SESSION_SECRET, 3600);
    const stored = { github_username: "ben", created_at: "x", updated_at: "y", disabled: true, tasks: {} };
    let putBody: string | undefined;
    const fetchMock = (async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") { putBody = init.body as string; return new Response(JSON.stringify({ content: { sha: "s2" } }), { status: 200 }); }
      return new Response(JSON.stringify({ sha: "s1", content: btoa(JSON.stringify(stored)), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/user/ben/disabled", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ disabled: false }),
    });
    const res = await handleApiUserDisabled(req, SUPER_ENV, fetchMock, "ben");
    expect(res.status).toBe(200);
    expect(JSON.parse(atob(JSON.parse(putBody!).content)).disabled).toBe(false);
  });

  it("rejects a non-boolean body with 400", async () => {
    const session = await signSession("sam", SUPER_ENV.SESSION_SECRET, 3600);
    const req = new Request("https://w.example/api/user/ben/disabled", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ disabled: "yes" }),
    });
    const res = await handleApiUserDisabled(req, SUPER_ENV, globalThis.fetch, "ben");
    expect(res.status).toBe(400);
  });
});

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
      // Directory listing (cascade scan for dangling unit_leader refs) — only ben, no reports.
      if (url.endsWith("/contents/progress")) return new Response(JSON.stringify(
        [{ name: "ben.json", type: "file", path: "progress/ben.json" }]),
        { headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ sha: "s1", content: btoa(JSON.stringify(stored)), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    let cacheBusted = false;
    const env = { ...SUPER_ENV, AGGREGATE_CACHE: { delete: async () => { cacheBusted = true; } } };
    const res = await handleApiUserDelete(delReq(session, "ben"), env, fetchMock, "ben");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true, username: "ben", unassigned: [] });
    const del = calls.find((c) => c.method === "DELETE");
    expect(del.url).toContain("/contents/progress/ben.json");
    expect(JSON.parse(del.body).sha).toBe("s1");
    expect(cacheBusted).toBe(true);
  });

  it("clears a dangling unit_leader on engineers the deleted user led (cascade)", async () => {
    const session = await signSession("sam", SUPER_ENV.SESSION_SECRET, 3600);
    const lead = { github_username: "lead", created_at: "x", updated_at: "y", tasks: {} };
    const report = { github_username: "report", created_at: "x", updated_at: "y", unit_leader: "lead", tasks: {} };
    const puts: Array<{ url: string; body: any }> = [];
    let leadDeleted = false;
    const fetchMock = (async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") { leadDeleted = url.includes("/contents/progress/lead.json"); return new Response(JSON.stringify({ commit: { sha: "c" } }), { status: 200 }); }
      if (init?.method === "PUT") { puts.push({ url, body: JSON.parse(init.body as string) }); return new Response(JSON.stringify({ content: { sha: "s2" } }), { status: 200 }); }
      if (url.endsWith("/contents/progress")) return new Response(JSON.stringify([
        { name: "lead.json", type: "file", path: "progress/lead.json" },
        { name: "report.json", type: "file", path: "progress/report.json" },
      ]), { headers: { "content-type": "application/json" } });
      const stored = url.includes("report.json") ? report : lead;
      return new Response(JSON.stringify({ sha: "s1", content: btoa(JSON.stringify(stored)), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const res = await handleApiUserDelete(delReq(session, "lead"), SUPER_ENV, fetchMock, "lead");
    expect(res.status).toBe(200);
    expect((await res.json() as any).unassigned).toEqual(["report"]);
    expect(leadDeleted).toBe(true);
    // report's unit_leader was cleared and stamped with the acting super admin.
    const reportPut = puts.find((p) => p.url.includes("report.json"));
    expect(reportPut).toBeTruthy();
    const written = JSON.parse(atob(reportPut!.body.content));
    expect(written.unit_leader).toBeUndefined();
    expect(written.unit_leader_set_by).toBe("sam");
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
      // Directory listing (cascade scan) — only ben, no reports.
      if (url.endsWith("/contents/progress")) return new Response(JSON.stringify(
        [{ name: "ben.json", type: "file", path: "progress/ben.json" }]),
        { headers: { "content-type": "application/json" } });
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

describe("/api/user/:username/competencies (admin override)", () => {
  it("returns 403 when caller is not an admin", async () => {
    const session = await signSession("randomguy", ENV.SESSION_SECRET, 3600);
    const env = { ...ENV, ADMIN_USERNAMES: "mykhailo-melnyk" };
    const req = new Request("https://w.example/api/user/anna/competencies", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ competency: "web" }),
    });
    const res = await handleApiUserCompetencies(req, env, CUR, globalThis.fetch, "anna");
    expect(res.status).toBe(403);
  });

  it("an admin sets a target's competency and is recorded as the setter", async () => {
    const session = await signSession("mykhailo-melnyk", ENV.SESSION_SECRET, 3600);
    const env = { ...ENV, ADMIN_USERNAMES: "mykhailo-melnyk" };
    const calls: any[] = [];
    const fetchMock = (async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body });
      if (init?.method === "PUT") return new Response(JSON.stringify({ content: { sha: "s" } }), { status: 200 });
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/user/anna/competencies", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ competency: "backend" }),
    });
    const res = await handleApiUserCompetencies(req, env, CUR, fetchMock, "anna");
    expect(res.status).toBe(200);
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.url).toContain("progress/anna.json");
    const written = JSON.parse(atob(JSON.parse(put.body).content));
    expect(written.competency).toBe("backend");
    expect(written.competency_set_by).toBe("mykhailo-melnyk");
  });

  it("does NOT stamp the admin's display name onto the target", async () => {
    const session = await signSession("mykhailo-melnyk", ENV.SESSION_SECRET, 3600, "Admin Person");
    const env = { ...ENV, ADMIN_USERNAMES: "mykhailo-melnyk" };
    let putBody: string | undefined;
    const stored = { github_username: "anna", display_name: "Anna Smith", created_at: "x", updated_at: "y", tasks: {} };
    const fetchMock = (async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") { putBody = init.body as string; return new Response(JSON.stringify({ content: { sha: "s" } }), { status: 200 }); }
      return new Response(JSON.stringify({ sha: "s", content: btoa(JSON.stringify(stored)), encoding: "base64" }),
        { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const req = new Request("https://w.example/api/user/anna/competencies", {
      method: "POST",
      headers: { Cookie: `session=${session}`, "content-type": "application/json" },
      body: JSON.stringify({ competency: "web" }),
    });
    const res = await handleApiUserCompetencies(req, env, CUR, fetchMock, "anna");
    expect(res.status).toBe(200);
    expect(JSON.parse(atob(JSON.parse(putBody!).content)).display_name).toBe("Anna Smith"); // unchanged
  });
});

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
