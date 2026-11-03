---
name: nest-feature
description: >
  Builds a NestJS feature from the bottom up: DTO, repository, service, then
  controller, using red-green-refactor while existing HTTP contracts stay
  intact. Use when adding an endpoint, field, or business rule in apps/api.
  Do not use for a refactor with no new behavior, for a schema-only change
  (database-migration), or for UI-only work (react-feature).
owner: tbd
freedom: guided
last_reviewed: 2026-10-28
---

# Skill: Nest feature

## 1. When

- **Use when** an endpoint, response field, or business rule is added to `apps/api`.
- **Do not use** for a pure refactor (`safe-refactoring`), a schema change with no new behavior (`database-migration`), or UI-only work (`react-feature`).

## 2. Inputs

- Stop if this is new behavior and `specs/<feature>-ears.md` is missing or `.planning/STATE.md` has no active wave. Run `spec-kit-ears` and `open-gsd-pipeline` first. Do not write those files here.
- If `apps/api` already has characterization tests, `pnpm test` for that suite is green before you edit.
- If the feature needs a table or column, `database-migration` has already landed the migration and `down.sql`.
- You have read `.agents/agents/architecture.md` and `.agents/agents/code.md`.

## 3. Steps

### Phase 1: Characterization

1. If `characterization-tests` has not been run and the routes you will touch already exist in production code, stop and run that skill first.
2. If the feature is new and nothing old changes, skip this phase and say so.

### Phase 2: Contracts and DTOs

1. Add request and response DTOs under `apps/api/src/<module>/dto/` with `class-validator` constraints.
2. New response fields are optional and have a default that old clients can ignore.
3. Do not rename or remove an existing field, and do not change an existing status code.

### Phase 3: Red test

1. Write the unit test (fake repository) and, when the change is HTTP, the integration test.
2. Run the new test. It must fail for the missing behavior, not for a typo or a missing import.

### Phase 4: Bottom up

1. Repository in `apps/api/src/<module>/`: Prisma only. No `$transaction` here.
2. Service: business rules, domain exceptions, `prisma.$transaction` when more than one write must commit together.
3. Controller: thin handler. An exception filter maps domain exceptions to HTTP. The service does not throw `HttpException` and does not import Express request or response types.
4. Register the provider in the Nest module.

### Phase 5: Verify

1. The full test command is green. Characterization tests, if they exist, still pass without edited assertions.
2. If the API Jest config has `coverageThreshold`, leave it or raise it to the new measured branch coverage. Do not lower it.

## 4. Outputs

- DTO, repository, service, controller, module wiring, and tests.
- A migration only if `database-migration` was the prior skill. Do not hand-edit the database from this skill.

## 5. Definition of done

1. `pnpm lint`, `pnpm format:check`, and `pnpm typecheck` return 0.
2. `pnpm test` returns 0.
3. Existing response bodies for routes this task did not mean to change have the same keys as before.

## 6. Stop and rollback

- A change to an old response shape or status code stops the task. Report it. Do not "keep compatibility" by deleting the old assertion.
- If characterization tests stay red after three attempts, `git restore` the API source from this attempt and report.
- No Prisma calls in the controller. No weakened assertions.
