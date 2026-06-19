import { describe, it, expect } from "vitest";
import { MANIFEST, competencyIds, pathFor } from "../src/curriculum";

// These exercise the REAL JSON imports (manifest + path files), which the aggregate
// tests stub out — so this is the guard that the files load and stay consistent.
describe("curriculum registry", () => {
  it("exposes every manifest competency", () => {
    const ids = competencyIds();
    expect(ids).toEqual(MANIFEST.competencies.map((c) => c.id));
    expect(ids).toContain("web");
  });

  it("resolves a path of 5 levels for each competency, with correctly-prefixed task ids", () => {
    for (const id of competencyIds()) {
      const path = pathFor(id);
      expect(path, id).not.toBeNull();
      expect(path!.levels).toHaveLength(5);
      for (const lvl of path!.levels) {
        expect(lvl.tasks.length).toBeGreaterThan(0);
        for (const t of lvl.tasks) {
          expect(t.id.startsWith(id + "-"), t.id).toBe(true);
        }
      }
    }
  });

  it("returns null for no/unknown competency", () => {
    expect(pathFor(undefined)).toBeNull();
    expect(pathFor("")).toBeNull();
    expect(pathFor("nonsense")).toBeNull();
  });

  it("keeps task ids globally unique across competencies", () => {
    const all = competencyIds().flatMap((id) => pathFor(id)!.levels.flatMap((l) => l.tasks.map((t) => t.id)));
    expect(new Set(all).size).toBe(all.length);
  });
});
