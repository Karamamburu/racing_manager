# Bugfix

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Bug: <input and wrong output>
Product repo: <path>
Branch bugfix/<KEY>-<slug>.
Read AGENTS.md, then .agents/skills/bugfix/SKILL.md.
Write a regression test that fails before the fix.

Done: the regression test passes, the four pnpm commands return 0, commit prefix [agent].
Report the root cause, the test name, and the gate results.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Bug: <input and wrong output>
Read the product AGENTS.md, then .agents/skills/bugfix/SKILL.md.
Branch bugfix/<KEY>-<slug>.

Done: the regression test passes, the four pnpm commands return 0, commit prefix [agent].
Report the root cause, the test name, and the gate results.
```
