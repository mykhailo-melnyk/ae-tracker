export interface RepoConfig { owner: string; repo: string; token: string; }
export interface JsonFile<T> { sha: string; data: T; }

const API = "https://api.github.com";

function headers(token: string) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "ae-tracker-worker",
    "x-github-api-version": "2022-11-28",
  };
}

// GitHub's edge (fronted by Cloudflare) occasionally returns a transient gateway
// error — most often a "error code: 502" — or throttles with 429. A single such
// blip while the aggregate fans out reads over every progress file would otherwise
// abort the whole request. These GETs are idempotent, so we retry them a few times
// with a short backoff. (Writes are NOT retried here: they use SHA-based optimistic
// concurrency and are retried by their callers, which re-read the fresh SHA first.)
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_GET_ATTEMPTS = 4;

async function githubGet(url: string, token: string, fetchFn: typeof fetch): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    let res: Response | undefined;
    try {
      res = await fetchFn(url, { headers: headers(token) });
    } catch (e) {
      // Network-level failure (connection reset, timeout). Retry unless we're out of tries.
      if (attempt >= MAX_GET_ATTEMPTS) throw e;
      console.warn(`githubGet network error, retrying ${attempt}/${MAX_GET_ATTEMPTS}: ${e instanceof Error ? e.message : String(e)}`);
      await new Promise((r) => setTimeout(r, 200 * attempt));
      continue;
    }
    if (!RETRYABLE_STATUS.has(res.status) || attempt >= MAX_GET_ATTEMPTS) return res;
    // Drain the body so the underlying connection can be reused, then back off.
    await res.text().catch(() => {});
    console.warn(`githubGet ${res.status}, retrying ${attempt}/${MAX_GET_ATTEMPTS}: ${url}`);
    await new Promise((r) => setTimeout(r, 200 * attempt));
  }
}

export async function readJsonFile<T = unknown>(
  cfg: RepoConfig,
  path: string,
  fetchFn: typeof fetch = fetch,
): Promise<JsonFile<T> | null> {
  const res = await githubGet(`${API}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, cfg.token, fetchFn);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`readJsonFile ${res.status}: ${await res.text()}`);
  const body = await res.json() as { sha: string; content: string; encoding: string };
  if (body.encoding !== "base64") throw new Error(`unexpected encoding: ${body.encoding}`);
  const decoded = atob(body.content.replace(/\n/g, ""));
  return { sha: body.sha, data: JSON.parse(decoded) as T };
}

export async function writeJsonFile(
  cfg: RepoConfig,
  path: string,
  data: unknown,
  sha: string | null,
  message: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ sha: string }> {
  const content = btoa(JSON.stringify(data, null, 2));
  const body: Record<string, unknown> = { message, content };
  if (sha) body.sha = sha;
  const res = await fetchFn(`${API}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
    method: "PUT",
    headers: { ...headers(cfg.token), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`writeJsonFile ${res.status}: ${await res.text()}`);
  const out = await res.json() as { content: { sha: string } };
  return { sha: out.content.sha };
}

export async function createIssue(
  cfg: RepoConfig,
  issue: { title: string; body: string; labels?: string[]; assignees?: string[] },
  fetchFn: typeof fetch = fetch,
): Promise<{ url: string }> {
  const res = await fetchFn(`${API}/repos/${cfg.owner}/${cfg.repo}/issues`, {
    method: "POST",
    headers: { ...headers(cfg.token), "content-type": "application/json" },
    body: JSON.stringify({ title: issue.title, body: issue.body, labels: issue.labels, assignees: issue.assignees }),
  });
  if (!res.ok) throw new Error(`createIssue ${res.status}: ${await res.text()}`);
  const out = await res.json() as { html_url: string };
  return { url: out.html_url };
}

export interface DirEntry { name: string; path: string; }

export async function listDirectory(
  cfg: RepoConfig,
  path: string,
  fetchFn: typeof fetch = fetch,
): Promise<DirEntry[]> {
  const res = await githubGet(`${API}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, cfg.token, fetchFn);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`listDirectory ${res.status}`);
  const body = await res.json() as Array<{ name: string; type: string; path: string }>;
  return body.filter((e) => e.type === "file" && e.name.endsWith(".json"))
             .map((e) => ({ name: e.name, path: e.path }));
}
