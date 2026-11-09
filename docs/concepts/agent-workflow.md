---
type: concept
updated: 2026-11-09
sources:
  - ts-agent-kit/AGENTS.md
  - ts-agent-kit/.agents/skills/functional-analysis-v2/SKILL.md
  - ts-agent-kit/.agents/skills/spec-kit-ears/SKILL.md
  - docs/SCHEMA.md
---

# Concept: Agent workflow

## This wiki vs the kit

| Artifact | Role |
|---|---|
| `docs/` (this wiki) | Durable product knowledge; read `INDEX.md` first |
| `ts-agent-kit/AGENTS.md` | Coding laws, skill router, DoD |
| `Tasks/<KEY>/PRD.md` | Functional analysis before EARS (`functional-analysis-v2`) |
| `specs/*-ears.md` | Acceptance specs with FR/UC traceability; binds FRs to wiki/As-Is (`spec-kit-ears`) |
| `.planning/` | Disk-backed waves (≤3 files) when using open-gsd |

There is **no** separate system-analysis document. System binding (domain wiki + optional read-only As-Is) happens inside `spec-kit-ears`. Optional `architecture` after EARS is only for large or breaking design (C4, decisions, T1–TN).

Root `AGENTS.md` maps **real** package paths and points here for product context.

## Suggested order for new behavior

1. Wiki: `docs/INDEX.md` → one domain page.
2. Kit: `knowledge-index` (import graph) when available at product root.
3. `functional-analysis-v2` → two-model PRD pipeline: DeepSeek V4.1 Flash authors `Tasks/<KEY>/PRD.md`, Gemini 4 Argon reviews it, P0/P1 findings return it for rework for at most three rounds, then the human accepts the PRD.
4. `spec-kit-ears` → `specs/<feature>-ears.md` derived from PRD FRs/UCs + domain wiki (FR↔EARS traceability required).
5. Optional `architecture` when the change is multi-day, multi-module, or breaking → waves → feature skills → `mr`.
6. Tiny 1–2 file fixes: `small-fix` (no fake roadmap; no PRD / EARS).

After public contract changes, update the matching wiki/domain page + log (see [SCHEMA](../SCHEMA.md)).

## Kit path caveat

Kit templates assume `apps/api` and `apps/web`. This monorepo uses `racing_manager_back` / `racing_manager_front` until skills are fully vendored—always prefer root `AGENTS.md` paths.
