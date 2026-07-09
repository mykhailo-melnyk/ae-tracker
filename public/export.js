// export.js — admin-only export of engineers by competency.
// Reads the already-loaded AGG (aggregate) and CUR (curriculum); never mutates
// them. Produces a flat CSV (zero dependencies) and a true .xlsx workbook with a
// leading Summary sheet (SheetJS, loaded lazily from CDN on first Excel export).

// Pinned SheetJS build from the official CDN (the npm `xlsx` mirrors are stale).
const SHEETJS_URL = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";

const UNASSIGNED = "__unassigned__";
const NO_LEADER = "__no_leader__";

function compLabel(CUR, id) {
  if (!id) return "Unassigned";
  const c = (CUR.competencies || []).find((c) => c.id === id);
  return c ? c.label : id;
}

function leaderLabelFor(AGG, username) {
  if (!username) return "Unassigned";
  const e = AGG.engineers.find((x) => x.username === username);
  return e ? (e.display_name || e.username) : username;
}

// Distinct leader usernames present in the aggregate, sorted by display name.
function leaderList(AGG) {
  return [...new Set(AGG.engineers.map((e) => e.unit_leader).filter(Boolean))]
    .sort((a, b) => leaderLabelFor(AGG, a).localeCompare(leaderLabelFor(AGG, b)));
}

// Engineers passing BOTH the competency selection and the unit-leader selection
// (intersection). chosenLeaders is a Set of leader usernames; includeNoLeader covers
// engineers with no leader assigned.
function selectedEngineers(AGG, chosenIds, includeUnassigned, chosenLeaders, includeNoLeader) {
  return AGG.engineers.filter((e) => {
    const compOk = (e.competency && chosenIds.has(e.competency)) || (!e.competency && includeUnassigned);
    const leaderOk = (e.unit_leader && chosenLeaders.has(e.unit_leader)) || (!e.unit_leader && includeNoLeader);
    return compOk && leaderOk;
  });
}

function buildRows(AGG, engineers, CUR) {
  return engineers.map((e) => ({
    Name: e.display_name || e.username,
    GitHub: "@" + e.username,
    Competency: compLabel(CUR, e.competency),
    "Unit leader": leaderLabelFor(AGG, e.unit_leader),
    "Current level": e.current_level,
    "Completion %": Math.round(e.completion_pct * 100),
    "Last active": new Date(e.last_active).toLocaleDateString(),
  }));
}

function fileDate() {
  return new Date().toISOString().slice(0, 10);
}

// ---- CSV ----

function csvCell(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadCsv(rows) {
  const headers = Object.keys(rows[0] || {
    Name: "", GitHub: "", Competency: "", "Unit leader": "", "Current level": "", "Completion %": "", "Last active": "",
  });
  const lines = [headers.map(csvCell).join(",")]
    .concat(rows.map((r) => headers.map((h) => csvCell(r[h])).join(",")));
  // BOM so Excel reads UTF-8 (accented names) correctly.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, "ae-progress-" + fileDate() + ".csv");
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---- xlsx (lazy SheetJS) ----

let sheetJsPromise = null;
function loadSheetJs() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (sheetJsPromise) return sheetJsPromise;
  sheetJsPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SHEETJS_URL;
    s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error("SheetJS failed to load")));
    s.onerror = () => { sheetJsPromise = null; reject(new Error("Could not load the Excel library")); };
    document.head.appendChild(s);
  });
  return sheetJsPromise;
}

function summaryAoa(AGG, engineers, CUR, chosenIds, includeUnassigned, chosenLeaders, includeNoLeader) {
  const aoa = [];
  aoa.push(["AE Tracker — engineer export"]);
  aoa.push(["Generated", new Date().toLocaleString()]);
  const chosenLabels = (CUR.competencies || [])
    .filter((c) => chosenIds.has(c.id))
    .map((c) => c.label)
    .concat(includeUnassigned ? ["Unassigned"] : []);
  aoa.push(["Competencies", chosenLabels.join(", ")]);
  aoa.push(["Total engineers", engineers.length]);
  const avg = engineers.length
    ? Math.round((100 * engineers.reduce((n, e) => n + e.completion_pct, 0)) / engineers.length)
    : 0;
  aoa.push(["Avg completion %", avg]);
  aoa.push([]);

  aoa.push(["By competency", "Count"]);
  for (const c of CUR.competencies || []) {
    if (!chosenIds.has(c.id)) continue;
    aoa.push([c.label, engineers.filter((e) => e.competency === c.id).length]);
  }
  if (includeUnassigned) {
    aoa.push(["Unassigned", engineers.filter((e) => !e.competency).length]);
  }
  aoa.push([]);

  aoa.push(["By unit leader", "Count"]);
  for (const u of [...chosenLeaders].sort((a, b) => leaderLabelFor(AGG, a).localeCompare(leaderLabelFor(AGG, b)))) {
    aoa.push([leaderLabelFor(AGG, u), engineers.filter((e) => e.unit_leader === u).length]);
  }
  if (includeNoLeader) {
    aoa.push(["Unassigned", engineers.filter((e) => !e.unit_leader).length]);
  }
  aoa.push([]);

  aoa.push(["By current level", "Count"]);
  for (const lvl of ["L1", "L2", "L3", "L4", "L5"]) {
    aoa.push([lvl, engineers.filter((e) => e.current_level === lvl).length]);
  }
  return aoa;
}

