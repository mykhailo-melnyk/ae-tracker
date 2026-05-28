// worker/test/github.test.ts
import { describe, it, expect } from "vitest";
import { readJsonFile } from "../src/github";

const cfg = { owner: "mykhailo-melnyk", repo: "ae-tracker-data", token: "tok" };

describe("readJsonFile", () => {
  it("returns parsed JSON and sha when file exists", async () => {
    const fetchMock = (async () => new Response(JSON.stringify({
      sha: "sha-1234",
      content: btoa('{"hello":"world"}'),
      encoding: "base64",
    }), { headers: { "content-type": "application/json" } })) as typeof fetch;

    const result = await readJsonFile(cfg, "progress/mykhailo-melnyk.json", fetchMock);
    expect(result).toEqual({ sha: "sha-1234", data: { hello: "world" } });
  });

  it("returns null when file does not exist (404)", async () => {
    const fetchMock = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    const result = await readJsonFile(cfg, "progress/ghost.json", fetchMock);
    expect(result).toBeNull();
  });

  it("throws on other errors", async () => {
    const fetchMock = (async () => new Response("server error", { status: 500 })) as typeof fetch;
    await expect(readJsonFile(cfg, "progress/x.json", fetchMock)).rejects.toThrow();
  });
});
