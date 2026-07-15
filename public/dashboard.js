const WORKER = window.WORKER_URL;
let AGG = null;
let CUR = null;          // curriculum.json — manifest: competency registry + shared L1–L5 framework
const PATHS = {};        // competency id -> composed path ({levels:[{id,title,...,tasks}]}), cached

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

// Fetch (and cache) a competency's path file, composed with the manifest framework
// into {levels:[{id,title,...,tasks}]}. Used only to render the per-competency accordion.
async function loadPath(competencyId) {
  if (PATHS[competencyId]) return PATHS[competencyId];
  const res = await fetch("curriculum." + competencyId + ".json");
  if (!res.ok) throw new Error("path load failed: " + competencyId);
  const path = await res.json();
  const byId = {};
  for (const l of path.levels) byId[l.id] = l;
  const composed = {
    levels: CUR.levels.map((m) => ({ ...m, tasks: (byId[m.id] || {}).tasks || [] })),
  };
  PATHS[competencyId] = composed;
  return composed;
}

let LEADER = "all";               // "all" | "__unassigned__" | a leader username
const LEADER_UNASSIGNED = "__unassigned__";

function inLeaderScope(e) {
  if (LEADER === "all") return true;
  if (LEADER === LEADER_UNASSIGNED) return !e.unit_leader;
  return e.unit_leader === LEADER;
}

// Active (non-disabled) engineers within the current competency + unit-leader scope.
// Every headline number and the bars are derived from this set, so the whole dashboard
// rescopes when SCOPE or LEADER changes. Disabled engineers are excluded from all stats
// (as before).
function scopedActive() {
  return AGG.engineers.filter((e) =>
    !e.disabled
    && (SCOPE === "all" || e.competency === SCOPE)
    && inLeaderScope(e));
}

const STALL_MS = 14 * 86400_000;

function renderKpis() {
  const active = scopedActive();
  const avg = active.length
    ? Math.round(100 * active.reduce((n, e) => n + e.completion_pct, 0) / active.length)
    : 0;
  const stalled = active.filter((e) => Date.now() - new Date(e.last_active).getTime() >= STALL_MS).length;
  document.getElementById("kpis").innerHTML = `
    <div class="kpi"><div class="lbl">Engineers started</div><div class="val">${active.length}</div></div>
    <div class="kpi"><div class="lbl">At Level 2+</div><div class="val">${
      active.filter((e) => e.current_level !== "L1").length
    }</div></div>
    <div class="kpi"><div class="lbl">Avg completion</div><div class="val">${avg}%</div></div>
    <div class="kpi"><div class="lbl">Stalled (14+ days)</div><div class="val">${stalled}</div></div>
  `;
}

function renderBars() {
  const dist = {};
  for (const e of scopedActive()) dist[e.current_level] = (dist[e.current_level] ?? 0) + 1;
  const max = Math.max(...Object.values(dist), 1);
  const order = ["L1", "L2", "L3", "L4", "L5"];
  const labels = { L1: "Understand", L2: "Edit w/ Review", L3: "Plan", L4: "Orchestrate", L5: "Architecture" };
  document.getElementById("bars").innerHTML = order.map((id) => {
    const v = dist[id] ?? 0;
    const h = (v / max) * 100;
    return `<div class="bar"><div class="bar-val">${v}</div>
            <div class="bar-fill" style="height:${h}%"></div>
            <div class="bar-lbl"><strong>${id}</strong>${labels[id]}</div></div>`;
  }).join("");
}

const LEVEL_LABELS = { L1: "Understand", L2: "Edit w/ Review", L3: "Plan", L4: "Orchestrate", L5: "Architecture" };

