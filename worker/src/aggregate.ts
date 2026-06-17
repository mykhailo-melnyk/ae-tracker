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
  // Whether the requesting session is a super admin (controls disable/enable UI).
  // Set per-request — never part of the cached body, which is shared across viewers.
  is_superadmin: boolean;
  engineers: Array<{
    username: string;
    display_name?: string;
    current_level: string;
    completion_pct: number;
    last_active: string;
    competency?: string;
    disabled?: boolean;
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
  let engineers_started = 0;
  const engineers: Aggregate["engineers"] = [];

  const stallThresholdMs = STALLED_DAYS * 86_400_000;

  for (const p of progresses) {
    const cl = currentLevel(p, curriculum);
    const la = lastActive(p);
    const done = allTaskIds.filter((id) => p.tasks[id]?.done).length;
    // Disabled engineers are still surfaced in the list (behind a dashboard filter)
    // but are excluded from every headline count so they don't skew adoption stats.
    if (!p.disabled) {
      engineers_started += 1;
      by_current_level[cl] = (by_current_level[cl] ?? 0) + 1;
      for (const id of allTaskIds) {
        if (p.tasks[id]?.done) by_task[id] += 1;
      }
      if (now.getTime() - new Date(la).getTime() > stallThresholdMs) stalled_14d += 1;
    }
    engineers.push({
      username: p.github_username,
      display_name: p.display_name,
      current_level: cl,
      completion_pct: done / totalTasks,
      last_active: la,
      competency: p.competency,
      disabled: p.disabled,
    });
  }

  return {
    as_of: now.toISOString(),
    engineers_started,
    by_current_level,
    by_task,
    stalled_14d,
    is_superadmin: false, // overwritten per-request in handleApiAggregate (not cached)
    engineers,
  };
}

import type { Env } from "./index";
import { verifySession, tokenFromRequest } from "./session";
import { isSuperAdmin } from "./api";

// Bump when the aggregate's shape changes so a deploy invalidates stale entries
// immediately (v2 adds per-engineer `competency`; v3 adds per-engineer `disabled`
// and excludes disabled engineers from the headline counts).
export const CACHE_KEY = "aggregate-v3";
const CACHE_TTL_SECONDS = 300;

// `is_superadmin` is viewer-specific, so it can't live in the shared cached body.
// We cache the aggregate without it and stamp the requesting viewer's value on the
// way out (whether the body came from cache or a fresh compute).
function withViewer(body: string, superadmin: boolean): Response {
  const agg = JSON.parse(body) as Aggregate;
  agg.is_superadmin = superadmin;
  return new Response(JSON.stringify(agg), { headers: { "content-type": "application/json" } });
}

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
  const superadmin = isSuperAdmin(session.username, env);
  // Super admins are a superset of admins (see api.ts) — either role may view.
  if (!admins.includes(session.username) && !superadmin) return new Response("forbidden", { status: 403 });

  if (env.AGGREGATE_CACHE) {
    const cached = await env.AGGREGATE_CACHE.get(CACHE_KEY);
    if (cached) return withViewer(cached, superadmin);
  }
  const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  const agg = await computeAggregate(cfg, curriculum, fetchFn);
  const body = JSON.stringify(agg); // cached body carries is_superadmin:false; the viewer's value is stamped below
  if (env.AGGREGATE_CACHE) {
    await env.AGGREGATE_CACHE.put(CACHE_KEY, body, { expirationTtl: CACHE_TTL_SECONDS });
  }
  return withViewer(body, superadmin);
}
