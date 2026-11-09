---
name: spec-kit-ears
description: >
  Writes an EARS acceptance spec from an accepted functional-analysis PRD and
  one wiki domain page, with FR/UC traceability and HTTP/DTO contracts, before
  any test or product code. Use when behavior is new or a contract changes.
  Do not use to implement the feature, and do not use for a one or two file
  fix that does not change a contract (small-fix).
owner: tbd
freedom: strict
last_reviewed: 2026-11-03
---

# Skill: EARS spec

## 1. When

- **Use when** a new endpoint, screen, or business rule needs an acceptance spec before code.
- **Do not use** to write the implementation. That is a later wave of `open-gsd-pipeline`. Do not use for `small-fix`.
- There is no separate system-analysis stage: bind FRs to the existing system here (wiki + optional read-only As-Is).

## 2. Inputs

- An **accepted** `Tasks/<KEY>/PRD.md` from `functional-analysis-v2` (Meta status `accepted`). If the file is missing or still `draft`, stop and run that skill first.
- PRD Meta must name a domain wiki page (e.g. `docs/domains/<domain>.md`). If missing, stop and ask the human to fix the PRD.
- The ticket or a short statement of the user-visible outcome (must match the PRD).
- `docs/INDEX.md` and that one domain page (neighbors only if the domain page links them).
- Run this skill from the product root.

## 3. Steps

### Phase 0: Read PRD and wiki

1. Open `Tasks/<KEY>/PRD.md`. List every `FR-*` and `UC-*` id.
2. Open `docs/INDEX.md`, then exactly the domain page named in PRD Meta. Note existing entities, routes, and constraints the FRs touch.
3. Mark unsupported claims `[ASSUMPTION]`, or stop and ask the human when a contract cannot be written without a fact.
4. If a FR cannot be contracted without knowing today’s path, run read-only `investigate-codebase`. Do not edit product apps.

### Phase 1: Five EARS patterns

Derive every requirement from the PRD FRs/UCs, not from a free-form ticket rewrite. Write every requirement in English with these shapes. A requirement that fits none of them is rewritten with the human, not forced into a vague sentence.

1. **Ubiquitous:** `The system SHALL <action>.`
2. **Event:** `WHEN <trigger>, the system SHALL <action>.`
3. **State:** `WHILE <state>, the system SHALL <action>.`
4. **Unwanted:** `IF <failure>, the system SHALL <action>.` This group is mandatory.
5. **Optional:** `WHERE <flag>, the system SHALL <action>.` If nothing is optional, write `WHERE none, the system SHALL skip this pattern.`

### Phase 2: Contracts

1. Name the Nest request and response DTO, or the web client type, on every requirement that crosses HTTP. Prefer names and fields consistent with the wiki domain page and As-Is facts.
2. Money is integer minor units or a decimal string. Never `number`.
3. Dates are ISO-8601 strings validated at the boundary, not free text.
4. A `WHEN` that creates, updates, or deletes names the idempotency key field.

### Phase 3: Traceability

1. Every EARS statement under the five patterns maps to at least one `FR-*`.
2. Every `FR-*` from the PRD appears in at least one EARS mapping. If an FR has no mapping, stop and either add a requirement or ask the human to drop the FR from the PRD.
3. Prefer also naming the related `UC-*` when clear from the PRD.

### Phase 4: Write the files

1. If `specs/` does not exist, create it.
2. Start from `.agents/templates/specs/feature-ears.md` and replace the example with this task (include Source PRD, Domain, and Traceability).
3. Save `specs/<feature>-ears.md`.
4. Fill the EARS column in `Tasks/<KEY>/PRD.md` § Traceability. That PRD edit is allowed. Do not change FR/UC text unless the human asks; if the FR set changes, the PRD must be re-accepted.
5. Run:

```bash
node .agents/tools/ears_linter.mjs
```

When this kit is the workspace and the product is another directory, run the script by its absolute path with the shell's working directory set to the product root. The script reads `process.cwd()`.

## 4. Outputs

- `specs/<feature>-ears.md` with Source PRD, Domain, five patterns, Contracts, Tests, and Traceability.
- Updated EARS column in `Tasks/<KEY>/PRD.md` § Traceability.
- A checklist of requirement coverage for later tests (the Tests section in the spec). It is not a test file.

## 5. Definition of done

- `node .agents/tools/ears_linter.mjs` exits 0.
- Unwanted behavior is present.
- Traceability: every PRD `FR-*` maps to ≥1 EARS statement; every EARS statement maps to ≥1 `FR-*`.
- PRD Traceability EARS column is filled.
- No product code, test, or Prisma schema was edited. `git diff --exit-code -- apps` is empty (and the same for product package paths when this repo uses them).

## 6. Stop and rollback

- Missing or non-accepted `Tasks/<KEY>/PRD.md` stops the skill. Run `functional-analysis-v2` and wait for human acceptance.
- Missing domain page in PRD Meta, or a domain page that does not exist, stops the skill.
- An `FR-*` with no EARS mapping stops the skill.
- A requirement that fits no EARS pattern stops the skill. Ask the human to restate it.
- A contradiction with the layer laws in `AGENTS.md` keeps the layer law. Change the spec, not the law.
- If product files changed, `git restore apps` (or the product package paths) and stop.
