# Orchestrate coder, reviewer, summarizer

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Task: <goal and acceptance criteria>
Product repo: <path>
Read AGENTS.md, then .agents/skills/orchestrate-coder-reviewer-summarizer/SKILL.md.
Use a fresh context for each role. Do not publish the pull request.

Done: CODE_GATE is the four pnpm commands, reviewer and summarizer fingerprints are empty diffs,
and the local PR description is backed by the diff. Stop if the same blocker repeats.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Task: <goal and acceptance criteria>
Read the product AGENTS.md, then .agents/skills/orchestrate-coder-reviewer-summarizer/SKILL.md.
Fresh context per role. Do not push or merge.

Done: gates green, read-only roles proved by git status fingerprints, summary left locally.
```
