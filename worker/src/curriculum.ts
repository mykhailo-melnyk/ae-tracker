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
  tasks: Array<{ id: string }>;
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

export const MANIFEST = manifest;

export function competencyIds(): string[] {
  return manifest.competencies.map((c) => c.id);
}

/** Resolve an engineer's path by competency id. Returns null for none/unknown. */
export function pathFor(competencyId?: string): ResolvedCurriculum | null {
  if (!competencyId) return null;
  return PATHS[competencyId] ?? null;
}
