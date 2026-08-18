const WORKER = window.WORKER_URL;
let MANIFEST = null;       // curriculum.json — competency registry + shared L1–L5 framework
let CURRICULUM = null;     // the engineer's composed path (manifest levels + their competency's tasks)
let SEARCH_QUERY = "";     // current cross-level search text (empty = normal view)
let PROGRESS = null;
let FOCUS_LEVEL = null;
let READONLY = false;
let TOAST_TIMER = null; // pending auto-dismiss timeout for the undo toast
let ON_WALL = false;        // does this engineer appear on any wall card this week?
const DAY_MS = 86400000, WEEK_MS = 7 * DAY_MS;

// Monday-aligned UTC week index — mirrors worker/src/wall.ts:weekIndex.
function weekIndexJs(ms) { return Math.floor((Math.floor(ms / DAY_MS) + 3) / 7); }

// Current consecutive-weeks streak + whether it's at risk (alive but not extended
// this week yet). Computed from the engineer's own completed-task timestamps.
function motivationStats() {
  const ts = Object.values(PROGRESS.tasks)
    .filter((t) => t.done && t.at)
    .map((t) => new Date(t.at).getTime())
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b);
  const weeks = new Set(ts.map(weekIndexJs));
  const cw = weekIndexJs(Date.now());
  let anchor = weeks.has(cw) ? cw : (weeks.has(cw - 1) ? cw - 1 : null);
  let streak = 0;
  if (anchor !== null) { for (let w = anchor; weeks.has(w); w--) streak++; }
  return { streak, atRisk: anchor === cw - 1, ts };
}

// Title for a task id from the loaded path (null if not found).
function taskTitleById(id) {
  for (const lvl of (CURRICULUM ? CURRICULUM.levels : [])) {
    const t = lvl.tasks.find((x) => x.id === id);
    if (t) return t.title;
  }
  return null;
}

// Render the personal panel: streak, next milestone (nearest level), recent wins,
// and an "on the wall" badge. Hidden for read-only viewers or before a path loads.
function renderMotivation() {
  const box = document.getElementById("motivation-panel");
  if (READONLY || !CURRICULUM) { box.classList.add("hidden"); return; }

  const { streak, atRisk } = motivationStats();
  const streakLine = streak === 0
    ? "Start a streak — finish a task this week."
    : atRisk
      ? `${streak}-week streak — tick one task this week to keep it 🔥`
      : `${streak}-week streak 🔥`;

  const cur = CURRICULUM.levels.find((l) => l.id === computeCurrentLevel());
  const allDone = CURRICULUM.levels.every((l) => l.tasks.every((t) => PROGRESS.tasks[t.id]?.done));
  const remaining = cur ? cur.tasks.filter((t) => !PROGRESS.tasks[t.id]?.done).length : 0;
  const milestoneLine = allDone
    ? "You've completed every level 🎉"
    : `${remaining} task${remaining === 1 ? "" : "s"} from finishing ${cur.title}`;

  const wins = Object.entries(PROGRESS.tasks)
    .filter(([, v]) => v.done && v.at)
    .sort((a, b) => new Date(b[1].at) - new Date(a[1].at))
    .slice(0, 3)
    .map(([id]) => taskTitleById(id))
    .filter(Boolean);
  const winsLine = wins.length
    ? wins.map((w) => `“${w}”`).join(", ")
    : "No completed tasks yet — your first one starts the momentum.";

  const wallBadge = ON_WALL
    ? `<a class="motiv-wall-badge" href="wall.html">🎉 You're on the wall this week</a>`
    : "";

  box.innerHTML = `
    ${wallBadge}
    <div class="motiv-tiles">
      <div class="motiv-tile"><div class="motiv-icon">🔥</div><div><div class="motiv-label">Your streak</div><div class="motiv-text">${streakLine}</div></div></div>
      <div class="motiv-tile"><div class="motiv-icon">🎯</div><div><div class="motiv-label">Next milestone</div><div class="motiv-text">${milestoneLine}</div></div></div>
      <div class="motiv-tile"><div class="motiv-icon">🏅</div><div><div class="motiv-label">Recent wins</div><div class="motiv-text">${winsLine}</div></div></div>
    </div>`;
  box.classList.remove("hidden");
}

