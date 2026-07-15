import { listDirectory, readJsonFile, type RepoConfig } from "./github";
import type { ProgressFile } from "./types";
import type { ResolvedCurriculum } from "./curriculum";
import type { Env } from "./index";
import { verifySession, tokenFromRequest } from "./session";

// Structural registries (the ./curriculum and ./certifications modules satisfy these;
// tests pass fakes) — mirrors aggregate.ts.
interface CurriculumRegistry {
  pathFor(competencyId?: string): ResolvedCurriculum | null;
}
interface CertRegistry {
  certList(): Array<{ id: string; label: string; itemIds: string[]; requiredItemIds: string[] }>;
}
const EMPTY_CERT_REGISTRY: CertRegistry = { certList: () => [] };

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export interface Wall {
  as_of: string;
  cards: {
    on_a_roll: Array<{ username: string; display_name?: string; count: number }>;
    leveled_up: Array<{ username: string; display_name?: string; level: string }>;
    cert_ready: Array<{ username: string; display_name?: string; cert_id: string; cert_label: string }>;
    longest_streak: Array<{ username: string; display_name?: string; weeks: number }>;
    just_started: Array<{ username: string; display_name?: string }>;
    welcome_back: Array<{ username: string; display_name?: string; weeks_away: number }>;
  };
}

// Monday-aligned week index (UTC). Consecutive calendar weeks differ by exactly 1.
// 1970-01-01 (epoch day 0) was a Thursday, so +3 shifts the boundary to Monday.
export function weekIndex(d: Date): number {
  const days = Math.floor(d.getTime() / DAY_MS);
  return Math.floor((days + 3) / 7);
}

// Length of the current consecutive-weeks run: anchored at the current week, or one
// grace week before (streak alive but not yet extended this week). 0 if neither is active.
export function currentStreak(weeks: Set<number>, now: Date): number {
  const cw = weekIndex(now);
  let anchor: number;
  if (weeks.has(cw)) anchor = cw;
  else if (weeks.has(cw - 1)) anchor = cw - 1;
  else return 0;
  let n = 0;
  for (let w = anchor; weeks.has(w); w--) n++;
  return n;
}

// Ascending completion timestamps (ms) for a progress file; tasks without a valid `at`
// are dropped (never crash).
function doneTimestamps(p: ProgressFile): number[] {
  return Object.values(p.tasks)
    .filter((t) => t.done && t.at)
    .map((t) => Date.parse(t.at as string))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
}

