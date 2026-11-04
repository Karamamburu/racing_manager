---
name: hotfix
description: >
  Ships an urgent production fix with a tiny scope, an explicit rollback, a
  regression test, and a green toolchain. Use when production is down, an
  incident is open, or a critical degradation needs a safe patch now. Do not
  use for an ordinary bugfix, a new feature, or a refactor.
owner: tbd
freedom: strict
last_reviewed: 2026-10-28
---

# Skill: Hotfix

## Procedure

Scope discipline is the point. Before code, send one chat message, not a new document: what broke in production, the minimal fix (about 20 lines or fewer of product code), what you will not touch, and how to roll back if the fix makes things worse. That message is not an approval gate. It stops the extra edits that make a hotfix expensive. Use Plan mode if you need to think first.

Read `.agents/agents/hotfix.md` before editing.

### 1. Prepare

- Branch from the default branch: `git checkout <default> && git checkout -b hotfix/<KEY>-<short-description>`.

### 2. Minimal fix

- One change, the one that stops the incident.
- No refactor and no "while we are here".
- If the fix needs more than about 20 lines of product code, stop. Agree a switch to `bugfix` with the human. Do not widen the hotfix until it fits.

### 3. Regression test

- A test that reproduces the incident and passes after the fix.

### 4. Check

```bash
pnpm format
pnpm lint --fix
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

A red hook in a hotfix is a defect heading to production. Fix it. Do not skip hooks.

On failure, use `.agents/agents/error-handling.md`. Default severity is High. If something that was green before your edit is now red, treat it as Critical, stop, and call the human.

### 5. Commit

`[agent] hotfix(<scope>): <what production does again>`

Exactly one commit. English.

### 6. Exit

Say the hotfix is ready, the regression test is in, the toolchain is green, and the rollback from the opening message still applies. Ask before opening a merge request to the default branch.