async function loadManifest() {
  const res = await fetch("curriculum.json");
  if (!res.ok) throw new Error("curriculum load failed");
  return res.json();
}

// Fetch a competency's path file and compose it with the shared manifest framework
// into the {levels:[{id,title,...,tasks}]} shape the render code expects.
async function loadPath(competencyId) {
  const res = await fetch("curriculum." + competencyId + ".json");
  if (!res.ok) throw new Error("path load failed: " + competencyId);
  const path = await res.json();
  const byId = {};
  for (const l of path.levels) byId[l.id] = l;
  return {
    ...MANIFEST,
    levels: MANIFEST.levels.map((m) => {
      const p = byId[m.id] || { tasks: [] };
      return {
        ...m,
        tasks: p.tasks || [],
        estimated_hours_min: p.estimated_hours_min,
        estimated_hours_max: p.estimated_hours_max,
      };
    }),
  };
}

async function loadProgress() {
  const params = new URLSearchParams(window.location.search);
  const as = params.get("as");
  if (as) {
    const res = await apiFetch(WORKER + "/api/user/" + encodeURIComponent(as));
    if (res.status === 401) return { unauthenticated: true };
    if (res.status === 403) return { forbidden: true };
    if (!res.ok) throw new Error("loadProgress(as) failed: " + res.status);
    return { progress: await res.json(), readonly: true, viewingUsername: as };
  }
  const res = await apiFetch(WORKER + "/api/me");
  if (res.status === 401) return { unauthenticated: true };
  if (!res.ok) throw new Error("loadMe failed: " + res.status);
  return { progress: await res.json(), readonly: false };
}

function isLevelComplete(level) {
  return level.tasks.every((t) => PROGRESS.tasks[t.id]?.done);
}

function tasksDoneInLevel(level) {
  return level.tasks.filter((t) => PROGRESS.tasks[t.id]?.done).length;
}

function computeCurrentLevel() {
  for (const lvl of CURRICULUM.levels) {
    if (!isLevelComplete(lvl)) return lvl.id;
  }
  return CURRICULUM.levels[CURRICULUM.levels.length - 1].id;
}

function renderPillBar() {
  const bar = document.getElementById("pill-bar");
  bar.innerHTML = "";
  const currentLevel = computeCurrentLevel();
  for (const lvl of CURRICULUM.levels) {
    const done = tasksDoneInLevel(lvl);
    const total = lvl.tasks.length;
    const complete = done === total;
    const isCurrent = lvl.id === currentLevel;
    const isFocus = lvl.id === FOCUS_LEVEL;
    const cls = complete ? "complete" : (isCurrent && isFocus ? "current" : "");
    const pill = document.createElement("div");
    pill.className = "pill " + cls + (isFocus ? " focused" : "");
    pill.innerHTML = `
      <div class="pill-num">LEVEL ${lvl.id.slice(1)}</div>
      <div class="pill-name">${lvl.title}</div>
      <div class="pill-count">${complete ? "✓ " : ""}${done} / ${total}</div>
      <div class="pill-bar-mini"><div style="width:${(done / total) * 100}%"></div></div>
    `;
    pill.addEventListener("click", () => {
      FOCUS_LEVEL = lvl.id;
      renderPillBar();
      renderFocusCard();
    });
    bar.appendChild(pill);
  }
}

function renderTotals() {
  const totalTasks = CURRICULUM.levels.reduce((n, l) => n + l.tasks.length, 0);
  const done = CURRICULUM.levels.reduce((n, l) => n + tasksDoneInLevel(l), 0);
  document.getElementById("done-count").textContent = done;
  document.getElementById("total-count").textContent = totalTasks;
}

// Render an estimated-minutes value as a short human string: "10 min" or "1.5 hr".
function formatEstimate(min) {
  if (min < 60) return min + " min";
  const hrs = min / 60;
  return (Number.isInteger(hrs) ? hrs : hrs.toFixed(1)) + " hr";
}

// ---- Level-assessment launch (tasks flagged `assessment` in the curriculum) ----

