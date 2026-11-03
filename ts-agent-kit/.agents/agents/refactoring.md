# Refactoring rules

## When it is appropriate

- A name lies about the concept.
- The same rule is copied and should live in one place.
- A module has more than one reason to change.
- A rule sits in the wrong layer (validation in the controller that belongs in the service, a Prisma call outside the repository).

## When it is forbidden

- "While we are here", with no task.
- Inside a hotfix.
- On code with no tests. Write the tests first (`characterization-tests` or `tests-unit`), then change structure.

## Before the first edit

1. `pnpm test` is green.
2. `git status` is clean, or the human has named the unrelated dirty files to leave alone.
3. Branch: `refactor/<KEY>-<short-description>`.
4. Find every use before editing:

```bash
rg "OldName" apps packages
```

## Order

Dependencies first:

```
domain types
prisma schema and migration, only if the database shape changes
repository
service
controller and DTO
apps/web, if a shared name leaked into the client
tests last
```

Do not start the next layer until `pnpm lint` and `pnpm typecheck` pass on the current one.

## After

```bash
rg "OldName" apps packages
pnpm lint
pnpm typecheck
pnpm test
```

`rg` prints nothing. Public HTTP paths stay the same unless the task says otherwise. A schema change has a migration and `down.sql`. No commented-out code and no leftover TODO from the rename.

## Commits

One commit unless the change is large enough to review in layers:

```
[agent] refactor(links): rename ShortLink to Link across layers
```

Messages are English.
