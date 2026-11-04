# Integration tests

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Routes: <method and path>
Product repo: <path>
Disposable database url: <url>
Read AGENTS.md, then .agents/skills/tests-integration/SKILL.md.
Isolate rows. Run the suite twice.

Done: both runs pass, coverage thresholds did not fall, four pnpm commands return 0.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Routes: <method and path>
Disposable database url: <url>
Read the product AGENTS.md, then .agents/skills/tests-integration/SKILL.md.

Done: two green runs, thresholds unchanged or higher, four pnpm commands return 0.
```
