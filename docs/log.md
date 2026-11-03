# Wiki log

Append-only. Prefix every entry with `## [YYYY-MM-DD] ingest|query|lint | Title`.

## [2026-11-03] ingest | EARS binds PRD to wiki (no SYSTEM.md)

Chose not to add a system-analysis stage. Strengthened `spec-kit-ears`: read accepted PRD + domain wiki, derive EARS from FR/UC, require bidirectional traceability, fill PRD Traceability EARS column. Updated [concepts/agent-workflow.md](concepts/agent-workflow.md).

## [2026-11-03] ingest | Functional analysis before EARS

Wired kit skill `functional-analysis`: English `Tasks/<KEY>/PRD.md` (problem, actors, use cases, FRs) is mandatory before `spec-kit-ears`. Updated kit router (`AGENTS.md`, `CLAUDE.md`, README), EARS/architecture inputs, and [concepts/agent-workflow.md](concepts/agent-workflow.md).

## [2026-11-03] ingest | Initial codebase compilation

Seeded Karpathy-style wiki under `docs/`: SCHEMA, raw catalog, overview, packages, entities, concepts, domains, INDEX. Wired root `AGENTS.md` and `.cursor/rules/project-knowledge.mdc`. Sources: package READMEs, Prisma schema enums/models, Nest controllers, front layout, infra docs pointers.
