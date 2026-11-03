---
name: techlead-gate
description: >
  Runs the deterministic acceptance chain for a NestJS and React wave:
  knowledge index, import cycles, layer rules, blast radius, EARS specs,
  the wave plan, and pnpm test. Use at the end of a GSD wave and before a
  merge request. Do not skip a red check or replace the chain with a summary.
owner: tbd
freedom: strict
last_reviewed: 2026-10-28
---

# Skill: Techlead gate

## 1. When

- **Use when** a wave's code is on disk and before `mr`.
- **Do not use** to implement the feature. A red check is fixed by the wave's implementation skill, then the gate is run again.

## 2. Inputs

- Product root is the working directory.
- Dependencies are installed if `pnpm test` needs them.
- `docs/INDEX.md` exists (`knowledge-index` copies the template when it does not).

## 3. Steps

### Phase 1: One command

```bash
node .agents/tools/verify_techlead_gate.mjs
```

The script stops at the first failure. It does not continue to the next check for extra errors.

### Phase 2: The chain

1. `verify_kb_sync.mjs` — index length and domain links.
2. `build_dependency_graph.mjs` — `cycles` must be empty.
3. `verify_architecture_layers.mjs` — Nest and React layer rules.
4. `verify_blast_radius.mjs` — file budget and frozen paths.
5. `ears_linter.mjs` when any `specs/*-ears.md` exists. A `small-fix` with no spec skips this step.
6. `plan_checker.mjs` when `.planning/STATE.md` exists. A `small-fix` does not create `.planning/` to satisfy this step.
7. `pnpm test`.

### Phase 3: Verdict

Success prints `TECHLEAD GATE: ACCEPTED` and exits 0. Anything else exits non-zero. Do not claim acceptance without that line.

## 4. Outputs

- The console log of the chain.
- `specs/dependency-graph.json` rewritten by the graph step.

## 5. Definition of done

- The command exits 0.
- The log contains `TECHLEAD GATE: ACCEPTED`.

## 6. Stop and rollback

- Any failed check blocks the merge request. Do not commit with `--no-verify` and do not weaken a test to turn the gate green.
- The same check failing twice: stop and report the log to the human.
