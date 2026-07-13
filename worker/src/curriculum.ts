// Curriculum registry: the manifest (competency list + shared L1–L5 framework) and
// every per-competency path file, statically imported and resolved by competency.
//
// Adding a NEW competency = add its path file, a manifest entry, AND an import here,
// then redeploy the worker. Editing tasks within an existing competency = edit that
// JSON file + redeploy (the aggregate reads task ids from here, so it needs the worker
// to pick up the change — same as the curriculum import has always worked).
import manifest from "../../public/curriculum.json";
import webPath from "../../public/curriculum.web.json";
import mobilePath from "../../public/curriculum.mobile.json";
import backendPath from "../../public/curriculum.backend.json";

export interface LevelTasks {
  id: string;
  // `assessment` marks the level's assessment-launcher task (see /api/assessment), which is
  // excluded from that endpoint's "level complete" requirement.
  tasks: Array<{ id: string; assessment?: boolean }>;
}

// What the aggregate needs from a resolved path: the per-level task ids. Path files
// carry more (titles, links, hours) but this is the structural minimum.
export interface ResolvedCurriculum {
  levels: LevelTasks[];
}

interface PathFile {
  competency: string;
  levels: LevelTasks[];
}

const PATHS: Record<string, PathFile> = {};
for (const p of [webPath, mobilePath, backendPath] as PathFile[]) {
  PATHS[p.competency] = p;
}

// Flat task lookup across every path file, for the feedback endpoint: validate a
// submitted task id and enrich the issue with its competency / level / title.
export interface TaskInfo { competency: string; level: string; title: string; }
const TASK_INDEX: Record<string, TaskInfo> = {};
for (const p of [webPath, mobilePath, backendPath] as Array<{
  competency: string;
  levels: Array<{ id: string; tasks: Array<{ id: string; title: string }> }>;
}>) {
  for (const lvl of p.levels) {
    for (const t of lvl.tasks) {
      TASK_INDEX[t.id] = { competency: p.competency, level: lvl.id, title: t.title };
    }
  }
}

export const MANIFEST = manifest;

export function competencyIds(): string[] {
  return manifest.competencies.map((c) => c.id);
}

/** A submitted task id's competency/level/title, or null if the id is unknown. */
export function taskInfo(taskId: string): TaskInfo | null {
  return TASK_INDEX[taskId] ?? null;
}

/** Human label for a competency id (e.g. "web" → "Web"), or undefined if unknown. */
export function competencyLabel(id: string): string | undefined {
  return manifest.competencies.find((c) => c.id === id)?.label;
}

/** Resolve an engineer's path by competency id. Returns null for none/unknown. */
export function pathFor(competencyId?: string): ResolvedCurriculum | null {
  if (!competencyId) return null;
  return PATHS[competencyId] ?? null;
}
