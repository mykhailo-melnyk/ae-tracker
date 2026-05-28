import { handleLogin, handleCallback, handleLogout } from "./auth";
import { handleApiMe, handleApiMark, handleApiUser } from "./api";
import { handleApiAggregate } from "./aggregate";
import curriculum from "../../public/curriculum.json";

export interface Env {
  DATA_REPO_OWNER: string;
  DATA_REPO_NAME: string;
  ADMIN_USERNAMES: string;
  FRONTEND_ORIGIN: string;
  FRONTEND_BASE_PATH?: string;
  SESSION_SECRET: string;
  OAUTH_CLIENT_ID: string;
  OAUTH_CLIENT_SECRET: string;
  BOT_PAT: string;
  AGGREGATE_CACHE?: KVNamespace;
}

function corsHeaders(env: Env, request: Request): HeadersInit {
  return {
    "Access-Control-Allow-Origin": env.FRONTEND_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    Vary: "Origin",
  };
}

function withCors(response: Response, env: Env, request: Request): Response {
  const newHeaders = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(env, request))) newHeaders.set(k, v as string);
  return new Response(response.body, { status: response.status, headers: newHeaders });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    }

    // /auth/* — no CORS needed (full-page redirects)
    if (url.pathname === "/auth/login") return handleLogin(request, env);
    if (url.pathname === "/auth/callback") return await handleCallback(request, env);
    if (url.pathname === "/auth/logout") return handleLogout(request, env);

    // /api/*
    if (url.pathname === "/api/me") return withCors(await handleApiMe(request, env), env, request);
    if (url.pathname === "/api/mark") return withCors(await handleApiMark(request, env), env, request);
    if (url.pathname === "/api/aggregate") return withCors(
      await handleApiAggregate(request, env, curriculum as any),
      env, request,
    );
    const userMatch = url.pathname.match(/^\/api\/user\/([\w-]+)$/);
    if (userMatch) return withCors(
      await handleApiUser(request, env, fetch, userMatch[1]),
      env, request,
    );

    return new Response("not found", { status: 404 });
  },
};
