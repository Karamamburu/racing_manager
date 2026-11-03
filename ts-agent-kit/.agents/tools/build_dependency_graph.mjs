import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const apps = path.join(root, 'apps');
const specsDir = path.join(root, 'specs');

function isTest(file) {
  return (
    /\.(spec|test)\.tsx?$/.test(file) ||
    file.includes(`${path.sep}__tests__${path.sep}`)
  );
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !isTest(full)) out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function resolveImport(fromFile, spec) {
  let target = spec;
  if (target.endsWith('.js')) target = target.slice(0, -3);
  const base = path.resolve(path.dirname(fromFile), target);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function importsOf(file, text) {
  const specs = [];
  const patterns = [
    /\bfrom\s+['"](\.[^'"]+)['"]/g,
    /\bimport\s+['"](\.[^'"]+)['"]/g,
    /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(text);
    while (match) {
      specs.push(match[1]);
      match = pattern.exec(text);
    }
  }
  return specs
    .map((spec) => resolveImport(file, spec))
    .filter(Boolean)
    .map(rel);
}

function findCycles(nodes, edges) {
  const adjacent = new Map(nodes.map((node) => [node, []]));
  for (const edge of edges) {
    if (adjacent.has(edge.from) && adjacent.has(edge.to)) adjacent.get(edge.from).push(edge.to);
  }
  const color = new Map();
  const stack = [];
  const cycles = [];

  function visit(node) {
    color.set(node, 1);
    stack.push(node);
    for (const next of adjacent.get(node) ?? []) {
      const state = color.get(next) ?? 0;
      if (state === 0) visit(next);
      else if (state === 1) {
        const start = stack.indexOf(next);
        cycles.push([...stack.slice(start), next]);
      }
    }
    stack.pop();
    color.set(node, 2);
  }

  for (const node of nodes) {
    if (!color.get(node)) visit(node);
  }
  return cycles;
}

const files = walk(apps);
const nodes = files.map(rel);
const edges = [];

for (const file of files) {
  const from = rel(file);
  const text = fs.readFileSync(file, 'utf8');
  for (const to of importsOf(file, text)) {
    if (nodes.includes(to)) edges.push({ from, to });
  }
}

const cycles = findCycles(nodes, edges);
fs.mkdirSync(specsDir, { recursive: true });
const output = path.join(specsDir, 'dependency-graph.json');
fs.writeFileSync(output, `${JSON.stringify({ nodes, edges, cycles }, null, 2)}\n`);

if (cycles.length > 0) {
  console.error(cycles.map((cycle) => `cycle: ${cycle.join(' -> ')}`).join('\n'));
  process.exit(1);
}

console.log(`graph: ${nodes.length} node(s), ${edges.length} edge(s), 0 cycles`);
