# Techlead gate

## Mode A — this kit is the open workspace

```text
Product repo: <path>
Read AGENTS.md, then .agents/skills/techlead-gate/SKILL.md.
Run node .agents/tools/verify_techlead_gate.mjs from the product root.
Stop at the first red check. Do not continue the chain by hand to collect more errors.

Done: the log prints TECHLEAD GATE: ACCEPTED.
```

## Mode B — kit vendored into the app

```text
Read the product AGENTS.md, then .agents/skills/techlead-gate/SKILL.md.
Run node .agents/tools/verify_techlead_gate.mjs.

Done: the log prints TECHLEAD GATE: ACCEPTED. Do not open a merge request on any other result.
```
