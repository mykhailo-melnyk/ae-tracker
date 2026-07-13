const WORKER = window.WORKER_URL;
let REGISTRY = null;      // certifications.json
let PROGRESS = null;      // the engineer's progress file
let CURRENT = null;       // the loaded path file for the focused certification
let VENDOR_ID = null;     // selected vendor key (into REGISTRY.vendors)
let VENDOR_CERTS = [];    // [{ meta, path }] for every certification of the selected vendor

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

// Vendor picker — uses the tracker's competency-picker markup (.comp-label /
// .comp-chips / .comp-chip.on), all defined under `.competency-picker` in
// styles.css — the only stylesheet cert.html loads.
function renderVendorPicker() {
  const box = document.getElementById("cert-picker");
  const vendorIds = Object.keys(REGISTRY.vendors || {});
  const chips = vendorIds.map((id) => {
    const on = VENDOR_ID === id;
    return `<button type="button" class="comp-chip ${on ? "on" : ""}" data-vendor="${id}">${REGISTRY.vendors[id].label}</button>`;
  }).join("");
  box.innerHTML = `<div class="comp-label">Vendor</div><div class="comp-chips">${chips}</div>`;
  box.querySelectorAll(".comp-chip").forEach((el) =>
    el.addEventListener("click", () => selectVendor(el.dataset.vendor)));
}

// Certification pill bar for the selected vendor — one .pill per certification,
// mirroring the tracker's renderPillBar (app.js) for competency levels. VENDOR_CERTS
// is fully loaded (every certification's path file) before this renders, so both
// progress counts and exam.name are available without extra fetches per card.
function renderCertPillBar() {
  const bar = document.getElementById("cert-pill-bar");
  bar.innerHTML = "";
  for (const { meta, path } of VENDOR_CERTS) {
    const items = allItems(path);
    const done = items.filter((it) => PROGRESS.tasks[it.id]?.done).length;
    const total = items.length;
    const complete = total > 0 && done === total;
    const isFocus = CURRENT && CURRENT.certification === meta.id;
    const cls = complete ? "complete" : (isFocus ? "current" : "");
    const pill = document.createElement("div");
    pill.className = "pill " + cls;
    pill.innerHTML = `
      <div class="pill-name">${(path.exam && path.exam.name) || meta.label}</div>
      <div class="pill-count">${complete ? "✓ " : ""}${done} / ${total}</div>
      <div class="pill-bar-mini"><div style="width:${total ? (done / total) * 100 : 0}%"></div></div>
    `;
    pill.addEventListener("click", () => focusCert(meta.id));
    bar.appendChild(pill);
  }
}

function renderBanner() {
  const box = document.getElementById("cert-banner");
  const parts = [];
  if (CURRENT && CURRENT.exam && CURRENT.exam.name) {
    // The pill card also shows this name, but truncates long ones with an
    // ellipsis (.pill-name is nowrap) — this is the only place it's shown in full.
    parts.push(`<div class="move-on">Prep path for: <strong>${CURRENT.exam.name}</strong></div>`);
  }
  if (CURRENT && CURRENT.draft) {
    const note = CURRENT.exam && CURRENT.exam.notes ? CURRENT.exam.notes : "This path is a draft under review.";
    parts.push(`<div class="move-on"><strong>Draft:</strong> ${note}</div>`);
  } else if (CURRENT && CURRENT.exam && CURRENT.exam.notes) {
    parts.push(`<div class="move-on">${CURRENT.exam.notes}</div>`);
  }
  box.innerHTML = parts.join("");
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
            <div class="title">${it.title} <span class="kind-tag ${it.kind}">${it.kind}</span>${it.optional ? `<span class="kind-tag optional">optional</span>` : ""}${it.estimated_minutes ? `<span class="task-est">· ${formatEstimate(it.estimated_minutes)}</span>` : ""}</div>
            ${it.desc ? `<div class="desc">${it.desc}</div>` : ""}
            ${it.exam_note ? `<div class="exam-note">${it.exam_note}</div>` : ""}
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
  renderVendorPicker();
  renderCertPillBar();
  if (!CURRENT) {
    document.getElementById("cert-banner").innerHTML = "";
    document.getElementById("cert-body").innerHTML =
      `<div class="empty-path">This vendor has no certification prep paths yet.</div>`;
    return;
  }
  renderBanner();
  renderBody();
}

// Loads every certification's path file for the given vendor in parallel, then
// focuses the vendor's first certification (same zero-extra-click default the
// page had with a single certification before this redesign).
async function selectVendor(vendorId) {
  VENDOR_ID = vendorId;
  const certs = (REGISTRY.certifications || []).filter((c) => c.vendor === vendorId);
  VENDOR_CERTS = await Promise.all(certs.map(async (meta) => ({ meta, path: await loadPath(meta.id) })));
  CURRENT = VENDOR_CERTS.length ? VENDOR_CERTS[0].path : null;
  renderCert();
}

// Switches the focused certification within the already-loaded VENDOR_CERTS —
// no fetch needed, every vendor certification was loaded by selectVendor.
function focusCert(certId) {
  const entry = VENDOR_CERTS.find((v) => v.meta.id === certId);
  if (!entry) return;
  CURRENT = entry.path;
  renderCert();
}

async function toggleItem(itemId) {
  const currentlyDone = PROGRESS.tasks[itemId]?.done === true;
  const newDone = !currentlyDone;
  PROGRESS.tasks[itemId] = { done: newDone, at: new Date().toISOString() }; // optimistic
  renderCertPillBar();
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
    renderCertPillBar();
    renderBody();
    alert("Could not save your change. Try again in a moment.");
  }
}

async function init() {
  const res = await apiFetch(WORKER + "/api/me");
  hidePageLoader();
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
  const firstVendor = Object.keys(REGISTRY.vendors || {})[0];
  if (firstVendor) await selectVendor(firstVendor);
}

init().catch((e) => {
  showPageError(e, () => init());
});
