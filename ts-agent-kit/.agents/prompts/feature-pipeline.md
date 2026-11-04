# Feature pipeline

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Spec: specs/<feature>-ears.md
Product repo: <path>
Read AGENTS.md, then .agents/skills/feature-pipeline/SKILL.md and .agents/pipeline/ROLES.md.
You are the orchestrator. Start a fresh context for the coder, each judge, and the summarizer.
CODE_GATE is node .agents/tools/verify_techlead_gate.mjs from the product root.
Validate every handoff with node .agents/tools/verify_handoff.mjs.
Three ACCEPT verdicts write handoff/verdict.json with VERDICT READY.
Any REJECT goes to the summarizer, then back to the coder.
Stop at cycle 3 or when the same blocker survives two rounds.

Done: verdict.json says READY, judge fingerprints are empty, nothing was pushed.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Spec: specs/<feature>-ears.md
Read the product AGENTS.md, then .agents/skills/feature-pipeline/SKILL.md and .agents/pipeline/ROLES.md.
You are the orchestrator. One fresh context per role. Do not play the coder and a judge in this chat.

Done: VERDICT READY, or VERDICT ESCALATE with the reason. Do not open a merge request.
```
