# AGENTS.md

Product rulebook entry for Racing Manager. Coding standards and the skill router live in [`ts-agent-kit/AGENTS.md`](ts-agent-kit/AGENTS.md). Product knowledge lives in [`docs/`](docs/INDEX.md) (Karpathy-style LLM wiki).

## 1. Read order

1. This file — package map and wiki pointer.
2. [`docs/INDEX.md`](docs/INDEX.md) — then **one** linked domain or wiki page.
3. For implementation process: `ts-agent-kit/AGENTS.md` and exactly one skill under `ts-agent-kit/.agents/skills/<name>/SKILL.md`.

Do not load whole packages into context “for orientation.” Prefer the wiki.

## 2. Stack contract (this repo)

| Path | Role |
|---|---|
| `racing_manager_front` | React + Vite SPA (`src/pages`, `src/features`, `src/shared`) |
| `racing_manager_back` | NestJS API (`src/<module>/`) |
| `racing_manager_back/prisma/schema.prisma` | Prisma schema SoT for the main API client |
| `racing_manager_db` | Local Postgres + MinIO; `db/init.sql` + `db/migrate_*.sql` |
| `competition_managment_service` | Internal CMS (stages/heats); not public |
| `nginx` | Local reverse proxy |
| `infra` | Prod/stage Compose, Authentik, backups |
| `observability` | Log retention notes |
| `ts-agent-kit` | Agent skills/standards (not product runtime) |
| `docs/` | LLM wiki (INDEX, domains, entities, concepts) |
| `specs/` | EARS acceptance specs |
| `.planning/` | Wave plans when using open-gsd |

Kit docs may say `apps/api` / `apps/web`. **These paths override** until the kit is vendored with product names.

Package manager is npm per package (not a root pnpm workspace).

## 3. LLM wiki operations

Schema: [`docs/SCHEMA.md`](docs/SCHEMA.md).

| Op | When |
|---|---|
| **Ingest** | New source in `docs/raw/` or a meaningful product/infra change to compile |
| **Query** | Answer from INDEX → pages; file durable answers back into `docs/` |
| **Lint** | Health-check contradictions, stale claims, orphans, broken links |

Wiki language: **English**. Append [`docs/log.md`](docs/log.md) on ingest/query/lint.

After public contract changes, update the matching `docs/domains/*.md` (and entity/concept if needed) plus INDEX one-liners when feasible.

## 4. Definition of done (product)

Follow the active kit skill. At minimum, do not leave the wiki contradicting a shipped public contract you just changed.

Feature-sized work: accepted PRD under `Tasks/<KEY>/PRD.md` (`functional-analysis-v2`: DeepSeek author + Gemini reviewer with P0/P1 rework rounds) before EARS under `specs/` (`spec-kit-ears` must trace every PRD `FR-*` to the spec and bind to the domain wiki page); waves under `.planning/` when using open-gsd (≤3 files per wave).
