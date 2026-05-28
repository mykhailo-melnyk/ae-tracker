const WORKER = window.WORKER_URL;

async function loadMe() {
  const res = await fetch(WORKER + "/api/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("loadMe failed: " + res.status);
  return res.json();
}

async function init() {
  const me = await loadMe();
  if (!me) {
    document.getElementById("signed-out").classList.remove("hidden");
    document.getElementById("signin-link").href = WORKER + "/auth/login";
    return;
  }
  document.getElementById("signed-in").classList.remove("hidden");
  // Pill bar + focus card rendering added in Task 7.2 / 7.3
  document.getElementById("greeting-title").textContent = "Welcome back, " + me.github_username;
}

init().catch((e) => {
  document.body.innerHTML = "<pre style='padding:24px;color:#b91c1c'>" + e.message + "</pre>";
});
