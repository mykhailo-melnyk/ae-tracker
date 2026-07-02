// Certification registry: the registry (cert list) and every per-cert prep path file,
// statically imported and flattened to item ids for the aggregate.
//
// Adding a NEW certification = add its path file, a registry entry, AND an import here,
// then redeploy the worker. Editing items within an existing cert = edit that JSON file
// + redeploy (the aggregate reads item ids from here).
import registry from "../../public/certifications.json";
import claudeCodePath from "../../public/certification.claude-code.json";

export interface CertInfo {
  id: string;
  label: string;
  itemIds: string[];
}

interface PathFile {
  certification: string;
  sections: Array<{ id: string; items: Array<{ id: string }> }>;
}

const PATHS: Record<string, PathFile> = {};
for (const p of [claudeCodePath] as PathFile[]) {
  PATHS[p.certification] = p;
}

const LIST: CertInfo[] = registry.certifications.map((c) => {
  const path = PATHS[c.id];
  const itemIds = path ? path.sections.flatMap((s) => s.items.map((it) => it.id)) : [];
  return { id: c.id, label: c.label, itemIds };
});

/** Every certification with its flattened prep-item ids. */
export function certList(): CertInfo[] {
  return LIST;
}

/** Human label for a cert id, or undefined if unknown. */
export function certLabel(id: string): string | undefined {
  return registry.certifications.find((c) => c.id === id)?.label;
}
