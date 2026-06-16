import type { Env } from "./index";
import { signSession } from "./session";

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function handleLogin(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const state = randomState();
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", env.OAUTH_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", `${url.origin}/auth/callback`);
  authorizeUrl.searchParams.set("scope", "read:user");
  authorizeUrl.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.toString(),
      "Set-Cookie": `oauth_state=${state}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) out[k] = v.join("=");
  }
  return out;
}

export async function handleCallback(
  request: Request,
  env: Env,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookies = parseCookies(request.headers.get("Cookie"));
  const expectedState = cookies["oauth_state"];

  if (!code || !state || !expectedState || state !== expectedState) {
    console.error(`oauth: invalid state — hasCode=${!!code} hasState=${!!state} hasCookie=${!!expectedState} match=${state === expectedState}`);
    return new Response("Invalid OAuth state", { status: 400 });
  }

  // Exchange code for access token
  const tokenRes = await fetchFn("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: env.OAUTH_CLIENT_ID,
      client_secret: env.OAUTH_CLIENT_SECRET,
      code,
    }),
  });
  if (!tokenRes.ok) {
    const bodyText = await tokenRes.text();
    console.error(`oauth token exchange failed: status=${tokenRes.status} body=${bodyText.slice(0, 500)}`);
    return new Response(
      `OAuth token exchange failed — status ${tokenRes.status}; body: ${bodyText.slice(0, 500)}`,
      { status: 502 },
    );
  }
  const tokenJson = await tokenRes.json() as { access_token?: string; error?: string; error_description?: string };
  const accessToken = tokenJson.access_token;
  if (!accessToken) {
    console.error(`oauth: no access token — error=${tokenJson.error ?? "(none)"} description=${tokenJson.error_description ?? "(none)"}`);
    return new Response(
      `No access token in response — error: ${tokenJson.error ?? "(none)"}; description: ${tokenJson.error_description ?? "(none)"}`,
      { status: 502 },
    );
  }

  // Fetch user identity. Use "token <oauth>" scheme — GitHub's documented scheme
  // for OAuth-flow tokens. (Bearer also works for most endpoints but token is canonical.)
  const userRes = await fetchFn("https://api.github.com/user", {
    headers: {
      authorization: `token ${accessToken}`,
      "user-agent": "ae-tracker-worker",
      accept: "application/vnd.github+json",
    },
  });
  if (!userRes.ok) {
    const bodyText = await userRes.text();
    console.error(`oauth: fetch user failed — status=${userRes.status} body=${bodyText.slice(0, 500)}`);
    return new Response(
      `Failed to fetch GitHub user — status ${userRes.status}; body: ${bodyText.slice(0, 500)}`,
      { status: 502 },
    );
  }
  const user = await userRes.json() as { login: string; name?: string };

  // Mint session cookie. Carry the GitHub display name in the token so authenticated
  // requests can persist it into the engineer's own progress file without re-hitting
  // the GitHub API. Falls back to the login when the profile has no name set.
  const displayName = user.name?.trim() || user.login;
  const session = await signSession(user.login, env.SESSION_SECRET, SESSION_TTL_SECONDS, displayName);

  const basePath = env.FRONTEND_BASE_PATH ?? "";
  // Hand the token to the frontend in the URL *fragment* (#t=...). Safari and
  // Firefox-Strict block the cross-site session cookie below, so the frontend's
  // primary mechanism is to read this token, stash it in localStorage, and send it
  // as a Bearer header on API calls. A fragment (not a query param) never reaches a
  // server and isn't sent in the Referer header, so the token stays off the wire and
  // out of logs; the frontend strips it from the URL immediately on load.
  const redirect = `${env.FRONTEND_ORIGIN}${basePath}/tracker.html#t=${encodeURIComponent(session)}`;
  return new Response(null, {
    status: 302,
    headers: {
      Location: redirect,
      // Also set the cookie as a same-origin fallback (harmless where third-party
      // cookies are allowed). SameSite=None so it's at least attempted cross-origin.
      "Set-Cookie": `session=${session}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${SESSION_TTL_SECONDS}`,
    },
  });
}

export function handleLogout(_request: Request, env: Env): Response {
  const basePath = env.FRONTEND_BASE_PATH ?? "";
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${env.FRONTEND_ORIGIN}${basePath}/tracker.html`,
      "Set-Cookie": `session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`,
    },
  });
}