export async function computeWall(
  cfg: RepoConfig,
  registry: CurriculumRegistry,
  fetchFn: typeof fetch = fetch,
  now: Date = new Date(),
  certRegistry: CertRegistry = EMPTY_CERT_REGISTRY,
): Promise<Wall> {
  const entries = await listDirectory(cfg, "progress", fetchFn);
  const progresses: ProgressFile[] = [];
  for (const e of entries) {
    const r = await readJsonFile<ProgressFile>(cfg, e.path, fetchFn);
    if (r) progresses.push(r.data);
  }

  const nowMs = now.getTime();
  const within7d = (t: number) => t <= nowMs && nowMs - t <= WEEK_MS;
  const certDefs = certRegistry.certList();

  const onARoll: Wall["cards"]["on_a_roll"] = [];
  const leveledUp: Array<{ username: string; display_name?: string; level: string; _t: number }> = [];
  const certReady: Array<{ username: string; display_name?: string; cert_id: string; cert_label: string; _t: number }> = [];
  const longestStreak: Wall["cards"]["longest_streak"] = [];
  const justStarted: Array<{ username: string; display_name?: string; _t: number }> = [];
  const welcomeBack: Array<{ username: string; display_name?: string; weeks_away: number; _t: number }> = [];

  for (const p of progresses) {
    if (p.disabled) continue;
    const username = p.github_username;
    const display_name = p.display_name;
    const ts = doneTimestamps(p);
    if (ts.length === 0) continue;

    // on_a_roll — tasks completed in the last 7 days
    const recentCount = ts.filter(within7d).length;
    if (recentCount > 0) onARoll.push({ username, display_name, count: recentCount });

    // leveled_up — a whole level finished within 7 days (dated by its last task)
    const path = registry.pathFor(p.competency);
    if (path) {
      for (const lvl of path.levels) {
        const ids = lvl.tasks.map((t) => t.id);
        if (ids.length === 0 || !ids.every((id) => p.tasks[id]?.done)) continue;
        const times = ids.map((id) => Date.parse(p.tasks[id]?.at ?? ""));
        if (times.some((n) => Number.isNaN(n))) continue;
        const completedAt = Math.max(...times);
        if (within7d(completedAt)) leveledUp.push({ username, display_name, level: lvl.id, _t: completedAt });
      }
    }

    // cert_ready — all required items of a cert done within 7 days
    for (const c of certDefs) {
      const req = c.requiredItemIds;
      if (req.length === 0 || !req.every((id) => p.tasks[id]?.done)) continue;
      const times = req.map((id) => Date.parse(p.tasks[id]?.at ?? ""));
      if (times.some((n) => Number.isNaN(n))) continue;
      const readyAt = Math.max(...times);
      if (within7d(readyAt)) certReady.push({ username, display_name, cert_id: c.id, cert_label: c.label, _t: readyAt });
    }

    // longest_streak — current consecutive-weeks run (>= 2)
    const weeks = new Set(ts.map((t) => weekIndex(new Date(t))));
    const streak = currentStreak(weeks, now);
    if (streak >= 2) longestStreak.push({ username, display_name, weeks: streak });

    // just_started — first-ever activity within the last 7 days
    if (within7d(ts[0])) justStarted.push({ username, display_name, _t: ts[0] });

    // welcome_back — activity in the last 7 days after a >= 14-day gap
    const recent = ts.filter(within7d);
    if (recent.length > 0) {
      const recentStart = recent[0];
      let prior: number | undefined;
      for (const t of ts) { if (t < recentStart) prior = t; else break; }
      if (prior !== undefined && recentStart - prior >= 2 * WEEK_MS) {
        welcomeBack.push({ username, display_name, weeks_away: Math.floor((recentStart - prior) / WEEK_MS), _t: recentStart });
      }
    }
  }

  const CAP = 8;
  const strip = <T extends { _t: number }>(arr: T[]) =>
    arr.sort((a, b) => b._t - a._t).slice(0, CAP).map(({ _t, ...rest }) => rest);

  return {
    as_of: now.toISOString(),
    cards: {
      on_a_roll: onARoll.sort((a, b) => b.count - a.count).slice(0, CAP),
      leveled_up: strip(leveledUp),
      cert_ready: strip(certReady),
      longest_streak: longestStreak.sort((a, b) => b.weeks - a.weeks).slice(0, CAP),
      just_started: strip(justStarted),
      welcome_back: strip(welcomeBack),
    },
  };
}

export const WALL_CACHE_KEY = "wall-v1";
const WALL_CACHE_TTL_SECONDS = 300;

// The wall is for any signed-in engineer (NOT admin-gated). The payload is identical
// for every viewer, so the cached body is returned verbatim (unlike the aggregate,
// which stamps a per-viewer is_superadmin). Degrades gracefully without KV.
export async function handleApiWall(
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

  if (env.AGGREGATE_CACHE) {
    const cached = await env.AGGREGATE_CACHE.get(WALL_CACHE_KEY);
    if (cached) return new Response(cached, { headers: { "content-type": "application/json" } });
  }
  const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  const wall = await computeWall(cfg, registry, fetchFn, new Date(), certRegistry);
  const body = JSON.stringify(wall);
  if (env.AGGREGATE_CACHE) {
    await env.AGGREGATE_CACHE.put(WALL_CACHE_KEY, body, { expirationTtl: WALL_CACHE_TTL_SECONDS });
  }
  return new Response(body, { headers: { "content-type": "application/json" } });
}
