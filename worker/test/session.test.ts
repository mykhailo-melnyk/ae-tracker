import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "../src/session";

const SECRET = "test-secret-32-bytes-long-padding-ok";

describe("session cookies", () => {
  it("round-trips a username", async () => {
    const cookie = await signSession("mykhailo-melnyk", SECRET, 3600);
    const result = await verifySession(cookie, SECRET);
    expect(result).toEqual({ username: "mykhailo-melnyk", valid: true });
  });

  it("round-trips an optional display name", async () => {
    const cookie = await signSession("mykhailo-melnyk", SECRET, 3600, "Mykhailo Melnyk");
    const result = await verifySession(cookie, SECRET);
    expect(result).toEqual({ username: "mykhailo-melnyk", displayName: "Mykhailo Melnyk", valid: true });
  });

  it("rejects a tampered payload", async () => {
    const cookie = await signSession("mykhailo-melnyk", SECRET, 3600);
    // Swap the payload portion for a different one (different username)
    const [payload, mac] = cookie.split(".");
    const evilPayload = btoa(JSON.stringify({ u: "attacker", e: 9_999_999_999 }));
    const tampered = `${evilPayload}.${mac}`;
    const result = await verifySession(tampered, SECRET);
    expect(result.valid).toBe(false);
  });

  it("rejects a tampered MAC", async () => {
    const cookie = await signSession("mykhailo-melnyk", SECRET, 3600);
    const [payload] = cookie.split(".");
    const tampered = `${payload}.deadbeefdeadbeefdeadbeefdeadbeef`;
    const result = await verifySession(tampered, SECRET);
    expect(result.valid).toBe(false);
  });

  it("rejects an expired cookie", async () => {
    // Sign with -1 second TTL → already expired
    const cookie = await signSession("mykhailo-melnyk", SECRET, -1);
    const result = await verifySession(cookie, SECRET);
    expect(result.valid).toBe(false);
  });

  it("rejects a wrong-secret cookie", async () => {
    const cookie = await signSession("mykhailo-melnyk", SECRET, 3600);
    const result = await verifySession(cookie, "different-secret-32-bytes-padding");
    expect(result.valid).toBe(false);
  });
});
