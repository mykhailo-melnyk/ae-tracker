const WORKER = window.WORKER_URL;
let MANIFEST = null;       // curriculum.json — competency registry + shared L1–L5 framework
let CURRICULUM = null;     // the engineer's composed path (manifest levels + their competency's tasks)
let PROGRESS = null;
let FOCUS_LEVEL = null;
let READONLY = false;
let FB_TASK = null;    // task id the open feedback modal is scoped to (null = general)
let FB_TYPE = "bug";   // currently selected feedback type

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

function renderFocusCard() {
  const card = document.getElementById("focus-card");
  const lvl = CURRICULUM.levels.find((l) => l.id === FOCUS_LEVEL);
  if (!lvl) { card.innerHTML = ""; return; }
  const done = tasksDoneInLevel(lvl);
  const total = lvl.tasks.length;

  const taskHtml = lvl.tasks.map((task) => {
    const isDone = PROGRESS.tasks[task.id]?.done === true;
    return `
      <div class="task ${isDone ? "done" : ""}" data-task="${task.id}">
        <div class="check"></div>
        <div class="body">
          <div class="title">${task.title} <span class="kind-tag ${task.kind}">${task.kind}</span></div>
          ${task.desc ? `<div class="desc">${task.desc}</div>` : ""}
          ${task.link ? `<a class="external" href="${task.link}" target="_blank" rel="noopener">${task.link} ↗</a>` : ""}
          ${READONLY ? "" : `<div><button type="button" class="task-report">⚑ Report / suggest</button></div>`}
        </div>
      </div>`;
  }).join("");

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
}

// ---- Feedback modal ----

// Open the modal scoped to a task (taskId) or general (null). No-op in read-only view.
function openFeedback(taskId) {
  if (READONLY) return;
  FB_TASK = taskId || null;
  FB_TYPE = "bug";
  document.getElementById("fb-title").textContent = FB_TASK ? "Report an issue with " + FB_TASK : "Send feedback";
  document.querySelectorAll(".fb-type").forEach((b) => b.classList.toggle("on", b.dataset.type === FB_TYPE));
  const msg = document.getElementById("fb-message");
  msg.value = "";
  document.getElementById("fb-count").textContent = "0";
  const result = document.getElementById("fb-result");
  result.textContent = ""; result.className = "fb-result";
  document.getElementById("fb-submit").disabled = false;
  document.getElementById("feedback-modal").classList.remove("hidden");
  msg.focus();
}

function closeFeedback() {
  document.getElementById("feedback-modal").classList.add("hidden");
}

async function submitFeedback() {
  const message = document.getElementById("fb-message").value.trim();
  const result = document.getElementById("fb-result");
  if (message.length < 1) { result.textContent = "Please enter a message."; result.className = "fb-result error"; return; }
  const submit = document.getElementById("fb-submit");
  submit.disabled = true; // in-flight guard against double-submit
  result.textContent = "Sending…"; result.className = "fb-result";
  try {
    const res = await apiFetch(WORKER + "/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: FB_TYPE, message, task_id: FB_TASK || undefined }),
    });
    if (!res.ok) throw new Error("feedback failed: " + res.status);
    const { url } = await res.json();
    result.className = "fb-result ok";
    result.innerHTML = `Thanks — tracked here <a href="${url}" target="_blank" rel="noopener">↗</a>`;
    document.getElementById("fb-message").value = "";
    document.getElementById("fb-count").textContent = "0";
    submit.disabled = false;
  } catch (e) {
    result.textContent = "Could not send feedback. Try again in a moment.";
    result.className = "fb-result error";
    submit.disabled = false;
  }
}

// Wire the modal's static controls (and the general "Send feedback" button) once.
function initFeedback() {
  document.getElementById("fb-close").addEventListener("click", closeFeedback);
  document.getElementById("fb-cancel").addEventListener("click", closeFeedback);
  document.getElementById("feedback-modal").addEventListener("click", (e) => {
    if (e.target.id === "feedback-modal") closeFeedback(); // click on the backdrop
  });
  document.querySelectorAll(".fb-type").forEach((b) => {
    b.addEventListener("click", () => {
      FB_TYPE = b.dataset.type;
      document.querySelectorAll(".fb-type").forEach((x) => x.classList.toggle("on", x === b));
    });
  });
  const msg = document.getElementById("fb-message");
  msg.addEventListener("input", () => { document.getElementById("fb-count").textContent = String(msg.value.length); });
  document.getElementById("fb-submit").addEventListener("click", submitFeedback);
  const open = document.getElementById("feedback-open");
  if (open) open.addEventListener("click", () => openFeedback(null));
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
  // Persist
  try {
    const res = await apiFetch(WORKER + "/api/mark", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task_id: taskId, done: newDone }),
    });
    if (!res.ok) throw new Error("mark failed: " + res.status);
    PROGRESS = await res.json();
  } catch (e) {
    // Roll back
    PROGRESS.tasks[taskId] = { done: currentlyDone };
    renderTotals();
    renderPillBar();
    renderFocusCard();
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
  document.getElementById("greeting-sub").textContent = lvl ? "Currently at " + lvl.title : "";
  document.getElementById("totals").classList.remove("hidden");
  document.getElementById("pill-bar-wrap").classList.remove("hidden");
  renderTotals();
  renderPillBar();
  renderFocusCard();
}

// No competency yet: hide the path UI and prompt the engineer to pick one (or, for an
// admin viewing read-only, explain there's nothing to show).
function showNoCompetency() {
  CURRICULUM = null;
  document.getElementById("totals").classList.add("hidden");
  document.getElementById("pill-bar-wrap").classList.add("hidden");
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
  if (result.unauthenticated) {
    // A stale/expired token may be sitting in localStorage; drop it so we don't keep
    // sending a dead Bearer header.
    clearAuthToken();
    document.getElementById("signed-out").classList.remove("hidden");
    document.getElementById("signin-link").href = WORKER + "/auth/login";
    return;
  }
  if (result.forbidden) {
    document.body.innerHTML = "<pre style='padding:24px;color:#b91c1c'>Forbidden — admins only.</pre>";
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
    ${dashboardLink}
    <a class="signout-link" href="${WORKER}/auth/logout" onclick="clearAuthToken()">Sign out</a>
  `;

  if (READONLY) document.body.classList.add("readonly");
  if (!READONLY) {
    document.getElementById("feedback-open").classList.remove("hidden"); // reveal the floating button
    initFeedback();
  }

  renderCompetencyPicker();
  // The learning path depends on the chosen competency — gate until one is picked.
  if (PROGRESS.competency) await renderPath();
  else showNoCompetency();
}

init().catch((e) => {
  document.body.innerHTML = "<pre style='padding:24px;color:#b91c1c'>" + e.message + "</pre>";
});
