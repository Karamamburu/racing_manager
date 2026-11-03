# ts-agent-kit

English skills and rules for agents working in a TypeScript monorepo: NestJS, React, Prisma, PostgreSQL.

The rulebook is [AGENTS.md](AGENTS.md). Claude Code starts at [CLAUDE.md](CLAUDE.md), which sends the session to the same router. Procedures are in `.agents/skills/`. Standards are in `.agents/agents/`. Short launch prompts are in `.agents/prompts/`.

## Stack the skills assume

- pnpm workspace
- `apps/api` — NestJS, Prisma (`apps/api/prisma/schema.prisma`), Jest, supertest
- `apps/web` — React, Vite, Vitest, Testing Library
- PostgreSQL
- Root scripts: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`
- Feature-sized acceptance, from the product root: `node .agents/tools/verify_techlead_gate.mjs`

New behavior is analysis-then-spec-first. `knowledge-index`, then `functional-analysis` (accepted `Tasks/<KEY>/PRD.md`), then `spec-kit-ears` run before code. `open-gsd-pipeline` stores waves in `.planning/`. `feature-pipeline` is the closed loop for a feature wave: coder, CODE_GATE, Skeptic, Realist, Visionary, then a summarizer only when a judge rejects. A one or two file fix with no schema change and no new contract uses `small-fix`.

Checkers and templates live under `.agents/tools/` and `.agents/templates/`, so they are included when `.agents/` is copied into a product.

If a product uses other directories, say so once in that repo's root `AGENTS.md`. Skills keep using the names from the kit until that override exists.

## Use the kit

**Open this directory as the workspace.** Cursor discovers `.agents/skills/`. Claude Code reads `CLAUDE.md`, then `AGENTS.md`, then the skill file. Point the agent at the product repo in the task if the product lives elsewhere.

**Vendor into a product.** Copy these three pieces so the same relative paths work from the product root:

- `AGENTS.md` → `<app>/AGENTS.md`
- `CLAUDE.md` → `<app>/CLAUDE.md`
- `.agents/` → `<app>/.agents/`

Edit the product `AGENTS.md` only to record path overrides. Leave the router and the layer laws intact.

## Skills

| Skill | When |
|---|---|
| `knowledge-index` | One domain page and the import neighbors before an edit |
| `functional-analysis` | English PRD (problem, actors, use cases, FRs) before EARS |
| `spec-kit-ears` | EARS acceptance spec before code |
| `open-gsd-pipeline` | Wave plan in `.planning/` for a multi-file change |
| `feature-pipeline` | Coder, CODE_GATE, three read-only judges, summarizer |
| `architecture-layers-linter` | Nest and React import direction |
| `blast-radius-guard` | File budget and frozen paths, including applied migrations |
| `techlead-gate` | Deterministic exit for a wave, and the check before a merge request |
| `small-fix` | 1-2 files, no schema change, no new contract |
| `investigate-codebase` | Read-only map before an edit |
| `architecture` | Design before code for large or breaking work |
| `feature` | New behavior on API and UI |
| `nest-feature` | New HTTP behavior |
| `react-feature` | New UI behavior |
| `bugfix` | Known bug |
| `hotfix` | Production incident |
| `refactoring` | Structure change, same behavior |
| `safe-refactoring` | Stricter types, existing tests frozen |
| `database-migration` | Prisma schema change with a reversible `down.sql` |
| `tests-unit` | Service tests on fake repositories |
| `tests-integration` | API and repository tests on real PostgreSQL |
| `characterization-tests` | Snapshot current HTTP before touching the app |
| `code-review` | Review a diff |
| `docs` | ADR, TSDoc, changelog, README during the task |
| `mr` | Prepare a merge request |
| `orchestrate-coder-reviewer-summarizer` | Separate coder, reviewer, and summarizer |

Launch prompts for each skill are in `.agents/prompts/`. Each prompt has two modes: this kit is the open workspace, or the kit is vendored at `<app>/.agents/` and the app root `AGENTS.md` points at it.
