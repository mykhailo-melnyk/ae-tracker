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
  requiredItemIds: string[];
}

interface PathFile {
  certification: string;
  sections: Array<{ id: string; title: string; items: Array<{ id: string; title: string; optional?: boolean }> }>;
}

const PATHS: Record<string, PathFile> = {};
for (const p of [claudeCodePath] as PathFile[]) {
  PATHS[p.certification] = p;
}

// Flat item lookup across every cert path file, for the feedback endpoint: validate a
// submitted cert item id and enrich the issue with its certification / section / title.
// Mirrors curriculum.ts's TASK_INDEX.
export interface CertItemInfo { certId: string; certLabel: string; sectionTitle: string; title: string; }
const ITEM_INDEX: Record<string, CertItemInfo> = {};
for (const p of [claudeCodePath] as PathFile[]) {
  for (const sec of p.sections) {
    for (const it of sec.items) {
      ITEM_INDEX[it.id] = {
        certId: p.certification,
        certLabel: certLabel(p.certification) ?? p.certification,
        sectionTitle: sec.title,
        title: it.title,
      };
    }
  }
}

/** A submitted cert item id's certification/section/title, or null if the id is unknown. */
export function certItemInfo(itemId: string): CertItemInfo | null {
  return ITEM_INDEX[itemId] ?? null;
}

const LIST: CertInfo[] = registry.certifications.map((c) => {
  const path = PATHS[c.id];
  const items = path ? path.sections.flatMap((s) => s.items) : [];
  const itemIds = items.map((it) => it.id);
  const requiredItemIds = items.filter((it) => it.optional !== true).map((it) => it.id);
  return { id: c.id, label: c.label, itemIds, requiredItemIds };
});

/** Every certification with its flattened prep-item ids. */
export function certList(): CertInfo[] {
  return LIST;
}

/** Human label for a cert id, or undefined if unknown. */
export function certLabel(id: string): string | undefined {
  return registry.certifications.find((c) => c.id === id)?.label;
}
