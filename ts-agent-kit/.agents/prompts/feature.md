# New feature

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Task: <what the user can do that they cannot do now>
Product repo: <path>
Branch feature/<KEY>-<slug>.
Read AGENTS.md, then .agents/skills/feature/SKILL.md, and follow it.
If the change is API-only, use nest-feature. If it is UI-only, use react-feature.

Done: the skill gate is green, the commit is prefixed [agent], the tree is clean.
Report the diff in one paragraph, the tests, and the gate results.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Task: <what the user can do that they cannot do now>
You are in the product repo. Read AGENTS.md at the repo root, then .agents/skills/feature/SKILL.md.
Branch feature/<KEY>-<slug>.

Done: the skill gate is green, the commit is prefixed [agent], the tree is clean.
Report the diff in one paragraph, the tests, and the gate results.
```
