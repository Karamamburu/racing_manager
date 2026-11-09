import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const [authorArg, reworkArg] = process.argv.slice(2);

function die(message) {
  console.error(message);
  process.exit(1);
}

if (!authorArg || !reworkArg) {
  die('usage: node verify_prd_coverage.mjs <author.json> <rework.json>');
}

function readJson(fileArg) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(root, fileArg), 'utf8'));
  } catch (error) {
    die(`prd coverage: cannot read ${fileArg} (${error.message})`);
  }
}

const author = readJson(authorArg);
const rework = readJson(reworkArg);

if (author.role !== 'prd_author') die('prd coverage: author handoff role must be prd_author');
if (rework.role !== 'prd_rework') die('prd coverage: rework brief role must be prd_rework');
if (!Array.isArray(rework.instructions) || rework.instructions.length === 0) {
  die('prd coverage: rework brief has no instructions');
}

const instructions = new Map();
for (const item of rework.instructions) {
  if (item && typeof item.source === 'string') {
    instructions.set(item.source, { ...item, instructionId: item.id });
  }
}

const optional = new Set();
for (const item of rework.non_blocking ?? []) {
  if (item && typeof item.id === 'string') optional.add(item.id);
}

const decisions = new Map();
const failures = [];

for (const field of ['review_trace', 'deferred', 'disagreements']) {
  if (!Array.isArray(author[field])) {
    failures.push(`author handoff needs a ${field} array`);
    continue;
  }
  for (const item of author[field]) {
    const id = typeof item === 'string' ? item : item?.finding_id;
    if (typeof id !== 'string') {
      failures.push(`author ${field} entry has no review id`);
      continue;
    }
    if (!instructions.has(id) && !optional.has(id)) {
      failures.push(`author references ${id}, which is not in the rework brief`);
    }
    if (decisions.has(id)) {
      failures.push(`author references ${id} both in ${decisions.get(id)} and ${field}`);
    } else {
      decisions.set(id, field);
    }
  }
}

for (const [source, instruction] of instructions) {
  const field = decisions.get(source);
  if (!field) {
    failures.push(`missing decision for blocking instruction ${instruction.instructionId} (${source})`);
  } else if (field === 'deferred') {
    failures.push(`blocking instruction ${instruction.instructionId} (${source}) cannot be deferred`);
  }
}

if (failures.length > 0) die(failures.join('\n'));

console.log(`prd coverage: ${instructions.size} blocking item(s) addressed`);