// The level an assessment task belongs to, or null if it isn't in the loaded path.
function levelOfTask(taskId) {
  for (const lvl of CURRICULUM.levels) {
    if (lvl.tasks.some((t) => t.id === taskId)) return lvl;
  }
  return null;
}

// The assessment unlocks when every OTHER task in its level is done (the Worker
// enforces the same rule server-side).
function assessmentUnlocked(lvl) {
  return lvl.tasks.filter((t) => !t.assessment).every((t) => PROGRESS.tasks[t.id]?.done);
}

// A plain link can't carry the Bearer session token (same Safari constraint that
// motivated apiFetch), so the launcher is a button: ask the Worker for this
// engineer's unique candidate link, then render it.
function assessmentLaunchHtml(task) {
  const lvl = levelOfTask(task.id);
  const unlocked = lvl && assessmentUnlocked(lvl);
  return `
    <div class="assessment-launch">
      <button type="button" class="assessment-start" ${unlocked ? "" : "disabled"}>Start assessment</button>
      <span class="assessment-result">${unlocked ? "" : "Finish the level’s other tasks to unlock."}</span>
    </div>`;
}

async function startAssessment(taskId, launchEl) {
  const lvl = levelOfTask(taskId);
  if (!lvl) return;
  const btn = launchEl.querySelector(".assessment-start");
  const result = launchEl.querySelector(".assessment-result");
  btn.disabled = true;
  result.textContent = "Getting your link…";
  // Opened synchronously inside the click gesture — a window.open after the
  // await below would be swallowed by popup blockers.
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  try {
    const res = await apiFetch(WORKER + "/api/assessment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ level: lvl.id }),
    });
    if (res.status === 409) {
      const body = await res.json();
      result.textContent = body.error === "level incomplete"
        ? `Not yet — ${body.remaining} task${body.remaining === 1 ? "" : "s"} in this level still to go.`
        : "Pick your competency first.";
      btn.disabled = false;
      tab?.close();
      return;
    }
    if (!res.ok) throw new Error("assessment failed: " + res.status);
    const { url } = await res.json();
    // The link stays as a fallback if the tab was blocked or gets closed.
    result.innerHTML = `<a href="${url}" target="_blank" rel="noopener">Your assessment (opens in a new tab) ↗</a>`;
    if (tab) tab.location = url;
    else window.location.assign(url);
    btn.disabled = false; // this tab stays put now — allow reopening the link
  } catch (e) {
    tab?.close();
    result.textContent = "Could not get your assessment link. Try again in a moment.";
    btn.disabled = false;
  }
}

// Wire Start-assessment buttons inside a just-rendered container.
function wireAssessmentButtons(container) {
  container.querySelectorAll(".task").forEach((el) => {
    const launch = el.querySelector(".assessment-launch");
    if (!launch) return;
    launch.querySelector(".assessment-start").addEventListener("click", (e) => {
      e.stopPropagation();
      startAssessment(el.dataset.task, launch);
    });
  });
}

// Shared task-row markup used by both the focus card and the search results.
// opts.levelBadge (e.g. "L3") adds a "LEVEL 3" badge after the title;
// opts.report (default true) emits the per-task "Report / suggest" button.
function taskRowHtml(task, opts = {}) {
  const { levelBadge = null, report = true } = opts;
  const isDone = PROGRESS.tasks[task.id]?.done === true;
  const badge = levelBadge ? ` <span class="task-level">LEVEL ${levelBadge.slice(1)}</span>` : "";
  return `
    <div class="task ${isDone ? "done" : ""}" data-task="${task.id}">
      <div class="check"></div>
      <div class="body">
        <div class="title">${task.title} <span class="kind-tag ${task.kind}">${task.kind}</span>${task.estimated_minutes ? `<span class="task-est">· ${formatEstimate(task.estimated_minutes)}</span>` : ""}${badge}</div>
        ${task.desc ? `<div class="desc">${task.desc}</div>` : ""}
        ${task.link ? `<a class="external" href="${task.link}" target="_blank" rel="noopener">${task.link} ↗</a>` : ""}
        ${(task.assessment && !READONLY) ? assessmentLaunchHtml(task) : ""}
        ${(!READONLY && report) ? `<div><button type="button" class="task-report">⚑ Report / suggest</button></div>` : ""}
      </div>
    </div>`;
}

