---
type: schema
updated: 2026-11-03
---

# LLM Wiki schema

Karpathy-style knowledge base for Racing Manager. Knowledge is **compiled once and kept current**, not re-derived every chat.

## Layers

| Layer | Path | Rule |
|---|---|---|
| Raw | `docs/raw/` | Immutable. Agent reads; never edits (except human-approved source drops). |
| Wiki | `docs/` pages outside `raw/` | Agent-owned synthesis: overview, packages, entities, concepts, domains. |
| Schema | this file + root `AGENTS.md` | Workflows and conventions. |

Entry point for every task: [`INDEX.md`](INDEX.md) (≤100 lines).

## Token discipline

1. Read `docs/INDEX.md` only.
2. Open **one** linked page (domain preferred for code changes; entity/concept/package as needed).
3. Then open code neighbors for that module. Do not load whole packages into context.
4. After a public contract change (route, DTO field, env, status enum, response shape), update the matching domain/wiki page + `INDEX.md` + append `log.md` in the same change when feasible.

Wiki language is **English**. Product UI copy and legal policy text may stay Russian in source; summaries here stay English.

## Page conventions

- Short pages (~40–120 lines). Prefer links over duplication.
- Optional YAML frontmatter: `type`, `updated`, `sources`.
- Relative markdown links between pages.
- Cite raw sources or repo paths; do not paste secrets, `.env`, or full Compose files.
- Domain pages keep a `## Breakage signals` section (required by `knowledge-index`).

## Operations

### Ingest

When the human drops a source into `docs/raw/` or points at a repo change worth compiling:

1. Read the source (do not modify raw).
2. Summarize key takeaways with the human if asked.
3. Create or update wiki pages (entity, concept, package, domain as needed).
4. Update `INDEX.md` one-liners.
5. Append a log entry.

One ingest may touch many pages. Prefer one source at a time unless the human asks for a batch.

### Query

1. Read `INDEX.md`.
2. Open the relevant page(s); cite them in the answer.
3. If the answer is durable (comparison, decision, map), file it as a new wiki page and log it.

### Lint

On request, health-check the wiki:

- Contradictions between pages
- Stale claims superseded by newer sources or schema
- Orphan pages (no inbound links from INDEX or peers)
- Concepts mentioned without a page
- Broken relative links
- Domains missing Breakage signals

Fix what is safe; report the rest.

## Log format

[`log.md`](log.md) is append-only. Each entry starts with:

```text
## [YYYY-MM-DD] ingest|query|lint | Short title
```

Example: `grep "^## \[" docs/log.md | tail -5`

## Relationship to agent kit

- Coding standards and skill router: `ts-agent-kit/AGENTS.md` (not duplicated here).
- Product paths override kit placeholders: see root `AGENTS.md`.
- EARS specs: `specs/<feature>-ears.md`.
- Wave plans: `.planning/` (≤3 files per wave when using open-gsd).
- This wiki is the durable product map; kit skills are the process.

## Non-goals

- No RAG / embeddings / search CLI in v1 (`INDEX.md` is enough).
- No full legal policy paste — summarize and cite `policy.md`.
- Do not treat uncommitted WIP as settled fact unless marked in progress on the page.
