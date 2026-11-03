---
name: docs
description: >
  Documents a change while it is being built: an ADR when the decision is
  hard to undo, TSDoc on public APIs, a changelog line, and a README update.
  Use when a public API, architecture decision, env var, dependency, or
  user-visible behavior changes. Do not use to write a PRD, and do not use
  as a wrap-up document after the task is already finished.
owner: tbd
freedom: guided
last_reviewed: 2026-10-28
---

# Skill: Docs

## Procedure

Read `.agents/agents/docs.md` and follow the templates there.

### 1. Before implementation

- Does the task change a public route, a client function, an env var, or a dependency?
- Is the decision architectural (several modules, a new tool, a new approach)?
- If it is architectural, write the ADR before the code so Context and Decision exist while they are still cheap to change.

### 2. During implementation

- Write the TSDoc with the signature, before the body. English. Summary, then `@param`, `@returns`, and `@throws` when they add something the types do not say.

```ts
/**
 * Create a link with a generated code.
 *
 * @param originalUrl - http or https URL.
 * @returns The stored link.
 * @throws InvalidUrlError when the URL is empty or not http(s).
 */
export function createLink(originalUrl: string): Link {}
```

### 3. After implementation

- Add one user-facing line under `[Unreleased]` in `CHANGELOG.md`: `Added`, `Changed`, `Fixed`, `Removed`, or `Security`. Example: `- Fixed 500 on POST /links when the URL exceeds 2048 characters (PROJ-202).`
- If an env var, a run command, a dependency, or the route list changed, update that section of `README.md`.
- If you added an ADR, link it from the README architecture section and from `docs/adr/INDEX.md`.

### 4. ADR

Use ADR-lite or ADR-full from `.agents/agents/docs.md`. Do not delete an older ADR. Supersede it.

## Definition of done

- Public functions touched in the diff have TSDoc that says more than the name.
- User-visible changes have a changelog line.
- A decision that matches the ADR-full triggers has a file under `docs/adr/` with a sensitivity check, or the task stops and asks for one.
- `pnpm lint` and `pnpm typecheck` still return 0. This skill does not skip the toolchain when it also edits code comments in TypeScript files.