// Task-level detail only makes sense within a single competency (each has its own task
// list). In the "All" scope we hide it and prompt to pick a competency; otherwise we
// load that competency's path and show its levels/tasks, with the denominator = active
// engineers in that competency.
async function renderLevelCompletion() {
  const box = document.getElementById("task-rates");
  if (SCOPE === "all") {
    box.innerHTML = `<div class="empty-detail">Select a competency above to see task-level detail.</div>`;
    return;
  }
  let path;
  try {
    path = await loadPath(SCOPE);
  } catch (e) {
    box.innerHTML = `<div class="empty-detail">Could not load the ${SCOPE} curriculum. Try again in a moment.</div>`;
    return;
  }
  const total = scopedActive().length || 1;
  const html = path.levels.map((lvl) => {
    const done = lvl.tasks.reduce((n, t) => n + (AGG.by_task[t.id] ?? 0), 0);
    const levelPct = lvl.tasks.length ? Math.round((done / (total * lvl.tasks.length)) * 100) : 0;
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
  const leaderNote = LEADER !== "all"
    ? `<div class="empty-detail" style="margin-bottom:8px">Task detail reflects the whole competency, not the unit-leader filter.</div>`
    : "";
  box.innerHTML = leaderNote + html;
}

// The currently-selected certification (drives the readiness card + table). Certs are
// filtered one-at-a-time via #cert-pills so the table stays a fixed width as certs grow.
let CERT_SEL = null;

function selectedCert() {
  const certs = AGG.certifications || [];
  return certs.find((c) => c.id === CERT_SEL) || certs[0] || null;
}

function buildCertPills() {
  const box = document.getElementById("cert-pills");
  const certs = AGG.certifications || [];
  if (!certs.length) { box.innerHTML = ""; return; }
  if (!CERT_SEL || !certs.some((c) => c.id === CERT_SEL)) CERT_SEL = certs[0].id;
  box.innerHTML = certs.map((c) =>
    `<div class="comp-pill ${c.id === CERT_SEL ? "active" : ""}" data-cert="${c.id}">${c.label}</div>`).join("");
}

function renderCertReadiness() {
  const box = document.getElementById("cert-readiness");
  const c = selectedCert();
  if (!c) { box.innerHTML = `<div class="empty-detail">No certifications configured.</div>`; return; }
  box.innerHTML = `
    <div class="cert-stats">
      <div class="kpi"><div class="lbl">Started preparation</div><div class="val">${c.engineers_started || 0}</div></div>
      <div class="kpi"><div class="lbl">Ready to pass exam</div><div class="val">${c.engineers_ready || 0}</div></div>
    </div>`;
}

function competencyLabel(id) {
  if (!id) return "—";
  const c = (CUR.competencies || []).find((x) => x.id === id);
  return c ? c.label : id;
}

// Display name for a leader username, resolved from the engineers list (leaders are
// themselves engineers). Falls back to the raw username, or "—" when unset.
function leaderName(username) {
  if (!username) return "—";
  const e = AGG.engineers.find((x) => x.username === username);
  return e ? (e.display_name || e.username) : username;
}

// Certifications-only engineers table (its own dashboard tab), scoped to the ONE
// selected certification (#cert-pills). Fixed width regardless of how many certs
// exist. Cross-cutting: NOT scoped by the competency pills. Disabled engineers excluded.
function renderCertTable() {
  const box = document.getElementById("cert-table");
  const sel = selectedCert();
  if (!sel) { box.innerHTML = `<div class="empty-detail">No certifications configured.</div>`; return; }
  const q = CERT_SEARCH.toLowerCase();
  const rows = AGG.engineers
    .filter((e) => !e.disabled)
    .filter((e) => !q || e.username.toLowerCase().includes(q) || (e.display_name || "").toLowerCase().includes(q))
    .map((e) => ({ e, cp: (e.certifications || {})[sel.id] || { pct: 0, ready: false } }))
    .sort((a, b) => b.cp.pct - a.cp.pct);

  const body = rows.map(({ e, cp }) => {
    const pct = Math.round((cp.pct || 0) * 100);
    return `<tr>
      <td><div class="who"><div class="avatar">${(e.display_name || e.username).slice(0, 2).toUpperCase()}</div>
          <div><div class="name">${e.display_name || e.username}</div>
               <div class="handle">@${e.username}</div></div></div></td>
      <td>${competencyLabel(e.competency)}</td>
      <td><span class="cert-chip${cp.ready ? " ready" : ""}">${pct}%</span></td>
      <td>${cp.ready ? `<span class="cert-chip ready">Ready</span>` : `<span class="handle">Not yet</span>`}</td>
      <td><span class="last-active">${new Date(e.last_active).toLocaleDateString()}</span></td>
    </tr>`;
  }).join("") || `<tr><td colspan="5"><div class="empty-detail">No engineers match.</div></td></tr>`;

  box.innerHTML = `<table class="engineers"><thead><tr>
    <th>Engineer</th><th>Competency</th><th>${sel.label} progress</th><th>Exam ready</th><th>Last active</th>
  </tr></thead><tbody>${body}</tbody></table>`;
}

let FILTER = "all";
let SEARCH = "";
let CERT_SEARCH = "";
let SCOPE = "all";       // page-level competency scope: "all" or a competency id

function buildCompetencyPills() {
  const box = document.getElementById("scope-pills");
  const comps = CUR.competencies || [];
  box.innerHTML = `<div class="comp-pill active" data-comp="all">All</div>`
    + comps.map((c) => `<div class="comp-pill" data-comp="${c.id}">${c.label}</div>`).join("");
}

function populateLeaderFilter() {
  const sel = document.getElementById("leader-filter");
  const leaders = [...new Set(AGG.engineers.map((e) => e.unit_leader).filter(Boolean))]
    .sort((a, b) => leaderName(a).localeCompare(leaderName(b)));
  sel.innerHTML = `<option value="all">All unit leaders</option>`
    + leaders.map((u) => `<option value="${u}">${leaderName(u)}</option>`).join("")
    + `<option value="${LEADER_UNASSIGNED}">Unassigned</option>`;
  // Keep the current selection if it's still a valid option; else fall back to "all".
  if (LEADER === "all" || LEADER === LEADER_UNASSIGNED || leaders.includes(LEADER)) sel.value = LEADER;
  else { LEADER = "all"; sel.value = "all"; }
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
    if (SCOPE !== "all" && e.competency !== SCOPE) return false;
    if (!inLeaderScope(e)) return false;
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
    const leaderOptions = [`<option value=""${!e.unit_leader ? " selected" : ""}>—</option>`]
      .concat(AGG.engineers
        .filter((o) => o.username !== e.username) // no self-lead
        .map((o) => `<option value="${o.username}"${e.unit_leader === o.username ? " selected" : ""}>${o.display_name || o.username}</option>`))
      .join("");
    const disabledBadge = e.disabled ? `<span class="disabled-badge">disabled</span>` : "";
    // Disable/Enable is a super-admin-only power (AGG.is_superadmin is stamped per-viewer).
    const toggleBtn = AGG.is_superadmin
      ? `<button class="disable-btn${e.disabled ? " enable" : ""}" data-user="${e.username}" data-disabled="${e.disabled ? "1" : "0"}">${e.disabled ? "Enable" : "Disable"}</button>`
      : "";
    // Delete is a super-admin-only, irreversible hard delete (typed-username confirm).
    const deleteBtn = AGG.is_superadmin
      ? `<button class="delete-btn" data-user="${e.username}">Delete</button>`
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
      <td><select class="leader-select" data-user="${e.username}" data-prev="${e.unit_leader || ""}">${leaderOptions}</select></td>
      <td><span class="last-active">${new Date(e.last_active).toLocaleDateString()}</span></td>
      <td style="text-align:right">${toggleBtn}${deleteBtn}<a href="tracker.html?as=${e.username}" style="color:#2563eb;font-weight:600">View →</a></td>
    </tr>`;
  }).join("");
  document.querySelectorAll(".comp-select").forEach((sel) => {
    sel.addEventListener("change", () => saveCompetency(sel));
  });
  document.querySelectorAll(".leader-select").forEach((sel) => {
    sel.addEventListener("change", () => saveLeader(sel));
  });
  document.querySelectorAll(".disable-btn").forEach((btn) => {
    btn.addEventListener("click", () => toggleDisabled(btn));
  });
  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteEngineer(btn));
  });
}

// "Needs a nudge": quiet (14+ days) non-disabled engineers, grouped by unit leader,
// scoped by the unit-leader filter. Built entirely from aggregate data — no new fetch.
function renderNudge() {
  const box = document.getElementById("nudge-list");
  const now = Date.now();
  const quiet = AGG.engineers
    .filter((e) => !e.disabled && inLeaderScope(e))
    .filter((e) => now - new Date(e.last_active).getTime() >= STALL_MS)
    .map((e) => ({ e, days: Math.floor((now - new Date(e.last_active).getTime()) / 86400000) }));

  if (!quiet.length) {
    box.innerHTML = `<div class="empty-detail">Everyone's active — nothing to nudge 🎉</div>`;
    return;
  }

  const groups = new Map();
  for (const item of quiet) {
    const key = item.e.unit_leader || LEADER_UNASSIGNED;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === LEADER_UNASSIGNED) return 1;
    if (b === LEADER_UNASSIGNED) return -1;
    return leaderName(a).localeCompare(leaderName(b));
  });

  box.innerHTML = keys.map((key) => {
    const rows = groups.get(key).sort((a, b) => b.days - a.days);
    const heading = key === LEADER_UNASSIGNED ? "Unassigned" : leaderName(key);
    const items = rows.map(({ e, days }) => `
      <div class="nudge-row">
        <div class="who"><div class="avatar">${(e.display_name || e.username).slice(0, 2).toUpperCase()}</div>
          <div><div class="name">${e.display_name || e.username}</div><div class="handle">@${e.username}</div></div></div>
        <span class="level-chip ${e.current_level}">${e.current_level}</span>
        <span class="nudge-comp">${competencyLabel(e.competency)}</span>
        <span class="nudge-away">quiet ${days} day${days === 1 ? "" : "s"}</span>
        <button class="nudge-copy" data-handle="@${e.username}">Copy @handle</button>
      </div>`).join("");
    return `<div class="nudge-group"><h4 class="nudge-leader">${heading} <span class="nudge-count">${rows.length}</span></h4>${items}</div>`;
  }).join("");

  box.querySelectorAll(".nudge-copy").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigator.clipboard?.writeText(btn.dataset.handle);
      const orig = btn.textContent;
      btn.textContent = "Copied ✓";
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });
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

