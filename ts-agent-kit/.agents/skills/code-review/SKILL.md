---
name: code-review
description: >
  Reviews a diff against the TypeScript standards and Nest/React layer rules,
  and reports blockers, recommendations, risks, evidence, and whether the
  change does the job it claims. Use before merge. Do not use to implement a
  feature or a bugfix, and do not use as a substitute for the human's acceptance.
owner: tbd
freedom: strict
last_reviewed: 2026-10-28
---

# Skill: Code review

## Goal

Check the diff against `.agents/agents/typescript-standards.md`, `.agents/agents/architecture.md`, `.agents/agents/code.md`, and `.agents/agents/security.md`.

This skill does not edit product code. Findings go to the author.

## Steps

### 1. Run the checks

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Put the pass or fail in the report. Do not paste every diagnostic. Quote a line only when it is a finding.

### 2. Read the changed files

Read the whole file, not only the hunk, when the hunk touches a controller, service, repository, migration, or React feature.

### 3. Checklist

#### Blockers

- [ ] Exported functions have parameter and return types (`typescript-standards` §1).
- [ ] No `any`, `@ts-ignore`, or `@ts-expect-error` without written approval.
- [ ] Public responses are DTOs or named types, not anonymous bags.
- [ ] Controllers do not import `PrismaClient` or `PrismaService`.
- [ ] Services do not throw `HttpException` and do not import Express `Request` or `Response`.
- [ ] No empty `catch`.
- [ ] No shared mutable default argument.
- [ ] Async path: repository and service methods that do I/O are `async`, and callers `await` them. No sync file or HTTP call on the request path.
- [ ] Logs: no `console.log`, no secret fields, event name is stable (`logging.md`).
- [ ] Security: no hardcoded secret, raw SQL is parameterized, passwords are hashed with argon2 or bcrypt, outbound HTTP sets a timeout, TLS is not disabled (`security.md`).
- [ ] A new default does not turn the feature off. `0`, `""`, or `null` on the setting the feature exists to perform is a blocker unless the task says the feature is optional and off by default.
- [ ] A test asserts the outbound payload, not only a status code, when the change calls another service.
- [ ] A new env var is present in the env example and in the deploy config in this change.
- [ ] Schema changes include `migration.sql` and a non-empty `down.sql`.
- [ ] The author showed a business result when the change alters data volume or content: metric, how it was measured, and at least five records opened by hand. "Tests are green" is not that result. A missing slice is a blocker.

#### Recommendations

- [ ] No magic numbers (`§8`).
- [ ] No duplicated business rule.
- [ ] A function does one thing.
- [ ] Names: `camelCase`, `PascalCase`, `UPPER_SNAKE_CASE`.
- [ ] New logic does not lower the coverage threshold.

## Report

```text
## Code Review: <branch or files>

### Automated checks
lint: pass or fail | typecheck: pass or fail | test: pass or fail

### Blockers

| # | File | Line | Finding | Rule |
|---|------|------|---------|------|
| 1 | apps/api/src/links/links.controller.ts | 12 | PrismaService injected into the controller | AGENTS.md layer laws |

### Recommendations

| # | File | Line | Finding | Rule |
|---|------|------|---------|------|
| 1 | apps/api/src/links/links.service.ts | 40 | Literal 75 | typescript-standards §8 |

### Business result
Before/after: <metric, query, values> | Records opened: N
Defaults checked: <which, and that the feature still works>

### Result
- Blockers: X
- Recommendations: Y
- Verdict: changes required, or acceptable
```

The business-result section is mandatory. If the author did not provide a slice, write "not provided" and add a blocker when the change can drop or empty data.

A render-wait setting once shipped as default `0`, meaning do not wait. Review checked style and missed the effect. Most captured pages were empty. The suite was green.

## Comment that goes on the merge request

The report above is the reviewer's worksheet. The comment posted for the author is plain prose, as short as it can be while still telling them what to change.

Before sending:

- Prose paragraphs. No table, no heading stack, no emoji.
- Merge two paragraphs that are the same finding.
- Automated checks are one sentence. The verdict is one sentence at the end.
- Say each finding once.
- Each finding says what is wrong, how you know, and what to do.
- Prefer `links.controller.ts:12-20` over a tour of the file.
- Confirmed fixes are one sentence together, not a paragraph each.
- Delete praise and delete a retelling of code that is fine.

Write the full report first so you do not skip a blocker. Then cut the comment until removing one more sentence would leave the author unsure what to fix.

## Prompt sketch

```text
Read .agents/skills/code-review/SKILL.md.
Review the current diff.
Run pnpm lint, pnpm typecheck, and pnpm test.
Write the worksheet, then the short comment.
```
