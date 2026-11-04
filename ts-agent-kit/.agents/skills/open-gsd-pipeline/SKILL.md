---
name: open-gsd-pipeline
description: >
  Plans and executes a NestJS and React change as disk-backed waves so scope
  and context do not drift. Use when the work touches more than two files, a
  new contract, or more than one layer. Do not use for a one or two file fix
  with no schema change and no new contract (small-fix).
owner: tbd
freedom: strict
last_reviewed: 2026-10-28
---

# Skill: GSD pipeline

Get Stuff Done: DISCUSS, PLAN, EXECUTE, VERIFY. State lives in `.planning/`, not in the chat. Each execute wave is a fresh context.

## 1. When

- **Use when** the change is a new behavior, crosses layers, or needs more than two files.
- **Do not use** for `small-fix`. Do not implement a later wave inside the context that planned it.

## 2. Inputs

- An accepted `specs/<feature>-ears.md` (`spec-kit-ears`, linter exit 0). If the spec is missing, stop and run that skill.
- A clean product git tree, or a human note that names dirty files to leave alone.
- Run commands from the product root.

## 3. Steps

### Phase 1: DISCUSS

1. Copy `.agents/templates/planning/PROJECT.md` to `.planning/PROJECT.md` if the file is missing.
2. Replace the example. Record the goal, out of scope, and the invariants from `AGENTS.md` (layers, backward compatible responses, no silent `any`).

### Phase 2: PLAN

1. Copy `.agents/templates/planning/ROADMAP.md` and `STATE.md` if they are missing.
2. Replace the example waves. Order, and skip a wave the spec does not need:
   1. DTO and shared response types.
   2. Prisma migration, only when the spec changes stored data (`database-migration`).
   3. Repository and service.
   4. Controller.
   5. React client, hook, and component.
   6. Verify (`techlead-gate`).
3. Each wave lists at most 3 files, as checklist lines whose text is a path.
4. Set `Active wave:` in `.planning/STATE.md` to the first unfinished heading.
5. Run `node .agents/tools/plan_checker.mjs`. It must exit 0 before any product edit.

### Phase 3: EXECUTE

1. Start a new agent context. It may read `AGENTS.md`, `.planning/STATE.md`, `.planning/PROJECT.md`, the current wave in `ROADMAP.md`, and the EARS spec. It does not read earlier chat.
2. That context follows only the skill the wave names: `nest-feature`, `react-feature`, or `database-migration`.
3. Close the context when the wave's files are done. Mark that wave's paths `[x]` and move `Active wave:` forward.
4. A wave that edits a later layer is restored with `git restore` on those paths, then repeated.

### Phase 4: VERIFY

1. Run `node .agents/tools/plan_checker.mjs`.
2. Run `node .agents/tools/verify_techlead_gate.mjs`.
3. On failure, fix only the reported check, at most three times. The same failure twice stops the loop.

## 4. Outputs

- `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/STATE.md`
- Product code limited to the files named on the waves
- A green techlead gate at the end

## 5. Definition of done

- Every wave in `ROADMAP.md` is `[x]`.
- `plan_checker.mjs` and `verify_techlead_gate.mjs` exit 0.
- `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and `pnpm test` exit 0.

## 6. Stop and rollback

- EXECUTE of the DTO wave editing a controller, repository, or screen: `git restore` those paths and repeat the wave.
- Plan checker or techlead gate still failing after three attempts: stop and report the log. Do not raise `max_changed_files`.
- Do not keep the planning context open and "just implement the rest".