// Render the cross-level search view. Empty query => normal single-level view.
// Non-empty => hide the pill bar + focus card and list matching tasks from every
// level, each wired to toggleTask.
function renderSearch() {
  const results = document.getElementById("search-results");
  const pillWrap = document.getElementById("pill-bar-wrap");
  const focus = document.getElementById("focus-card");
  const q = SEARCH_QUERY.trim().toLowerCase();
  if (!CURRICULUM || !q) {
    results.innerHTML = "";
    if (CURRICULUM) { pillWrap.classList.remove("hidden"); focus.classList.remove("hidden"); }
    return;
  }
  pillWrap.classList.add("hidden");
  focus.classList.add("hidden");
  const matches = [];
  for (const lvl of CURRICULUM.levels) {
    for (const task of lvl.tasks) {
      const hay = (task.title + " " + (task.desc || "")).toLowerCase();
      if (hay.includes(q)) matches.push({ task, levelId: lvl.id });
    }
  }
  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "search-empty";
    empty.textContent = `No steps match “${SEARCH_QUERY.trim()}”.`; // textContent: query is user input
    results.replaceChildren(empty);
    return;
  }
  const rows = matches.map((m) => taskRowHtml(m.task, { levelBadge: m.levelId, report: false })).join("");
  results.innerHTML =
    `<div class="search-head">${matches.length} match${matches.length === 1 ? "" : "es"}</div>${rows}`;
  results.querySelectorAll(".task").forEach((el) => {
    el.querySelector(".check").addEventListener("click", () => toggleTask(el.dataset.task));
  });
  wireAssessmentButtons(results);
}

// Wire the search input once.
function initSearch() {
  const input = document.getElementById("step-search");
  input.addEventListener("input", () => { SEARCH_QUERY = input.value; renderSearch(); });
}

function renderFocusCard() {
  const card = document.getElementById("focus-card");
  const lvl = CURRICULUM.levels.find((l) => l.id === FOCUS_LEVEL);
  if (!lvl) { card.innerHTML = ""; return; }
  const done = tasksDoneInLevel(lvl);
  const total = lvl.tasks.length;

  const taskHtml = lvl.tasks.map((task) => taskRowHtml(task)).join("");

  const hoursLine = (lvl.estimated_hours_min && lvl.estimated_hours_max)
    ? `<div class="level-hours">Estimated <strong>${lvl.estimated_hours_min}–${lvl.estimated_hours_max} hours</strong> to complete</div>`
    : "";
  card.innerHTML = `
    <div class="focus-head">
      <div>
        <span class="level-tag">LEVEL ${lvl.id.slice(1)} · ${lvl.id === computeCurrentLevel() ? "CURRENT" : "PREVIEW"}</span>
        <h2>${lvl.title}</h2>
        <div class="sub">${lvl.subtitle}</div>
        ${hoursLine}
        ${lvl.link ? `<div class="level-link"><a href="${lvl.link}" target="_blank" rel="noopener">Read the full level explanation on GitHub ↗</a></div>` : ""}
      </div>
      <div class="count">${done} / ${total}</div>
    </div>
    ${lvl.move_on_when ? `<div class="move-on"><strong>Move on when:</strong> ${lvl.move_on_when}</div>` : ""}
    ${taskHtml}
  `;
  card.querySelectorAll(".task").forEach((el) => {
    el.querySelector(".check").addEventListener("click", () => toggleTask(el.dataset.task));
    const rep = el.querySelector(".task-report");
    if (rep) rep.addEventListener("click", (e) => { e.stopPropagation(); openFeedback(el.dataset.task); });
  });
  wireAssessmentButtons(card);
}

