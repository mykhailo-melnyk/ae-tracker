import { listDirectory, readJsonFile, type RepoConfig } from "./github";
import type { ProgressFile } from "./types";
import type { ResolvedCurriculum } from "./curriculum";

// The aggregate resolves each engineer's path by their competency. A registry is any
// object exposing pathFor() (the ./curriculum module satisfies this structurally; tests
// pass a fake). Returns null for an engineer with no/unknown competency.
interface CurriculumRegistry {
  pathFor(competencyId?: string): ResolvedCurriculum | null;
}

// A cert registry is any object exposing certList() (the ./certifications module
// satisfies this structurally; tests pass a fake). Empty default = no cert pass.
interface CertRegistry {
  certList(): Array<{ id: string; label: string; itemIds: string[]; requiredItemIds: string[] }>;
}
const EMPTY_CERT_REGISTRY: CertRegistry = { certList: () => [] };

export interface Aggregate {
  as_of: string;
  engineers_started: number;
  by_current_level: Record<string, number>;
  by_task: Record<string, number>;
  stalled_14d: number;
  // Whether the requesting session is a super admin (controls disable/enable UI).
  // Set per-request — never part of the cached body, which is shared across viewers.
  is_superadmin: boolean;
  certifications: Array<{
    id: string;
    label: string;
    total_items: number;
    engineers_started: number;   // ≥1 item done
    engineers_ready: number;     // ALL required items done
  }>;
  engineers: Array<{
    username: string;
    display_name?: string;
    current_level: string;
    completion_pct: number;
    last_active: string;
    competency?: string;
    disabled?: boolean;
    certifications: Record<string, { done: number; total: number; pct: number; ready: boolean }>;
  }>;
}

const STALLED_DAYS = 14;

function currentLevel(progress: ProgressFile, path: ResolvedCurriculum): string {
  for (const lvl of path.levels) {
    const allDone = lvl.tasks.every((t) => progress.tasks[t.id]?.done === true);
    if (!allDone) return lvl.id;
  }
  return path.levels[path.levels.length - 1].id;
}

function lastActive(progress: ProgressFile): string {
  const timestamps = Object.values(progress.tasks)
    .map((t) => t.at).filter((s): s is string => !!s);
  if (timestamps.length === 0) return progress.created_at;
  return timestamps.sort().slice(-1)[0];
}

export async function computeAggregate(
  cfg: RepoConfig,
  registry: CurriculumRegistry,
  fetchFn: typeof fetch,
  now: Date = new Date(),
  certRegistry: CertRegistry = EMPTY_CERT_REGISTRY,
): Promise<Aggregate> {
  const entries = await listDirectory(cfg, "progress", fetchFn);
  const progresses: ProgressFile[] = [];
  for (const e of entries) {
    const result = await readJsonFile<ProgressFile>(cfg, e.path, fetchFn);
    if (result) progresses.push(result.data);
  }

  const by_current_level: Record<string, number> = {};
  // by_task is keyed by globally-unique task ids (e.g. web-L1.T1), so paths never
  // collide. Keys are seeded lazily from each active engineer's own path.
  const by_task: Record<string, number> = {};
  let stalled_14d = 0;
  let engineers_started = 0;
  const engineers: Aggregate["engineers"] = [];

  const stallThresholdMs = STALLED_DAYS * 86_400_000;

  const certDefs = certRegistry.certList();
  const certAgg = certDefs.map((c) => ({
    id: c.id, label: c.label, total_items: c.requiredItemIds.length,
    engineers_started: 0, engineers_ready: 0,
  }));

  for (const p of progresses) {
    // Each engineer's progress is measured against THEIR competency's path. An engineer
    // with no/unknown competency has no path yet: current level L1, 0% complete.
    const path = registry.pathFor(p.competency);
    const pathTaskIds = path ? path.levels.flatMap((l) => l.tasks.map((t) => t.id)) : [];
    const totalTasks = pathTaskIds.length;
    const cl = path ? currentLevel(p, path) : "L1";
    const la = lastActive(p);
    const done = pathTaskIds.filter((id) => p.tasks[id]?.done).length;
    // Disabled engineers are still surfaced in the list (behind a dashboard filter)
    // but are excluded from every headline count so they don't skew adoption stats.
    if (!p.disabled) {
      engineers_started += 1;
      by_current_level[cl] = (by_current_level[cl] ?? 0) + 1;
      for (const id of pathTaskIds) {
        by_task[id] = (by_task[id] ?? 0) + (p.tasks[id]?.done ? 1 : 0);
      }
      if (now.getTime() - new Date(la).getTime() > stallThresholdMs) stalled_14d += 1;
    }
    const certProgress: Record<string, { done: number; total: number; pct: number; ready: boolean }> = {};
    for (let i = 0; i < certDefs.length; i++) {
      const def = certDefs[i];
      const total = def.requiredItemIds.length;
      const doneCount = def.requiredItemIds.filter((id) => p.tasks[id]?.done).length;
      const ready = total > 0 && doneCount === total;
      certProgress[def.id] = { done: doneCount, total, pct: total ? doneCount / total : 0, ready };
      // Disabled engineers are excluded from headline cert counts, as elsewhere.
      if (!p.disabled) {
        if (doneCount > 0) certAgg[i].engineers_started += 1;
        if (ready) certAgg[i].engineers_ready += 1;
      }
    }
    engineers.push({
      username: p.github_username,
      display_name: p.display_name,
      current_level: cl,
      completion_pct: totalTasks ? done / totalTasks : 0,
      last_active: la,
      competency: p.competency,
      disabled: p.disabled,
      certifications: certProgress,
    });
  }

  return {
    as_of: now.toISOString(),
    engineers_started,
    by_current_level,
    by_task,
    stalled_14d,
    is_superadmin: false, // overwritten per-request in handleApiAggregate (not cached)
    certifications: certAgg,
    engineers,
  };
}

import type { Env } from "./index";
import { verifySession, tokenFromRequest } from "./session";
import { isSuperAdmin } from "./api";

// Bump when the aggregate's shape changes so a deploy invalidates stale entries
// immediately (v2 adds per-engineer `competency`; v3 adds per-engineer `disabled`
// and excludes disabled engineers from the headline counts; v4 makes completion /
// current-level per the engineer's own competency path and keys by_task by the
// globally-unique prefixed task ids; v5 adds per-cert readiness + per-engineer
// cert progress; v6 counts cert readiness against required (non-optional) items only).
export const CACHE_KEY = "aggregate-v6";
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
  registry: CurriculumRegistry,
  fetchFn: typeof fetch = fetch,
  certRegistry: CertRegistry = EMPTY_CERT_REGISTRY,
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
  const agg = await computeAggregate(cfg, registry, fetchFn, new Date(), certRegistry);
  const body = JSON.stringify(agg); // cached body carries is_superadmin:false; the viewer's value is stamped below
  if (env.AGGREGATE_CACHE) {
    await env.AGGREGATE_CACHE.put(CACHE_KEY, body, { expirationTtl: CACHE_TTL_SECONDS });
  }
  return withViewer(body, superadmin);
}
