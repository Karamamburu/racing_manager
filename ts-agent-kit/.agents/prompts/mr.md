# Merge request

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Branch: <name>
Product repo: <path>
Read AGENTS.md, then .agents/skills/mr/SKILL.md.
Rebase onto the default branch only if it is a fast-forward or the human approved a rebase.
Do not merge.

Done: four pnpm commands return 0, the description says what, why, how to test, and the rollback.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Branch: <name>
Read the product AGENTS.md, then .agents/skills/mr/SKILL.md.
Do not merge.

Done: toolchain green, description complete, request left for a human to approve.
```
