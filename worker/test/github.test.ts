// worker/test/github.test.ts
import { describe, it, expect } from "vitest";
import { readJsonFile, writeJsonFile, listDirectory, createIssue } from "../src/github";

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

  it("retries transient GitHub errors (502) and succeeds", async () => {
    let calls = 0;
    const fetchMock = (async () => {
      calls++;
      if (calls < 3) return new Response("error code: 502\n", { status: 502 });
      return new Response(JSON.stringify({
        sha: "sha-ok", content: btoa('{"hello":"world"}'), encoding: "base64",
      }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const result = await readJsonFile(cfg, "progress/flaky.json", fetchMock);
    expect(calls).toBe(3);
    expect(result).toEqual({ sha: "sha-ok", data: { hello: "world" } });
  });

  it("gives up after repeated transient errors and throws", async () => {
    let calls = 0;
    const fetchMock = (async () => { calls++; return new Response("error code: 502\n", { status: 502 }); }) as typeof fetch;
    await expect(readJsonFile(cfg, "progress/down.json", fetchMock)).rejects.toThrow("readJsonFile 502");
    expect(calls).toBe(4); // MAX_GET_ATTEMPTS
  });
});

describe("writeJsonFile", () => {
  it("PUTs content with the SHA when updating", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchMock = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ content: { sha: "new-sha" } }), { status: 200 });
    }) as typeof fetch;

    await writeJsonFile(cfg, "progress/mykhailo-melnyk.json", { tasks: {} }, "old-sha", "msg", fetchMock);

    expect(captured!.init.method).toBe("PUT");
    const body = JSON.parse(captured!.init.body as string);
    expect(body.sha).toBe("old-sha");
    expect(body.message).toBe("msg");
    const decoded = atob(body.content);
    expect(JSON.parse(decoded)).toEqual({ tasks: {} });
  });

  it("omits SHA when creating a new file", async () => {
    let capturedBody: any = null;
    const fetchMock = (async (url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ content: { sha: "new-sha" } }), { status: 201 });
    }) as typeof fetch;

    await writeJsonFile(cfg, "progress/new.json", { tasks: {} }, null, "create", fetchMock);

    expect(capturedBody.sha).toBeUndefined();
  });
});

describe("createIssue", () => {
  const repoCfg = { owner: "mykhailo-melnyk", repo: "ae-tracker", token: "feedback-tok" };

  it("POSTs the issue and returns the html_url", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchMock = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return new Response(JSON.stringify({ html_url: "https://github.com/mykhailo-melnyk/ae-tracker/issues/7" }), { status: 201 });
    }) as typeof fetch;

    const result = await createIssue(
      repoCfg,
      { title: "[bug] web-L1.T1 — broken link", body: "details", labels: ["feedback"] },
      fetchMock,
    );

    expect(result).toEqual({ url: "https://github.com/mykhailo-melnyk/ae-tracker/issues/7" });
    expect(captured!.url).toBe("https://api.github.com/repos/mykhailo-melnyk/ae-tracker/issues");
    expect(captured!.init.method).toBe("POST");
    expect((captured!.init.headers as Record<string, string>).authorization).toBe("Bearer feedback-tok");
    const body = JSON.parse(captured!.init.body as string);
    expect(body).toEqual({ title: "[bug] web-L1.T1 — broken link", body: "details", labels: ["feedback"] });
  });

  it("throws when GitHub rejects the issue (e.g. unknown label)", async () => {
    const fetchMock = (async () => new Response("Validation Failed", { status: 422 })) as typeof fetch;
    await expect(
      createIssue(repoCfg, { title: "t", body: "b", labels: ["nope"] }, fetchMock),
    ).rejects.toThrow("createIssue 422");
  });
});

describe("listDirectory", () => {
  it("returns file names with .json suffix only", async () => {
    const fetchMock = (async () => new Response(JSON.stringify([
      { name: "mykhailo-melnyk.json", type: "file", path: "progress/mykhailo-melnyk.json" },
      { name: "anna.json", type: "file", path: "progress/anna.json" },
      { name: "README.md", type: "file", path: "progress/README.md" },
      { name: "subdir", type: "dir", path: "progress/subdir" },
    ]), { headers: { "content-type": "application/json" } })) as typeof fetch;

    const result = await listDirectory(cfg, "progress", fetchMock);
    expect(result.map((f) => f.name).sort()).toEqual(["anna.json", "mykhailo-melnyk.json"]);
  });

  it("returns empty array when directory does not exist (404)", async () => {
    const fetchMock = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    const result = await listDirectory(cfg, "progress", fetchMock);
    expect(result).toEqual([]);
  });
});
