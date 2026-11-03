# AGENTS.md

Rules for a pnpm monorepo: NestJS API, React web, PostgreSQL via Prisma.
This file is the only rulebook. Skills and standards live under `.agents/`.

## 1. Read order

1. This file: stack contract, router, layer laws, definition of done.
2. Exactly one skill from the router: `.agents/skills/<name>/SKILL.md`.
3. Only the standards that skill names, under `.agents/agents/`.

Do not start implementation before the skill's inputs are true. If a stop condition fires, roll back the skill's last step and report to the human. Do not bypass the stop.

## 2. Stack contract

| Path | Role |
|---|---|
| `apps/api` | NestJS. Modules in `apps/api/src/<module>/`. |
| `apps/api/prisma/schema.prisma` | The only schema source. |
| `apps/api/prisma/migrations/` | Prisma Migrate history plus a reviewed `down.sql` per migration. |
| `apps/web` | React + Vite. Features in `apps/web/src/features/<name>/`. |
| `apps/web/src/api/` | The only HTTP client the UI may call. |

Package manager is pnpm. API tests use Jest and supertest. Web tests use Vitest and Testing Library.

If a product uses different directories, the product's root `AGENTS.md` names them once. Until it does, these paths are the contract. Do not invent a second layout inside a skill.

## 3. Spec, waves, and gates

New behavior, in this order:

1. `knowledge-index` — one domain page and the import neighbors. Do not read the whole repo.
2. `functional-analysis` — accepted English `Tasks/<KEY>/PRD.md` (problem, actors, use cases, FRs) before any acceptance spec.
3. `spec-kit-ears` — `specs/<feature>-ears.md` before tests or product code.
4. `architecture` — only when the change is breaking, multi-day, or crosses a service boundary. Stop until a human accepts the document.
5. `open-gsd-pipeline` — `.planning/` waves of at most 3 files. A fresh context executes one wave with `nest-feature`, `react-feature`, or `database-migration`.
6. `feature-pipeline` — closed loop for that wave: coder, CODE_GATE (`verify_techlead_gate.mjs`), then Skeptic, Realist, and Visionary. Three `ACCEPT` verdicts are required before `mr`. A single reviewer, when the human asks for one, stays `orchestrate-coder-reviewer-summarizer`.

A correction of one or two product files, with no schema change, no new dependency, and no new route contract, uses `small-fix` instead. It does not invent a `.planning/` roadmap.

Run the checkers from the product root:

```bash
node .agents/tools/verify_techlead_gate.mjs
```

That command runs the knowledge index, the import graph, the layer linter, the blast-radius guard, the EARS linter when a spec exists, the plan checker when `.planning/STATE.md` exists, then `pnpm test`. The first failure stops it.

## 4. Skill router

Pick one primary skill. A second skill runs only when the first skill says to.

| Task | Skill | Do not use it for |
|---|---|---|
| Scope a change to one domain and its import neighbors | `knowledge-index` | Implementing the change |
| Functional analysis (PRD) before EARS | `functional-analysis` | Writing EARS, architecture, or the feature |
| Acceptance spec before code | `spec-kit-ears` | Writing the feature |
| Disk-backed waves for a multi-file change | `open-gsd-pipeline` | A 1-2 file fix with no new contract |
| Closed loop after a feature wave: coder, gate, three judges | `feature-pipeline` | A 1-2 file fix, or a request for one reviewer |
| Import direction after a code wave | `architecture-layers-linter` | Redesigning the layers |
| File budget and frozen paths | `blast-radius-guard` | Raising the budget so this diff fits |
| Exit a wave, or the check before a merge request | `techlead-gate` | Skipping a red check |
| 1-2 files, no schema, no new dependency, no new contract | `small-fix` | A new endpoint or a third product file |
| Read-only map before any edit | `investigate-codebase` | Writing tests or migrations |
| Design for multi-module, breaking, or multi-day work | `architecture` | Coding the feature. Stop after the document is approved |
| New HTTP behavior | `nest-feature` | UI-only work, refactor, schema-only change |
| New UI behavior | `react-feature` | API-only work, rules that belong in Nest |
| New behavior on both API and UI | `feature` | Bugfix, hotfix, refactor, architecture-only |
| Known bug with a symptom | `bugfix` | Production incident, new feature, refactor |
| Production incident or severe degradation | `hotfix` | Ordinary bugfix, feature, refactor |
| Restructure or rename, same behavior | `refactoring` | Feature, bugfix, hotfix |
| Typing or structure cleanup, tests frozen | `safe-refactoring` | Any behavior change |
| Table, column, index, or foreign key change | `database-migration` | Data edits with no schema change |
| Service logic tests, no database | `tests-unit` | SQL, transactions, HTTP-to-database |
| HTTP and repository tests on real PostgreSQL | `tests-integration` | Pure logic with no database |
| Snapshot of existing HTTP before any app edit | `characterization-tests` | New code written test-first |
| Review a diff before merge | `code-review` | Implementing the change |
| ADR, TSDoc, changelog, README during the task | `docs` | A PRD or a post-task wrap-up document |
| Open or update a merge request | `mr` | Writing the feature or reviewing it |
| Independent coder, reviewer, and summarizer | `orchestrate-coder-reviewer-summarizer` | A one-file low-risk edit |

