const WORKER = window.WORKER_URL;
let REGISTRY = null;    // certifications.json
let PROGRESS = null;    // the engineer's progress file
let CURRENT = null;     // the loaded path file for the selected cert

function formatEstimate(min) {
  if (min < 60) return min + " min";
  const hrs = min / 60;
  return (Number.isInteger(hrs) ? hrs : hrs.toFixed(1)) + " hr";
}

async function loadRegistry() {
  const res = await fetch("certifications.json");
  if (!res.ok) throw new Error("registry load failed: " + res.status);
  return res.json();
}

async function loadPath(certId) {
  const res = await fetch("certification." + certId + ".json");
  if (!res.ok) throw new Error("path load failed: " + certId);
  return res.json();
}

// Flatten a path's items for progress math.
function allItems(path) {
  return path.sections.flatMap((s) => s.items);
}

// Uses the tracker's competency-picker markup (.comp-label / .comp-chips / .comp-chip.on),
// all defined under `.competency-picker` in styles.css — the only stylesheet cert.html loads.
function renderPicker() {
  const box = document.getElementById("cert-picker");
  const certs = REGISTRY.certifications || [];
  const chips = certs.map((c) => {
    const on = CURRENT && CURRENT.certification === c.id;
    return `<button type="button" class="comp-chip ${on ? "on" : ""}" data-cert="${c.id}">${c.label}</button>`;
  }).join("");
  box.innerHTML = `<div class="comp-label">Certification</div><div class="comp-chips">${chips}</div>`;
  box.querySelectorAll(".comp-chip").forEach((el) =>
    el.addEventListener("click", () => selectCert(el.dataset.cert)));
}

function renderBanner() {
  const box = document.getElementById("cert-banner");
  if (CURRENT && CURRENT.draft) {
    const note = CURRENT.exam && CURRENT.exam.notes ? CURRENT.exam.notes : "This path is a draft under review.";
    box.innerHTML = `<div class="move-on"><strong>Draft:</strong> ${note}</div>`;
  } else {
    box.innerHTML = "";
  }
}

function renderTotals() {
  const items = allItems(CURRENT);
  const done = items.filter((it) => PROGRESS.tasks[it.id]?.done).length;
  document.getElementById("cert-totals").innerHTML =
    `<strong>${done}</strong> / ${items.length} items done`;
}

function renderBody() {
  const body = document.getElementById("cert-body");
  const examLink = CURRENT.exam && CURRENT.exam.link
    ? `<div class="level-link"><a href="${CURRENT.exam.link}" target="_blank" rel="noopener">Official exam page ↗</a></div>` : "";

  const sectionsHtml = CURRENT.sections.map((sec) => {
    const done = sec.items.filter((it) => PROGRESS.tasks[it.id]?.done).length;
    const itemsHtml = sec.items.map((it) => {
      const isDone = PROGRESS.tasks[it.id]?.done === true;
      return `
        <div class="task ${isDone ? "done" : ""}" data-item="${it.id}">
          <div class="check"></div>
          <div class="body">
            <div class="title">${it.title} <span class="kind-tag ${it.kind}">${it.kind}</span>${it.estimated_minutes ? `<span class="task-est">· ${formatEstimate(it.estimated_minutes)}</span>` : ""}</div>
            ${it.desc ? `<div class="desc">${it.desc}</div>` : ""}
            ${it.link ? `<a class="external" href="${it.link}" target="_blank" rel="noopener">${it.link} ↗</a>` : ""}
          </div>
        </div>`;
    }).join("");
    return `
      <div class="focus-card">
        <div class="focus-head">
          <div><h2>${sec.title}</h2></div>
          <div class="count">${done} / ${sec.items.length}</div>
        </div>
        ${itemsHtml}
      </div>`;
  }).join("");

  body.innerHTML = examLink + sectionsHtml;
  body.querySelectorAll(".task").forEach((el) =>
    el.querySelector(".check").addEventListener("click", () => toggleItem(el.dataset.item)));
}

function renderCert() {
  renderPicker();
  renderBanner();
  renderTotals();
  renderBody();
}

async function selectCert(certId) {
  CURRENT = await loadPath(certId);
  renderCert();
}

async function toggleItem(itemId) {
  const currentlyDone = PROGRESS.tasks[itemId]?.done === true;
  const newDone = !currentlyDone;
  PROGRESS.tasks[itemId] = { done: newDone, at: new Date().toISOString() }; // optimistic
  renderTotals();
  renderBody();
  try {
    const res = await apiFetch(WORKER + "/api/mark", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task_id: itemId, done: newDone }),
    });
    if (!res.ok) throw new Error("mark failed: " + res.status);
    PROGRESS = await res.json();
  } catch (e) {
    PROGRESS.tasks[itemId] = { done: currentlyDone }; // roll back
    renderTotals();
    renderBody();
    alert("Could not save your change. Try again in a moment.");
  }
}

async function init() {
  const res = await apiFetch(WORKER + "/api/me");
  if (res.status === 401) {
    clearAuthToken();
    document.getElementById("signed-out").classList.remove("hidden");
    document.getElementById("signin-link").href = WORKER + "/auth/login";
    return;
  }
  if (!res.ok) throw new Error("loadMe failed: " + res.status);
  PROGRESS = await res.json();

  if (PROGRESS.disabled) {
    document.getElementById("disabled").classList.remove("hidden");
    document.getElementById("user-box").innerHTML =
      `<a class="signout-link" href="${WORKER}/auth/logout" onclick="clearAuthToken()">Sign out</a>`;
    return;
  }

  document.getElementById("user-box").innerHTML = `
    <span class="user-name">${PROGRESS.display_name || PROGRESS.github_username}</span>
    <a class="dashboard-link" href="tracker.html">← Tracker</a>
    <a class="signout-link" href="${WORKER}/auth/logout" onclick="clearAuthToken()">Sign out</a>
  `;

  REGISTRY = await loadRegistry();
  document.getElementById("cert-app").classList.remove("hidden");
  const first = (REGISTRY.certifications || [])[0];
  if (first) await selectCert(first.id);
}

init().catch((e) => {
  document.body.innerHTML = "<pre style='padding:24px;color:#b91c1c'>" + e.message + "</pre>";
});
