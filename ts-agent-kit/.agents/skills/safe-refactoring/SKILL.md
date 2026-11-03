---
name: safe-refactoring
description: >
  Refactors NestJS or React code and tightens TypeScript types without changing
  external behavior and without editing existing tests. Use for deduplication,
  module extraction, and strict typing. Do not use in the same change as a new
  feature or a behavior fix.
owner: tbd
freedom: strict
last_reviewed: 2026-10-28
---

# Skill: Safe refactoring

## 1. When

- **Use when** you are removing duplication, extracting a module, or making types stricter, and the observable behavior stays the same.
- **Do not use** in the same change as a new feature or a bugfix.

## 2. Inputs

- `pnpm lint`, `pnpm typecheck`, and `pnpm test` are green.
- `git status --short` is clean, or the human named dirty files that this skill must not touch.
- You have read `.agents/agents/refactoring.md` and `.agents/agents/typescript-standards.md`.

## 3. Steps

### Phase 1: Baseline

1. Run the test suite and record that it passed.
2. List call sites:

```bash
rg "OldName" apps packages
```

### Phase 2: Small steps

1. One step is one structural change (move a function, rename an internal type, delete a duplicate).
2. After each step run `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
3. Do not add `any`, `@ts-ignore`, `@ts-expect-error`, or `eslint-disable`. Those need written approval and are not part of this skill's success path.

### Phase 3: Prove the tests can fail

1. Inject one obvious behavior break in the code under refactor (for example, stop incrementing a counter the tests claim to cover).
2. The suite must go red. If it stays green, the tests do not lock the behavior. Stop and report. Do not "fix" that by editing tests inside this skill. The human may switch you to `tests-unit` first.
3. Revert the injected break. The suite is green again.

## 4. Outputs

- Edits under application source only.
- `git diff --exit-code` on existing test files returns 0. New test files are also out of scope for this skill.

## 5. Definition of done

1. Existing tests are unchanged (`git diff --exit-code` on the test paths).
2. `pnpm lint`, `pnpm format:check`, and `pnpm typecheck` return 0.
3. `pnpm test` returns 0.
4. Coverage thresholds are unchanged or higher.

## 6. Stop and rollback

- Do not edit existing tests.
- If `pnpm test` goes red, restore the last step. Do not silence the type checker.
- Three red runs on the same step: stop and report.
