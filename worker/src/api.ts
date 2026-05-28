import type { Env } from "./index";
import { verifySession } from "./session";
import { readJsonFile } from "./github";
import type { ProgressFile } from "./types";

function parseCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const p of header.split(";")) {
    const [k, ...v] = p.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

async function requireSession(request: Request, env: Env): Promise<string | Response> {
  const cookie = parseCookie(request.headers.get("Cookie"), "session");
  if (!cookie) return new Response("unauthenticated", { status: 401 });
  const result = await verifySession(cookie, env.SESSION_SECRET);
  if (!result.valid || !result.username) return new Response("unauthenticated", { status: 401 });
  return result.username;
}

function progressPath(username: string): string {
  return `progress/${username}.json`;
}

function emptyProgress(username: string): ProgressFile {
  const now = new Date().toISOString();
  return { github_username: username, created_at: now, updated_at: now, tasks: {} };
}

export async function handleApiMe(
  request: Request,
  env: Env,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const auth = await requireSession(request, env);
  if (auth instanceof Response) return auth;
  const username = auth;
  const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  const existing = await readJsonFile<ProgressFile>(cfg, progressPath(username), fetchFn);
  const progress = existing?.data ?? emptyProgress(username);
  return Response.json(progress);
}
