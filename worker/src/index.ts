export interface Env {
  DATA_REPO_OWNER: string;
  DATA_REPO_NAME: string;
  ADMIN_USERNAMES: string;
  FRONTEND_ORIGIN: string;

  // Secrets — set via `wrangler secret put`:
  SESSION_SECRET: string;       // HMAC key for session cookies
  OAUTH_CLIENT_ID: string;
  OAUTH_CLIENT_SECRET: string;
  BOT_PAT: string;              // Fine-grained PAT for the data repo

  // Bindings (set in wrangler.toml):
  AGGREGATE_CACHE?: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response("AE Tracker Worker — wire endpoints in Part 4+", {
      status: 200,
    });
  },
};
