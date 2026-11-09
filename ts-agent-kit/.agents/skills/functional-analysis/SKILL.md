---
name: functional-analysis
description: >
  Writes an English functional analysis (PRD) with problem, solution, actors,
  use cases, and functional requirements before any EARS spec or product code.
  Use when new user-visible behavior or a contract change needs a PRD under
  Tasks/<KEY>/PRD.md. Do not use for small-fix, to write EARS or architecture,
  or to implement the feature.
owner: tbd
freedom: guided
last_reviewed: 2026-11-03
---

# Skill: Functional analysis

> Superseded by `functional-analysis-v2`, the two-model author/reviewer
> pipeline. This file is kept for reference; do not route new work here.

## 1. When

- **Use when** new user-visible behavior or a contract change will need an EARS spec.
- **Do not use** for `small-fix`, for a bugfix or hotfix that does not add product behavior, or to write EARS, architecture, or product code.

## 2. Inputs

- A ticket or short statement of the user-visible outcome, plus a stable `KEY` (ticket id or slug).
- `docs/INDEX.md` and exactly one domain page (wiki neighbors only if that page links them).
- Optional As-Is facts via `investigate-codebase` when the current flow is unclear. Still no edits under product apps.

Run this skill from the product root.

## 3. Steps

### Phase 1: Clarify

1. Name the pain, the primary actor, and one observable success signal.
2. If any of those are missing, ask the human. Do not invent them.
3. Mark every claim the inputs do not support with `[ASSUMPTION]`.

### Phase 2: Write the PRD

1. If `Tasks/<KEY>/` does not exist, create it.
2. Start from `.agents/templates/tasks/PRD.md` and replace the placeholders for this task.
3. Save `Tasks/<KEY>/PRD.md` in **English**.
4. Keep the document product-level: what the user can do, not Nest, Prisma, React, C4, DTOs, or waves.

Required content:

| Section | Rule |
|---|---|
| Problem | Who hurts, current workaround, why now |
| Solution | Intended product outcome for the user |
| Out of scope | Explicit non-goals |
| Actors / roles | Id, name, goal, permissions or constraints that matter to the flow |
| Use cases | Each `UC-NN`: actor, precondition, trigger, main flow, alternate/exception flows, postcondition |
| Functional requirements | Each `FR-NN` is a SHALL statement linked to one or more UC ids |
| Non-functional | Only if the human stated them (`NFR-NN`); otherwise omit the section |
| Acceptance / DoD | Checks a human can verify without reading code |
| Open questions | Must be empty before status becomes `accepted` |
| Traceability | FR → UC; leave the EARS column blank until `spec-kit-ears` runs |

### Phase 3: Self-check

- Every use case has a primary actor that appears under Actors.
- Every FR maps to at least one UC.
- Problem and Solution contain no implementation design.
- No `TODO`, `TBD`, or `???` remain before handoff for acceptance.
- Status in Meta is `draft` until the human accepts.

### Phase 4: Human accept

1. Stop. Ask the human to accept the PRD.
2. On explicit acceptance, set Meta status to `accepted`.
3. Do not start `spec-kit-ears` in the same run until that acceptance is explicit.

## 4. Outputs

- `Tasks/<KEY>/PRD.md` with status `accepted` after human approval (or `draft` while waiting).

## 5. Definition of done

- `Tasks/<KEY>/PRD.md` exists, is English, and follows the template sections.
- Self-check in Phase 3 passes.
- Human has set or confirmed status `accepted`.
- No product code, test, Prisma schema, EARS spec, architecture doc, or `.planning/` wave was edited.

## 6. Stop and rollback

- Missing pain, actor, or success signal: ask; do not guess.
- Invented latency, volume, or cost numbers: remove them or mark `[ASSUMPTION]` and triage with the human.
- If product files under `apps/`, `racing_manager_*`, CMS, or Prisma changed: restore them and stop.
- Do not write EARS wording, C4 diagrams, DTO contracts, or wave plans in this skill.

## 7. Exit

Say the path to the PRD and that the next skill is `spec-kit-ears` (then optional `architecture` for system analysis). Ask whether to proceed only after status is `accepted`.
