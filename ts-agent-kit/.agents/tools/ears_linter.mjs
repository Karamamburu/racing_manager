import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const specsDir = path.join(root, 'specs');
const failures = [];

function fail(file, message) {
  failures.push(`${path.relative(root, file)}: ${message}`);
}

if (!fs.existsSync(specsDir)) {
  console.log('ears: no specs directory, nothing to check');
  process.exit(0);
}

const files = fs
  .readdirSync(specsDir)
  .filter((name) => name.endsWith('-ears.md'))
  .sort();

if (files.length === 0) {
  console.log('ears: no specs/*-ears.md, nothing to check');
  process.exit(0);
}

const vague = [
  [/\bsome\b/i, 'some'],
  [/\bfast\b/i, 'fast'],
  [/\bappropriate\b/i, 'appropriate'],
  [/\bas needed\b/i, 'as needed'],
];

for (const name of files) {
  const file = path.join(specsDir, name);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  for (const word of ['SHALL', 'WHEN', 'WHILE', 'IF', 'WHERE']) {
    if (!new RegExp(`\\b${word}\\b`).test(text)) {
      fail(file, `missing EARS keyword ${word}`);
    }
  }

  const unwanted = lines.some((line, index) => {
    if (!/\bIF\b/.test(line)) return false;
    return /\bSHALL\b/.test(lines.slice(index, index + 3).join(' '));
  });
  if (!unwanted) fail(file, 'unwanted behavior must be an IF ... SHALL requirement');

  if (!/Dto\b|client type/i.test(text)) {
    fail(file, 'name a Nest DTO or a web client type');
  }

  lines.forEach((line, index) => {
    if (/\b(amount|price|money|cost)\b/i.test(line) && /\bnumber\b/i.test(line)) {
      fail(file, `line ${index + 1}: money must not use the type number`);
    }
    for (const [pattern, label] of vague) {
      if (pattern.test(line)) fail(file, `line ${index + 1}: vague wording "${label}"`);
    }
  });

  const mutates = lines.some(
    (line) =>
      /\b(WHEN|IF)\b/.test(line) &&
      /\b(create|creates|created|creating|update|updates|updated|updating|delete|deletes|deleted|deleting|POST|PATCH|PUT)\b/i.test(
        line,
      ),
  );
  if (mutates && !/idempoten/i.test(text)) {
    fail(file, 'a mutating WHEN or IF must name an idempotency key');
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`ears: ${files.length} spec(s) ok`);
