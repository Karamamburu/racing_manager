# Unit tests

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Module: <apps/api service or pure function>
Product repo: <path>
Read AGENTS.md, then .agents/skills/tests-unit/SKILL.md.
Use a fake repository. No database.

Done: branch coverage of the named module is 100%, the suite does not open a database port,
pnpm lint and pnpm typecheck return 0.
Do not change production code to satisfy a test. If you find a defect, stop and report it.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Module: <apps/api service or pure function>
Read the product AGENTS.md, then .agents/skills/tests-unit/SKILL.md.

Done: 100% branch coverage of the named module, no database, lint and typecheck green.
```
