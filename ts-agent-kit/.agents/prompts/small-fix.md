# Small fix

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Change: <symptom and the one or two product files>
Product repo: <path>
Read AGENTS.md, then .agents/skills/small-fix/SKILL.md.
No schema change, no new dependency, no new route contract, no .planning/ directory.
Run node .agents/tools/verify_techlead_gate.mjs from the product root.

Done: at most two product files changed, the four pnpm commands exit 0, and the gate prints TECHLEAD GATE: ACCEPTED.
If a third file is required, stop and switch to spec-kit-ears.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Change: <symptom and the one or two product files>
Read the product AGENTS.md, then .agents/skills/small-fix/SKILL.md.
Do not create .planning/.

Done: the techlead gate is accepted and the product diff is one or two files.
```
