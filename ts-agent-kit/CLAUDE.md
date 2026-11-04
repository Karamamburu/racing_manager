# CLAUDE.md

Read `AGENTS.md` before any work. It is the rulebook: stack, layer laws, skill router, anti-cheat, and the definition of done. Do not start implementation, and do not invent a second set of rules, until that file is read.

This file exists so Claude Code enters through the same door as Cursor. Skills are not auto-loaded here. Open the one skill `AGENTS.md` selects:

`.agents/skills/<name>/SKILL.md`

Then open only the standards that skill names, under `.agents/agents/`.

## Router

New behavior follows this order: `knowledge-index`, `functional-analysis`, `spec-kit-ears`, `architecture` only when the change is breaking or multi-day, then `open-gsd-pipeline`, then `feature-pipeline` before `mr`. CODE_GATE inside that loop is `techlead-gate`. Three `ACCEPT` verdicts are required. A one or two file fix with no schema change and no new contract uses `small-fix` and does not create `.planning/`.

| Task | Skill |
|---|---|
| One domain and its import neighbors | `knowledge-index` |
| Functional analysis (PRD) before EARS | `functional-analysis` |
| Acceptance spec before code | `spec-kit-ears` |
| Waves on disk | `open-gsd-pipeline` |
| Coder, gate, and three read-only judges | `feature-pipeline` |
| Import direction | `architecture-layers-linter` |
| File budget and frozen paths | `blast-radius-guard` |
| End of a wave, and before a merge request | `techlead-gate` |
| 1-2 files, no schema, no new contract | `small-fix` |
| Read-only map before edits | `investigate-codebase` |
| Multi-module, breaking, or multi-day design | `architecture` (stop when the document is approved) |
| New HTTP behavior | `nest-feature` |
| New UI behavior | `react-feature` |
| API and UI together | `feature` |
| Known bug | `bugfix` |
| Production incident | `hotfix` |
| Same behavior, new structure | `refactoring` |
| Stricter types, tests frozen | `safe-refactoring` |
| Schema change | `database-migration` (before feature work) |
| Service tests, no database | `tests-unit` |
| Real PostgreSQL | `tests-integration` |
| Snapshot existing HTTP before edits | `characterization-tests` |
| Review a diff | `code-review` |
| ADR, TSDoc, changelog, README | `docs` |
| Open or update a merge request | `mr` |
| Separate coder, reviewer, summarizer | `orchestrate-coder-reviewer-summarizer` |

Skip the orchestrator for a one-file low-risk edit. Do not implement product code inside `code-review`, `docs`, or `mr`.

## Done

Finish only when these return 0, plus any extra checks the active skill lists:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

Feature-sized work also runs `node .agents/tools/verify_techlead_gate.mjs` from the product root. It must print `TECHLEAD GATE: ACCEPTED`. `small-fix` runs that same command and does not create `.planning/`.

If a skill stop condition fires, roll back that step and tell the human. Do not weaken tests, lower a coverage threshold, or silence TypeScript or ESLint to get a green run.
