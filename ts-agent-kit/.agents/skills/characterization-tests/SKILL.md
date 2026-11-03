---
name: characterization-tests
description: >
  Records the current HTTP status and body of existing NestJS routes with
  supertest before any application edit. Use when changing a service that has
  no behavior tests yet. Do not use for new code written test-first, or when
  a green characterization suite already covers the routes you will touch.
owner: tbd
freedom: strict
last_reviewed: 2026-10-28
---

# Skill: Characterization tests

## 1. When

- **Use when** an existing API must change and the current responses are not locked by tests.
- **Do not use** for new code written test-first, or when a characterization suite already passes for the routes in scope.

## 2. Inputs

- An `architecture-map.md` from `investigate-codebase`, or an equivalent list of routes and files.
- Disposable PostgreSQL is migrated (`prisma migrate deploy`).
- `git diff --exit-code -- apps` returns 0. Application code has not been edited in this task.

## 3. Steps

### Phase 1: Matrix

1. List the routes this task might affect: method, path, input, status, relevant headers, and JSON keys.
2. Include one rejection case the route already performs (validation or not found), using the status the server returns today.

### Phase 2: Lock the behavior

1. Add tests under the API characterization path, for example `apps/api/test/characterization/`.
2. Assert the response the server gives now, including a status that looks wrong. The snapshot records reality. It does not invent the correct product behavior.
3. If the status surprises you, write it down in the test name and in the task note. Do not "fix" the controller in this skill.

### Phase 3: Run

1. `pnpm test` for the characterization path is green on the untouched application.
2. Do not lower `coverageThreshold`. If the project has no threshold yet, you may set it to the measured branch percentage for the covered files, rounded down. Record the command.

## 4. Outputs

- Characterization specs only, plus a threshold that stayed the same or rose.
- No diff under application source, Prisma schema, or migrations.

## 5. Definition of done

1. `git diff --exit-code -- apps/api/src apps/web/src apps/api/prisma` returns 0.
2. The characterization command returns 0.
3. `pnpm lint` and `pnpm typecheck` return 0 for the test files.

## 6. Stop and rollback

- Do not edit `apps/api/src`, `apps/web/src`, or `apps/api/prisma` in this skill.
- If that diff is not empty, `git restore` those paths and stop.
- If a test is still red after three attempts, stop and report. Do not change the server so the test can pass.
