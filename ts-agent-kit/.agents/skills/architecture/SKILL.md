---
name: architecture
description: >
  Designs a change before code: C1 and C2 diagrams, a component model,
  decisions with alternatives, data contracts, and tasks T1-TN with a
  definition of done. Use for work of a day or more, several modules, or a
  breaking change, after requirements exist and before feature implementation.
  Do not use for a small local fork that an ADR-lite can record.
owner: tbd
freedom: heuristic
last_reviewed: 2026-10-28
---

# Skill: Architecture

## When

The task is a day or more, crosses modules, breaks a contract, or adds a service. Input is an approved requirements note. Output is the input to `feature`, `nest-feature`, or `react-feature`. A small fork that is cheap to undo is an ADR-lite via `docs`, not this skill.

## Goal

Write the design before implementation. The document says what we will build, why this shape, and how it splits into tasks. It is a work plan.

Read `.agents/agents/architecture.md` first.

## Inputs

| Input | Where | If missing |
|---|---|---|
| Requirements with ids and a definition of done | `Tasks/<KEY>/PRD.md` or the ticket | Ask. Do not design from a guess. |
| Latency, volume, cost, or availability numbers | The requirements | Ask. Do not invent numbers. |
| The code that exists today | The product repo | Read it before proposing a new module. |
| Stack and security constraints | `AGENTS.md` | Read-only. A conflict is an escalation, not an override. |

Mark any conclusion that the inputs do not support with `[ASSUMPTION]` and triage it with the human before the document is final.

## Steps

### 1. Read the task

- Record the definition of done as observable facts.
- List limits, allowed formats, and security constraints.
- Say whether `apps/api`, `apps/web`, or both change.

### 2. Read the code

- Find the extension point: an existing module, repository, or feature folder.
- Trace today's path from the user action to the database row.
- Check config for settings that already exist.
- Reuse a component you found with search. A second copy is a defect in the design.
- If you name a library version, verify it. Do not write a version from memory.

### 3. C4

Two diagrams, Mermaid `flowchart LR`. A box is a process or a store, not a class. See `.agents/agents/architecture.md`.

C1: user, this system, external systems.

C2: `apps/web`, `apps/api`, PostgreSQL, and any queue or object store. Controllers and services are not C2 boxes.

### 4. Components

Three groups: unchanged, new, and edited. For each new module, one line: name, layer (controller, service, repository, domain, web feature), purpose.

### 5. Decisions

A decision is in the document only when all three are true:

1. Two implementers could choose incompatible options.
2. The choice is not obvious.
3. There is a real trade-off.

Otherwise put it in **Deferred**.

Each included decision:

```text
### AD-N: <name>
**Chosen:** <what>
**Alternatives:** <at least two real ones, with a pro and a con each>
**Binds:** <what implementers must do>
**Prevents:** <what mistake this blocks>
**Consequences:** <trade-offs>
```

Ids are stable. Do not renumber them.

A load-bearing choice (new datastore, new framework, a service boundary) is not made silently. List the alternatives and let the human choose. The default is the stack in `AGENTS.md`. Leaving that stack requires ADR-full in `.agents/agents/docs.md`.

Typical decisions: where state lives (Postgres versus memory), retry and timeout values, whether a dynamic source needs accumulation or one snapshot, and how T1 blocks T2.

### 6. Data contracts

Show the delta only.

- DTO fields: name, type, required, meaning.
- Routes: method, path, body, response, status codes.
- Prisma models that change, and whether `database-migration` is required.
- Shared types between `apps/web` and `apps/api`, and which side is the source of truth (the API).

### 7. Files

A table: app, path, create or edit, one line on the change.

### 8. Tasks

- One task is at most a day, including tests.
- Dependencies are explicit.
- Order: contracts (T1), then server (T2), then UI (T3), then integration (T4).

Capability map at the top of the section: every input requirement maps to a component, a decision, and a task. Nothing extra is added.

```text
### T1: <name>

**Branch:** `feature/<KEY>-<slug>`
**App:** apps/api or apps/web
**Goal:** <one sentence>

**Do:**
- [ ] item

**Done when:**
- [ ] tests exist and pass
- [ ] pnpm lint, pnpm format:check, pnpm typecheck, pnpm test
- [ ] a human has reviewed the change
```

### 9. Risks

A short table: severity, risk, likelihood, impact, mitigation.

### 10. Check the document

- C1 and C2 are present.
- The definition of done is observable.
- Limits are named constants.
- Every decision passed the membership test and has two alternatives. The rest is Deferred.
- The capability map covers every input requirement and adds none.
- Every `[ASSUMPTION]` was triaged. No TODO placeholders remain.
- Each task is at most a day and has a definition of done.
- A human approved the document. Tasks are not handed to an implementer before that. The author's self-check is not the approval.

## Document outline

```text
# <KEY>: <title>
## 1. Context and goal
## 2. Definition of done and constraints
## 3. Diagrams (C1, C2)
## 4. Components
## 5. Decisions
## 6. Data contracts
## 7. Files
## 8. Tasks and capability map
## 9. Risks
## 10. Standards and checks
## 11. Deferred
```

## Task quality

Reject a task that says "implement the feature", has no test command, hides a limit as a magic number, or names no app. API tasks name the route and the status codes. UI tasks name the screen and the client payload the test will assert.

## Self-check before handoff

- Completeness: diagrams, contracts, files, tasks, risks.
- Testability: each task's done-when block includes the four pnpm commands.
- Security: user-supplied URLs, raw SQL, and secrets are called out or explicitly absent.
- Layers: controllers do not own Prisma. The web app does not own the business rule.

## Escalation

Stop and ask the human when requirements contradict each other, a number is missing and the design depends on it, or the only workable design leaves the stack in `AGENTS.md`.

## Anti-patterns

- A class diagram in place of C2.
- Decisions with a fake alternative ("or we do nothing").
- Tasks longer than a day.
- Invented latency numbers.
- Starting `nest-feature` in the same session before the human accepts the document.

## Checks you can run

```bash
rg -n "flowchart" Tasks/<KEY>/*.md
rg -n "pnpm lint" Tasks/<KEY>/*.md
rg -n "TODO|TBD|\\?\\?\\?" Tasks/<KEY>/*.md
```

The first two searches must hit. The third must be empty before approval.
