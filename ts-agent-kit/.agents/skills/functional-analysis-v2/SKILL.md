---
name: functional-analysis
description: >
  Produces a complete English product-level PRD before EARS specification or
  product implementation. Use for new user-visible behavior or domain-contract
  changes that require a PRD under Tasks/<KEY>/PRD.md. Do not use for small fixes,
  bugfixes, EARS, architecture, or implementation.
owner: tbd
freedom: guided
last_reviewed: 2026-11-07
---

# Skill: Functional analysis

## 1. Purpose

Produce a PRD that is sufficiently precise for a separate EARS specification
without requiring repeated clarification rounds during implementation planning.

The PRD describes **what the product must do and which domain rules it must
preserve**. It does not prescribe technical architecture or implementation.

## 2. When to use

- Use when new user-visible behavior or a domain/API contract change requires
  an EARS specification.
- Do not use for `small-fix`, isolated bugfixes/hotfixes without new behavior,
  EARS authoring, architecture, or product code.

Run from the product root.

## 3. Inputs and discovery

Required:
- A ticket or short statement of the intended user-visible outcome.
- A stable `KEY`.
- `docs/INDEX.md` and the relevant domain page.

Read exactly one domain page initially. Follow links to neighboring domain
pages only when the feature crosses those boundaries.

Use `investigate-codebase` when current behavior, compatibility, or existing
business rules cannot be established from documentation. Investigation may
read code and tests but must not edit product files.

Before drafting, identify:
- Existing actors, workflows, terminology, and domain entities.
- Existing rules that the feature changes, extends, or must preserve.
- Related features and contracts explicitly referenced by the domain docs.
- Migration and backward-compatibility implications, if existing data is affected.

Do not infer undocumented behavior from a technical implementation alone.
Record it as `[ASSUMPTION]` or ask the human to confirm it.

## 4. Analysis workflow

### Phase 1: Frame the problem

Establish:
1. Who experiences the problem?
2. What are they trying to achieve?
3. What happens today, including workarounds?
4. Why is the change needed now?
5. What observable result would demonstrate success?

If the primary actor, user pain, or success signal is genuinely unclear, ask
the human before proceeding. Do not ask questions whose answers can be derived
from the supplied ticket or domain documentation.

### Phase 2: Model the product behavior

Before writing requirements, work through the following checklist. Include only
items relevant to the feature, but explicitly consider each one.

**Actors and permissions**
- Who initiates each workflow?
- Which roles may view, create, edit, cancel, or correct data?
- Are self-service, guest, and administrator flows consistent?
- Are there ownership or authorization boundaries?

**Domain concepts and relationships**
- What are the product-level entities and their responsibilities?
- Which entity owns each piece of information and each lifecycle?
- What is the identity of each entity? Which identifiers must remain stable?
- What are the cardinalities and uniqueness rules?
- Distinguish a container/aggregate from an individual participation,
  occurrence, attempt, or outcome when their lifecycles differ.

**Lifecycle and state transitions**
- List states for each entity separately.
- Define what creates, changes, ends, or reactivates each state.
- Define whether records are deleted, retained, cancelled, or withdrawn.
- State which transitions are allowed or forbidden and under what conditions.
- Clarify whether an outcome/result is distinct from participation status.
- Explain how corrections work and whether they update an existing record.

**Invariants and isolation**
- Write down rules that must always hold, not merely happy-path behavior.
- Check uniqueness under concurrent requests, not only sequential UI use.
- Identify which changes are local to one entity and which affect related
  entities.
- State what must not change when an operation affects a sibling entity.
- Define behavior when a parent is cancelled but child records already have
  outcomes or history.

**Configuration and editing**
- Identify shared settings versus per-item settings.
- Define defaults and whether they apply on create, copy, or later additions.
- Specify which fields can be changed before and after dependent records exist.
- Define deletion/removal rules and whether historical references freeze fields.
- Define ordering, labels, normalization, and collision behavior where relevant.

**Lists, grouping, and calculations**
- Define the dimensions used to group, filter, compare, and rank records.
- Separate stored facts from derived values and display-only values.
- State which existing calculation or ranking rules remain unchanged.
- Define treatment of incomplete, absent, cancelled, or disqualified records.
- Explain when cached or persisted derived values must be recalculated.

**Compatibility, migration, and integrations**
- Identify existing records and workflows affected by the change.
- Define how old data maps to the new product concepts.
- Preserve meaningful historical values; do not silently rewrite source facts
  merely to make new calculations convenient.
- Specify how anomalies are retained, excluded from active behavior, and
  reported for reconciliation.
- Identify downstream consumers and the stable identifier they must use.
- State explicit contracts with adjacent features; keep their implementation
  details and unrelated scope out of this PRD.

**Atomicity and failure behavior**
- Identify multi-entity operations that must succeed or fail as one action.
- State what happens when any part of a submitted operation is invalid.
- Ensure failed operations do not leave partial configuration or records.
- Define user-visible errors for forbidden transitions and conflicts.

### Phase 3: Resolve ambiguities

Create a short internal list of decisions that materially affect product
behavior. For each, choose one:
- Answer is supported by the ticket or domain documentation.
- Answer is established by current product behavior, verified through
  `investigate-codebase`.
- Human decision is required.
- It is a deliberate assumption and must be marked `[ASSUMPTION]`.

Ask the human only about unresolved decisions that block a coherent PRD or
could cause materially different product behavior. Group related questions
into one concise clarification round. Do not ask about implementation choices
that belong to EARS or architecture.

If a decision is deferred, state the boundary clearly in the PRD. Do not leave
a vague question that makes the feature impossible to specify.

### Phase 4: Write the PRD

