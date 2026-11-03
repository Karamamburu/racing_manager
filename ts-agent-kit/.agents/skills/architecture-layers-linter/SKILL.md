---
name: architecture-layers-linter
description: >
  Checks NestJS and React import direction: controllers and the web app do
  not call Prisma, services do not throw HTTP exceptions, and DTOs do not
  import services. Use after a code wave and inside the techlead gate. Do not
  use to redesign layers.
owner: tbd
freedom: strict
last_reviewed: 2026-10-28
---

# Skill: Architecture layers linter

## 1. When

- **Use when** a wave of product code has been written, before tests are treated as the only gate, and as part of `techlead-gate`.
- **Do not use** to invent a new layering. The laws are in `AGENTS.md`.

## 2. Inputs

- Product code under `apps/`.
- Working directory is the product root.

## 3. Steps

### Phase 1: Scan

```bash
node .agents/tools/verify_architecture_layers.mjs
```

The script walks `apps/**/*.ts` and `apps/**/*.tsx`. It does not use a Python AST.

### Phase 2: Rules

1. `*.controller.ts` and everything under `apps/web` do not import `@prisma/client`, `PrismaClient`, or `PrismaService`, and do not call Prisma model methods (`findMany`, `create`, `update`, and the rest of that family).
2. `*.service.ts` may call `prisma.$transaction` only. Model methods belong in `*.repository.ts`. A service does not mention `HttpException` and does not import `express`.
3. Files under a `dto/` directory do not import a service, a controller, or Prisma.
4. `import(` (a dynamic import) is a violation in `apps/`.

### Phase 3: Fix

1. Move the offending call to the layer the script names.
2. Re-run the script. Do not disable it.

## 4. Outputs

- Exit 0 and no violation lines, or exit 1 with `file:line` and the rule.

## 5. Definition of done

- `node .agents/tools/verify_architecture_layers.mjs` exits 0.

## 6. Stop and rollback

- A dynamic `import()` added to get past the scanner: remove it and stop.
- A service that imports `HttpException` to return a status quickly: restore the service and map the domain error in a filter.
