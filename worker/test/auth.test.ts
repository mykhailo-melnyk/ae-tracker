import { describe, it, expect } from "vitest";
import { handleLogin } from "../src/auth";

const ENV = {
  OAUTH_CLIENT_ID: "client-abc",
  FRONTEND_ORIGIN: "https://example.github.io",
};

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
