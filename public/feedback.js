// Shared feedback modal — used by the tracker (app.js) and the certification
// page (cert.js). Both pages load this before their own script and provide the
// same static markup (#feedback-open FAB + #feedback-modal) plus the shared
// styles.css. It uses the globals defined by auth.js (`apiFetch`) and by each
// page's script (`WORKER`); it declares none of them.
//
// Entry points gate their own visibility (the tracker hides them in read-only
// view), so openFeedback itself makes no read-only check.

let FB_TASK = null;    // task/item id the open feedback modal is scoped to (null = general)
let FB_TYPE = "bug";   // currently selected feedback type

// Open the modal scoped to a task/item (taskId) or general (null).
function openFeedback(taskId) {
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
