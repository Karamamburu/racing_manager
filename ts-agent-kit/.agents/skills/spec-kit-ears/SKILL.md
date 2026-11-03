---
name: spec-kit-ears
description: >
  Writes an EARS acceptance spec for a NestJS and React change before any
  test or product code. Use when behavior is new or a contract changes. Do
  not use to implement the feature, and do not use for a one or two file fix
  that does not change a contract (small-fix).
owner: tbd
freedom: strict
last_reviewed: 2026-10-28
---

# Skill: EARS spec

## 1. When

- **Use when** a new endpoint, screen, or business rule needs an acceptance spec before code.
- **Do not use** to write the implementation. That is a later wave of `open-gsd-pipeline`. Do not use for `small-fix`.

## 2. Inputs

- The ticket or a short statement of the user-visible outcome.
- `docs/INDEX.md` and the one domain page from `knowledge-index`, when that index exists.
- Run this skill from the product root.

## 3. Steps

### Phase 1: Five EARS patterns

Write every requirement in English with these shapes. A requirement that fits none of them is rewritten with the human, not forced into a vague sentence.

1. **Ubiquitous:** `The system SHALL <action>.`
2. **Event:** `WHEN <trigger>, the system SHALL <action>.`
3. **State:** `WHILE <state>, the system SHALL <action>.`
4. **Unwanted:** `IF <failure>, the system SHALL <action>.` This group is mandatory.
5. **Optional:** `WHERE <flag>, the system SHALL <action>.` If nothing is optional, write `WHERE none, the system SHALL skip this pattern.`

### Phase 2: Contracts

1. Name the Nest request and response DTO, or the web client type, on every requirement that crosses HTTP.
2. Money is integer minor units or a decimal string. Never `number`.
3. Dates are ISO-8601 strings validated at the boundary, not free text.
4. A `WHEN` that creates, updates, or deletes names the idempotency key field.

### Phase 3: Write the file

1. If `specs/` does not exist, create it.
2. Start from `.agents/templates/specs/feature-ears.md` and replace the example with this task.
3. Save `specs/<feature>-ears.md`.
4. Run:

```bash
node .agents/tools/ears_linter.mjs
```

When this kit is the workspace and the product is another directory, run the script by its absolute path with the shell's working directory set to the product root. The script reads `process.cwd()`.

## 4. Outputs

- `specs/<feature>-ears.md`
- A checklist of requirement ids the later tests must cover. The checklist lives in the spec. It is not a test file.

## 5. Definition of done

- `node .agents/tools/ears_linter.mjs` exits 0.
- Unwanted behavior is present.
- No product code, test, or Prisma schema was edited. `git diff --exit-code -- apps` is empty.

## 6. Stop and rollback

- A requirement that fits no EARS pattern stops the skill. Ask the human to restate it.
- A contradiction with the layer laws in `AGENTS.md` keeps the layer law. Change the spec, not the law.
- If product files changed, `git restore apps` and stop.
