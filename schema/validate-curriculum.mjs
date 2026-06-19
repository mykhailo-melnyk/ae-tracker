// Validates the curriculum manifest and every per-competency path file it points to.
// Manifest-driven: adding a competency needs no change here — just a manifest entry
// + its path file. Run locally with `node schema/validate-curriculum.mjs`; CI runs
// the same script. Exits non-zero (and prints why) on any violation.
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = join(root, "public");
const schemaDir = join(root, "schema");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validateManifest = ajv.compile(readJson(join(schemaDir, "curriculum.manifest.schema.json")));
const validatePath = ajv.compile(readJson(join(schemaDir, "curriculum.path.schema.json")));

const errors = [];
const fail = (msg) => errors.push(msg);

// 1. Manifest
const manifest = readJson(join(pub, "curriculum.json"));
if (!validateManifest(manifest)) {
  fail("manifest (public/curriculum.json) failed schema:\n" + ajv.errorsText(validateManifest.errors, { separator: "\n  " }));
}

// 2. Each path file
const seenTaskIds = new Map(); // taskId -> competency that owns it
for (const comp of manifest.competencies ?? []) {
  const file = comp.file;
  let path;
  try {
    path = readJson(join(pub, file));
  } catch {
    fail(`competency "${comp.id}": file public/${file} is missing or unreadable`);
    continue;
  }
  if (!validatePath(path)) {
    fail(`public/${file} failed schema:\n  ` + ajv.errorsText(validatePath.errors, { separator: "\n  " }));
    continue;
  }
  if (path.competency !== comp.id) {
    fail(`public/${file}: competency field "${path.competency}" does not match manifest id "${comp.id}"`);
  }
  for (const lvl of path.levels) {
    for (const t of lvl.tasks) {
      if (!t.id.startsWith(comp.id + "-")) {
        fail(`public/${file}: task id "${t.id}" is not prefixed with "${comp.id}-"`);
      }
      if (seenTaskIds.has(t.id)) {
        fail(`task id "${t.id}" is duplicated (in ${comp.id} and ${seenTaskIds.get(t.id)})`);
      } else {
        seenTaskIds.set(t.id, comp.id);
      }
    }
  }
}

if (errors.length) {
  console.error("Curriculum validation FAILED:\n\n" + errors.join("\n\n"));
  process.exit(1);
}
console.log(`Curriculum OK: manifest + ${(manifest.competencies ?? []).length} path file(s), ${seenTaskIds.size} unique task ids.`);