async function deleteEngineer(btn) {
  const username = btn.dataset.user;
  const typed = prompt(
    `This permanently deletes @${username}'s progress. This cannot be undone.\n\n`
    + `Type the username "${username}" to confirm:`);
  if (typed === null) return; // cancelled
  if (typed.trim().replace(/^@/, "") !== username) {
    alert("Username did not match — nothing was deleted.");
    return;
  }
  btn.disabled = true;
  try {
    const res = await apiFetch(WORKER + "/api/user/" + encodeURIComponent(username) + "/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) throw new Error("delete failed: " + res.status);
    // Drop the engineer locally so both the counts and the table update without a reload.
    AGG.engineers = AGG.engineers.filter((e) => e.username !== username);
    // Clear anyone who had them as unit leader — the backend cascades this too, but do it
    // locally so the leader filter/rows are consistent without a reload (no dangling ghost).
    AGG.engineers.forEach((e) => { if (e.unit_leader === username) e.unit_leader = null; });
    populateLeaderFilter();
    renderKpis();
    renderTable();
  } catch (e) {
    btn.disabled = false;
    alert("Could not delete @" + username + ". Try again in a moment.");
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

async function saveLeader(sel) {
  const username = sel.dataset.user;
  const leader = sel.value;
  sel.disabled = true;
  try {
    const res = await apiFetch(WORKER + "/api/user/" + encodeURIComponent(username) + "/leader", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leader: leader || null }),
    });
    if (!res.ok) throw new Error("save failed: " + res.status);
    const updated = await res.json();
    const eng = AGG.engineers.find((e) => e.username === username);
    if (eng) eng.unit_leader = updated.unit_leader;
    sel.dataset.prev = updated.unit_leader || "";
    populateLeaderFilter(); // a leader may have just appeared or disappeared from the pool
    sel.disabled = false;
  } catch (e) {
    sel.value = sel.dataset.prev; // roll back the selection
    sel.disabled = false;
    alert("Could not save unit leader for " + username + ". Try again in a moment.");
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
  document.querySelectorAll("#scope-pills .comp-pill").forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll("#scope-pills .comp-pill").forEach((p) => p.classList.remove("active"));
      el.classList.add("active");
      SCOPE = el.dataset.comp;
      renderAll(); // scope drives the whole dashboard, not just the table
    });
  });
  document.getElementById("search").addEventListener("input", (e) => {
    SEARCH = e.target.value;
    renderTable();
  });
  document.getElementById("leader-filter").addEventListener("change", (e) => {
    LEADER = e.target.value;
    renderAll(); // leader scope drives KPIs + bars + table, like the competency scope
  });
  document.getElementById("cert-search").addEventListener("input", (e) => {
    CERT_SEARCH = e.target.value;
    renderCertTable();
  });
  document.querySelectorAll("#cert-pills .comp-pill").forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll("#cert-pills .comp-pill").forEach((p) => p.classList.remove("active"));
      el.classList.add("active");
      CERT_SEL = el.dataset.cert;
      renderCertReadiness();
      renderCertTable();
    });
  });
}