// Show a non-blocking "Marked as done/not done · Undo" toast after a toggle
// saves. Undo re-toggles the same task. One toast at a time; each call resets
// the 5s auto-dismiss timer.
function showUndoToast(taskId, done) {
  const toast = document.getElementById("toast");
  document.getElementById("toast-msg").textContent = done ? "Marked as done" : "Marked as not done";
  const undo = document.getElementById("toast-undo");
  undo.onclick = () => { hideToast(); toggleTask(taskId); };
  toast.classList.remove("hidden");
  if (TOAST_TIMER) clearTimeout(TOAST_TIMER);
  TOAST_TIMER = setTimeout(hideToast, 5000);
}

function hideToast() {
  if (TOAST_TIMER) { clearTimeout(TOAST_TIMER); TOAST_TIMER = null; }
  document.getElementById("toast").classList.add("hidden");
}

async function toggleTask(taskId) {
  if (READONLY) return;
  const currentlyDone = PROGRESS.tasks[taskId]?.done === true;
  const newDone = !currentlyDone;
  // Optimistic
  PROGRESS.tasks[taskId] = { done: newDone, at: new Date().toISOString() };
  renderTotals();
  renderPillBar();
  renderFocusCard();
  renderSearch();
  // Persist
  try {
    const res = await apiFetch(WORKER + "/api/mark", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task_id: taskId, done: newDone }),
    });
    if (!res.ok) throw new Error("mark failed: " + res.status);
    PROGRESS = await res.json();
    showUndoToast(taskId, newDone);
    renderMotivation();
  } catch (e) {
    // Roll back
    PROGRESS.tasks[taskId] = { done: currentlyDone };
    renderTotals();
    renderPillBar();
    renderFocusCard();
    renderSearch();
    alert("Could not save your change. Try again in a moment.");
  }
}

function renderCompetencyPicker() {
  const box = document.getElementById("competency-picker");
  const options = MANIFEST.competencies || [];
  if (!options.length) { box.innerHTML = ""; return; }
  const selected = PROGRESS.competency || null;
  const label = READONLY ? "Competency" : "My competency";
  // Before a competency is picked there's no path to show, so make the prompt explicit.
  const hint = READONLY
    ? ""
    : selected
      ? `<span class="comp-hint">Pick the one area you work in</span>`
      : `<span class="comp-hint">Pick your competency to start — this loads your learning path.</span>`;
  const chips = options.map((c) => {
    const on = selected === c.id;
    return `<button type="button" class="comp-chip ${on ? "on" : ""}" data-comp="${c.id}"${READONLY ? " disabled" : ""}>${c.label}</button>`;
  }).join("");
  box.innerHTML = `<div class="comp-label">${label}</div>${hint}<div class="comp-chips">${chips}</div>`;
  if (READONLY) return;
  box.querySelectorAll(".comp-chip").forEach((el) => {
    el.addEventListener("click", () => selectCompetency(el.dataset.comp));
  });
}

async function selectCompetency(compId) {
  if (READONLY) return;
  const prev = PROGRESS.competency || null;
  // Single-select: clicking the active one clears it, otherwise it replaces.
  const next = prev === compId ? null : compId;
  // Optimistic
  PROGRESS.competency = next || undefined;
  renderCompetencyPicker();
  try {
    const res = await apiFetch(WORKER + "/api/competencies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ competency: next }),
    });
    if (!res.ok) throw new Error("competency save failed: " + res.status);
    PROGRESS = await res.json();
    renderCompetencyPicker();
    // The path depends on the competency: load & render it, or fall back to the gate.
    if (PROGRESS.competency) await renderPath();
    else showNoCompetency();
  } catch (e) {
    // Roll back
    PROGRESS.competency = prev || undefined;
    renderCompetencyPicker();
    alert("Could not save your competency. Try again in a moment.");
  }
}

// Render the engineer's learning path (competency already chosen).
async function renderPath() {
  CURRICULUM = await loadPath(PROGRESS.competency);
  FOCUS_LEVEL = computeCurrentLevel();
  const lvl = CURRICULUM.levels.find((l) => l.id === FOCUS_LEVEL);
  document.getElementById("greeting-sub").textContent = lvl ? `Currently at: LEVEL ${lvl.id.slice(1)} — ${lvl.title}` : "";
  document.getElementById("totals").classList.remove("hidden");
  document.getElementById("pill-bar-wrap").classList.remove("hidden");
  document.getElementById("step-search-wrap").classList.remove("hidden");
  renderTotals();
  renderPillBar();
  renderFocusCard();
  renderMotivation();
}

