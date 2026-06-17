const WORKER = window.WORKER_URL;
let AGG = null;
let CUR = null;

async function loadAgg() {
  const res = await apiFetch(WORKER + "/api/aggregate");
  if (res.status === 401) { window.location = "tracker.html"; return null; }
  if (res.status === 403) { document.getElementById("not-admin").classList.remove("hidden"); return null; }
  if (!res.ok) throw new Error("aggregate failed: " + res.status);
  return res.json();
}

async function loadCurriculum() {
  const res = await fetch("curriculum.json");
  if (!res.ok) throw new Error("curriculum load failed");
  return res.json();
}

function renderKpis() {
  // Disabled engineers are excluded from every headline number (the worker already
  // excludes them from engineers_started/stalled; do the same for client-side KPIs).
  const active = AGG.engineers.filter((e) => !e.disabled);
  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><div class="lbl">Engineers started</div><div class="val">${AGG.engineers_started}</div></div>
    <div class="kpi"><div class="lbl">At Level 2+</div><div class="val">${
      active.filter((e) => e.current_level !== "L1").length
    }</div></div>
    <div class="kpi"><div class="lbl">Avg completion</div><div class="val">${
      active.length
        ? Math.round(100 * active.reduce((n, e) => n + e.completion_pct, 0) / active.length)
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

const LEVEL_LABELS = { L1: "Understand", L2: "Edit w/ Review", L3: "Plan", L4: "Orchestrate", L5: "Architecture" };

function renderLevelCompletion() {
  const total = AGG.engineers_started || 1;
  const html = CUR.levels.map((lvl) => {
    const done = lvl.tasks.reduce((n, t) => n + (AGG.by_task[t.id] ?? 0), 0);
    const levelPct = Math.round((done / (total * lvl.tasks.length)) * 100);
    const taskRows = lvl.tasks.map((t) => {
      const pct = Math.round(((AGG.by_task[t.id] ?? 0) / total) * 100);
      return `<div class="task-row">
        <span class="tid">${t.id}</span>
        <span class="tname">${t.title || t.id}</span>
        <span class="tbar"><div style="width:${pct}%"></div></span>
        <span class="tpct">${pct}%</span>
      </div>`;
    }).join("");
    return `<details class="lvl-acc">
      <summary>
        <span class="lvl-caret">▸</span>
        <span class="lvl-name"><strong>${lvl.id}</strong> ${lvl.title || LEVEL_LABELS[lvl.id] || ""}</span>
        <span class="tbar"><div style="width:${levelPct}%"></div></span>
        <span class="tpct">${levelPct}%</span>
        <span class="lvl-count">${lvl.tasks.length} tasks</span>
      </summary>
      <div class="lvl-tasks">${taskRows}</div>
    </details>`;
  }).join("");
  document.getElementById("task-rates").innerHTML = html;
}

let FILTER = "all";
let SEARCH = "";
let COMP_FILTER = "all";

function buildCompetencyPills() {
  const box = document.getElementById("competency-pills");
  const comps = CUR.competencies || [];
  box.innerHTML = `<div class="comp-pill active" data-comp="all">All</div>`
    + comps.map((c) => `<div class="comp-pill" data-comp="${c.id}">${c.label}</div>`).join("");
}

function renderTable() {
  const filtered = AGG.engineers.filter((e) => {
    // The "Disabled" pill shows ONLY disabled engineers; every other view hides them.
    if (FILTER === "disabled") {
      if (!e.disabled) return false;
    } else {
      if (e.disabled) return false;
      if (FILTER === "stalled") {
        const ageMs = Date.now() - new Date(e.last_active).getTime();
        if (ageMs < 14 * 86400_000) return false;
      } else if (FILTER === "L4") {
        if (e.current_level !== "L4" && e.current_level !== "L5") return false;
      } else if (FILTER !== "all") {
        if (e.current_level !== FILTER) return false;
      }
    }
    if (COMP_FILTER !== "all" && e.competency !== COMP_FILTER) return false;
    if (SEARCH) {
      const q = SEARCH.toLowerCase();
      return e.username.toLowerCase().includes(q)
          || (e.display_name || "").toLowerCase().includes(q);
    }
    return true;
  });
  const allComps = CUR.competencies || [];
  document.getElementById("engineers-body").innerHTML = filtered.map((e) => {
    const options = [`<option value=""${!e.competency ? " selected" : ""}>—</option>`]
      .concat(allComps.map((c) => `<option value="${c.id}"${e.competency === c.id ? " selected" : ""}>${c.label}</option>`))
      .join("");
    const disabledBadge = e.disabled ? `<span class="disabled-badge">disabled</span>` : "";
    // Disable/Enable is a super-admin-only power (AGG.is_superadmin is stamped per-viewer).
    const toggleBtn = AGG.is_superadmin
      ? `<button class="disable-btn${e.disabled ? " enable" : ""}" data-user="${e.username}" data-disabled="${e.disabled ? "1" : "0"}">${e.disabled ? "Enable" : "Disable"}</button>`
      : "";
    return `
    <tr${e.disabled ? ' class="row-disabled"' : ""}>
      <td><div class="who"><div class="avatar">${(e.display_name || e.username).slice(0, 2).toUpperCase()}</div>
          <div><div class="name">${e.display_name || e.username}${disabledBadge}</div>
               <div class="handle">@${e.username}</div></div></div></td>
      <td><span class="level-chip ${e.current_level}">${e.current_level}</span></td>
      <td><div class="pct-cell"><div class="pct-bar"><div style="width:${Math.round(e.completion_pct * 100)}%"></div></div>
          <span class="pct-num">${Math.round(e.completion_pct * 100)}%</span></div></td>
      <td><select class="comp-select" data-user="${e.username}" data-prev="${e.competency || ""}">${options}</select></td>
      <td><span class="last-active">${new Date(e.last_active).toLocaleDateString()}</span></td>
      <td style="text-align:right">${toggleBtn}<a href="tracker.html?as=${e.username}" style="color:#2563eb;font-weight:600">View →</a></td>
    </tr>`;
  }).join("");
  document.querySelectorAll(".comp-select").forEach((sel) => {
    sel.addEventListener("change", () => saveCompetency(sel));
  });
  document.querySelectorAll(".disable-btn").forEach((btn) => {
    btn.addEventListener("click", () => toggleDisabled(btn));
  });
}

async function toggleDisabled(btn) {
  const username = btn.dataset.user;
  const next = btn.dataset.disabled !== "1"; // currently disabled? then we're enabling
  const verb = next ? "disable" : "enable";
  if (!confirm(`Are you sure you want to ${verb} @${username}?`
      + (next ? "\n\nThey will be blocked from the tracker until re-enabled." : ""))) return;
  btn.disabled = true;
  try {
    const res = await apiFetch(WORKER + "/api/user/" + encodeURIComponent(username) + "/disabled", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ disabled: next }),
    });
    if (!res.ok) throw new Error("toggle failed: " + res.status);
    const updated = await res.json();
    const eng = AGG.engineers.find((e) => e.username === username);
    if (eng) eng.disabled = updated.disabled;
    // Re-render: counts and which rows are visible both change.
    renderKpis();
    renderTable();
  } catch (e) {
    btn.disabled = false;
    alert("Could not " + verb + " @" + username + ". Try again in a moment.");
  }
}

