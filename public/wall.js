const WORKER = window.WORKER_URL;

async function loadWall() {
  const res = await apiFetch(WORKER + "/api/wall");
  if (res.status === 401) { window.location = "tracker.html"; return null; }
  if (!res.ok) throw new Error("wall failed: " + res.status);
  return res.json();
}

function who(entry) {
  const avatar = `<img class="wall-avatar" src="https://github.com/${encodeURIComponent(entry.username)}.png" alt="" loading="lazy">`;
  return `${avatar}<span class="wall-name">${entry.display_name || entry.username}</span>`;
}

// Card definitions: order, icon, title, per-entry line, and a warm empty state.
const CARDS = [
  { key: "on_a_roll", icon: "🔥", title: "On a roll",
    empty: "No bursts of activity yet this week — be the first 👀",
    line: (e) => `${e.count} task${e.count === 1 ? "" : "s"} this week` },
  { key: "leveled_up", icon: "📈", title: "Leveled up",
    empty: "No level-ups this week — yours could be next.",
    line: (e) => `completed ${e.level}` },
  { key: "cert_ready", icon: "🎓", title: "Cert-ready",
    empty: "No new cert-ready engineers this week.",
    line: (e) => `ready for ${e.cert_label}` },
  { key: "longest_streak", icon: "⚡", title: "Longest streaks",
    empty: "No multi-week streaks yet — start one this week.",
    line: (e) => `${e.weeks}-week streak` },
  { key: "just_started", icon: "👋", title: "Just started",
    empty: "No new starters this week.",
    line: () => "just started" },
  { key: "welcome_back", icon: "🙌", title: "Welcome back",
    empty: "Nobody's returned this week — yet.",
    line: (e) => `back after ${e.weeks_away} week${e.weeks_away === 1 ? "" : "s"}` },
];

function renderWall(wall) {
  const grid = document.getElementById("wall-grid");
  grid.innerHTML = CARDS.map((c) => {
    const list = wall.cards[c.key] || [];
    const body = list.length
      ? list.map((e) => `<li class="wall-entry">${who(e)}<span class="wall-line">${c.line(e)}</span></li>`).join("")
      : `<li class="wall-empty">${c.empty}</li>`;
    return `<section class="wall-card">
      <h2 class="wall-card-title"><span class="wall-icon">${c.icon}</span>${c.title}</h2>
      <ul class="wall-list">${body}</ul>
    </section>`;
  }).join("");
}

async function init() {
  const wall = await loadWall();
  hidePageLoader();
  if (!wall) return;
  document.getElementById("wall").classList.remove("hidden");
  document.getElementById("wall-asof").textContent = "As of " + new Date(wall.as_of).toLocaleString();
  document.getElementById("who").innerHTML =
    `<a class="dashboard-link" href="tracker.html">My tracker</a>
     <a class="signout-link" href="${WORKER}/auth/logout" onclick="clearAuthToken()">Sign out</a>`;
  renderWall(wall);
}

init().catch((e) => showPageError(e, () => init()));
