---
name: orchestrate-coder-reviewer-summarizer
description: >
  Runs a Coder, then a Reviewer, then a Summarizer as separate contexts with
  read-only review, structured handoffs, and deterministic gates, and returns
  findings to the Coder until the diff is accepted or the loop stops. Use when
  the task needs an independent check and a proof-based pull request
  description. Do not use for a one-file low-risk edit where three model calls
  cost more than the change.
owner: tbd
freedom: strict
last_reviewed: 2026-10-28
---

# Skill: Coder, Reviewer, Summarizer

Run three roles as a state machine. Do not ask one context to play all three. Each worker starts fresh, receives only its input, and leaves a handoff the orchestrator can check.

## Rules

1. The orchestrator owns state. It picks the next role, counts iterations, runs gates, and stops the loop.
2. Only the Coder edits product code. Reviewer and Summarizer are read-only. Compare the worktree before and after their runs.
3. Do not trust a role's self-report. Check tests, lint, the handoff shape, and the diff with commands.
4. Do not start the Summarizer after `CHANGES_REQUESTED`, `BLOCKED`, a red gate, or an invalid handoff. Send the findings back to the Coder.
5. Cap iterations and time. If the same blocker appears twice, stop and escalate to the human.
6. Do not open a pull request, push, or post a message unless the human asked. The Summarizer writes local artifacts. Publishing is a separate step (`mr`).
7. Do not pass secrets, the full chat, or hidden reasoning. Pass the task, facts, the diff, command results, decisions, and open risks.

## Topology

| Shape | What to run |
|---|---|
| One low-risk file | One agent and the four pnpm commands. Do not use this skill. |
| One coherent diff that needs an independent review and a PR description | The pipeline below. |
| Several independent quality axes | Use `feature-pipeline`. Do not run the three judges inside this skill. |
| Architecture, security, or money | This pipeline plus a human acceptance gate. |
| Several implementations that do not share files | Separate worktrees. Do not mix them into one loop. |

Start with the basic pipeline. Add a fan-out only when the task's shape pays for it.

## Preflight

1. Read `AGENTS.md` and the skill the Coder must follow (`feature`, `nest-feature`, `react-feature`, `bugfix`, `hotfix`, or `refactoring`).
2. `git status`. Do not mix the human's uncommitted work into the task. If the tree is dirty, record a baseline fingerprint. Do not reset or checkout their files.
3. Write a task envelope: goal, boundaries, acceptance criteria, allowed paths, protected paths, gate commands, `max_iterations` (usually 2, at most 3 without a new human decision), and escalation conditions.
4. Launch each role as its own subagent or fresh context. Do not continue the Coder's chat as the Reviewer.
5. Create `.ai-team/runs/<run-id>/`. Do not reuse one `coder.json` across parallel runs.
6. Run the gates once before the Coder if you need a baseline. A red baseline is not the new diff's fault. Stop, or record the known debt in the envelope.

Gate commands for this stack:

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

## State machine

```text
INIT → CODER → CODE_GATE → REVIEWER → REVIEW_GATE
                                  ├─ CHANGES_REQUESTED → CODER (iteration + 1)
                                  ├─ BLOCKED or invalid → ESCALATE
                                  └─ MERGE → SUMMARIZER → FINAL_GATE → READY_FOR_PR
```

## Step 1. Coder

Pass only the envelope, the acceptance criteria, the relevant implementation skill, the allowed paths, the previous Reviewer's findings when this is a fix iteration, and the handoff format.

The Coder may read, edit, and run commands inside the product root. The Coder may not push, merge, publish, edit protected paths, weaken a test or a coverage threshold, or skip hooks.

The handoff is JSON: changed files, commands with exit codes, assumptions, risks, and what is unfinished. `tests pass` is not the whole proof.

Reject a handoff with an empty `changed_files` list or a non-numeric exit code.

```json
{
  "role": "coder",
  "changed_files": ["apps/api/src/links/links.service.ts"],
  "commands": [{ "cmd": "pnpm test", "exit_code": 0 }],
  "assumptions": [],
  "risks": [],
  "unfinished": []
}
```

## Step 2. CODE_GATE

The orchestrator runs this, not the Coder.

1. Diff paths against the allowlist and the protected paths.
2. `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`.
3. If the change depends on time, concurrency, randomness, or the network, run the targeted test twice.
4. `git diff --check`.
5. Save `diff.patch`, stdout, stderr, and exit codes under the run directory.