// Top-level view switch across all dashboard tabs.
function wireTabs() {
  const views = ["levels", "certs", "nudge"];
  document.querySelectorAll(".dash-tab").forEach((el) => {
    el.addEventListener("click", () => {
      document.querySelectorAll(".dash-tab").forEach((t) => t.classList.remove("active"));
      el.classList.add("active");
      const view = el.dataset.view;
      for (const v of views) document.getElementById("view-" + v).classList.toggle("hidden", v !== view);
    });
  });
}

async function init() {
  const [agg, cur] = await Promise.all([loadAgg(), loadCurriculum()]);
  hidePageLoader();
  AGG = agg;
  CUR = cur;
  if (!AGG) return;
  document.getElementById("admin").classList.remove("hidden");
  document.getElementById("as-of").textContent = "As of " + new Date(AGG.as_of).toLocaleString();
  // Topbar: link back to the engineer's own tracker + sign-out (admin identity is
  // implicit from session — no need to fetch /api/me)
  document.getElementById("who").innerHTML =
    `<a class="dashboard-link" href="tracker.html">My tracker</a>
     <a class="signout-link" href="${WORKER}/auth/logout" onclick="clearAuthToken()">Sign out</a>`;
  buildCompetencyPills();
  populateLeaderFilter();
  buildCertPills();
  await renderAll();
  wireFilters();
  wireTabs();
  document.getElementById("export-btn").addEventListener("click", () => openExportDialog(AGG, CUR));
}

// Re-render everything that depends on the competency scope.
async function renderAll() {
  renderKpis();
  renderBars();
  await renderLevelCompletion();
  renderCertReadiness();
  renderCertTable();
  renderTable();
  renderNudge();
}

init().catch((e) => {
  showPageError(e, () => init());
});
