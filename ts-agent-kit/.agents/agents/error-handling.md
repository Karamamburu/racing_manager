# Error handling during a task

Use this file from any skill when a step fails, is ambiguous, or blocks.

## Rule

Understand the failure before proposing a workaround.

`any`, `@ts-ignore`, an empty `catch`, or a test rewritten to match the bug turns a visible failure into hidden debt. Walk these five steps in order:

1. **Identify.** Say what broke. Not "tsc failed". Say `apps/api/src/links/link.service.ts:42` returns `Link | null` and the controller passes it to a function that requires `Link`.
2. **Assess.** Pick a severity from the table. Say what is blocked and what is not.
3. **Communicate.** Tell the human what happened and what the options are. On Critical and High, do not choose for them.
4. **Offer solutions.** Concrete steps, not "I will try to fix it".
5. **Document.** The chosen compromise is a comment next to the code (`accepted compromise: <what>, because <why>`) or a short note in `Tasks/<key>/decisions.md` when that folder exists.

## Severity

| Level | Meaning | Response |
|---|---|---|
| Critical | Work cannot continue. Something you did not intend to change is broken, the project does not typecheck or boot, or a secret leaked. | Stop. Record the symptom. Do not offer a workaround. Wait for the human. |
| High | This step will not finish as planned. A test fails for an unclear reason, or `tsc` reports an error you cannot explain. | Describe it. Offer two or three repairs with trade-offs. Wait for the choice. |
| Medium | The step can close with a compromise that must be visible. | Name the compromise and the reason. Continue. |
| Low | Noise that does not block. A typo in a comment in a file you are not changing. | Note it. Do not chase it in this task. |

## Typical cases

### `tsc` fails in code you did not mean to change

Default severity: **High**. Either your type change broke a caller, or the compiler is now seeing an old error.

- Do not add `@ts-ignore` to continue.
- Read the error and the file. If your change caused it, fix the cause. If it is pre-existing and outside the task, make a separate `[manual] fix(types): ...` commit before the main work, or stop and ask if that fix is unsafe.

### A test fails and the reason is unclear

Severity: **High**.

1. Read the assertion and the stack.
2. Inspect the value. Remove the debug print before commit.
3. If it is still unclear, stop. Tell the human the trace and what you already tried.

Three attempts on the same failure, then stop. Do not skip the test and do not edit the assertion to match the wrong behavior.

### A Prisma migration fails

**Critical** if two branches created divergent histories or `down.sql` does not apply. **High** otherwise.

- Do not `prisma migrate resolve` or mark a migration applied without understanding the schema you are declaring.
- Show `prisma migrate status` and the SQL that failed. Let the human pick the repair.

### A hook that used to pass now fails

- ESLint, Prettier, `tsc`, or tests on your diff: High. Fix your diff.
- `pnpm audit` on a dependency you did not touch: separate `[manual] chore(deps)` commit. See `.agents/agents/code.md`.
- Secret scan: **Critical**. Stop.

### The design document disagrees with the code

**High** if the code is already merged. **Medium** if the code is only on your branch.

Do not implement a plan that the code contradicts, and do not change behavior to match a stale plan. Update the plan or the code after the human says which one is the source of truth.

### A library does not do what its docs say

Severity: **High**. Show a 5–10 line reproduction, the version, and expected versus actual. A workaround needs an explicit yes from the human, plus a note that says when it should be removed.

### The session is losing earlier decisions

Severity: **High**. Stop. Write what is done, the file you stopped in, and the next decision. Tell the human the next session should start from that note.

## Never

- Silently apply `eslint-disable`, `@ts-ignore`, `it.skip`, or an empty `catch`.
- Change a test so it matches the current behavior without agreeing that the requirement changed.
- File a non-Low problem as a TODO and move on.
- Repeat the same attempt more than three times.
- Ship a fix you cannot explain. If you do not know why the old code failed, you do not know why the new code works.
