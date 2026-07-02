import { describe, it, expect } from "vitest";
import { certList, certLabel } from "../src/certifications";

describe("certifications registry", () => {
  it("lists Claude Code with flattened item ids", () => {
    const list = certList();
    const cc = list.find((c) => c.id === "claude-code");
    expect(cc).toBeTruthy();
    expect(cc!.label).toBe("Claude Code");
    expect(cc!.itemIds).toContain("cc.fund.1");
    expect(cc!.itemIds).toContain("cc.exam.3");
    // ids are unique
    expect(new Set(cc!.itemIds).size).toBe(cc!.itemIds.length);
  });

  it("resolves a cert label", () => {
    expect(certLabel("claude-code")).toBe("Claude Code");
    expect(certLabel("nope")).toBeUndefined();
  });
});
