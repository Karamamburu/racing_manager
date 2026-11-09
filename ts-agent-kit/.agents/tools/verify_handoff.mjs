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

const PRD_DIMENSIONS = [
  'problem',
  'actors',
  'domain_model',
  'lifecycle',
  'invariants',
  'configuration',
  'calculations',
  'compatibility',
  'atomicity',
  'requirements',
  'acceptance',
  'traceability',
  'consistency',
  'product_level',
  'assumptions',
];

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
} else if (data.role === 'prd_author') {
  requireKeys(data, [
    'cycle',
    'prd_path',
    'changed_files',
    'review_trace',
    'human_answers',
    'deferred',
    'assumptions',
    'open_questions',
    'disagreements',
  ]);
  if (!Number.isInteger(data.cycle) || data.cycle < 1) fail('cycle must be an integer >= 1');
  if (typeof data.prd_path !== 'string' || !data.prd_path.startsWith('Tasks/') || !data.prd_path.endsWith('.md')) {
    fail('prd_path must be a Tasks/<KEY>/...md path');
  } else if (!fs.existsSync(path.resolve(root, data.prd_path))) {
    fail(`missing PRD ${data.prd_path}`);
  }
  if (!Array.isArray(data.changed_files) || data.changed_files.length === 0) {
    fail('changed_files must be a non-empty array');
  } else {
    if (data.changed_files.length !== 1 || data.changed_files[0] !== data.prd_path) {
      fail('changed_files must contain exactly the PRD path');
    }
    for (const rel of data.changed_files) {
      if (typeof rel !== 'string' || !fs.existsSync(path.join(root, rel))) fail(`missing changed file ${rel}`);
    }
  }
  const authorIds = new Set();
  if (!Array.isArray(data.review_trace)) {
    fail('review_trace must be an array');
  } else {
    for (const id of data.review_trace) {
      if (!/^RF-\d{3}$/.test(id)) fail(`review_trace id must look like RF-001, got ${id}`);
      else if (authorIds.has(id)) fail(`duplicate review id ${id}`);
      else authorIds.add(id);
    }
  }
  for (const field of ['deferred', 'disagreements']) {
    if (!Array.isArray(data[field])) {
      fail(`${field} must be an array`);
      continue;
    }
    for (const item of data[field]) {
      if (!isObject(item)) {
        fail(`${field} item must be an object`);
        continue;
      }
      if (!/^RF-\d{3}$/.test(item.finding_id)) {
        fail(`${field} finding_id must look like RF-001, got ${item.finding_id}`);
      } else if (authorIds.has(item.finding_id)) {
        fail(`duplicate review id ${item.finding_id}`);
      } else {
        authorIds.add(item.finding_id);
      }
      const key = field === 'deferred' ? 'reason' : 'rationale';
      if (typeof item[key] !== 'string' || item[key].trim() === '') fail(`${field} item needs a non-empty ${key}`);
    }
  }
  for (const field of ['human_answers', 'assumptions', 'open_questions']) {
    if (!Array.isArray(data[field])) {
      fail(`${field} must be an array`);
      continue;
    }
    for (const item of data[field]) {
      if (typeof item !== 'string' || item.trim() === '') fail(`${field} entries must be non-empty strings`);
    }
  }
  if (
    data.cycle >= 2 &&
    authorIds.size === 0 &&
    (!Array.isArray(data.human_answers) || data.human_answers.length === 0)
  ) {
    fail('cycle 2+ needs review_trace, deferred, disagreements, or human_answers entries');
  }
} else if (data.role === 'prd_reviewer') {
  const dimensions = PRD_DIMENSIONS;
  requireKeys(data, ['cycle', 'verdict', 'summary', 'coverage', 'findings']);
  if (!Number.isInteger(data.cycle) || data.cycle < 1) fail('cycle must be an integer >= 1');
  if (data.verdict !== 'ACCEPT' && data.verdict !== 'REWORK') fail('verdict must be ACCEPT or REWORK');
  if (typeof data.summary !== 'string' || data.summary.trim() === '') fail('summary must be non-empty');
  const coverage = new Map();
  if (!Array.isArray(data.coverage)) {
    fail('coverage must be an array');
  } else {
    for (const row of data.coverage) {
      if (!isObject(row)) {
        fail('coverage row must be an object');
        continue;
      }
      if (!dimensions.includes(row.dimension)) {
        fail(`unknown coverage dimension ${row.dimension}`);
      } else if (coverage.has(row.dimension)) {
        fail(`duplicate coverage dimension ${row.dimension}`);
      } else {
        coverage.set(row.dimension, row);
      }
      if (!['PASS', 'GAP', 'NOT_APPLICABLE'].includes(row.status)) {
        fail('coverage status must be PASS, GAP, or NOT_APPLICABLE');
      }
      if (typeof row.note !== 'string') fail('coverage note must be a string');
      if ((row.status === 'GAP' || row.status === 'NOT_APPLICABLE') && row.note.trim() === '') {
        fail(`coverage ${row.dimension} needs a note`);
      }
    }
    for (const dimension of dimensions) {
      if (!coverage.has(dimension)) fail(`missing coverage dimension ${dimension}`);
    }
  }
  const gaps = new Set();
  for (const row of coverage.values()) {
    if (row.status === 'GAP') gaps.add(row.dimension);
  }
  let blocking = 0;
  const findingIds = new Set();
  if (!Array.isArray(data.findings)) {
    fail('findings must be an array');
  } else {
    data.findings.forEach((finding) => {
      if (!isObject(finding)) {
        fail('finding must be an object');
        return;
      }
      if (!/^RF-\d{3}$/.test(finding.id)) fail(`finding id must look like RF-001, got ${finding.id}`);
      else if (findingIds.has(finding.id)) fail(`duplicate finding id ${finding.id}`);
      else findingIds.add(finding.id);
      if (finding.priority === 'P0' || finding.priority === 'P1') blocking += 1;
      else if (finding.priority !== 'P2') fail('priority must be P0, P1, or P2');
      if (!dimensions.includes(finding.dimension)) fail(`unknown finding dimension ${finding.dimension}`);
      else if (finding.priority === 'P0' || finding.priority === 'P1') gaps.delete(finding.dimension);
      const locationError = checkLocation(finding.location);
      if (locationError) fail(locationError);
      if (typeof finding.issue !== 'string' || finding.issue.trim() === '') fail('issue must be non-empty');
      if (typeof finding.evidence !== 'string' || finding.evidence.trim() === '') fail('evidence must be non-empty');
      if (typeof finding.required_action !== 'string' || finding.required_action.trim() === '') {
        fail('required_action must be non-empty');
      }
      if (finding.resolution !== 'author' && finding.resolution !== 'human') fail('resolution must be author or human');
    });
    for (const dimension of gaps) fail(`coverage GAP for ${dimension} has no P0/P1 finding`);
  }
  if (data.verdict === 'REWORK' && blocking === 0) fail('REWORK needs at least one P0 or P1 finding');
  if (data.verdict === 'ACCEPT' && blocking > 0) fail('ACCEPT cannot include a P0 or P1 finding');
} else if (data.role === 'prd_rework') {
  const dimensions = PRD_DIMENSIONS;
  requireKeys(data, ['round', 'blocking_count', 'instructions', 'non_blocking']);
  if (!Number.isInteger(data.round) || data.round < 2) fail('round must be an integer >= 2');
  const instructionIds = new Set();
  const instructionSources = new Set();
  if (!Array.isArray(data.instructions) || data.instructions.length === 0) {
    fail('instructions must be a non-empty array');
  } else {
    data.instructions.forEach((item, index) => {
      if (!isObject(item)) {
        fail('instruction must be an object');
        return;
      }
      const expected = `RW-${String(index + 1).padStart(3, '0')}`;
      if (!/^RW-\d{3}$/.test(item.id)) fail(`instruction id must look like RW-001, got ${item.id}`);
      else if (item.id !== expected) fail(`instruction ${item.id} is out of order; expected ${expected}`);
      else if (instructionIds.has(item.id)) fail(`duplicate instruction id ${item.id}`);
      else instructionIds.add(item.id);
      if (!/^RF-\d{3}$/.test(item.source)) fail(`instruction source must look like RF-001, got ${item.source}`);
      else if (instructionSources.has(item.source)) fail(`duplicate instruction source ${item.source}`);
      else instructionSources.add(item.source);
      if (item.priority !== 'P0' && item.priority !== 'P1') fail('instruction priority must be P0 or P1');
      if (!dimensions.includes(item.dimension)) fail(`unknown instruction dimension ${item.dimension}`);
      const locationError = checkLocation(item.location);
      if (locationError) fail(locationError);
      if (typeof item.issue !== 'string' || item.issue.trim() === '') fail('issue must be non-empty');
      if (typeof item.required_action !== 'string' || item.required_action.trim() === '') {
        fail('required_action must be non-empty');
      }
      if (item.resolution !== 'author' && item.resolution !== 'human') fail('resolution must be author or human');
    });
    if (data.blocking_count !== data.instructions.length) {
      fail(`blocking_count is ${data.blocking_count}; counted ${data.instructions.length}`);
    }
  }
  const nonBlockingIds = new Set();
  if (!Array.isArray(data.non_blocking)) {
    fail('non_blocking must be an array');
  } else {
    data.non_blocking.forEach((item) => {
      if (!isObject(item)) {
        fail('non_blocking item must be an object');
        return;
      }
      if (!/^RF-\d{3}$/.test(item.id)) fail(`non_blocking id must look like RF-001, got ${item.id}`);
      else if (nonBlockingIds.has(item.id)) fail(`duplicate non_blocking id ${item.id}`);
      else if (instructionSources.has(item.id)) {
        fail(`non_blocking id ${item.id} duplicates an instruction source`);
      } else nonBlockingIds.add(item.id);
      if (item.priority !== 'P2') fail('non_blocking priority must be P2');
      if (!dimensions.includes(item.dimension)) fail(`unknown non_blocking dimension ${item.dimension}`);
      if (typeof item.issue !== 'string' || item.issue.trim() === '') fail('issue must be non-empty');
      if (typeof item.required_action !== 'string' || item.required_action.trim() === '') {
        fail('required_action must be non-empty');
      }
    });
  }
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
