import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();

function runNode(script) {
  console.log(`\n--- ${script} ---`);
  const result = spawnSync(process.execPath, [path.join(toolsDir, script)], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error(`TECHLEAD GATE: FAILED at ${script}`);
    process.exit(result.status === null ? 1 : result.status);
  }
}

runNode('verify_kb_sync.mjs');
runNode('build_dependency_graph.mjs');
runNode('verify_architecture_layers.mjs');
runNode('verify_blast_radius.mjs');

const specsDir = path.join(root, 'specs');
const hasEars =
  fs.existsSync(specsDir) &&
  fs.readdirSync(specsDir).some((name) => name.endsWith('-ears.md'));

if (hasEars) runNode('ears_linter.mjs');
else console.log('\n--- ears_linter.mjs skipped (no specs/*-ears.md) ---');

if (fs.existsSync(path.join(root, '.planning', 'STATE.md'))) runNode('plan_checker.mjs');
else console.log('\n--- plan_checker.mjs skipped (no .planning/STATE.md) ---');

console.log('\n--- pnpm test ---');
const test = spawnSync('pnpm', ['test'], { cwd: root, stdio: 'inherit' });
if (test.error || test.status !== 0) {
  const detail = test.error ? test.error.message : `exit ${test.status}`;
  console.error(`TECHLEAD GATE: FAILED at pnpm test (${detail})`);
  process.exit(test.status === null || test.status === undefined ? 1 : test.status || 1);
}

console.log('\nTECHLEAD GATE: ACCEPTED');
