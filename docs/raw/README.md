---
type: raw
updated: 2026-11-03
---

# Raw sources

Immutable layer of the LLM wiki.

## Rules

- Humans curate what lands here.
- The agent **reads** these files and compiles into wiki pages under `docs/`.
- The agent **must not** edit raw content during ingest/query/lint (except when the human explicitly asks to drop or replace a source file).
- Never store secrets, tokens, or `.env` values here.

## What belongs here

- Pointers and manifests (see [`sources.md`](sources.md))
- Exported decision notes, meeting briefs, or ADRs the team wants frozen
- Snapshots of external docs that are not already in the git tree

Repo files that already live elsewhere (READMEs, Prisma schema, PolicyPage legal copy) stay in place; list them in `sources.md` instead of copying.
