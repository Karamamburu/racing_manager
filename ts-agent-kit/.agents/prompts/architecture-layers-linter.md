# Architecture layers

## Mode A — this kit is the open workspace

```text
Product repo: <path>
Read AGENTS.md, then .agents/skills/architecture-layers-linter/SKILL.md.
Run node .agents/tools/verify_architecture_layers.mjs from the product root.
Fix violations by moving code to the named layer. Do not add a dynamic import().

Done: the command exits 0.
```

## Mode B — kit vendored into the app

```text
Read the product AGENTS.md, then .agents/skills/architecture-layers-linter/SKILL.md.
Run node .agents/tools/verify_architecture_layers.mjs.

Done: the command exits 0.
```
