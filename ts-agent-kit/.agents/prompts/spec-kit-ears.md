# EARS spec

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Behavior: <what the user can do>
Product repo: <path>
Read AGENTS.md, then .agents/skills/spec-kit-ears/SKILL.md.
Write specs/<feature>-ears.md from .agents/templates/specs/feature-ears.md.
Run node .agents/tools/ears_linter.mjs with the working directory set to the product root.
Do not edit apps/.

Done: the linter exits 0 and git diff -- apps is empty.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Behavior: <what the user can do>
Read the product AGENTS.md, then .agents/skills/spec-kit-ears/SKILL.md.
Write specs/<feature>-ears.md. Run node .agents/tools/ears_linter.mjs.
Do not edit apps/.

Done: the linter exits 0 and the application diff is empty.
```
