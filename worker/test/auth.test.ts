import { describe, it, expect } from "vitest";
import { handleLogin, handleCallback } from "../src/auth";

const ENV = {
  OAUTH_CLIENT_ID: "client-abc",
  FRONTEND_ORIGIN: "https://example.github.io",
};

describe("/auth/callback", () => {
  const baseEnv = {
    OAUTH_CLIENT_ID: "client-abc",
    OAUTH_CLIENT_SECRET: "secret-xyz",
    SESSION_SECRET: "test-secret-32-bytes-long-padding-ok",
    FRONTEND_ORIGIN: "https://example.github.io",
    FRONTEND_BASE_PATH: "/ae-tracker",
  } as any;

  function mockFetch(responses: Record<string, any>): typeof fetch {
    return async (url) => {
      const u = typeof url === "string" ? url : (url as Request).url;
      for (const [pattern, body] of Object.entries(responses)) {
        if (u.includes(pattern)) return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
      }
      return new Response("not mocked", { status: 500 });
    };
  }

  it("rejects when state cookie missing", async () => {
    const req = new Request("https://w.example/auth/callback?code=abc&state=foo");
    const res = await handleCallback(req, baseEnv, globalThis.fetch);
    expect(res.status).toBe(400);
  });

  it("rejects when state cookie does not match", async () => {
    const req = new Request("https://w.example/auth/callback?code=abc&state=foo", {
      headers: { Cookie: "oauth_state=bar" },
    });
    const res = await handleCallback(req, baseEnv, globalThis.fetch);
    expect(res.status).toBe(400);
  });

  it("on success: sets session cookie, redirects to frontend tracker", async () => {
    const fetchMock = mockFetch({
      "/login/oauth/access_token": { access_token: "gh-token-123", token_type: "bearer" },
      "api.github.com/user": { login: "mykhailo-melnyk", name: "Mykhailo Melnyk" },
    });
    const req = new Request("https://w.example/auth/callback?code=abc&state=goodstate", {
      headers: { Cookie: "oauth_state=goodstate" },
    });
    const res = await handleCallback(req, baseEnv, fetchMock);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://example.github.io/ae-tracker/tracker.html");
    const setCookie = res.headers.get("Set-Cookie")!;
    expect(setCookie).toMatch(/^session=[^;]+;/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
  });

  it("logout clears the session cookie and redirects to the tracker", async () => {
    const { handleLogout } = await import("../src/auth");
    const req = new Request("https://w.example/auth/logout");
    const res = handleLogout(req, baseEnv);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://example.github.io/ae-tracker/tracker.html");
    const setCookie = res.headers.get("Set-Cookie")!;
    expect(setCookie).toMatch(/^session=;/);
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
  });

  it("redirects to /tracker.html (no prefix) when FRONTEND_BASE_PATH is unset (local dev)", async () => {
    const fetchMock = mockFetch({
      "/login/oauth/access_token": { access_token: "gh-token-123", token_type: "bearer" },
      "api.github.com/user": { login: "mykhailo-melnyk", name: "Mykhailo Melnyk" },
    });
    const devEnv = { ...baseEnv, FRONTEND_ORIGIN: "http://localhost:8080", FRONTEND_BASE_PATH: undefined };
    const req = new Request("https://w.example/auth/callback?code=abc&state=goodstate", {
      headers: { Cookie: "oauth_state=goodstate" },
    });
    const res = await handleCallback(req, devEnv, fetchMock);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("http://localhost:8080/tracker.html");
  });
});

describe("/auth/login", () => {
  it("redirects to GitHub OAuth authorize with correct params", () => {
    const req = new Request("https://worker.example.com/auth/login");
    const res = handleLogin(req, ENV as any);
    expect(res.status).toBe(302);
    const loc = res.headers.get("Location")!;
    expect(loc.startsWith("https://github.com/login/oauth/authorize")).toBe(true);
    const url = new URL(loc);
    expect(url.searchParams.get("client_id")).toBe("client-abc");
    expect(url.searchParams.get("scope")).toBe("read:user");
    expect(url.searchParams.get("redirect_uri")).toBe("https://worker.example.com/auth/callback");
    expect(url.searchParams.get("state")).toMatch(/^[a-f0-9]{32}$/);
  });
});