async function saveCompetency(sel) {
  const username = sel.dataset.user;
  const id = sel.value;
  sel.disabled = true;
  try {
    const res = await apiFetch(WORKER + "/api/user/" + encodeURIComponent(username) + "/competencies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ competency: id || null }),
    });
    if (!res.ok) throw new Error("save failed: " + res.status);
    const updated = await res.json();
    const eng = AGG.engineers.find((e) => e.username === username);
    if (eng) eng.competency = updated.competency;
    sel.dataset.prev = updated.competency || "";
    sel.disabled = false;
  } catch (e) {
    sel.value = sel.dataset.prev; // roll back the selection
    sel.disabled = false;
    alert("Could not save competency for " + username + ". Try again in a moment.");
  }
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
  document.querySelectorAll(".comp-pill").forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll(".comp-pill").forEach((p) => p.classList.remove("active"));
      el.classList.add("active");
      COMP_FILTER = el.dataset.comp;
      renderTable();
    });
  });
  document.getElementById("search").addEventListener("input", (e) => {
    SEARCH = e.target.value;
    renderTable();
  });
}

async function init() {
  const [agg, cur] = await Promise.all([loadAgg(), loadCurriculum()]);
  AGG = agg;
  CUR = cur;
  if (!AGG) return;
  document.getElementById("admin").classList.remove("hidden");
  document.getElementById("as-of").textContent = "As of " + new Date(AGG.as_of).toLocaleString();
  // Topbar: sign-out link (admin identity is implicit from session — no need to fetch /api/me)
  document.getElementById("who").innerHTML =
    `<a class="signout-link" href="${WORKER}/auth/logout" onclick="clearAuthToken()">Sign out</a>`;
  buildCompetencyPills();
  renderKpis(); renderBars(); renderLevelCompletion(); renderTable();
  wireFilters();
  document.getElementById("export-btn").addEventListener("click", () => openExportDialog(AGG, CUR));
}

init().catch((e) => {
  document.body.innerHTML = "<pre style='padding:24px;color:#b91c1c'>" + e.message + "</pre>";
});
