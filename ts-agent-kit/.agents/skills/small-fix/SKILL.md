---
name: small-fix
description: >
  Applies a one or two file NestJS or React fix with no schema change, no new
  dependency, and no new route contract, then runs the techlead gate. Use for
  a tiny correction. Do not use for a new endpoint, a Prisma schema change, or
  any task that needs a third product file.
owner: tbd
freedom: strict
last_reviewed: 2026-10-28
---

# Skill: Small fix

## 1. When

- **Use when** the correction fits in one or two product files, does not change `schema.prisma`, does not add a dependency, and does not add or reshape a route contract.
- **Do not use** when a third file is required. Switch to `spec-kit-ears` and `open-gsd-pipeline`. Do not create `.planning/` just to look like a pipeline.

## 2. Inputs

- The symptom, the file paths, and what "done" looks like.
- Product root is the working directory.
- Read `AGENTS.md`. If `docs/INDEX.md` is missing, copy `.agents/templates/docs/INDEX.md` and one domain page from `.agents/templates/docs/domains/example.md`, then name the domain you are actually touching. Those docs are not the two product files.

## 3. Steps

1. If the route already exists and no characterization test covers it, run `characterization-tests` before the edit.
2. Edit only the named paths. Do not touch a frozen path from `specs/blast-radius.json`.
3. Run `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and `pnpm test`. Fix a red command in the code, up to three attempts.
4. Run `node .agents/tools/verify_techlead_gate.mjs`. The EARS linter and the plan checker stay quiet when no spec and no `.planning/` exist.
5. Write a short note: files changed, commands, exit codes, and what you did not look at.

## 4. Outputs

- A patch of at most two product files, plus a knowledge-index edit when the public surface changed.
- The note from step 5.

## 5. Definition of done

- Characterization is green when the route already existed.
- The four pnpm commands exit 0.
- `verify_techlead_gate.mjs` exits 0.
- No new dependency and no Prisma schema diff.

## 6. Stop and rollback

- A third product file, a schema change, a new dependency, or a new route: stop and switch to the pipeline. Restore the extra edits.
- The gate is still red after three attempts: stop and paste the failing check. Do not skip it.
- A secret would be required: stop.
