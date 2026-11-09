# EARS spec

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Behavior: <what the user can do>
Product repo: <path>
Require accepted Tasks/<KEY>/PRD.md from functional-analysis-v2.
Read the PRD FR/UC ids and the domain wiki page named in PRD Meta.
Read AGENTS.md, then .agents/skills/spec-kit-ears/SKILL.md.
Write specs/<feature>-ears.md from .agents/templates/specs/feature-ears.md with FR/UC Traceability.
Fill the EARS column in Tasks/<KEY>/PRD.md Traceability.
Run node .agents/tools/ears_linter.mjs with the working directory set to the product root.
Do not edit apps/.

Done: the linter exits 0, every FR maps to EARS, and git diff -- apps is empty.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Behavior: <what the user can do>
Require accepted Tasks/<KEY>/PRD.md from functional-analysis-v2.
Read the PRD FR/UC ids and the domain wiki page named in PRD Meta.
Read the product AGENTS.md, then .agents/skills/spec-kit-ears/SKILL.md.
Write specs/<feature>-ears.md with FR/UC Traceability.
Fill the EARS column in Tasks/<KEY>/PRD.md Traceability.
Run node .agents/tools/ears_linter.mjs.
Do not edit apps/.

Done: the linter exits 0, every FR maps to EARS, and the application diff is empty.
```
