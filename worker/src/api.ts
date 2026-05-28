import type { Env } from "./index";
import { verifySession } from "./session";
import { readJsonFile, writeJsonFile } from "./github";
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

export async function handleApiMark(
  request: Request,
  env: Env,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const auth = await requireSession(request, env);
  if (auth instanceof Response) return auth;
  const username = auth;

  let body: { task_id?: string; done?: boolean };
  try { body = await request.json(); } catch { return new Response("invalid json", { status: 400 }); }
  if (typeof body.task_id !== "string" || typeof body.done !== "boolean") {
    return new Response("invalid body", { status: 400 });
  }

  const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  const existing = await readJsonFile<ProgressFile>(cfg, progressPath(username), fetchFn);
  const progress = existing?.data ?? emptyProgress(username);
  const sha = existing?.sha ?? null;

  const now = new Date().toISOString();
  progress.tasks[body.task_id] = body.done ? { done: true, at: now } : { done: false };
  progress.updated_at = now;

  await writeJsonFile(
    cfg,
    progressPath(username),
    progress,
    sha,
    `progress(${username}): ${body.done ? "✓" : "✗"} ${body.task_id}`,
    fetchFn,
  );

  return Response.json(progress);
}

function isAdmin(username: string, env: Env): boolean {
  return env.ADMIN_USERNAMES.split(",").map((s) => s.trim()).includes(username);
}

export async function handleApiUser(
  request: Request,
  env: Env,
  fetchFn: typeof fetch,
  targetUsername: string,
): Promise<Response> {
  const auth = await requireSession(request, env);
  if (auth instanceof Response) return auth;
  if (!isAdmin(auth, env)) return new Response("forbidden", { status: 403 });

  const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  const existing = await readJsonFile<ProgressFile>(cfg, progressPath(targetUsername), fetchFn);
  return Response.json(existing?.data ?? emptyProgress(targetUsername));
}
