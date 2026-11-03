---
name: bugfix
description: >
  Fixes a bug by reproducing it, finding the root cause, adding a failing
  regression test, applying a minimal fix, and leaving the toolchain green.
  Use for a known symptom or regression. Do not use for a production incident
  (hotfix), a new feature (feature), or a behavior-preserving restructure
  (refactoring).
owner: tbd
freedom: guided
last_reviewed: 2026-10-28
---

# Skill: Bugfix

## Procedure

If the root cause is not obvious, use Plan mode and read the code before writing the test. Do not guess the edit site. If the symptom and the cause are in different places, say so and continue.

### 1. Prepare

- Reproduce the failure. Name the input and the wrong output.
- Branch: `git checkout -b bugfix/<KEY>-<short-description>`.

### 2. Locate the defect

- Find the file and the line where the wrong decision happens.
- Fix the cause, not a nearby symptom.
- If the scope is wider than the ticket, tell the human before editing further.

### 3. Test first

- Write a regression test that fails on the current code.
- Run it and see the failure. A test that passes before the fix does not lock the bug.

### 4. Minimal fix

- Change only what removes the cause. No refactor in the same commit.
- Do not change a public HTTP contract unless the bug is that contract and the task says to change it.

### 5. Check

```bash
pnpm test
pnpm format
pnpm lint --fix
pnpm lint
pnpm format:check
pnpm typecheck
```

The regression test is green. The rest of the suite stays green.

A green run is not proof for a silent data bug. Re-run the real input that showed the bug and compare it to an independent expected result. See `.agents/agents/testing.md`.

If `tsc` fails in code you did not mean to change, or a test fails for an unclear reason, follow `.agents/agents/error-handling.md`. Do not add `@ts-ignore`.

### 6. Commit

`[agent] fix(<scope>): <the symptom that is gone>`

One commit. English.

### 7. Exit

Say the bug is fixed, the regression test exists, and the toolchain is green. Ask whether to open a merge request.
