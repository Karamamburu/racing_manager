# Documentation rules

## When to update

- A public function, class, or method changed: update the TSDoc.
- An endpoint, env var, dependency, or run command changed: update `README.md` in the same change.
- A decision spans modules or changes a public contract: add an ADR under `docs/adr/`.
- A user-visible change (endpoint, breaking change, bugfix, config): add a line under `[Unreleased]` in `CHANGELOG.md`.

A refactor with no behavior change does not get a changelog line.

## TSDoc

English. One summary line. Add `@param`, `@returns`, and `@throws` when they are not obvious from the types.

```ts
/**
 * Create a link with a generated code.
 *
 * @param originalUrl - http or https URL.
 * @returns The stored link.
 * @throws InvalidUrlError when the URL is empty or not http(s).
 */
export function createLink(originalUrl: string): Link {}
```

- Do not restate the function name (`/** Create link. */` on `createLink`). Say why, or skip the comment.
- Examples belong in the doc only when the behavior is surprising.
- Private helpers need a comment only when the next reader would misuse them.

## Changelog

Follow Keep a Changelog. Sections: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

One entry is one user-visible change, not one commit. Put the ticket at the end:

`- Added PATCH /links/:id to update the target URL (PROJ-101).`

## ADR

Two sizes.

**ADR-full** when any of these is true:

- Undoing it is expensive (data migration, database, framework, auth scheme).
- It crosses more than one repository.
- It moves a non-functional target (latency, cost, compliance).
- It contradicts an accepted ADR. The new file sets the old one to `Superseded by NNNN`.
- People disagree, or there are three or more real options.

**ADR-lite** when the fork is local, reversible in one change, and does not move a public API, the database, or an NFR.

Path: `docs/adr/NNNN-short-name.md`. Do not delete an ADR. Add a row to `docs/adr/INDEX.md`: number, slug, status, date, author, tags.

### ADR-lite

```markdown
# NNNN — <short title>

## Status

Accepted

## Context

<What forced the decision.>

## Decision

<One or two sentences.>

## Consequences

<What gets better, what gets worse, what risk stays.>

## Alternatives considered

- <Option>: why it lost.
```

### ADR-full

Include status, a one-sentence decision in context, measurable drivers, at least three options with pros and cons, a weighted matrix, and a sensitivity check.

- Write the weights before scoring the options. Changing weights after the score is a sign you need a proof, not a new weight.
- An empty sensitivity check stays `Proposed`. It is not accepted.
- Drivers are measurable. "Faster" is not a driver. "p99 under 200ms at 100 rps" is.
- One author and one reviewer. A crowd means the decision is not made yet.

Sensitivity check: if weights move by 20% and the winner changes, do not accept the ADR. Run a proof no longer than a day and put the numbers in the matrix.

## README

Minimum sections: overview, quickstart, configuration, how to run (dev, tests, migrations), architecture (the layer sketch), API (where the OpenAPI document lives).

A stale README that contradicts the change is a merge blocker.

## Forbidden

- A new public API with no TSDoc.
- A new endpoint or a breaking change with no changelog line.
- An architectural decision with no ADR. When unsure, write ADR-lite.
- Deleting an ADR.
- Generated comments that only repeat the identifier.
- An ADR-full accepted with an empty sensitivity check.
