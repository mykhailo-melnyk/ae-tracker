import { describe, it, expect } from "vitest";
import { certList, certLabel } from "../src/certifications";

describe("certifications registry", () => {
  it("lists Claude Code with flattened item ids and required-only subset", () => {
    const list = certList();
    const cc = list.find((c) => c.id === "claude-code");
    expect(cc).toBeTruthy();
    expect(cc!.label).toBe("Claude Code");
    // ids exist under the new structure
    expect(cc!.itemIds).toContain("cc.d1.1");
    expect(cc!.itemIds).toContain("cc.exam.2");
    expect(cc!.itemIds).toContain("cc.start.3"); // the optional course
    // the optional course is in itemIds but excluded from requiredItemIds
    expect(cc!.requiredItemIds).toContain("cc.d1.1");
    expect(cc!.requiredItemIds).not.toContain("cc.start.3");
    expect(cc!.requiredItemIds.length).toBe(cc!.itemIds.length - 1);
    // ids are unique
    expect(new Set(cc!.itemIds).size).toBe(cc!.itemIds.length);
  });

  it("resolves a cert label", () => {
    expect(certLabel("claude-code")).toBe("Claude Code");
    expect(certLabel("nope")).toBeUndefined();
  });
});
