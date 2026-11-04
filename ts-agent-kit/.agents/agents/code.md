# Code rules

Read `.agents/agents/typescript-standards.md` for the numbered rules. This file is the day-to-day shape of a change.

## Shape

- Exported functions have parameter and return types. `void` is written when a function returns nothing.
- Short code. If the same business rule appears twice, move it once. Two blocks that mean different things stay apart.
- Do not mix HTTP, business rules, and Prisma in one file.

## Layers

- `apps/api` controllers: HTTP in, HTTP out, including mapping a domain error to a status.
- Services: rules and orchestration. They take a repository (or `PrismaService` only through the repository).
- Repositories: Prisma queries. They map rows to domain types.
- Domain files: values and domain errors. No infrastructure imports.
- `apps/web`: components render, hooks orchestrate view state, `apps/web/src/api/` performs HTTP.

## Returns and errors

- A repository may return `T | null` when the row is missing.
- A service may return `T | null` for the same meaning, or throw a domain error when the missing row is a failed command. Pick one per method and test it.
- The controller turns `null` or a domain error into the HTTP status. It does not hide the error.
- Invalid input fails in the DTO pipe or as a domain error. Do not catch it and return a success body.
- No empty `catch`. Handle the error or rethrow it.

## Forbidden

- Prisma calls in a controller or in `apps/web`.
- `console.log` as logging. See `.agents/agents/logging.md`.
- A business rule copied into a second module.

## Lint and format

Before a task is done:

```bash
pnpm format
pnpm lint --fix
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

`pnpm format` and `pnpm lint --fix` run first. What remains after `--fix` is fixed by hand. Do not disable a rule to clear it.

The definition of done is the four checks in `AGENTS.md`: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`.

## Hooks

- `git commit --no-verify` is forbidden.
- A hook failure in your diff (ESLint, Prettier, `tsc`, tests) is fixed, then the commit is retried.
- A `pnpm audit` finding in a dependency you did not touch is a separate commit: `[manual] chore(deps): bump <package> to X.Y.Z for <advisory>`. Do not mix it into the feature commit. Run `pnpm test` on the bump first.
- A secret in the diff is Critical. Stop. Revoke the secret at the source, then remove it from the tree. Do not "fix" it by committing the deletion alone while the old commit still holds it, without telling the human.

## How to cite

Use `§N` from `.agents/agents/typescript-standards.md` in review notes. Example: `§3` errors, `§5` async, `§8` constants.
