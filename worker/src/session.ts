// HMAC-SHA256 session cookie sign/verify.
// Format: <payloadBase64>.<macHex>
// Payload: { u: username, e: expUnixSeconds }

interface Payload { u: string; e: number; }

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

export async function signSession(username: string, secret: string, ttlSeconds: number): Promise<string> {
  const payload: Payload = { u: username, e: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payloadB64 = btoa(JSON.stringify(payload));
  const mac = await hmac(secret, payloadB64);
  return `${payloadB64}.${mac}`;
}

export async function verifySession(cookie: string, secret: string): Promise<{ username?: string; valid: boolean }> {
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
  return { username: payload.u, valid: true };
}
