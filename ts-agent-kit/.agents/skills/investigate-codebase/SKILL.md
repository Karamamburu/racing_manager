---
name: investigate-codebase
description: >
  Reads a NestJS and React codebase without editing it, maps the call chain
  from UI and controller through service and repository to Prisma, and lists
  the files a change may touch. Use before a feature, refactor, or bugfix in
  existing code. Do not use once implementation of tests or migrations has
  started.
owner: tbd
freedom: strict
last_reviewed: 2026-10-28
---

# Skill: Investigate the codebase

## 1. When

- **Use when** a new change, refactor, or bugfix starts and the blast radius is not written down yet.
- **Do not use** after the task has moved on to writing tests or migrations. Finish the map first, then switch skills.

## 2. Inputs

- The product repo is the working directory (the kit alone has no `apps/`).
- `git status --short` has no uncommitted edits, or the human has named dirty files that must stay untouched.
- You have read `AGENTS.md` sections 2 and 4.

## 3. Steps

### Phase 1: Read only

1. Scan `apps/api/src` (modules, controllers, services, repositories) and `apps/web/src` (features and `api/`).
2. List endpoints and screens for the target entity.
3. Note request and response DTO fields that are already public.

### Phase 2: Map

1. Write the chain: UI client, controller, service, repository, Prisma model, table.
2. List external contracts that must not change: response keys, status codes, env vars, shared package exports.

### Phase 3: Blast radius

1. List files that may change. Prefer a short list. If the list grows past a handful of files, say why each one is required.
2. List modules that stay untouched, especially auth, logging setup, and Prisma migration history.

## 4. Outputs

- `architecture-map.md` in the task folder or the repo root if the human named no folder. It contains the chain, the frozen contracts, the file list, and the untouched modules.
- No product code edits.

## 5. Definition of done

1. `git status --short -- apps` is empty (or identical to the dirty files the human asked you to leave).
2. If the product has the toolchain installed, `pnpm lint` and `pnpm typecheck` still return 0. You did not need them to pass by editing code. If dependencies are not installed, say so and rely on the clean git status.

## 6. Stop and rollback

- If any file under `apps/` changed, `git restore` those paths and stop.
