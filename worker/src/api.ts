import type { Env } from "./index";
import { verifySession, tokenFromRequest } from "./session";
import { readJsonFile, writeJsonFile, createIssue, deleteFile, listDirectory, type RepoConfig } from "./github";
import { CACHE_KEY } from "./aggregate";
import * as curriculum from "./curriculum";
import * as certifications from "./certifications";
import type { ProgressFile } from "./types";

/** Just the slice of the curriculum the competency endpoints need to validate ids. */
interface CompetencyTaxonomy {
  competencies?: Array<{ id: string; label: string }>;
}

interface Session { username: string; displayName?: string; }

async function requireSession(request: Request, env: Env): Promise<Session | Response> {
  const token = tokenFromRequest(request);
  if (!token) return new Response("unauthenticated", { status: 401 });
  const result = await verifySession(token, env.SESSION_SECRET);
  if (!result.valid || !result.username) return new Response("unauthenticated", { status: 401 });
  return { username: result.username, displayName: result.displayName };
}

function progressPath(username: string): string {
  return `progress/${username}.json`;
}

function emptyProgress(username: string, displayName?: string): ProgressFile {
  const now = new Date().toISOString();
  return { github_username: username, display_name: displayName, created_at: now, updated_at: now, tasks: {} };
}

/**
 * Stamp the engineer's GitHub display name onto their own progress file when it's
 * missing or stale. Returns true if it changed anything (so callers can decide to
 * persist). Only ever called with the *authenticated* engineer's own name — never an
 * admin's, so an admin override can't overwrite the target's name.
 */
function applyDisplayName(progress: ProgressFile, displayName?: string): boolean {
  if (!displayName || progress.display_name === displayName) return false;
  progress.display_name = displayName;
  return true;
}

