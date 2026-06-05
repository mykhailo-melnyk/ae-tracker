// Cross-domain auth.
//
// The frontend (github.io) and Worker (workers.dev) are different registrable
// domains, so a session *cookie* set by the Worker is third-party and gets blocked
// by Safari (always) and Firefox-Strict on the frontend's cross-origin fetch. To
// work in every browser we don't rely on the cookie: the OAuth callback hands us the
// session token in the URL fragment, we keep it in localStorage, and we send it as an
// `Authorization: Bearer` header on every API call. Headers aren't subject to any
// third-party-cookie policy.
const TOKEN_KEY = "ae_session";

// On load, capture a token passed in the URL fragment (#t=...) from the OAuth
// callback, persist it, then strip it from the address bar / history so it isn't
// left lying around or shared via copy-paste.
(function captureTokenFromHash() {
  if (location.hash.startsWith("#t=")) {
    const t = decodeURIComponent(location.hash.slice(3));
    if (t) localStorage.setItem(TOKEN_KEY, t);
    history.replaceState(null, "", location.pathname + location.search);
  }
})();

function authToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// fetch() wrapper that attaches the Bearer token. Keeps credentials:"include" so the
// cookie still works as a fallback where the browser allows it (same-origin / Chrome).
function apiFetch(url, opts = {}) {
  const headers = new Headers(opts.headers || {});
  const t = authToken();
  if (t) headers.set("Authorization", "Bearer " + t);
  return fetch(url, { ...opts, headers, credentials: "include" });
}
