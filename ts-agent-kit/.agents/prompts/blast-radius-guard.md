# Blast radius

## Mode A — this kit is the open workspace

```text
Product repo: <path>
Read AGENTS.md, then .agents/skills/blast-radius-guard/SKILL.md.
If specs/blast-radius.json is missing, copy .agents/templates/specs/blast-radius.json.
Run node .agents/tools/verify_blast_radius.mjs from the product root.

Done: the command exits 0. Do not raise max_changed_files. Restore any edited applied migration.sql.
```

## Mode B — kit vendored into the app

```text
Read the product AGENTS.md, then .agents/skills/blast-radius-guard/SKILL.md.
Run node .agents/tools/verify_blast_radius.mjs.

Done: the file count is within the budget and no frozen path changed.
```
