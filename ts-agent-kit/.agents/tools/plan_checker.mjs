import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const planning = path.join(root, '.planning');
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(name) {
  const file = path.join(planning, name);
  if (!fs.existsSync(file)) {
    fail(`missing .planning/${name}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

function sectionBody(text, heading) {
  const match = new RegExp(`^##\\s+${heading}\\s*$`, 'im').exec(text);
  if (!match) return null;
  const rest = text.slice(match.index + match[0].length);
  const next = rest.search(/^##\s+/m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

function meaningful(body) {
  if (!body) return false;
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .some((line) => !/^<[^>]+>$/.test(line) && !/^TODO\b/i.test(line));
}

function parseWaves(roadmap) {
  const waves = [];
  let current = null;
  for (const line of roadmap.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = { title: heading[1].trim(), files: [] };
      waves.push(current);
      continue;
    }
    if (!current) continue;
    const item = line.match(/^-\s+\[([ xX])\]\s+(.+?)\s*$/);
    if (!item) continue;
    const target = item[2].trim();
    if (!(target.includes('/') || /\.[A-Za-z0-9]+$/.test(target))) continue;
    current.files.push({ path: target, done: item[1].toLowerCase() === 'x' });
  }
  return waves;
}

if (!fs.existsSync(planning)) {
  console.error('plan: .planning/ is missing');
  process.exit(1);
}

const project = read('PROJECT.md');
const roadmap = read('ROADMAP.md');
const state = read('STATE.md');

for (const heading of ['Goal', 'Out of scope', 'Invariants']) {
  const body = sectionBody(project, heading);
  if (body === null) fail(`PROJECT.md is missing ## ${heading}`);
  else if (!meaningful(body)) fail(`PROJECT.md ## ${heading} is empty`);
}

const waves = roadmap ? parseWaves(roadmap) : [];
if (roadmap && waves.length === 0) fail('ROADMAP.md has no ## waves');

for (const wave of waves) {
  if (wave.files.length < 1 || wave.files.length > 3) {
    fail(`${wave.title} lists ${wave.files.length} files; a wave lists 1 to 3`);
  }
  for (const file of wave.files) {
    if (file.done && !fs.existsSync(path.join(root, file.path))) {
      fail(`${wave.title} checks ${file.path} but the file is not on disk`);
    }
  }
}

const active = state.match(/^Active wave:\s*(.+)\s*$/m);
if (state && !active) fail('STATE.md has no "Active wave:" line');
if (active && !waves.some((wave) => wave.title === active[1].trim())) {
  fail(`STATE.md active wave "${active?.[1].trim()}" does not match a ROADMAP heading`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`plan: ${waves.length} wave(s), active "${active[1].trim()}"`);