async function downloadXlsx(AGG, engineers, rows, CUR, chosenIds, includeUnassigned, chosenLeaders, includeNoLeader) {
  const XLSX = await loadSheetJs();
  const wb = XLSX.utils.book_new();

  const summary = XLSX.utils.aoa_to_sheet(summaryAoa(AGG, engineers, CUR, chosenIds, includeUnassigned, chosenLeaders, includeNoLeader));
  summary["!cols"] = [{ wch: 24 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, summary, "Summary");

  const people = XLSX.utils.json_to_sheet(rows);
  people["!cols"] = [{ wch: 24 }, { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 13 }, { wch: 12 }, { wch: 13 }];
  XLSX.utils.book_append_sheet(wb, people, "Engineers");

  XLSX.writeFile(wb, "ae-progress-" + fileDate() + ".xlsx");
}

// ---- Modal ----

function openExportDialog(AGG, CUR) {
  const comps = CUR.competencies || [];
  const leaders = leaderList(AGG);

  const backdrop = document.createElement("div");
  backdrop.className = "export-backdrop";
  backdrop.innerHTML = `
    <div class="export-modal" role="dialog" aria-modal="true" aria-label="Export engineers">
      <div class="export-head">
        <h3>Export engineers</h3>
        <button class="export-close" aria-label="Close">×</button>
      </div>
      <div class="export-body">
        <div class="export-section-label">Competencies to include</div>
        <div class="export-checks">
          <label class="export-check"><input type="checkbox" data-all> <span>Select all</span></label>
          ${comps.map((c) => `<label class="export-check"><input type="checkbox" value="${c.id}" checked> <span>${c.label}</span></label>`).join("")}
          <label class="export-check"><input type="checkbox" value="${UNASSIGNED}" checked> <span>Unassigned</span></label>
        </div>
        <div class="export-section-label">Unit leaders to include</div>
        <div class="export-checks" id="export-leader-checks">
          <label class="export-check"><input type="checkbox" data-all-leaders> <span>Select all</span></label>
          ${leaders.map((u) => `<label class="export-check"><input type="checkbox" data-leader value="${u}" checked> <span>${leaderLabelFor(AGG, u)}</span></label>`).join("")}
          <label class="export-check"><input type="checkbox" data-leader value="${NO_LEADER}" checked> <span>Unassigned</span></label>
        </div>
        <div class="export-count" id="export-count"></div>
      </div>
      <div class="export-actions">
        <button class="export-dl" data-fmt="csv">Download CSV</button>
        <button class="export-dl primary" data-fmt="xlsx">Download Excel (.xlsx)</button>
      </div>
    </div>`;

  const close = () => backdrop.remove();
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  backdrop.querySelector(".export-close").addEventListener("click", close);
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", esc); }
  });

  const itemBoxes = () => Array.from(backdrop.querySelectorAll('.export-checks input[value]:not([data-leader])'));
  const leaderBoxes = () => Array.from(backdrop.querySelectorAll('.export-checks input[data-leader]'));
  const allBox = backdrop.querySelector("input[data-all]");
  const allLeadersBox = backdrop.querySelector("input[data-all-leaders]");
  const countEl = backdrop.querySelector("#export-count");

  function currentSelection() {
    const checked = itemBoxes().filter((b) => b.checked).map((b) => b.value);
    const includeUnassigned = checked.includes(UNASSIGNED);
    const chosenIds = new Set(checked.filter((v) => v !== UNASSIGNED));
    const checkedL = leaderBoxes().filter((b) => b.checked).map((b) => b.value);
    const includeNoLeader = checkedL.includes(NO_LEADER);
    const chosenLeaders = new Set(checkedL.filter((v) => v !== NO_LEADER));
    return { chosenIds, includeUnassigned, chosenLeaders, includeNoLeader };
  }

  function refreshCount() {
    allBox.checked = itemBoxes().every((b) => b.checked);
    allLeadersBox.checked = leaderBoxes().every((b) => b.checked);
    const { chosenIds, includeUnassigned, chosenLeaders, includeNoLeader } = currentSelection();
    const n = selectedEngineers(AGG, chosenIds, includeUnassigned, chosenLeaders, includeNoLeader).length;
    countEl.textContent = n + (n === 1 ? " engineer selected" : " engineers selected");
  }

  allBox.addEventListener("change", () => {
    itemBoxes().forEach((b) => { b.checked = allBox.checked; });
    refreshCount();
  });
  itemBoxes().forEach((b) => b.addEventListener("change", refreshCount));

  allLeadersBox.addEventListener("change", () => {
    leaderBoxes().forEach((b) => { b.checked = allLeadersBox.checked; });
    refreshCount();
  });
  leaderBoxes().forEach((b) => b.addEventListener("change", refreshCount));

  backdrop.querySelectorAll(".export-dl").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { chosenIds, includeUnassigned, chosenLeaders, includeNoLeader } = currentSelection();
      const engineers = selectedEngineers(AGG, chosenIds, includeUnassigned, chosenLeaders, includeNoLeader);
      if (!engineers.length) { countEl.textContent = "No engineers match — widen your selection."; return; }
      const rows = buildRows(AGG, engineers, CUR);
      if (btn.dataset.fmt === "csv") {
        downloadCsv(rows);
      } else {
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Preparing…";
        try {
          await downloadXlsx(AGG, engineers, rows, CUR, chosenIds, includeUnassigned, chosenLeaders, includeNoLeader);
        } catch (e) {
          alert(e.message || "Excel export failed.");
        } finally {
          btn.disabled = false;
          btn.textContent = label;
        }
      }
    });
  });

  document.body.appendChild(backdrop);
  refreshCount();
}
