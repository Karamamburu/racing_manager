---
name: mr
description: >
  Prepares a merge request after implementation: formats the branch, confirms
  the toolchain is green, rebases onto the default branch, and writes a
  testable description with the ticket link. Use when opening or updating a
  merge request. Do not use to implement a feature or to perform the code review.
owner: tbd
freedom: strict
last_reviewed: 2026-10-28
---

# Skill: Merge request

## Procedure

Read `.agents/agents/mr.md`.

### 0. Techlead gate

From the product root:

```bash
node .agents/tools/verify_techlead_gate.mjs
```

If the exit code is not 0, stop. Do not open or update the merge request. Return to the wave's implementation skill, fix the failing check, and run the gate again.

### 1. Before opening

- Format and fix what the tools can fix:

```bash
pnpm format
pnpm lint --fix
```

- The definition of done is green:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

- Update the branch onto the default branch:

```bash
git fetch origin
git rebase origin/<default>
```

If rebase conflicts, stop and tell the human which files conflict. Do not force-push unless the human asks. Do not skip hooks.

### 2. Description

- Title: `feat:`, `fix:`, `hotfix:`, `refactor:`, or `docs:` plus a short result.
- Body: what changed, why, how to test, risks.
- If the database changed, say how to roll back and whether `down.sql` drops data.
- Link the ticket.

### 3. Checklist

- No commented-out code.
- No `console.log` left for debugging.
- No unrelated files in the diff.
- New or changed routes have tests.
- A schema change has `migration.sql` and `down.sql`.
- You did not merge the request. A human approves. This skill stops at ready-to-open or at the created request if the human asked you to create it.

## Definition of done

- `node .agents/tools/verify_techlead_gate.mjs` returned 0 on this wave.
- The four pnpm commands returned 0 on the rebased branch.
- The description matches `.agents/agents/mr.md`.
- The request is not merged.
