# Nest feature

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Task: <HTTP behavior to add in apps/api>
Product repo: <path>
Branch feature/<KEY>-<slug>.
Read AGENTS.md, then .agents/skills/nest-feature/SKILL.md.
Run database-migration first if the schema changes.

Done: pnpm lint, pnpm format:check, pnpm typecheck, and pnpm test return 0.
Existing response keys you did not mean to change are unchanged.
Commit prefix [agent]. Report the route, the tests, and the gate results.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Task: <HTTP behavior to add in apps/api>
Read the product AGENTS.md, then .agents/skills/nest-feature/SKILL.md.
Branch feature/<KEY>-<slug>.

Done: the four pnpm commands return 0. Commit prefix [agent].
Report the route, the tests, and the gate results.
```
