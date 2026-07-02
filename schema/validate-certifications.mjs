// Validates the certifications registry and every per-cert path file it points to.
// Registry-driven: adding a cert needs no change here — just a registry entry + its
// path file. Run locally with `node schema/validate-certifications.mjs`; CI runs the
// same script. Exits non-zero (and prints why) on any violation.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const KINDS = new Set(["reading", "practice", "video"]);
const errors = [];
const fail = (m) => errors.push(m);

const registry = readJson(join(pub, "certifications.json"));
if (!registry.version) fail("certifications.json: missing version");
if (!Array.isArray(registry.certifications)) fail("certifications.json: certifications must be an array");

const seenIds = new Map(); // itemId -> cert id that owns it

for (const cert of registry.certifications ?? []) {
  for (const k of ["id", "code", "label", "file"]) {
    if (typeof cert[k] !== "string" || !cert[k]) fail(`cert "${cert.id ?? "?"}": missing/invalid "${k}"`);
  }
  if (!cert.file || !existsSync(join(pub, cert.file))) {
    fail(`cert "${cert.id}": file public/${cert.file} is missing`);
    continue;
  }
  let path;
  try { path = readJson(join(pub, cert.file)); }
  catch { fail(`cert "${cert.id}": public/${cert.file} is not valid JSON`); continue; }

  if (path.certification !== cert.id) {
    fail(`public/${cert.file}: certification "${path.certification}" != registry id "${cert.id}"`);
  }
  if (!Array.isArray(path.sections)) { fail(`public/${cert.file}: sections must be an array`); continue; }

  const idRe = new RegExp("^" + cert.code + "\\.[a-z0-9-]+\\.\\d+$");
  for (const sec of path.sections) {
    if (!sec.id || !sec.title) fail(`public/${cert.file}: a section is missing id/title`);
    if (!Array.isArray(sec.items)) { fail(`public/${cert.file} section "${sec.id}": items must be an array`); continue; }
    for (const it of sec.items) {
      if (typeof it.id !== "string") { fail(`public/${cert.file} section "${sec.id}": item missing id`); continue; }
      if (it.id.length > 32) fail(`item id "${it.id}" exceeds 32 chars (POST /api/mark limit)`);
      if (!idRe.test(it.id)) fail(`item id "${it.id}" must match ${idRe} (cert code "${cert.code}")`);
      if (!KINDS.has(it.kind)) fail(`item "${it.id}": kind "${it.kind}" not in ${[...KINDS].join("|")}`);
      if (typeof it.title !== "string" || !it.title) fail(`item "${it.id}": missing title`);
      if (seenIds.has(it.id)) fail(`item id "${it.id}" duplicated (in ${cert.id} and ${seenIds.get(it.id)})`);
      else seenIds.set(it.id, cert.id);
    }
  }
}

if (errors.length) {
  console.error("Certification validation FAILED:\n\n" + errors.join("\n"));
  process.exit(1);
}
console.log(`Certifications OK: registry + ${(registry.certifications ?? []).length} path file(s), ${seenIds.size} unique item ids.`);
