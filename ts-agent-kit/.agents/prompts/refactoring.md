# Refactoring

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Refactor: <rename or move, behavior unchanged>
Product repo: <path>
Branch refactor/<KEY>-<slug>.
Read AGENTS.md, then .agents/skills/refactoring/SKILL.md.
List every use of the old name before editing.

Done: rg of the old name is empty, tests stay green, four pnpm commands return 0.
Commit prefix [agent]. Public HTTP paths are unchanged unless the ticket says otherwise.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Refactor: <rename or move, behavior unchanged>
Read the product AGENTS.md, then .agents/skills/refactoring/SKILL.md.
Branch refactor/<KEY>-<slug>.

Done: rg of the old name is empty, four pnpm commands return 0, commit prefix [agent].
```
