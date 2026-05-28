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

export async function readJsonFile<T = unknown>(
  cfg: RepoConfig,
  path: string,
  fetchFn: typeof fetch = fetch,
): Promise<JsonFile<T> | null> {
  const res = await fetchFn(`${API}/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
    headers: headers(cfg.token),
  });
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
