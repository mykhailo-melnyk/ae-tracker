import { listDirectory, readJsonFile, type RepoConfig } from "./github";
import type { ProgressFile } from "./types";

interface Curriculum {
  levels: Array<{ id: string; tasks: Array<{ id: string }>; level_complete_when: string }>;
}

export interface Aggregate {
  as_of: string;
  engineers_started: number;
  by_current_level: Record<string, number>;
  by_task: Record<string, number>;
  stalled_14d: number;
  engineers: Array<{
    username: string;
    display_name?: string;
    current_level: string;
    completion_pct: number;
    last_active: string;
  }>;
}

const STALLED_DAYS = 14;

function currentLevel(progress: ProgressFile, curriculum: Curriculum): string {
  for (const lvl of curriculum.levels) {
    const allDone = lvl.tasks.every((t) => progress.tasks[t.id]?.done === true);
    if (!allDone) return lvl.id;
  }
  return curriculum.levels[curriculum.levels.length - 1].id;
}

function lastActive(progress: ProgressFile): string {
  const timestamps = Object.values(progress.tasks)
    .map((t) => t.at).filter((s): s is string => !!s);
  if (timestamps.length === 0) return progress.created_at;
  return timestamps.sort().slice(-1)[0];
}

export async function computeAggregate(
  cfg: RepoConfig,
  curriculum: Curriculum,
  fetchFn: typeof fetch,
  now: Date = new Date(),
): Promise<Aggregate> {
  const entries = await listDirectory(cfg, "progress", fetchFn);
  const progresses: ProgressFile[] = [];
  for (const e of entries) {
    const result = await readJsonFile<ProgressFile>(cfg, e.path, fetchFn);
    if (result) progresses.push(result.data);
  }
  const totalTasks = curriculum.levels.reduce((n, l) => n + l.tasks.length, 0);
  const allTaskIds = curriculum.levels.flatMap((l) => l.tasks.map((t) => t.id));

  const by_current_level: Record<string, number> = {};
  const by_task: Record<string, number> = Object.fromEntries(allTaskIds.map((id) => [id, 0]));
  let stalled_14d = 0;
  const engineers: Aggregate["engineers"] = [];

  const stallThresholdMs = STALLED_DAYS * 86_400_000;

  for (const p of progresses) {
    const cl = currentLevel(p, curriculum);
    by_current_level[cl] = (by_current_level[cl] ?? 0) + 1;
    for (const id of allTaskIds) {
      if (p.tasks[id]?.done) by_task[id] += 1;
    }
    const la = lastActive(p);
    const isStalled = now.getTime() - new Date(la).getTime() > stallThresholdMs;
    if (isStalled) stalled_14d += 1;
    const done = allTaskIds.filter((id) => p.tasks[id]?.done).length;
    engineers.push({
      username: p.github_username,
      display_name: p.display_name,
      current_level: cl,
      completion_pct: done / totalTasks,
      last_active: la,
    });
  }

  return {
    as_of: now.toISOString(),
    engineers_started: progresses.length,
    by_current_level,
    by_task,
    stalled_14d,
    engineers,
  };
}

import type { Env } from "./index";
import { verifySession, tokenFromRequest } from "./session";

const CACHE_KEY = "aggregate-v1";
const CACHE_TTL_SECONDS = 300;

export async function handleApiAggregate(
  request: Request,
  env: Env,
  curriculum: Curriculum,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const token = tokenFromRequest(request);
  if (!token) return new Response("unauthenticated", { status: 401 });
  const session = await verifySession(token, env.SESSION_SECRET);
  if (!session.valid || !session.username) return new Response("unauthenticated", { status: 401 });
  const admins = env.ADMIN_USERNAMES.split(",").map((s) => s.trim());
  if (!admins.includes(session.username)) return new Response("forbidden", { status: 403 });

  if (env.AGGREGATE_CACHE) {
    const cached = await env.AGGREGATE_CACHE.get(CACHE_KEY);
    if (cached) return new Response(cached, { headers: { "content-type": "application/json" } });
  }
  const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  const agg = await computeAggregate(cfg, curriculum, fetchFn);
  const body = JSON.stringify(agg);
  if (env.AGGREGATE_CACHE) {
    await env.AGGREGATE_CACHE.put(CACHE_KEY, body, { expirationTtl: CACHE_TTL_SECONDS });
  }
  return new Response(body, { headers: { "content-type": "application/json" } });
}
