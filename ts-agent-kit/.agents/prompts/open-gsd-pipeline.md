# GSD pipeline

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Spec: specs/<feature>-ears.md
Product repo: <path>
Read AGENTS.md, then .agents/skills/open-gsd-pipeline/SKILL.md.
Copy .agents/templates/planning/ into .planning/ and replace the example.
Each wave lists at most 3 files. Execute one wave in a fresh context.
Run node .agents/tools/plan_checker.mjs and node .agents/tools/verify_techlead_gate.mjs from the product root.

Done: every wave is checked, both commands exit 0. Do not raise max_changed_files.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Spec: specs/<feature>-ears.md
Read the product AGENTS.md, then .agents/skills/open-gsd-pipeline/SKILL.md.
Keep state in .planning/. One fresh context per wave.

Done: plan_checker.mjs and verify_techlead_gate.mjs exit 0.
```