// No competency yet: hide the path UI and prompt the engineer to pick one (or, for an
// admin viewing read-only, explain there's nothing to show).
function showNoCompetency() {
  CURRICULUM = null;
  document.getElementById("totals").classList.add("hidden");
  document.getElementById("pill-bar-wrap").classList.add("hidden");
  document.getElementById("step-search-wrap").classList.add("hidden");
  SEARCH_QUERY = "";
  const searchInput = document.getElementById("step-search");
  if (searchInput) searchInput.value = "";
  renderSearch();
  document.getElementById("greeting-sub").textContent = READONLY
    ? "No competency selected"
    : "Pick your competency to start";
  document.getElementById("focus-card").innerHTML = READONLY
    ? `<div class="empty-path">This engineer hasn't selected a competency yet, so there's no learning path to show.</div>`
    : `<div class="empty-path">Choose your competency above to load your learning path.</div>`;
}

async function init() {
  MANIFEST = await loadManifest();
  const result = await loadProgress();
  hidePageLoader();
  if (result.unauthenticated) {
    // A stale/expired token may be sitting in localStorage; drop it so we don't keep
    // sending a dead Bearer header.
    clearAuthToken();
    document.getElementById("signed-out").classList.remove("hidden");
    document.getElementById("signin-link").href = WORKER + "/auth/login";
    return;
  }
  if (result.forbidden) {
    showPageError(new Error("Forbidden — admins only."), null);
    return;
  }
  PROGRESS = result.progress;
  READONLY = result.readonly;

  // A disabled engineer viewing their OWN page is locked out: show the explanatory
  // screen instead of the tracker. (Admins viewing via ?as= still see the progress.)
  if (!READONLY && PROGRESS.disabled) {
    document.getElementById("disabled").classList.remove("hidden");
    document.getElementById("user-box").innerHTML =
      `<a class="signout-link" href="${WORKER}/auth/logout" onclick="clearAuthToken()">Sign out</a>`;
    return;
  }

  document.getElementById("signed-in").classList.remove("hidden");

  const title = READONLY
    ? "Viewing " + (PROGRESS.display_name || PROGRESS.github_username) + (PROGRESS.disabled ? " (disabled)" : "")
    : "Welcome back, " + (PROGRESS.display_name || PROGRESS.github_username);
  document.getElementById("greeting-title").textContent = title;

  // Topbar: username + sign-out link
  const userBox = document.getElementById("user-box");
  const dashboardLink = PROGRESS.is_admin
    ? `<a class="dashboard-link" href="dashboard.html">Dashboard</a>`
    : "";
  userBox.innerHTML = `
    <span class="user-name">${PROGRESS.display_name || PROGRESS.github_username}</span>
    <a class="dashboard-link" href="wall.html">🏆 Wall</a>
    <a class="dashboard-link" href="cert.html">🎓 Certifications</a>
    ${dashboardLink}
    <a class="signout-link" href="${WORKER}/auth/logout" onclick="clearAuthToken()">Sign out</a>
  `;

  if (READONLY) document.body.classList.add("readonly");
  if (!READONLY) {
    document.getElementById("feedback-open").classList.remove("hidden"); // reveal the floating button
    initFeedback();
    // Best-effort: light up the "on the wall" badge if this engineer appears anywhere.
    apiFetch(WORKER + "/api/wall")
      .then((r) => r.ok ? r.json() : null)
      .then((wall) => {
        if (!wall) return;
        const me = PROGRESS.github_username;
        ON_WALL = Object.values(wall.cards).some((list) => list.some((e) => e.username === me));
        renderMotivation();
      })
      .catch(() => {}); // non-fatal — the badge just stays hidden
  }

  renderCompetencyPicker();
  initSearch();
  // The learning path depends on the chosen competency — gate until one is picked.
  if (PROGRESS.competency) await renderPath();
  else showNoCompetency();
}

init().catch((e) => {
  showPageError(e, () => init());
});