A red gate does not go to the Reviewer as a finished result. Return the log to the Coder if iterations remain. The same failure twice, or a failure outside the task, escalates.

## Step 3. Reviewer

Start the Reviewer in a fresh context. Pass the envelope, the real diff, `coder.json` as a claim to check rather than as truth, the gate logs, and `.agents/skills/code-review/SKILL.md`.

The Reviewer:

- Does not edit files.
- Checks the contract, layer boundaries, correctness, tests, security, and regressions.
- Returns `spec_verdict` (does this match the request) and `quality_verdict` (is the implementation sound).
- Ties each finding to a file, a line, and a quote from the diff.
- Marks each finding `CONFIRMED` or `INCONCLUSIVE`.
- Returns `MERGE`, `CHANGES_REQUESTED`, or `BLOCKED`.

Fingerprint before the Reviewer:

```bash
mkdir -p .ai-team/fingerprints
git status --porcelain > .ai-team/fingerprints/reviewer.before
```

After the Reviewer:

```bash
git status --porcelain > .ai-team/fingerprints/reviewer.after
diff -u .ai-team/fingerprints/reviewer.before .ai-team/fingerprints/reviewer.after
```

Any worktree change by the Reviewer is a role violation, including a "helpful" fix. Restore it and treat the review as invalid.

Use the same fingerprint around the Summarizer (`summarizer.before` and `summarizer.after`).

## Step 4. Verdict

- `MERGE`: no blocking findings. Continue to the Summarizer.
- `CHANGES_REQUESTED`: pass only confirmed findings, their evidence, and the acceptance criteria to a new Coder context. Increment the iteration. Run CODE_GATE again. Start a new Reviewer context.
- `BLOCKED`: stop. Say what authority, fact, or external state is missing.
- Invalid JSON or an empty reply: one format retry. A second failure is `BLOCKED`.

The Coder cannot close a finding by saying it is fixed. The next Reviewer checks the diff and the test. The Reviewer cannot add requirements that are outside the envelope. Those are non-blocking follow-ups.

## Step 5. Summarizer

Run only after `MERGE`. Read-only. Pass the envelope, the accepted diff, `coder.json`, `reviewer.json`, the gate logs, and `.agents/agents/mr.md`.

The local artifact includes:

- Title and why.
- Changes by layer (domain, Prisma, repository, service, controller, web).
- Test plan with the commands that actually ran.
- Risks, compatibility, and rollback (`down.sql` when the schema changed).
- Follow-ups.
- `READY_FOR_PR` or `BLOCKED`.

Reject vague lines ("added some changes"). Each claim points at the diff or a gate log.

```json
{
  "role": "summarizer",
  "verdict": "READY_FOR_PR",
  "claim_ledger": [
    { "text": "POST /links rejects file URLs with 400", "path": "apps/api/src/links/links.service.ts:40" }
  ]
}
```

Fail closed unless `verdict` is `READY_FOR_PR` and every claim has non-empty text and a `path:line` that exists.

## Step 6. FINAL_GATE

Before `READY_FOR_PR`:

- The last Reviewer returned `MERGE` and the handoff is valid.
- The four pnpm commands are green on the last Coder commit.
- The Summarizer did not change files (fingerprint diff is empty).
- Every PR description line is backed by the diff or a log.
- Open risks are listed, not omitted.
- Iteration count is recorded.
- Nothing was pushed or merged.

Give the human the local artifacts and a short audit: roles, iterations, gates, verdict, remaining risks.

## Stop

Stop the loop when:

- `max_iterations` is reached.
- The same blocking finding survived two review rounds.
- Reviewer or Summarizer changed the worktree.
- A handoff is invalid after one format retry.
- The Coder weakened a test, lowered a coverage threshold, touched a protected path, or left the allowlist.
- The baseline was red and the new failure cannot be separated from the old one.
- The dispute is a product or architecture decision.
- The time budget is spent.
- An external action needs permission that was not given.

Save the state and the next safe step. Do not run the loop again with no new information.

## Definition of done

- The three roles were separate invocations.
- Reviewer and Summarizer stayed read-only, shown by the fingerprint diffs.
- Each handoff is valid and small.
- A red review went back to the Coder. A merge went to the Summarizer.
- The loop can be resumed from `.ai-team/runs/<run-id>/`.
- The PR description is backed by the diff and the commands.
- Nothing was published as a side effect of this skill.
