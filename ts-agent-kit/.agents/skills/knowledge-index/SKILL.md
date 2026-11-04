---
name: knowledge-index
description: >
  Loads one domain from docs/INDEX.md, builds the TypeScript import graph, and
  refuses cyclic imports before a NestJS or React change. Use before modifying
  a product that already has modules. Do not use to implement the change, and
  do not read the whole repository into context.
owner: tbd
freedom: strict
last_reviewed: 2026-10-28
---

# Skill: Knowledge index

## 1. When

- **Use when** a change starts and the product has more than one module. Read the index, then one domain, then the graph neighbors.
- **Do not use** to write feature code. Do not open unrelated files "for context".

## 2. Inputs

- Product root is the working directory.
- `docs/INDEX.md` is 100 lines or fewer. If it is missing, copy `.agents/templates/docs/INDEX.md` and `.agents/templates/docs/domains/example.md`, then replace the example with the domain this task touches.

## 3. Steps

### Phase 1: Page the index

1. Read `docs/INDEX.md` only.
2. Open the one linked file `docs/domains/<domain>.md` for this task.
3. Note that page's breakage signals. Do not open a second domain.

### Phase 2: Import graph

```bash
node .agents/tools/build_dependency_graph.mjs
```

1. The script must exit 0 and write `specs/dependency-graph.json`.
2. If `cycles` is not empty, stop. Do not edit around a cycle.

### Phase 3: Scoped read

1. Find the target module in `nodes`.
2. From `edges`, list direct neighbors in and out.
3. Read only the target plus those neighbors. If that set is larger than five files, stop and ask which neighbor matters. Do not read the rest of `apps/`.

### Phase 4: File the change back

1. After a public route, env var, DTO field, or moved file, update `docs/INDEX.md` and the domain page in the same change.
2. The domain page keeps a `## Breakage signals` heading.

```bash
node .agents/tools/verify_kb_sync.mjs
```

## 4. Outputs

- `specs/dependency-graph.json`
- An updated index and domain page when the public surface changed
- A short list of the files that were read

## 5. Definition of done

- `build_dependency_graph.mjs` and `verify_kb_sync.mjs` exit 0.
- `cycles` is empty.
- Only the index, one domain page, and the neighbor set were read before implementation.

## 6. Stop and rollback

- A cycle: stop and report the cycle path. Do not delete an import to hide it without the human agreeing which edge is wrong.
- A read outside the neighbor set: stop and return to the graph before any edit.
