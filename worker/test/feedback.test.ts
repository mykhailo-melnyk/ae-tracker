import { describe, it, expect } from "vitest";
import { handleApiFeedback } from "../src/api";
import { signSession } from "../src/session";

const ENV = {
  SESSION_SECRET: "test-secret-32-bytes-long-padding-ok",
  DATA_REPO_OWNER: "mykhailo-melnyk",
  DATA_REPO_NAME: "ae-tracker-data",
  BOT_PAT: "bot-token",
  FEEDBACK_REPO_OWNER: "mykhailo-melnyk",
  FEEDBACK_REPO_NAME: "ae-tracker",
  FEEDBACK_PAT: "feedback-token",
  FEEDBACK_ASSIGNEE: "mykhailo-melnyk",
} as any;

// A real task id from the bundled web path (validated against the actual curriculum).
const TASK_ID = "web-L1.T5";

/**
 * Stub fetch that routes by URL: the progress read (data repo, Contents API) and the
 * issue POST (code repo, Issues API). `progress` is the stored ProgressFile (or null
 * for 404); `issueStatus` overrides the issue-creation response status.
 */
function stub(opts: { progress?: any; issueStatus?: number; record?: any[] } = {}) {
  const record = opts.record ?? [];
  const fetchMock = (async (url: string, init?: RequestInit) => {
    record.push({ url, method: init?.method ?? "GET", body: init?.body, headers: init?.headers });
    if (url.includes("/contents/progress/")) {
      if (!opts.progress) return new Response("not found", { status: 404 });
      return new Response(
        JSON.stringify({ sha: "s1", content: btoa(JSON.stringify(opts.progress)), encoding: "base64" }),
        { headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/issues")) {
      const status = opts.issueStatus ?? 201;
      if (status >= 400) return new Response("rejected", { status });
      return new Response(
        JSON.stringify({ html_url: "https://github.com/mykhailo-melnyk/ae-tracker/issues/42" }),
        { status },
      );
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  return { fetchMock, record };
}

function req(token: string | null, payload: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json", referer: "https://x.example/tracker.html" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request("https://w.example/api/feedback", { method: "POST", headers, body: JSON.stringify(payload) });
}

const session = (user = "anna", name?: string) => signSession(user, ENV.SESSION_SECRET, 3600, name);

describe("/api/feedback", () => {
  it("401 when unauthenticated", async () => {
    const { fetchMock } = stub();
    const res = await handleApiFeedback(req(null, { type: "bug", message: "x" }), ENV, fetchMock);
    expect(res.status).toBe(401);
  });

  it("400 on invalid type", async () => {
    const { fetchMock } = stub();
    const res = await handleApiFeedback(req(await session(), { type: "nope", message: "x" }), ENV, fetchMock);
    expect(res.status).toBe(400);
  });

  it("400 on empty / whitespace message", async () => {
    const { fetchMock } = stub();
    const res = await handleApiFeedback(req(await session(), { type: "bug", message: "   " }), ENV, fetchMock);
    expect(res.status).toBe(400);
  });

  it("400 when message exceeds 2000 chars", async () => {
    const { fetchMock } = stub();
    const res = await handleApiFeedback(req(await session(), { type: "bug", message: "a".repeat(2001) }), ENV, fetchMock);
    expect(res.status).toBe(400);
  });

  it("400 on an unknown task_id", async () => {
    const { fetchMock } = stub();
    const res = await handleApiFeedback(req(await session(), { type: "bug", message: "x", task_id: "web-L9.T99" }), ENV, fetchMock);
    expect(res.status).toBe(400);
  });

  it("creates a task-scoped issue and returns the url", async () => {
    const progress = { github_username: "anna", display_name: "Anna Smith", competency: "web", created_at: "x", updated_at: "y", tasks: {} };
    const { fetchMock, record } = stub({ progress });
    const res = await handleApiFeedback(
      req(await session("anna", "Anna Smith"), { type: "bug", message: "The link 404s for me", task_id: TASK_ID }),
      ENV, fetchMock,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://github.com/mykhailo-melnyk/ae-tracker/issues/42" });

    const issueCall = record.find((c) => c.url.endsWith("/issues"));
    expect(issueCall.url).toBe("https://api.github.com/repos/mykhailo-melnyk/ae-tracker/issues");
    expect((issueCall.headers as Record<string, string>).authorization).toBe("Bearer feedback-token");
    const sent = JSON.parse(issueCall.body as string);
    expect(sent.title).toBe(`[bug] ${TASK_ID} — The link 404s for me`);
    expect(sent.labels).toEqual(["feedback"]);
    expect(sent.assignees).toEqual(["mykhailo-melnyk"]);
    expect(sent.body).toContain("@anna (Anna Smith)");
    expect(sent.body).toContain("**Competency:** Web");
    expect(sent.body).toContain(`**Task:** ${TASK_ID} — Tool Setup Guide (Level 1)`);
    expect(sent.body).toContain("The link 404s for me");
  });

  it("creates a general (no-task) issue", async () => {
    const progress = { github_username: "anna", competency: "web", created_at: "x", updated_at: "y", tasks: {} };
    const { fetchMock, record } = stub({ progress });
    const res = await handleApiFeedback(
      req(await session("anna"), { type: "improvement", message: "Add dark mode" }),
      ENV, fetchMock,
    );
    expect(res.status).toBe(200);
    const sent = JSON.parse(record.find((c) => c.url.endsWith("/issues")).body as string);
    expect(sent.title).toBe("[improvement] Add dark mode");
    expect(sent.body).not.toContain("**Task:**");
  });

  it("403 and no issue when the engineer is disabled", async () => {
    const progress = { github_username: "anna", disabled: true, created_at: "x", updated_at: "y", tasks: {} };
    const { fetchMock, record } = stub({ progress });
    const res = await handleApiFeedback(req(await session("anna"), { type: "bug", message: "x" }), ENV, fetchMock);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "disabled" });
    expect(record.some((c) => c.url.endsWith("/issues"))).toBe(false);
  });

  it("propagates a GitHub failure (becomes a 5xx)", async () => {
    const progress = { github_username: "anna", competency: "web", created_at: "x", updated_at: "y", tasks: {} };
    const { fetchMock } = stub({ progress, issueStatus: 500 });
    await expect(
      handleApiFeedback(req(await session("anna"), { type: "bug", message: "x" }), ENV, fetchMock),
    ).rejects.toThrow("createIssue 500");
  });
});
