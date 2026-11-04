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

function packageHasTestScript(dir) {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return Boolean(pkg.scripts && pkg.scripts.test);
  } catch {
    return false;
  }
}

function runTests() {
  const rootPkg = path.join(root, 'package.json');
  if (packageHasTestScript(root)) {
    console.log('\n--- pnpm test (root) ---');
    const test = spawnSync('pnpm', ['test'], { cwd: root, stdio: 'inherit' });
    if (test.error || test.status !== 0) {
      const detail = test.error ? test.error.message : `exit ${test.status}`;
      console.error(`TECHLEAD GATE: FAILED at pnpm test (${detail})`);
      process.exit(test.status === null || test.status === undefined ? 1 : test.status || 1);
    }
    return;
  }

  // Product layout (Racing Manager): npm per package, no root package.json.
  const packageDirs = ['racing_manager_back', 'racing_manager_front', 'apps/api', 'apps/web']
    .map((rel) => path.join(root, rel))
    .filter((dir) => packageHasTestScript(dir));

  if (packageDirs.length === 0) {
    console.log('\n--- test skipped (no root or package test script) ---');
    return;
  }

  for (const dir of packageDirs) {
    const label = path.relative(root, dir) || '.';
    console.log(`\n--- npm test (${label}) ---`);
    const test = spawnSync('npm', ['test'], { cwd: dir, stdio: 'inherit' });
    if (test.error || test.status !== 0) {
      const detail = test.error ? test.error.message : `exit ${test.status}`;
      console.error(`TECHLEAD GATE: FAILED at npm test in ${label} (${detail})`);
      process.exit(test.status === null || test.status === undefined ? 1 : test.status || 1);
    }
  }
}

runTests();

console.log('\nTECHLEAD GATE: ACCEPTED');
