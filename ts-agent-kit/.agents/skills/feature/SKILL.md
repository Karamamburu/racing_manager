---
name: feature
description: >
  Implements a new user-facing behavior across NestJS and React: API contract
  first, then UI, with tests, safe defaults, and a check that the feature
  actually does its job. Use for a new endpoint plus screen, or a new flow
  that crosses both apps. Do not use for a bugfix, a hotfix, a pure refactor,
  or an architecture document before code.
owner: tbd
freedom: guided
last_reviewed: 2026-10-28
---

# Skill: Feature

## Procedure

If the approach is still unclear, switch the IDE to Plan mode, write the approach, and return to implementation only after it is accepted. Task notes may live in `Tasks/<KEY>/`.

### 0. Spec and wave

New behavior does not start in this skill.

- An accepted `specs/<feature>-ears.md` must already exist (`spec-kit-ears`, and `node .agents/tools/ears_linter.mjs` exits 0).
- `.planning/STATE.md` must name the active wave (`open-gsd-pipeline`).
- If either is missing, stop. Do not write the spec or the plan inside this skill.

### 1. Prepare

- Say what the user can do after the change that they could not do before.
- Branch: `git checkout -b feature/<KEY>-<short-description>`.
- Read `.agents/agents/architecture.md`.
- API only: switch to `nest-feature` and follow it. UI only: switch to `react-feature`. Both: stay here and run API first, then UI.

### 2. Read the code

- Find the extension point. Do not add a second copy of an existing rule.
- List layers: domain, Prisma, repository, service, controller, web client, hook, component.
- If the feature reads a page, a paginated API, a stream, or a growing log, confirm whether one read is the whole dataset. See `.agents/agents/architecture.md`, "Dynamic sources".
- If a call can hang without throwing, every step needs a timeout, including cleanup in `finally`. See the same file, "Timeouts".

### 3. Implement in order

1. Domain types.
2. `schema.prisma` and `database-migration` when the database shape changes. Do not skip `down.sql`.
3. Repository.
4. Service.
5. Controller and DTOs (`nest-feature` phases).
6. Web client, hook, and component (`react-feature` phases) after the contract exists.

### 4. Tests

- Unit tests for the service on a fake repository.
- Integration tests for the HTTP path when a route was added or changed.
- A Testing Library test when the UI changed, asserting the payload the client sends.

### 5. Final check

```bash
pnpm format
pnpm lint --fix
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

Run format and lint-fix before `pnpm lint`. A rule that `--fix` cannot clear is fixed by hand.

A green toolchain does not prove the feature works. For parse, import, scrape, or transform behavior, compare the output to an independent expected count. See `.agents/agents/testing.md`.

On a non-trivial failure, follow `.agents/agents/error-handling.md`. Do not start with a workaround.

### 6. Business result

A green suite shows the code runs. It does not show the feature has an effect. All four checks are required:

- **The default must not turn the feature off.** A setting that controls the thing the feature exists to do (a render wait, a crawl depth, a fetch limit) is either required with no default, or defaults to a value that does the work. `0`, `""`, and `null` on that setting are an off switch dressed as a default.
- **Assert the outbound payload, not only the status code.** A 200 from an upstream service proves nothing if the request asked it to do nothing.
- **A new environment variable is set in every deployed environment in the same change.** A variable that appears in no config cannot be reviewed, because there is nothing to compare.
- **Before calling the task done, record a before-and-after on a concrete metric**, with the query or request in the note, and open at least five resulting records by hand. "The job finished", "the worker is up", and "files were written" are not a business result.

A real miss: a render-wait setting shipped as `default 0` ("0 means do not wait"), was unset in every environment, and had no payload test. The browser tier captured DOM before paint. Days later, most stored pages were empty. The first person who opened the HTML noticed. The suite had stayed green.

### 7. Commit

`[agent] feat(<scope>): <what the user can do>`

One commit for the feature unless the human asked to split API and UI. English message. Tag and scope stay in the prefix. See `AGENTS.md`.

### 8. Exit

Say the ticket is done, the four commands passed, and the commit exists. Ask whether to open a merge request or change something. Do not open the request until the human says so.
