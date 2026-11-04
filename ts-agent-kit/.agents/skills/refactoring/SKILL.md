---
name: refactoring
description: >
  Restructures or renames NestJS and React code without changing behavior:
  finds every use, edits layer by layer, and leaves lint, types, and tests
  green. Use for restructure, rename, and cleanup. Do not use for a new
  feature, a bugfix, or a hotfix.
owner: tbd
freedom: guided
last_reviewed: 2026-10-28
---

# Skill: Refactoring

## Procedure

A rename can touch many files. Before editing, collect every use and read the list. If one file is surprising, understand it first. Plan mode helps. The file list may live in `Tasks/<KEY>/`.

### 1. Prepare

- Read `.agents/agents/refactoring.md` and `.agents/agents/architecture.md`.
- `pnpm test` is green.
- Branch: `git checkout -b refactor/<KEY>-<short-description>`.

### 2. Find uses

```bash
rg "OldName" apps packages
```

Write down every file. Do not start while an unexpected file is unexplained.

### 3. Edit layer by layer

After each layer: `pnpm lint` and `pnpm typecheck`.

1. **Domain types.** Rename the type, the constant, or the function. Update annotations in that module.
2. **Prisma.** Update the schema only when the stored name changes. If a table or column is renamed, stop and use `database-migration` (expand and contract when data exists). Do not rename a mapped column inside this skill with a destructive migration.
3. **Repository.** Imports, method names that contained the old word, mapping to domain types.
4. **Service.** Imports and method names that contained the old word.
5. **Controller and DTOs.** Imports and types. HTTP paths stay the same unless the task says otherwise.
6. **Web.** Client types and feature code that used the old name.
7. **Tests.** Imports and fake names. Then `pnpm test`.

### 4. Final check

```bash
rg "OldName" apps packages
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
```

`rg` prints nothing. All four toolchain commands return 0.

### 5. Commit

```bash
git add -p
git commit -m "[agent] refactor(<scope>): rename OldName to NewName across layers"
```

English message.

### 6. Exit

Say the layers are updated, tests are green, `rg OldName` is empty, and the commit exists. Ask whether to open a merge request.

## When a test fails

1. Read the error. It is usually a missed import or a missed property.
2. `rg "OldName" apps packages` again.
3. Fix that site and rerun.

Three failures on the same error: stop and follow `.agents/agents/error-handling.md`. Do not add `@ts-ignore`.

## When `tsc` fails

A typical message is that `OldName` is no longer exported. Update the import. Do not suppress the error.
