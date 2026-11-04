import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const indexPath = path.join(root, 'docs', 'INDEX.md');
const failures = [];

function fail(message) {
  failures.push(message);
}

if (!fs.existsSync(indexPath)) {
  fail('docs/INDEX.md is missing. Copy .agents/templates/docs/INDEX.md and a domain page.');
} else {
  const text = fs.readFileSync(indexPath, 'utf8');
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  if (lines.length > 100) fail(`docs/INDEX.md has ${lines.length} lines; the maximum is 100`);

  const linkPattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const domainFiles = [];
  let match = linkPattern.exec(text);
  while (match) {
    const dest = match[1].split('#')[0];
    if (dest && !/^[a-z]+:/i.test(dest)) {
      const absolute = path.resolve(path.dirname(indexPath), dest);
      const portable = path.relative(root, absolute).split(path.sep).join('/');
      if (portable.startsWith('docs/domains/') && portable.endsWith('.md')) {
        domainFiles.push(absolute);
        if (!fs.existsSync(absolute)) fail(`missing domain page ${portable}`);
      }
    }
    match = linkPattern.exec(text);
  }

  if (domainFiles.length === 0) fail('docs/INDEX.md does not link to any docs/domains/*.md page');

  for (const file of domainFiles) {
    if (!fs.existsSync(file)) continue;
    const body = fs.readFileSync(file, 'utf8');
    if (!/^##\s+Breakage signals\s*$/m.test(body)) {
      fail(`${path.relative(root, file).split(path.sep).join('/')} is missing ## Breakage signals`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('kb: index and domain links ok');
