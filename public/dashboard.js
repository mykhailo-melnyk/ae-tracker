const WORKER = window.WORKER_URL;
let AGG = null;

async function loadAgg() {
  const res = await fetch(WORKER + "/api/aggregate", { credentials: "include" });
  if (res.status === 401) { window.location = "tracker.html"; return null; }
  if (res.status === 403) { document.getElementById("not-admin").classList.remove("hidden"); return null; }
  if (!res.ok) throw new Error("aggregate failed: " + res.status);
  return res.json();
}

function renderKpis() {
  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><div class="lbl">Engineers started</div><div class="val">${AGG.engineers_started}</div></div>
    <div class="kpi"><div class="lbl">At Level 2+</div><div class="val">${
      AGG.engineers.filter((e) => e.current_level !== "L1").length
    }</div></div>
    <div class="kpi"><div class="lbl">Avg completion</div><div class="val">${
      AGG.engineers.length
        ? Math.round(100 * AGG.engineers.reduce((n, e) => n + e.completion_pct, 0) / AGG.engineers.length)
        : 0
    }%</div></div>
    <div class="kpi"><div class="lbl">Stalled (14+ days)</div><div class="val">${AGG.stalled_14d}</div></div>
  `;
}

function renderBars() {
  const max = Math.max(...Object.values(AGG.by_current_level), 1);
  const order = ["L1", "L2", "L3", "L4", "L5"];
  const labels = { L1: "Understand", L2: "Edit w/ Review", L3: "Plan", L4: "Orchestrate", L5: "Architecture" };
  document.getElementById("bars").innerHTML = order.map((id) => {
    const v = AGG.by_current_level[id] ?? 0;
    const h = (v / max) * 100;
    return `<div class="bar"><div class="bar-val">${v}</div>
            <div class="bar-fill" style="height:${h}%"></div>
            <div class="bar-lbl"><strong>${id}</strong>${labels[id]}</div></div>`;
  }).join("");
}

function renderTaskRates() {
  const total = AGG.engineers_started || 1;
  const rows = Object.entries(AGG.by_task)
    .sort(([, a], [, b]) => b - a)
    .map(([id, n]) => {
      const pct = Math.round((n / total) * 100);
      return `<div class="task-row">
        <span class="tid">${id}</span>
        <span class="tname">${id}</span>
        <span class="tbar"><div style="width:${pct}%"></div></span>
        <span class="tpct">${pct}%</span>
      </div>`;
    }).join("");
  document.getElementById("task-rates").innerHTML = rows;
}

let FILTER = "all";
let SEARCH = "";

function renderTable() {
  const filtered = AGG.engineers.filter((e) => {
    if (FILTER === "stalled") {
      const ageMs = Date.now() - new Date(e.last_active).getTime();
      if (ageMs < 14 * 86400_000) return false;
    } else if (FILTER === "L4") {
      if (e.current_level !== "L4" && e.current_level !== "L5") return false;
    } else if (FILTER !== "all") {
      if (e.current_level !== FILTER) return false;
    }
    if (SEARCH) {
      const q = SEARCH.toLowerCase();
      return e.username.toLowerCase().includes(q)
          || (e.display_name || "").toLowerCase().includes(q);
    }
    return true;
  });
  document.getElementById("engineers-body").innerHTML = filtered.map((e) => `
    <tr>
      <td><div class="who"><div class="avatar">${(e.display_name || e.username).slice(0, 2).toUpperCase()}</div>
          <div><div class="name">${e.display_name || e.username}</div>
               <div class="handle">@${e.username}</div></div></div></td>
      <td><span class="level-chip ${e.current_level}">${e.current_level}</span></td>
      <td><div class="pct-cell"><div class="pct-bar"><div style="width:${Math.round(e.completion_pct * 100)}%"></div></div>
          <span class="pct-num">${Math.round(e.completion_pct * 100)}%</span></div></td>
      <td><span class="last-active">${new Date(e.last_active).toLocaleDateString()}</span></td>
      <td style="text-align:right"><a href="tracker.html?as=${e.username}" style="color:#2563eb;font-weight:600">View →</a></td>
    </tr>`).join("");
}

function wireFilters() {
  document.querySelectorAll(".filter-pill").forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll(".filter-pill").forEach((p) => p.classList.remove("active"));
      el.classList.add("active");
      FILTER = el.dataset.filter;
      renderTable();
    });
  });
  document.getElementById("search").addEventListener("input", (e) => {
    SEARCH = e.target.value;
    renderTable();
  });
}

async function init() {
  AGG = await loadAgg();
  if (!AGG) return;
  document.getElementById("admin").classList.remove("hidden");
  document.getElementById("as-of").textContent = "As of " + new Date(AGG.as_of).toLocaleString();
  // Topbar: sign-out link (admin identity is implicit from session — no need to fetch /api/me)
  document.getElementById("who").innerHTML =
    `<a class="signout-link" href="${WORKER}/auth/logout">Sign out</a>`;
  renderKpis(); renderBars(); renderTaskRates(); renderTable();
  wireFilters();
}

init().catch((e) => {
  document.body.innerHTML = "<pre style='padding:24px;color:#b91c1c'>" + e.message + "</pre>";
});
