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
  if (typeof body.task_id !== "string" || body.task_id.length > 32 || typeof body.done !== "boolean") {
    return new Response("invalid body", { status: 400 });
  }

  const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  const taskId = body.task_id;
  const done = body.done;
  const msg = `progress(${username}): ${done ? "✓" : "✗"} ${taskId}`;

  // Retry on 409 (GitHub's optimistic-concurrency rejection when SHA is stale,
  // e.g. when two writes race). Re-read to pick up the fresh SHA, re-apply, retry.
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const existing = await readJsonFile<ProgressFile>(cfg, progressPath(username), fetchFn);
    const progress = existing?.data ?? emptyProgress(username);
    const now = new Date().toISOString();
    progress.tasks[taskId] = done ? { done: true, at: now } : { done: false };
    progress.updated_at = now;
    try {
      await writeJsonFile(cfg, progressPath(username), progress, existing?.sha ?? null, msg, fetchFn);
      return Response.json(progress);
    } catch (e) {
      const errStr = e instanceof Error ? e.message : String(e);
      const isConflict = errStr.includes("writeJsonFile 409");
      if (!isConflict || attempt === MAX_ATTEMPTS) {
        console.error(`mark failed: user=${username} task=${taskId} attempt=${attempt}/${MAX_ATTEMPTS} conflict=${isConflict} err=${errStr.slice(0, 300)}`);
        throw e;
      }
      // Else: re-read & retry. Tiny back-off to give the other writer time to settle.
      console.warn(`mark 409 conflict: user=${username} task=${taskId} attempt=${attempt}/${MAX_ATTEMPTS}, retrying`);
      await new Promise((r) => setTimeout(r, 50 * attempt));
    }
  }
  // Unreachable — loop either returns or throws.
  throw new Error("unreachable");
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
