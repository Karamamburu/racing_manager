import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fileArg = process.argv[2];

function die(message) {
  console.error(message);
  process.exit(1);
}

if (!fileArg) die('usage: node verify_handoff.mjs <handoff.json>');

const filePath = path.resolve(root, fileArg);
let data;
try {
  data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch (error) {
  die(`handoff: cannot read ${fileArg} (${error.message})`);
}

const failures = [];

function fail(message) {
  failures.push(message);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkLocation(location) {
  if (typeof location !== 'string') return 'location must be a string';
  const match = /^(.+):(\d+)$/.exec(location);
  if (!match) return 'location must be path:line';
  const rel = match[1].split('\\').join('/');
  if (rel.startsWith('/') || rel.includes('..')) return `location escapes the product root: ${rel}`;
  const line = Number(match[2]);
  if (!Number.isInteger(line) || line < 1) return 'line must be a positive integer';
  const absolute = path.resolve(root, rel);
  const rootPrefix = root.endsWith(path.sep) ? root : root + path.sep;
  if (absolute !== root && !absolute.startsWith(rootPrefix)) return `location escapes the product root: ${rel}`;
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return `missing file ${rel}`;
  const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  if (line > Math.max(lines.length, 1)) return `line ${line} is past the end of ${rel}`;
  return null;
}

function requireKeys(object, keys) {
  for (const key of keys) {
    if (!(key in object)) fail(`missing ${key}`);
  }
}

if (!isObject(data)) die('handoff: root must be an object');
if (typeof data.role !== 'string') die('handoff: role is required');

if (data.role === 'coder') {
  requireKeys(data, ['cycle', 'changed_files', 'commands', 'rw_trace']);
  if (!Number.isInteger(data.cycle) || data.cycle < 1) fail('cycle must be an integer >= 1');
  if (!Array.isArray(data.changed_files) || data.changed_files.length === 0) {
    fail('changed_files must be a non-empty array');
  } else {
    for (const rel of data.changed_files) {
      if (typeof rel !== 'string' || !fs.existsSync(path.join(root, rel))) fail(`missing changed file ${rel}`);
    }
  }
  if (!Array.isArray(data.commands) || data.commands.length === 0) fail('commands must be a non-empty array');
  else {
    for (const command of data.commands) {
      if (!isObject(command) || typeof command.cmd !== 'string' || !Number.isInteger(command.exit_code)) {
        fail('each command needs cmd and a numeric exit_code');
      }
    }
  }
  if (!Array.isArray(data.rw_trace)) fail('rw_trace must be an array');
  else if (data.cycle >= 2 && data.rw_trace.length === 0) fail('cycle 2+ needs rw_trace entries');
  else {
    for (const id of data.rw_trace) {
      if (!/^RW-\d{3}$/.test(id)) fail(`rw_trace id must look like RW-001, got ${id}`);
    }
  }
} else if (data.role === 'skeptic' || data.role === 'realist' || data.role === 'visionary') {
  requireKeys(data, ['verdict', 'findings']);
  if (data.verdict !== 'ACCEPT' && data.verdict !== 'REJECT') fail('verdict must be ACCEPT or REJECT');
  if (!Array.isArray(data.findings)) fail('findings must be an array');
  else if (data.verdict === 'ACCEPT' && data.findings.length > 0) fail('ACCEPT cannot include findings');
  else if (data.verdict === 'REJECT' && data.findings.length === 0) fail('REJECT needs at least one finding');
  else {
    for (const finding of data.findings) {
      if (!isObject(finding)) {
        fail('finding must be an object');
        continue;
      }
      if (!/^F-\d{3}$/.test(finding.id)) fail(`finding id must look like F-001, got ${finding.id}`);
      if (finding.severity !== 'BLOCKER' && finding.severity !== 'IMPORTANT') fail('severity must be BLOCKER or IMPORTANT');
      const locationError = checkLocation(finding.location);
      if (locationError) fail(locationError);
      if (typeof finding.issue !== 'string' || finding.issue.trim() === '') fail('issue must be non-empty');
      if (typeof finding.evidence !== 'string' || finding.evidence.trim() === '') fail('evidence must be non-empty');
    }
  }
} else if (data.role === 'summarizer') {
  requireKeys(data, ['title', 'blocking_count', 'instructions']);
  if (typeof data.title !== 'string' || data.title.trim() === '') fail('title must be non-empty');
  if (!Array.isArray(data.instructions) || data.instructions.length === 0) fail('instructions must be a non-empty array');
  else {
    let blockers = 0;
    data.instructions.forEach((item, index) => {
      if (!isObject(item)) {
        fail('instruction must be an object');
        return;
      }
      if (!/^RW-\d{3}$/.test(item.id)) fail(`instruction id must look like RW-001, got ${item.id}`);
      const expected = `RW-${String(index + 1).padStart(3, '0')}`;
      if (item.id !== expected) fail(`instruction ${item.id} is out of order; expected ${expected}`);
      if (item.severity !== 'BLOCKER' && item.severity !== 'IMPORTANT') fail('severity must be BLOCKER or IMPORTANT');
      if (item.severity === 'BLOCKER') blockers += 1;
      const locationError = checkLocation(item.location);
      if (locationError) fail(locationError);
      if (typeof item.issue !== 'string' || item.issue.trim() === '') fail('issue must be non-empty');
      if (typeof item.action !== 'string' || item.action.trim() === '') fail('action must be non-empty');
    });
    if (data.blocking_count !== blockers) fail(`blocking_count is ${data.blocking_count}; counted ${blockers}`);
  }
} else if (data.role === 'code_gate') {
  requireKeys(data, ['verdict', 'command', 'exit_code', 'summary']);
  if (data.verdict !== 'GATE_FAILURE') fail('code_gate verdict must be GATE_FAILURE');
  if (typeof data.command !== 'string' || data.command.trim() === '') fail('command must be non-empty');
  if (!Number.isInteger(data.exit_code) || data.exit_code === 0) fail('exit_code must be a non-zero integer');
  if (typeof data.summary !== 'string' || data.summary.trim() === '') fail('summary must be non-empty');
} else if (data.role === 'orchestrator') {
  requireKeys(data, ['verdict', 'cycle', 'reason']);
  if (!['READY', 'REWORK', 'GATE_FAILURE', 'ESCALATE'].includes(data.verdict)) {
    fail('verdict must be READY, REWORK, GATE_FAILURE, or ESCALATE');
  }
  if (!Number.isInteger(data.cycle) || data.cycle < 1) fail('cycle must be an integer >= 1');
  if (typeof data.reason !== 'string') fail('reason must be a string');
  if ((data.verdict === 'ESCALATE' || data.verdict === 'REWORK' || data.verdict === 'GATE_FAILURE') && data.reason.trim() === '') {
    fail(`${data.verdict} needs a non-empty reason`);
  }
} else {
  fail(`unknown role ${data.role}`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`handoff: ${data.role} ok`);
