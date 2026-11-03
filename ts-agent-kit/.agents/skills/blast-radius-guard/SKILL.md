---
name: blast-radius-guard
description: >
  Blocks a NestJS or React wave that exceeds the file budget or edits a
  frozen path, including an already applied Prisma migration.sql. Use before
  a commit and at the end of a wave. Do not raise the budget to fit the diff.
owner: tbd
freedom: strict
last_reviewed: 2026-10-28
---

# Skill: Blast radius guard

## 1. When

- **Use when** a wave is about to be committed, and as part of `techlead-gate`.
- **Do not use** to expand `max_changed_files` so the current diff passes.

## 2. Inputs

- `specs/blast-radius.json`. If it is missing, copy `.agents/templates/specs/blast-radius.json` and keep `max_changed_files` at 7 unless the human has already set another number in the product.
- A git work tree. The command runs at the product root.

## 3. Steps

### Phase 1: Status

```bash
node .agents/tools/verify_blast_radius.mjs
```

The script reads `git status --porcelain=v1 -z -uall`. A rename counts as one changed file. Both paths of a rename are checked against frozen rules.

### Phase 2: Budget

1. Compare the count with `max_changed_files` (default 7).
2. `.planning/`, `.ai-team/`, and `specs/dependency-graph.json` do not count. The gate rewrites that graph. Everything else counts, including tests and specs.
3. Over budget: split the work into another wave. Do not edit the JSON inside this task.

### Phase 3: Frozen paths

1. Any path listed in `frozen_paths` fails the check. A trailing `/` is a prefix. Any other entry is an exact path. `*` is a single path segment.
2. With `protect_applied_migrations` true (the default), a change to an existing `apps/api/prisma/migrations/<id>/migration.sql` fails. A newly added migration file is allowed.

## 4. Outputs

- A stdout list of counted files.
- Exit 0 when the budget and the frozen rules hold.

## 5. Definition of done

- `node .agents/tools/verify_blast_radius.mjs` exits 0.
- `max_changed_files` is the number the product had at the start of the task.

## 6. Stop and rollback

- A frozen file or an applied `migration.sql` was edited: `git restore` that path and stop.
- The count is over the budget: stop and split the wave. Do not commit a partial mix of two waves.
