---
name: tests-unit
description: >
  Writes fast isolated unit tests for NestJS service logic on in-memory fake
  repositories and aims for 100% branch coverage of the target module. Use for
  apps/api services and pure web hooks. Do not use for SQL, transactions, or
  HTTP tests that need PostgreSQL (tests-integration).
owner: tbd
freedom: guided
last_reviewed: 2026-10-28
---

# Skill: Unit tests

## 1. When

- **Use when** service logic in `apps/api/src/<module>/*.service.ts`, or a pure function, needs tests and the database must stay out of the run.
- **Do not use** for SQL, indexes, or transactions. That is `tests-integration`.

## 2. Inputs

- Characterization tests are green if that suite exists.
- The target module is named.
- You have read `.agents/agents/testing.md`.

## 3. Steps

### Phase 1: Branches

1. List every branch in the target: `if`, `switch`, early returns, thrown domain errors, and combined conditions.
2. List edges: empty string, missing entity, duplicate key at the service level, and each rejected input class the service claims to reject.

### Phase 2: Fake repository

1. Add an in-memory fake that implements the same async methods as the real repository, backed by a `Map`.
2. Assert returned values and stored state. Do not mock the service under test. Do not use a call-count assertion as the only proof.

### Phase 3: Tests and coverage

1. One test per branch from phase 1, under the API unit test path (for example `apps/api/src/<module>/<module>.service.spec.ts`).
2. Run Jest with branch coverage on that module and a fail-under of 100 for the files you named.

Web hooks that only call `apps/web/src/api/` are unit tests too: mock the client module, never Prisma.

## 4. Outputs

- Spec files next to the service or hook.
- A coverage command in the task note: command, passed count, branch percentage.

## 5. Definition of done

1. The targeted module's branch coverage command returns 0 at 100% for the files in scope.
2. The unit suite for that module finishes in under a few seconds and opens no database port.
3. `pnpm lint`, `pnpm format:check`, and `pnpm typecheck` return 0.

## 6. Stop and rollback

- No live PostgreSQL and no outbound network in unit tests.
- Do not mock the service you are testing.
- Do not change production code to satisfy a test. If the test found a defect, stop and report. Switch to `bugfix` if the human asks for the fix.
