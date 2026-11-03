import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const apps = path.join(root, 'apps');
const failures = [];

const MODEL_CALL =
  /\b(?:prisma|tx|trx)\.[A-Za-z_][A-Za-z0-9_]*\.(findUniqueOrThrow|findFirstOrThrow|findMany|findUnique|findFirst|createMany|updateMany|deleteMany|groupBy|aggregate|upsert|create|update|delete|count)\s*\(/;

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

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

function report(file, line, rule) {
  failures.push(`${rel(file)}:${line}: ${rule}`);
}

function lineOf(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function importSpecifiers(text) {
  const specs = [];
  const patterns = [/\bfrom\s+['"]([^'"]+)['"]/g, /\bimport\s+['"]([^'"]+)['"]/g];
  for (const pattern of patterns) {
    let match = pattern.exec(text);
    while (match) {
      specs.push({ source: match[1], index: match.index });
      match = pattern.exec(text);
    }
  }
  return specs;
}

function isDto(file) {
  const norm = file.split(path.sep).join('/');
  return norm.includes('/dto/') || norm.endsWith('.dto.ts');
}

function isWeb(file) {
  return file.split(path.sep).join('/').includes('/apps/web/');
}

if (!fs.existsSync(apps)) {
  console.log('layers: no apps/ directory, nothing to check');
  process.exit(0);
}

for (const file of walk(apps)) {
  const raw = fs.readFileSync(file, 'utf8');
  const text = stripComments(raw);
  const base = path.basename(file);
  const web = isWeb(file);
  const controller = base.endsWith('.controller.ts');
  const service = base.endsWith('.service.ts');
  const dto = isDto(file);

  const dynamic = /\bimport\s*\(/.exec(text);
  if (dynamic) report(file, lineOf(text, dynamic.index), 'dynamic import() is forbidden');

  if (controller || web) {
    if (/\bPrismaService\b/.test(text) || /\bPrismaClient\b/.test(text)) {
      report(file, 1, 'controller and web code must not reference PrismaService or PrismaClient');
    }
    for (const spec of importSpecifiers(text)) {
      if (spec.source === '@prisma/client' || spec.source.startsWith('@prisma/client/')) {
        report(file, lineOf(text, spec.index), 'controller and web code must not import @prisma/client');
      }
    }
    const call = MODEL_CALL.exec(text);
    if (call) report(file, lineOf(text, call.index), 'Prisma model call belongs in a repository');
    if (/\$queryRaw|\$executeRaw/.test(text)) {
      report(file, 1, 'raw Prisma query belongs in a repository');
    }
  }

  if (service) {
    const http = /\bHttpException\b/.exec(text);
    if (http) report(file, lineOf(text, http.index), 'service must throw a domain error, not HttpException');
    for (const spec of importSpecifiers(text)) {
      if (spec.source === 'express' || spec.source.startsWith('express/')) {
        report(file, lineOf(text, spec.index), 'service must not import express');
      }
    }
    const call = MODEL_CALL.exec(text);
    if (call) report(file, lineOf(text, call.index), 'service may open prisma.$transaction only; model calls belong in a repository');
    if (/\$queryRaw|\$executeRaw/.test(text)) {
      report(file, 1, 'raw Prisma query belongs in a repository');
    }
  }

  if (dto) {
    for (const spec of importSpecifiers(text)) {
      const source = spec.source;
      const banned =
        source === '@prisma/client' ||
        source.startsWith('@prisma/client/') ||
        source.includes('/prisma/') ||
        /\.service$/.test(source) ||
        /\.controller$/.test(source);
      if (banned) {
        report(file, lineOf(text, spec.index), `DTO must not import ${source}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('layers: ok');