export async function handleApiMe(
  request: Request,
  env: Env,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const auth = await requireSession(request, env);
  if (auth instanceof Response) return auth;
  const { username, displayName } = auth;
  // is_admin is a transient flag for the frontend (e.g. to surface the dashboard link);
  // it is derived from ADMIN_USERNAMES and never persisted to the progress file.
  const is_admin = isAdmin(username, env);
  const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  const existing = await readJsonFile<ProgressFile>(cfg, progressPath(username), fetchFn);
  if (!existing) {
    // No file yet — return a name-stamped empty without persisting (don't count
    // "logged in" as "started"; the file is created on first mark/competency).
    return Response.json({ ...emptyProgress(username, displayName), is_admin });
  }
  const progress = existing.data;
  // Backfill the display name into an existing file if GitHub now reports one (or it changed).
  if (applyDisplayName(progress, displayName)) {
    progress.updated_at = new Date().toISOString();
    try {
      await writeJsonFile(cfg, progressPath(username), progress, existing.sha, `progress(${username}): set display name`, fetchFn);
    } catch (e) {
      // Best-effort: a stale-SHA race here just means we backfill on the next request.
      console.warn(`display-name backfill skipped for ${username}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return Response.json({ ...progress, is_admin });
}

export async function handleApiMark(
  request: Request,
  env: Env,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const auth = await requireSession(request, env);
  if (auth instanceof Response) return auth;
  const { username, displayName } = auth;

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
    // A disabled engineer is locked out of all self-writes (defense-in-depth: the
    // frontend hides the UI, but a hand-crafted request must be rejected too).
    if (existing?.data.disabled) return Response.json({ error: "disabled" }, { status: 403 });
    const progress = existing?.data ?? emptyProgress(username, displayName);
    const now = new Date().toISOString();
    applyDisplayName(progress, displayName);
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

/**
 * POST /api/feedback — an engineer reports a bug or suggests an improvement. The
 * report is turned into a GitHub issue in the public code repo (separate repo + a
 * least-privilege FEEDBACK_PAT, distinct from the data repo's BOT_PAT). Per-task
 * feedback carries the task id; general feedback omits it. Returns the issue url.
 */
export async function handleApiFeedback(
  request: Request,
  env: Env,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const auth = await requireSession(request, env);
  if (auth instanceof Response) return auth;
  const { username, displayName } = auth;

  let body: { type?: unknown; message?: unknown; task_id?: unknown };
  try { body = await request.json(); } catch { return new Response("invalid json", { status: 400 }); }

  const type = body.type;
  if (type !== "bug" && type !== "improvement") return new Response("invalid body", { status: 400 });
  if (typeof body.message !== "string") return new Response("invalid body", { status: 400 });
  const message = body.message.trim();
  if (message.length < 1 || message.length > 2000) return new Response("invalid body", { status: 400 });
  // A scoped id may be a curriculum task or a certification prep item — try both.
  // `enrichLine` becomes the issue's task/item detail line for whichever matched.
  let taskId: string | undefined;
  let enrichLine: string | undefined;
  if (body.task_id !== undefined) {
    if (typeof body.task_id !== "string" || body.task_id.length > 32) return new Response("invalid body", { status: 400 });
    const taskInfo = curriculum.taskInfo(body.task_id);
    const certItem = taskInfo ? null : certifications.certItemInfo(body.task_id);
    if (!taskInfo && !certItem) return new Response("invalid body", { status: 400 });
    taskId = body.task_id;
    enrichLine = taskInfo
      ? `**Task:** ${taskId} — ${taskInfo.title} (Level ${taskInfo.level.slice(1)})`
      : `**Certification:** ${certItem!.certLabel}\n**Item:** ${taskId} — ${certItem!.title} (${certItem!.sectionTitle})`;
  }

  // Read the submitter's own progress (data repo / BOT_PAT) for the disabled-lock and
  // their competency. A disabled engineer is blocked from this self-write too.
  const dataCfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  const existing = await readJsonFile<ProgressFile>(dataCfg, progressPath(username), fetchFn);
  if (existing?.data.disabled) return Response.json({ error: "disabled" }, { status: 403 });
  const competency = existing?.data.competency;

  // Build the issue. The [type] prefix carries the type even without labels; the
  // single `feedback` label must pre-exist in the repo (GitHub rejects unknown labels).
  const oneLine = message.replace(/\s+/g, " ");
  const summary = oneLine.length > 60 ? oneLine.slice(0, 60) + "…" : oneLine;
  const title = `[${type}] ${taskId ? taskId + " — " : ""}${summary}`;
  const compLabel = competency ? (curriculum.competencyLabel(competency) ?? competency) : "—";
  const lines = [
    `**Type:** ${type}`,
    `**From:** @${username} (${displayName || username})`,
    `**Competency:** ${compLabel}`,
  ];
  if (enrichLine) lines.push(enrichLine);
  lines.push(`**Page:** ${request.headers.get("referer") || "—"}`);
  lines.push(`**Submitted:** ${new Date().toISOString()}`);
  const issueBody = `${lines.join("\n")}\n\n---\n\n${message}`;

  const feedbackCfg = { owner: env.FEEDBACK_REPO_OWNER, repo: env.FEEDBACK_REPO_NAME, token: env.FEEDBACK_PAT };
  const assignees = parseList(env.FEEDBACK_ASSIGNEE);
  try {
    const { url } = await createIssue(
      feedbackCfg,
      { title, body: issueBody, labels: ["feedback"], assignees: assignees.length ? assignees : undefined },
      fetchFn,
    );
    return Response.json({ url });
  } catch (e) {
    const errStr = e instanceof Error ? e.message : String(e);
    console.error(`feedback failed: user=${username} type=${type} task=${taskId ?? "-"} err=${errStr.slice(0, 300)}`);
    throw e;
  }
}

function parseList(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function isSuperAdmin(username: string, env: Env): boolean {
  return parseList(env.SUPERADMIN_USERNAMES).includes(username);
}

// Super admins are a superset of admins — they see everything an admin sees,
// plus the disable/enable controls. So the admin check accepts either list.
function isAdmin(username: string, env: Env): boolean {
  return parseList(env.ADMIN_USERNAMES).includes(username) || isSuperAdmin(username, env);
}

export async function handleApiUser(
  request: Request,
  env: Env,
  fetchFn: typeof fetch,
  targetUsername: string,
): Promise<Response> {
  const auth = await requireSession(request, env);
  if (auth instanceof Response) return auth;
  if (!isAdmin(auth.username, env)) return new Response("forbidden", { status: 403 });

  const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  const existing = await readJsonFile<ProgressFile>(cfg, progressPath(targetUsername), fetchFn);
  return Response.json(existing?.data ?? emptyProgress(targetUsername));
}

/**
 * Validate a single competency against the curriculum taxonomy. This is the ONLY
 * enforcement point for competency ids — the progress repo is not schema-checked.
 * An engineer has at most ONE competency. Returns `{ value }` where value is the id,
 * or `undefined` to clear the competency; returns null if the input is invalid.
 */
function validateCompetency(input: unknown, validIds: Set<string>): { value: string | undefined } | null {
  if (input === undefined || input === null || input === "") return { value: undefined }; // clear
  if (typeof input === "string" && validIds.has(input)) return { value: input };
  return null; // unknown id or wrong type
}

/**
 * Read-modify-write an engineer's competency with the same optimistic-concurrency
 * retry as handleApiMark (re-read fresh SHA, re-apply, retry up to 4× on 409).
 */
async function writeCompetency(
  cfg: RepoConfig,
  targetUsername: string,
  competency: string | undefined,
  setBy: string,
  fetchFn: typeof fetch,
  selfDisplayName?: string,
): Promise<ProgressFile> {
  const msg = `competency(${targetUsername}) set by ${setBy}`;
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const existing = await readJsonFile<ProgressFile>(cfg, progressPath(targetUsername), fetchFn);
    const progress = existing?.data ?? emptyProgress(targetUsername, selfDisplayName);
    const now = new Date().toISOString();
    // selfDisplayName is only passed on the self path (target === caller), so an admin
    // override never stamps the admin's name onto the target.
    applyDisplayName(progress, selfDisplayName);
    if (competency === undefined) delete progress.competency;
    else progress.competency = competency;
    progress.competency_set_by = setBy;
    progress.competency_updated_at = now;
    progress.updated_at = now;
    try {
      await writeJsonFile(cfg, progressPath(targetUsername), progress, existing?.sha ?? null, msg, fetchFn);
      return progress;
    } catch (e) {
      const errStr = e instanceof Error ? e.message : String(e);
      const isConflict = errStr.includes("writeJsonFile 409");
      if (!isConflict || attempt === MAX_ATTEMPTS) {
        console.error(`competency write failed: target=${targetUsername} attempt=${attempt}/${MAX_ATTEMPTS} conflict=${isConflict} err=${errStr.slice(0, 300)}`);
        throw e;
      }
      console.warn(`competency 409 conflict: target=${targetUsername} attempt=${attempt}/${MAX_ATTEMPTS}, retrying`);
      await new Promise((r) => setTimeout(r, 50 * attempt));
    }
  }
  // Unreachable — loop either returns or throws.
  throw new Error("unreachable");
}

/**
 * Validate a unit-leader assignment. `null`/`undefined`/`""` clears it. Otherwise the
 * value must be a GitHub-username-shaped string (≤ 39 chars) that isn't the target
 * themselves (no self-lead). Not verified to be an existing engineer — the UI only
 * offers existing engineers, and we avoid a directory read on every write (mirrors how
 * competency validates against the bundled taxonomy only). Returns `{ value }` (value
 * = username or undefined to clear), or null if the input is invalid.
 */
function validateLeader(input: unknown, targetUsername: string): { value: string | undefined } | null {
  if (input === undefined || input === null || input === "") return { value: undefined };
  if (typeof input !== "string") return null;
  if (!/^[\w-]{1,39}$/.test(input)) return null;
  if (input === targetUsername) return null; // no self-lead
  return { value: input };
}

/**
 * Read-modify-write an engineer's unit_leader with the same optimistic-concurrency
 * retry as writeCompetency (re-read fresh SHA, re-apply, retry up to 4× on 409).
 * Admin-only path, so it never stamps a display name.
 */
async function writeUnitLeader(
  cfg: RepoConfig,
  targetUsername: string,
  leader: string | undefined,
  setBy: string,
  fetchFn: typeof fetch,
): Promise<ProgressFile> {
  const msg = `unit_leader(${targetUsername}) set by ${setBy}`;
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const existing = await readJsonFile<ProgressFile>(cfg, progressPath(targetUsername), fetchFn);
    const progress = existing?.data ?? emptyProgress(targetUsername);
    const now = new Date().toISOString();
    if (leader === undefined) delete progress.unit_leader;
    else progress.unit_leader = leader;
    progress.unit_leader_set_by = setBy;
    progress.unit_leader_updated_at = now;
    progress.updated_at = now;
    try {
      await writeJsonFile(cfg, progressPath(targetUsername), progress, existing?.sha ?? null, msg, fetchFn);
      return progress;
    } catch (e) {
      const errStr = e instanceof Error ? e.message : String(e);
      const isConflict = errStr.includes("writeJsonFile 409");
      if (!isConflict || attempt === MAX_ATTEMPTS) {
        console.error(`unit_leader write failed: target=${targetUsername} attempt=${attempt}/${MAX_ATTEMPTS} conflict=${isConflict} err=${errStr.slice(0, 300)}`);
        throw e;
      }
      console.warn(`unit_leader 409 conflict: target=${targetUsername} attempt=${attempt}/${MAX_ATTEMPTS}, retrying`);
      await new Promise((r) => setTimeout(r, 50 * attempt));
    }
  }
  // Unreachable — loop either returns or throws.
  throw new Error("unreachable");
}

/** POST /api/competencies — an engineer sets their own competency (single, or clears it). */
export async function handleApiCompetencies(
  request: Request,
  env: Env,
  curriculum: CompetencyTaxonomy,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const auth = await requireSession(request, env);
  if (auth instanceof Response) return auth;
  const { username, displayName } = auth;

  let body: { competency?: unknown };
  try { body = await request.json(); } catch { return new Response("invalid json", { status: 400 }); }
  const validIds = new Set((curriculum.competencies ?? []).map((c) => c.id));
  const parsed = validateCompetency(body.competency, validIds);
  if (parsed === null) return new Response("invalid body", { status: 400 });

  const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  // A disabled engineer is locked out of self-writes (the admin override path below
  // is intentionally NOT blocked, so admins can still manage a disabled engineer).
  const existing = await readJsonFile<ProgressFile>(cfg, progressPath(username), fetchFn);
  if (existing?.data.disabled) return Response.json({ error: "disabled" }, { status: 403 });
  const progress = await writeCompetency(cfg, username, parsed.value, username, fetchFn, displayName);
  await env.AGGREGATE_CACHE?.delete(CACHE_KEY); // so the dashboard reflects the change on next load
  return Response.json(progress);
}

/** POST /api/user/{username}/competencies — an admin overrides an engineer's competency. */
export async function handleApiUserCompetencies(
  request: Request,
  env: Env,
  curriculum: CompetencyTaxonomy,
  fetchFn: typeof fetch,
  targetUsername: string,
): Promise<Response> {
  const auth = await requireSession(request, env);
  if (auth instanceof Response) return auth;
  if (!isAdmin(auth.username, env)) return new Response("forbidden", { status: 403 });

  let body: { competency?: unknown };
  try { body = await request.json(); } catch { return new Response("invalid json", { status: 400 }); }
  const validIds = new Set((curriculum.competencies ?? []).map((c) => c.id));
  const parsed = validateCompetency(body.competency, validIds);
  if (parsed === null) return new Response("invalid body", { status: 400 });

  const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  const progress = await writeCompetency(cfg, targetUsername, parsed.value, auth.username, fetchFn);
  await env.AGGREGATE_CACHE?.delete(CACHE_KEY); // so the dashboard reflects the change on next load
  return Response.json(progress);
}

/** POST /api/user/{username}/leader — an admin sets or clears an engineer's unit leader. */
export async function handleApiUserLeader(
  request: Request,
  env: Env,
  fetchFn: typeof fetch,
  targetUsername: string,
): Promise<Response> {
  const auth = await requireSession(request, env);
  if (auth instanceof Response) return auth;
  if (!isAdmin(auth.username, env)) return new Response("forbidden", { status: 403 });

  let body: { leader?: unknown };
  try { body = await request.json(); } catch { return new Response("invalid json", { status: 400 }); }
  const parsed = validateLeader(body.leader, targetUsername);
  if (parsed === null) return new Response("invalid body", { status: 400 });

  const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  const progress = await writeUnitLeader(cfg, targetUsername, parsed.value, auth.username, fetchFn);
  await env.AGGREGATE_CACHE?.delete(CACHE_KEY); // so the dashboard reflects the change on next load
  return Response.json(progress);
}

/**
 * POST /api/user/{username}/disabled — a super admin soft-disables (or re-enables)
 * an engineer. The progress file stays in place (never moved/deleted) so it can be
 * inspected later; we just flip the `disabled` flag and stamp who/when. Same 409
 * optimistic-concurrency retry as the other write paths.
 */
export async function handleApiUserDisabled(
  request: Request,
  env: Env,
  fetchFn: typeof fetch,
  targetUsername: string,
): Promise<Response> {
  const auth = await requireSession(request, env);
  if (auth instanceof Response) return auth;
  if (!isSuperAdmin(auth.username, env)) return new Response("forbidden", { status: 403 });

  let body: { disabled?: unknown };
  try { body = await request.json(); } catch { return new Response("invalid json", { status: 400 }); }
  if (typeof body.disabled !== "boolean") return new Response("invalid body", { status: 400 });
  const disabled = body.disabled;

  const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  const msg = `disabled(${targetUsername})=${disabled} set by ${auth.username}`;
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const existing = await readJsonFile<ProgressFile>(cfg, progressPath(targetUsername), fetchFn);
    // Can only disable an engineer who exists in the data — i.e. who appears on the
    // dashboard. There's nothing to disable for someone who never started.
    if (!existing) return new Response("no such engineer", { status: 404 });
    const progress = existing.data;
    const now = new Date().toISOString();
    progress.disabled = disabled;
    progress.disabled_by = auth.username;
    progress.disabled_at = now;
    progress.updated_at = now;
    try {
      await writeJsonFile(cfg, progressPath(targetUsername), progress, existing.sha, msg, fetchFn);
      await env.AGGREGATE_CACHE?.delete(CACHE_KEY); // so the dashboard reflects the change on next load
      return Response.json(progress);
    } catch (e) {
      const errStr = e instanceof Error ? e.message : String(e);
      const isConflict = errStr.includes("writeJsonFile 409");
      if (!isConflict || attempt === MAX_ATTEMPTS) {
        console.error(`disabled write failed: target=${targetUsername} attempt=${attempt}/${MAX_ATTEMPTS} conflict=${isConflict} err=${errStr.slice(0, 300)}`);
        throw e;
      }
      console.warn(`disabled 409 conflict: target=${targetUsername} attempt=${attempt}/${MAX_ATTEMPTS}, retrying`);
      await new Promise((r) => setTimeout(r, 50 * attempt));
    }
  }
  // Unreachable — loop either returns or throws.
  throw new Error("unreachable");
}

/**
 * Deleting an engineer would otherwise leave a *dangling* unit_leader reference on
 * everyone that engineer led (their `unit_leader` still points at a username with no
 * file). That ghost then re-appears in the dashboard's unit-leader filter and export.
 * So before removing the file we scan `progress/` and clear `unit_leader` on every
 * engineer who pointed at the deleted user, stamping the acting super admin. Reuses
 * writeUnitLeader (with its own 409 retry). Returns the usernames cleared.
 */
async function clearDanglingLeader(
  cfg: RepoConfig,
  deletedUsername: string,
  setBy: string,
  fetchFn: typeof fetch,
): Promise<string[]> {
  const entries = await listDirectory(cfg, "progress", fetchFn);
  const cleared: string[] = [];
  for (const entry of entries) {
    const username = entry.name.replace(/\.json$/, "");
    if (username === deletedUsername) continue; // that file is being deleted anyway
    const file = await readJsonFile<ProgressFile>(cfg, entry.path, fetchFn);
    if (file?.data.unit_leader === deletedUsername) {
      await writeUnitLeader(cfg, username, undefined, setBy, fetchFn);
      cleared.push(username);
    }
  }
  return cleared;
}

/**
 * POST /api/user/{username}/delete — a super admin PERMANENTLY deletes an engineer's
 * progress file (hard delete, for data-hygiene / GDPR removal). Irreversible: only the
 * data repo's git history retains the content afterward. Distinct from disable, which
 * keeps the file. Same 409 optimistic-concurrency retry as the other write paths, since
 * a concurrent /api/mark could move the SHA between the read and the delete.
 */
export async function handleApiUserDelete(
  request: Request,
  env: Env,
  fetchFn: typeof fetch,
  targetUsername: string,
): Promise<Response> {
  const auth = await requireSession(request, env);
  if (auth instanceof Response) return auth;
  if (!isSuperAdmin(auth.username, env)) return new Response("forbidden", { status: 403 });
  // Deleting yourself mid-session leaves a confusing half-state and is almost always a
  // mistake. Admin rights live in config, not the progress file, so there's no need to
  // protect the admin tier otherwise.
  if (targetUsername === auth.username) return new Response("cannot delete yourself", { status: 403 });

  const cfg = { owner: env.DATA_REPO_OWNER, repo: env.DATA_REPO_NAME, token: env.BOT_PAT };
  // Nothing to delete for someone who never started.
  const existing = await readJsonFile<ProgressFile>(cfg, progressPath(targetUsername), fetchFn);
  if (!existing) return new Response("no such engineer", { status: 404 });

  // Clear dangling unit_leader references FIRST. If this throws, the target file is
  // still present, so the operation is safely retryable (clearing is idempotent) rather
  // than leaving orphaned reports behind.
  const unassigned = await clearDanglingLeader(cfg, targetUsername, auth.username, fetchFn);

  const msg = `delete(${targetUsername}) by ${auth.username}`;
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // attempt 1 reuses the read above; later attempts re-read for a fresh SHA.
    const cur = attempt === 1 ? existing : await readJsonFile<ProgressFile>(cfg, progressPath(targetUsername), fetchFn);
    // A racing delete already removed it — treat as done.
    if (!cur) { await env.AGGREGATE_CACHE?.delete(CACHE_KEY); return Response.json({ deleted: true, username: targetUsername, unassigned }); }
    try {
      await deleteFile(cfg, progressPath(targetUsername), cur.sha, msg, fetchFn);
      await env.AGGREGATE_CACHE?.delete(CACHE_KEY); // so the dashboard drops the row on next load
      return Response.json({ deleted: true, username: targetUsername, unassigned });
    } catch (e) {
      const errStr = e instanceof Error ? e.message : String(e);
      const isConflict = errStr.includes("deleteFile 409");
      if (!isConflict || attempt === MAX_ATTEMPTS) {
        console.error(`delete failed: target=${targetUsername} attempt=${attempt}/${MAX_ATTEMPTS} conflict=${isConflict} err=${errStr.slice(0, 300)}`);
        throw e;
      }
      console.warn(`delete 409 conflict: target=${targetUsername} attempt=${attempt}/${MAX_ATTEMPTS}, retrying`);
      await new Promise((r) => setTimeout(r, 50 * attempt));
    }
  }
  // Unreachable — loop either returns or throws.
  throw new Error("unreachable");
}