1. Create `Tasks/<KEY>/` if it does not exist.
2. Start from `.agents/templates/tasks/PRD.md`.
3. Save `Tasks/<KEY>/PRD.md` in English.
4. Set Meta status to `draft`.
5. Keep the PRD product-level: describe user-visible behavior and domain
   contracts, not Nest, Prisma, React, DTOs, database tables, C4, or waves.

Required sections:

| Section | Content |
|---|---|
| Meta | KEY, title, status, domain, related systems |
| Problem | Who hurts, current behavior/workaround, why now, observable success |
| Solution | Product outcome, concepts, relationships, lifecycle, key rules |
| Out of scope | Explicit non-goals and boundaries with adjacent features |
| Actors / roles | Id, name, goal, relevant permissions and constraints |
| Use cases | Each UC-NN: actor, precondition, trigger, main flow, alternatives/exceptions, postcondition |
| Functional requirements | Each FR-NN is an unambiguous SHALL statement linked to UC ids |
| Non-functional | Include NFR-NN only when the human stated a requirement |
| Acceptance / DoD | Observable checks a human can verify without reading code |
| Open questions | Empty before acceptance; assumptions are not hidden here |
| Traceability | FR → UC; leave EARS column blank until `spec-kit-ears` runs |

For complex features, include concise domain tables for:
- Entity responsibilities and relationships.
- State transitions and forbidden transitions.
- Uniqueness/invariants.
- Editability rules by lifecycle state.
- Migration mapping and anomaly handling.

Do not add tables mechanically when they do not clarify the behavior.

### Phase 5: Write requirements precisely

Every FR must:
- Use one primary SHALL obligation; split unrelated obligations.
- Identify the actor or system behavior and the condition under which it applies.
- State the expected result, including rejection or preservation behavior.
- Link to one or more use cases.
- Be testable through acceptance criteria.

Avoid:
- Vague words such as "properly", "normally", "as appropriate", or "seamlessly".
- Requirements that merely repeat a use-case step without adding a rule.
- Mixing several independent business rules into one oversized FR.
- Technical prescriptions unless they are externally observable product
  contracts (for example, a stable identifier required by an integration).
- Requirements that contradict lifecycle tables or other requirements.

Use stable identifiers for domain entities in contracts. Do not use mutable
display names, ordering positions, or labels as identity.

### Phase 6: Derive acceptance criteria

Build acceptance checks from the domain rules, not only from the happy path.
For each important workflow, cover:
- Successful creation and normal use.
- Invalid input and atomic rejection.
- Boundary values and empty selections.
- Duplicate and concurrent operations.
- Allowed and forbidden lifecycle transitions.
- Isolation between related records.
- Historical data and migration anomalies, where applicable.
- Compatibility with existing behavior and adjacent systems.

Every critical invariant and every restrictive rule in the PRD must have at
least one observable acceptance check. Acceptance criteria must not introduce
new behavior that is absent from the solution or FRs.

### Phase 7: Self-review (two passes)

**Pass A — product/domain completeness**
- Can a reader understand the concepts without knowing the codebase?
- Are entity ownership, identity, cardinality, and lifecycle explicit?
- Are states and transitions complete, including forbidden transitions?
- Are uniqueness, isolation, cancellation, correction, and history rules clear?
- Are defaults, editing restrictions, ordering, and label collisions defined?
- Are grouping and ranking dimensions explicit?
- Are migration, compatibility, and downstream identifier contracts covered?
- Are atomicity and failure outcomes defined?

**Pass B — consistency and testability**
- Every use case has a primary actor listed under Actors.
- Every FR maps to at least one UC; every critical rule is covered by an FR.
- Every restrictive or conditional FR has a corresponding acceptance check.
- Acceptance checks agree with the solution, lifecycle, and FRs.
- No two sections define conflicting behavior.
- No mutable label is used as entity identity.
- No hidden assumptions or unresolved decisions remain.
- No `TODO`, `TBD`, or `???` remain before handoff.

Fix issues found in either pass before asking for acceptance. Do not send an
obviously incomplete PRD for the human to discover defects that this checklist
can catch.

## 5. Human acceptance

1. Keep Meta status as `draft`.
2. Present the PRD path and a concise summary of the important product
   decisions, assumptions, and any remaining risks.
3. Ask the human to accept the PRD.
4. On explicit acceptance, set Meta status to `accepted`.
5. Do not start `spec-kit-ears` in the same run before acceptance is explicit.

A PRD with unresolved product decisions or non-empty Open questions is not
ready for acceptance. If the human accepts a documented assumption, retain
the `[ASSUMPTION]` marker unless the human explicitly confirms it as a rule.

## 6. Outputs

- `Tasks/<KEY>/PRD.md`, English, initially `draft`.
- After explicit human approval, the same PRD with status `accepted`.
- No product code, tests, EARS specification, architecture document, or
  `.planning/` wave is created or edited by this skill.

## 7. Stop and rollback

- Missing pain, primary actor, or observable success signal: ask the human.
- Material ambiguity that changes user-visible behavior: ask; do not guess.
- Unsupported claims: remove them or mark `[ASSUMPTION]`.
- Invented latency, volume, cost, or performance targets: remove them unless
  stated by the human.
- If product files under `apps/`, `racing_manager_*`, CMS, or Prisma changed,
  restore them and stop.
- Do not write EARS wording, C4 diagrams, DTO contracts, architecture, or
  implementation plans in this skill.

## 8. Exit

State the path to the PRD and whether it is `draft` or `accepted`.
When accepted, say the next skill is `spec-kit-ears`; `architecture` may follow
when system analysis is needed. Ask whether to proceed only after acceptance.
