# Safe refactoring

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Structural change: <what moves or gets stricter, behavior unchanged>
Product repo: <path>
Read AGENTS.md, then .agents/skills/safe-refactoring/SKILL.md.
Do not edit existing tests. Do not add any, @ts-ignore, or eslint-disable.

Done: git diff on existing tests is empty, four pnpm commands return 0,
and the injected-break check showed the suite can go red.
Commit prefix [agent].
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Structural change: <what moves or gets stricter, behavior unchanged>
Read the product AGENTS.md, then .agents/skills/safe-refactoring/SKILL.md.
Do not edit existing tests.

Done: existing tests are untouched, four pnpm commands return 0, commit prefix [agent].
```
