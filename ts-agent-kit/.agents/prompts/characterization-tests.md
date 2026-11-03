# Characterization tests

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Routes to lock: <method, path, current status>
Product repo: <path>
Read AGENTS.md, then .agents/skills/characterization-tests/SKILL.md.
Record the response the server returns today, even if it looks wrong.
Do not edit apps/api/src, apps/web/src, or prisma/.

Done: characterization tests pass, git diff on application source is empty.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Routes to lock: <method, path, current status>
Read the product AGENTS.md, then .agents/skills/characterization-tests/SKILL.md.
Do not edit application source or Prisma files.

Done: tests pass on the current behavior, application diff is empty.
```
