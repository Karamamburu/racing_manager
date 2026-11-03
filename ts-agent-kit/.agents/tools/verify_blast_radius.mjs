import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const configPath = path.join(root, 'specs', 'blast-radius.json');

function die(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(configPath)) {
  die(
    'blast: specs/blast-radius.json is missing. Copy .agents/templates/specs/blast-radius.json and do not raise max_changed_files to fit this diff.',
  );
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  die(`blast: specs/blast-radius.json is not valid JSON (${error.message})`);
}

const maxFiles = config.max_changed_files ?? 7;
const frozen = Array.isArray(config.frozen_paths) ? config.frozen_paths : [];
const protectMigrations = config.protect_applied_migrations !== false;

if (!Number.isInteger(maxFiles) || maxFiles < 1) {
  die('blast: max_changed_files must be a positive integer');
}

const status = spawnSync('git', ['status', '--porcelain=v1', '-z', '-uall'], {
  cwd: root,
  encoding: 'utf8',
});

if (status.error || status.status !== 0) {
  die(`blast: git status failed (${status.stderr || status.error?.message || 'not a git repository'})`);
}

function parseStatus(text) {
  const entries = [];
  let index = 0;
  while (index < text.length) {
    if (text[index] === '\0') {
      index += 1;
      continue;
    }
    if (index + 2 > text.length) break;
    const xy = text.slice(index, index + 2);
    index += 2;
    if (text[index] === ' ') index += 1;
    const end = text.indexOf('\0', index);
    if (end < 0) break;
    const first = text.slice(index, end);
    index = end + 1;
    let second = null;
    if (xy.includes('R') || xy.includes('C')) {
      const end2 = text.indexOf('\0', index);
      if (end2 < 0) break;
      second = text.slice(index, end2);
      index = end2 + 1;
    }
    entries.push({ xy, paths: [first, second].filter(Boolean) });
  }
  return entries;
}

function counts(file) {
  const norm = file.split(path.sep).join('/');
  return !(
    norm === '.planning' ||
    norm.startsWith('.planning/') ||
    norm === '.ai-team' ||
    norm.startsWith('.ai-team/') ||
    norm === 'specs/dependency-graph.json'
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function frozenHit(file) {
  const norm = file.split(path.sep).join('/');
  for (const raw of frozen) {
    const pattern = String(raw).split(path.sep).join('/');
    if (pattern.endsWith('/')) {
      if (norm.startsWith(pattern)) return pattern;
    } else if (pattern.includes('*')) {
      const expression = `^${pattern.split('*').map(escapeRegExp).join('[^/]*')}$`;
      if (new RegExp(expression).test(norm)) return pattern;
    } else if (norm === pattern) return pattern;
  }
  return null;
}

function inHead(file) {
  const probe = spawnSync('git', ['cat-file', '-e', `HEAD:${file.split(path.sep).join('/')}`], {
    cwd: root,
  });
  return probe.status === 0;
}

const appliedMigration = /^apps\/api\/prisma\/migrations\/[^/]+\/migration\.sql$/;
const failures = [];
const counted = [];

for (const entry of parseStatus(status.stdout)) {
  const relevant = entry.paths.filter(counts);
  if (relevant.length === 0) continue;
  counted.push(relevant.join(' -> '));
  for (const file of entry.paths) {
    const hit = frozenHit(file);
    if (hit) failures.push(`frozen path ${file} matches ${hit}`);
    const norm = file.split(path.sep).join('/');
    if (protectMigrations && appliedMigration.test(norm) && inHead(norm)) {
      failures.push(`applied migration.sql must stay unchanged: ${norm}`);
    }
  }
}

if (counted.length > maxFiles) {
  failures.push(`changed files ${counted.length} exceed max_changed_files ${maxFiles}`);
}

if (failures.length > 0) {
  console.error(counted.map((file) => `counted: ${file}`).join('\n'));
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`blast: ${counted.length}/${maxFiles} file(s)`);
for (const file of counted) console.log(`counted: ${file}`);
