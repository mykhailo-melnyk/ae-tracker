// HMAC-SHA256 session cookie sign/verify.
// Format: <payloadBase64>.<macHex>
// Payload: { u: username, e: expUnixSeconds, n?: displayName }

interface Payload { u: string; e: number; n?: string; }

async function hmac(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Extract the session token from a request. Prefers the `Authorization: Bearer`
// header (how the frontend sends it — see below) and falls back to the `session`
// cookie. The header path exists because Safari and Firefox-Strict block our
// cross-site session cookie: frontend (github.io) and Worker (workers.dev) are
// different registrable domains, so the cookie is third-party and never sent on a
// cross-origin fetch. A Bearer header is immune to that, so it's the primary path;
// the cookie remains as a same-origin fallback.
export function tokenFromRequest(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const t = auth.slice("Bearer ".length).trim();
    if (t) return t;
  }
  const cookie = request.headers.get("Cookie");
  if (cookie) {
    for (const part of cookie.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === "session") return v.join("=");
    }
  }
  return null;
}

export async function signSession(username: string, secret: string, ttlSeconds: number, displayName?: string): Promise<string> {
  const payload: Payload = { u: username, e: Math.floor(Date.now() / 1000) + ttlSeconds };
  if (displayName) payload.n = displayName;
  const payloadB64 = btoa(JSON.stringify(payload));
  const mac = await hmac(secret, payloadB64);
  return `${payloadB64}.${mac}`;
}

export async function verifySession(cookie: string, secret: string): Promise<{ username?: string; displayName?: string; valid: boolean }> {
  const parts = cookie.split(".");
  if (parts.length !== 2) return { valid: false };
  const [payloadB64, providedMac] = parts;
  const expectedMac = await hmac(secret, payloadB64);
  if (!timingSafeEqual(providedMac, expectedMac)) return { valid: false };
  let payload: Payload;
  try {
    payload = JSON.parse(atob(payloadB64));
  } catch {
    return { valid: false };
  }
  if (typeof payload.u !== "string" || typeof payload.e !== "number") return { valid: false };
  if (payload.e < Math.floor(Date.now() / 1000)) return { valid: false };
  return { username: payload.u, displayName: typeof payload.n === "string" ? payload.n : undefined, valid: true };
}