Schema work uses `database-migration` before `nest-feature`. An existing API with no behavior tests uses `characterization-tests` before any edit under `apps/`. Review, docs, and MR skills do not implement product code.

## 5. Layer laws

API, from the outside in:

1. **Controller** (`*.controller.ts`): HTTP, `class-validator` DTOs, one service call. Map domain exceptions to HTTP in an exception filter, not in the service.
2. **Service** (`*.service.ts`): business rules and domain exceptions. Owns `prisma.$transaction`.
3. **Repository** (`*.repository.ts`): the only Prisma calls.
4. **Domain** (`*.ts` types next to the module, or `domain/`): entities and domain errors. No Nest HTTP types and no Prisma client.

Forbidden:

- `PrismaClient`, `PrismaService`, or a raw query inside a controller.
- `HttpException`, or Express `Request` / `Response`, inside a service.
- `commit` inside a repository. The service or the request scope owns the transaction.
- Untyped bodies. HTTP input enters through a DTO.
- Renaming or removing an existing response field, or changing an existing status code, unless the task says so. New response fields are optional and backward compatible.
- Business rules in `apps/web` that already live in `apps/api`. No secrets and no Prisma in `apps/web`.

## 6. Database laws

- A schema change ships a Prisma migration and a reviewed `down.sql` in the same migration directory. An empty `down.sql` stops the task.
- Do not call `prisma db push` against a shared database, and do not edit tables by hand in `psql`.
- Dropping or renaming a column that already has data needs an expand-and-contract plan, not a single destructive migration.
- Inspection tools against a database are read-only: `SELECT` with a row limit. No `INSERT`, `UPDATE`, `DELETE`, `DROP`, or `ALTER`.

## 7. Anti-cheat

Forbidden:

- Weakening or deleting an existing assertion to make a run green.
- Adding `any`, `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` without written approval from the tech lead.
- `catch` blocks that swallow the error (`catch { }` with no log and no rethrow).
- Lowering a coverage threshold. The number may only stay or go up.
- Editing application code before a characterization snapshot exists, when the skill requires one.
- Commits without a prefix: `[agent]` (the agent committed), `[assisted]` (a human edited the agent's proposal), or `[manual]` (a human wrote it).
- Auto-merge of a branch or pull request. A human reviews and approves.
- `git commit --no-verify`.
- Raising `max_changed_files` in `specs/blast-radius.json` so the current diff passes. Split the wave instead.

## 8. Definition of done

A task is not done until all four commands return 0:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

Feature-sized work (an EARS spec, or a `.planning/` wave) also runs this from the product root, and it must exit 0:

```bash
node .agents/tools/verify_techlead_gate.mjs
```

`small-fix` runs the same gate and does not create `.planning/` to satisfy it. `nest-feature`, `database-migration`, and the test skills add their own checks on top. Those extra checks do not replace these four.

## 9. How to run a skill

1. Find the skill in the router and follow its phases in order.
2. On a non-trivial failure, follow `.agents/agents/error-handling.md`: Identify, Assess, Communicate, Solutions. Do not patch around the failure first.
3. Commit only when the active skill reaches its commit step. Message language is English. Tag and scope stay in the prefix, for example `[agent] feat(links): add expiry on create`.
4. Branch names: `feature/<KEY>-<slug>`, `bugfix/<KEY>-<slug>`, `hotfix/<KEY>-<slug>`, `refactor/<KEY>-<slug>`.
5. After the skill's exit note, ask what is next. Do not open a merge request unless the human asks or the `mr` skill is the active task.

## 10. Where the standards are

| Topic | File |
|---|---|
| TypeScript | `.agents/agents/typescript-standards.md` |
| Layers and C4 | `.agents/agents/architecture.md` |
| Everyday code shape | `.agents/agents/code.md` |
| Prisma | `.agents/agents/database.md` |
| Tests | `.agents/agents/testing.md` |
| Security | `.agents/agents/security.md` |
| Logs | `.agents/agents/logging.md` |
| Failures during a task | `.agents/agents/error-handling.md` |
| ADR, TSDoc, changelog | `.agents/agents/docs.md` |
| Merge requests | `.agents/agents/mr.md` |
| Hotfix scope | `.agents/agents/hotfix.md` |
| Refactor order | `.agents/agents/refactoring.md` |
