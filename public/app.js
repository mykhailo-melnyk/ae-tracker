const WORKER = window.WORKER_URL;
let CURRICULUM = null;
let PROGRESS = null;
let FOCUS_LEVEL = null;

async function loadCurriculum() {
  const res = await fetch("curriculum.json");
  if (!res.ok) throw new Error("curriculum load failed");
  return res.json();
}

async function loadMe() {
  const res = await fetch(WORKER + "/api/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("loadMe failed: " + res.status);
  return res.json();
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
        </div>
      </div>`;
  }).join("");

  card.innerHTML = `
    <div class="focus-head">
      <div>
        <span class="level-tag">LEVEL ${lvl.id.slice(1)} · ${lvl.id === computeCurrentLevel() ? "CURRENT" : "PREVIEW"}</span>
        <h2>${lvl.title}</h2>
        <div class="sub">${lvl.subtitle}</div>
      </div>
      <div class="count">${done} / ${total}</div>
    </div>
    ${lvl.move_on_when ? `<div class="move-on"><strong>Move on when:</strong> ${lvl.move_on_when}</div>` : ""}
    ${taskHtml}
  `;
  card.querySelectorAll(".task").forEach((el) => {
    el.querySelector(".check").addEventListener("click", () => toggleTask(el.dataset.task));
  });
}

async function toggleTask(taskId) {
  const currentlyDone = PROGRESS.tasks[taskId]?.done === true;
  const newDone = !currentlyDone;
  // Optimistic
  PROGRESS.tasks[taskId] = { done: newDone, at: new Date().toISOString() };
  renderTotals();
  renderPillBar();
  renderFocusCard();
  // Persist
  try {
    const res = await fetch(WORKER + "/api/mark", {
      method: "POST",
      credentials: "include",
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

async function init() {
  CURRICULUM = await loadCurriculum();
  const me = await loadMe();
  if (!me) {
    document.getElementById("signed-out").classList.remove("hidden");
    document.getElementById("signin-link").href = WORKER + "/auth/login";
    return;
  }
  PROGRESS = me;
  FOCUS_LEVEL = computeCurrentLevel();
  document.getElementById("signed-in").classList.remove("hidden");
  document.getElementById("greeting-title").textContent =
    "Welcome back, " + (PROGRESS.display_name || PROGRESS.github_username);
  const lvl = CURRICULUM.levels.find((l) => l.id === FOCUS_LEVEL);
  document.getElementById("greeting-sub").textContent = "Currently at " + lvl.title;
  renderTotals();
  renderPillBar();
  renderFocusCard();
}

init().catch((e) => {
  document.body.innerHTML = "<pre style='padding:24px;color:#b91c1c'>" + e.message + "</pre>";
});
