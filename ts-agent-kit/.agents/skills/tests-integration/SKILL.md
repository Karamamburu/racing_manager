---
name: tests-integration
description: >
  Writes end-to-end API and repository tests against real PostgreSQL, isolates
  state between tests, and never lowers the coverage threshold. Use when the
  path is HTTP to Nest service to Prisma to Postgres. Do not use for pure
  business logic with no database (tests-unit).
owner: tbd
freedom: guided
last_reviewed: 2026-10-28
---

# Skill: Integration tests

## 1. When

- **Use when** the check is HTTP, service, repository, and PostgreSQL together.
- **Do not use** for pure rules with no database. That is `tests-unit`.

## 2. Inputs

- Unit tests for the module are green if they exist.
- Disposable PostgreSQL is up. `prisma migrate deploy` has been applied to it. Not the developer's primary database.
- You have read `.agents/agents/testing.md` and `.agents/agents/database.md`.

## 3. Steps

### Phase 1: Isolation

1. Confirm a fixture gives each test a clean schema: a rolled-back transaction, or a truncate of the touched tables before and after the test.
2. The Nest app in the test uses that database via the repository. If no fixture exists, add it before writing cases.

### Phase 2: Scenarios

1. Cover the status codes the route actually returns: success, validation failure, not found, conflict when a unique constraint matters.
2. Assert the status, the JSON keys, and the row after a write.
3. Use supertest. Do not follow redirects unless the assertion is about the final page. Check `Location` on the redirect itself.

### Phase 3: Double run

1. Run the integration suite twice back to back.
2. Both runs pass with no leftover rows and no unique-constraint failure caused by the previous run.

### Phase 4: Threshold only moves up

1. If Jest `coverageThreshold` exists, do not lower any number.
2. If this suite raised measured branch coverage and the project already tracks a threshold, you may raise the threshold to the new measured integer. You may not lower it to make the run pass.

## 4. Outputs

- Integration specs and the isolation fixture.
- The threshold file unchanged or higher.

## 5. Definition of done

1. Two consecutive integration runs pass.
2. `pnpm test` returns 0.
3. `pnpm lint`, `pnpm format:check`, and `pnpm typecheck` return 0.
4. `coverageThreshold` is absent, unchanged, or higher than before this task.

## 6. Stop and rollback

- Do not point tests at the primary development database.
- Do not lower a coverage threshold.
- If the second run fails on uniqueness or leftover rows, fix the fixture. Do not delete the test.
