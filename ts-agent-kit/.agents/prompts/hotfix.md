# Hotfix

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Production failure: <symptom>
Product repo: <path>
Branch from the default branch: hotfix/<KEY>-<slug>.
Read AGENTS.md, then .agents/skills/hotfix/SKILL.md and .agents/agents/hotfix.md.
Before code, state the minimal fix, what you will not touch, and the rollback.

Done: one [agent] hotfix commit, regression test, four pnpm commands green.
Do not open a merge request unless asked.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Production failure: <symptom>
Read the product AGENTS.md, then .agents/skills/hotfix/SKILL.md and .agents/agents/hotfix.md.
Branch from the default branch: hotfix/<KEY>-<slug>.

Done: one [agent] hotfix commit, regression test, four pnpm commands green.
Do not open a merge request unless asked.
```
