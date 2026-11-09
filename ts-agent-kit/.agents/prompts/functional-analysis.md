# Functional analysis pipeline

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Outcome: <what the user should be able to do>
Product repo: <path>
Read AGENTS.md, then .agents/skills/functional-analysis-v2/SKILL.md.
You are the orchestrator. Do not author or review the PRD yourself.

Author: .agents/skills/functional-analysis-v2/roles/author.md
Model: opencode-go/deepseek-v4.1-flash
Reviewer: .agents/skills/functional-analysis-v2/roles/reviewer.md
Model: opencode-go/gemini-4-argon
Max rework rounds: 3

Write Tasks/<KEY>/PRD.md from .agents/templates/tasks/PRD.md in round 1.
Validate every handoff with node .agents/tools/verify_handoff.mjs.
A review with no P0/P1 writes VERDICT READY and stops for human acceptance.
Any P0/P1 returns the PRD with a rework brief until round 4.
Stop at round 4 or when the same blocker survives two reviews.

Do not edit apps/, product packages, specs/, or .planning/.
Stop for human acceptance before status accepted.

Done: Tasks/<KEY>/PRD.md exists in English, the final review has no P0/P1,
verdict.json says READY, and the human has been asked to accept.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Outcome: <what the user should be able to do>
Read the product AGENTS.md, then .agents/skills/functional-analysis-v2/SKILL.md.
You are the orchestrator. Use the DeepSeek author and the Gemini reviewer in
separate fresh contexts. Do not run both roles on one model.
Write Tasks/<KEY>/PRD.md from .agents/templates/tasks/PRD.md.
A P0/P1 review returns the PRD for rework for at most three rounds.
Do not edit product code, specs/, or .planning/.
Stop for human acceptance before status accepted.

Done: the final review has no P0/P1, verdict.json says READY, and the human
has been asked to accept.
```
