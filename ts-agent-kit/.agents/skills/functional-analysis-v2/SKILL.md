---
name: functional-analysis-v2
description: >
  Runs functional analysis as a two-model pipeline: DeepSeek V4.1 Flash authors
  an English Tasks/<KEY>/PRD.md, Gemini 4 Argon reviews it read-only and files
  P0/P1/P2 findings, and any P0/P1 returns the PRD for rework for at most three
  rounds. Use before EARS when new user-visible behavior or a domain/API contract
  change needs a PRD. Do not use for small-fix, EARS, architecture, or implementation.
owner: tbd
freedom: strict
last_reviewed: 2026-11-09
---

# Skill: Functional analysis pipeline

The current context is the orchestrator. It never writes the PRD and never
reviews it. The author and the reviewer run in separate fresh contexts with
different models. The orchestrator owns round counting, the gate, the state
files, and escalation.

The pipeline exists to produce a **more complete and more precise PRD** than a
single pass can: the author drafts, an independent model attacks the draft, and
only blocking findings force another round.

## 1. When

- **Use when** new user-visible behavior or a domain/API contract change needs
  an EARS specification.
- **Do not use** for `small-fix`, an isolated bugfix or hotfix with no new
  behavior, EARS authoring, architecture, or product code.
- Run from the product root.

## 2. Roles and models

Read `.agents/skills/functional-analysis-v2/models.json` before the first
launch.

| Stage | Role file | Model | Access | Output |
|---|---|---|---|---|
| Author | `.agents/skills/functional-analysis-v2/roles/author.md` | `opencode-go/deepseek-v4.1-flash` | Writes only `Tasks/<KEY>/PRD.md` and its handoff | `handoff/prd/author-<round>.json` |
| Reviewer | `.agents/skills/functional-analysis-v2/roles/reviewer.md` | `opencode-go/gemini-4-argon` | Read-only; writes only its review file | `handoff/prd/review-<round>.json` |
| Orchestrator | this file | session default | Writes rework briefs and the verdict | `handoff/prd/rework-<round>.json`, `handoff/prd/verdict.json` |

Rules:

- Pass the exact model id from `models.json` to the subagent launcher. If the
  runtime cannot choose a model per role, stop and tell the human. Do not run
  both roles on one model.
- If a model id is unavailable, stop. Do not substitute silently.
- The reviewer does not receive the author chat. The author does not receive the
  reviewer chat. Only files cross the boundary.
- The reviewer is read-only toward the PRD. Any edit invalidates the review.
- Do not let one context play both roles, and do not run the reviewer in the
  orchestrator context.

## 3. Inputs and preflight

Required:

- A ticket or short statement of the user-visible outcome, plus a stable `KEY`.
- `docs/INDEX.md` and exactly one domain page. Follow links to neighboring
  domain pages only when the feature crosses those boundaries.
- Optional As-Is facts via `investigate-codebase` when current behavior,
  compatibility, or existing business rules are unclear.

Before the first model call:

1. `mkdir -p handoff/prd`.
2. Confirm the primary actor, the user pain, and one observable success signal.
   If any is missing, ask the human once and stop. Do not let the author invent
   them.
3. If `Tasks/<KEY>/PRD.md` already exists, copy it to
   `handoff/prd/PRD.baseline.md`. The pipeline may replace it only through the
   author.
4. Record the worktree, excluding the pipeline's own artifacts:

   ```bash
   git status --porcelain -- . ':(exclude)handoff' > handoff/prd/git.before
   ```

   A dirty tree is acceptable only when every dirty path is outside the PRD and
   `handoff/`.

## 4. State machine

```text
PREFLIGHT
  → AUTHOR round 1
  → REVIEW round 1
      ├─ no P0/P1 and no human decision → VERDICT READY → human acceptance
      ├─ P0/P1 and rework rounds used < 3 → REWORK → AUTHOR next round
      └─ P0/P1 and rework rounds used = 3 → VERDICT ESCALATE
```

Round semantics:

- Round 1 is the initial draft. A **rework round** is one return to the author
  after a review.
- `max_rework_rounds` is 3. The pipeline allows at most four author versions and
  four reviews: rounds 1, 2, 3, and 4.
- If review 4 still has a P0 or P1, stop. Do not start round 5.

## 5. Stage 1: Author

1. Start a fresh context with the author model. Give it
   `.agents/skills/functional-analysis-v2/roles/author.md`, the `KEY`, the ticket
   or outcome, `docs/INDEX.md`, the one domain page, and
   `.agents/templates/tasks/PRD.md`.
2. Round 1: no prior review. Round 2+: also give it the current PRD,
   `handoff/prd/rework-<n>.json` when it exists, and
   `handoff/prd/human-answers-<n>.md` when it exists. It must not read the
   reviewer chat.
3. The author writes `Tasks/<KEY>/PRD.md` in English and its handoff. It edits
   no other product file.
4. Validate. When round 2 or later has a rework brief, also prove every blocking
   instruction was addressed or disputed:

   ```bash
   node .agents/tools/verify_handoff.mjs handoff/prd/author-<round>.json

   # only when handoff/prd/rework-<round>.json exists
   node .agents/tools/verify_prd_coverage.mjs \
     handoff/prd/author-<round>.json \
     handoff/prd/rework-<round>.json
   ```

   A blocking instruction may appear in `review_trace` or `disagreements`. It
   may not appear in `deferred`; deferral is for P2 only. A round that only
   applies human answers records them in `human_answers`.

5. One format retry. A second invalid handoff or uncovered blocking instruction
   stops the pipeline with `ESCALATE`.
6. Check the worktree against `handoff/prd/git.before`. Any new change under the
   product apps, `racing_manager_*`, `competition_managment_service`, `specs/`,
   `.planning/`, or Prisma is a violation: restore those paths and stop. The PRD
   path itself is allowed.
7. Save a checksum of the PRD:

   ```bash
   shasum -a 256 Tasks/<KEY>/PRD.md > handoff/prd/PRD.round-<n>.sha256
   ```

On rework, the author must:

- address or explicitly dispute every `P0` and `P1` instruction;
- either address or explicitly defer each `P2` in `non_blocking`;
- record every blocking review id in `review_trace` or `disagreements`; P2 ids
  may also go in `deferred`;
- never delete a valid requirement or weaken scope just to clear a finding;
- never invent a human decision. If a finding needs one, record it in
  `open_questions` and leave the behavior clearly marked `[ASSUMPTION]` or
  blocked for the human.

## 6. Stage 2: Reviewer

1. Start a fresh context with the reviewer model. Give it
   `.agents/skills/functional-analysis-v2/roles/reviewer.md`, the current
   `Tasks/<KEY>/PRD.md`, `handoff/prd/author-<n>.json`, the domain
   page, `docs/INDEX.md`, the PRD template, and on round 2+ the previous review,
   the rework brief when it exists, and `handoff/prd/human-answers-<n>.md` when
   it exists.
2. Before it starts:

   ```bash
   cp Tasks/<KEY>/PRD.md handoff/prd/PRD.review-<n>.before.md
   shasum -a 256 Tasks/<KEY>/PRD.md > handoff/prd/PRD.review-<n>.before.sha256
   git status --porcelain -- . ':(exclude)handoff' > handoff/prd/git.review-<n>.before
   ```

3. The reviewer writes only `handoff/prd/review-<n>.json`. It does not edit the
   PRD or any product file.
4. After it finishes:

   ```bash
   shasum -a 256 -c handoff/prd/PRD.review-<n>.before.sha256
   git status --porcelain -- . ':(exclude)handoff' > handoff/prd/git.review-<n>.after
   diff -u handoff/prd/git.review-<n>.before handoff/prd/git.review-<n>.after
   ```

5. If the checksum fails or the git diff is non-empty, the review is invalid.
   Restore the PRD from `handoff/prd/PRD.review-<n>.before.md`, restore any
   product path, and treat it as a format failure. A second invalid review stops
   with `ESCALATE`.
6. Validate:

   ```bash
   node .agents/tools/verify_handoff.mjs handoff/prd/review-<n>.json
   ```

The reviewer must return a coverage row for all 15 dimensions listed in
`.agents/skills/functional-analysis-v2/roles/reviewer.md`. A `GAP` row without a
matching `P0` or `P1` finding is invalid.

## 7. Stage 3: Gate

The orchestrator, not a model, applies the gate.

1. `blocking` = findings with `priority` `P0` or `P1`.
2. `human` = blocking findings with `resolution: "human"`, plus every entry in
   the author handoff's `open_questions`.
3. Stop early when the same P0/P1 location and issue survives two consecutive
   reviews after being marked addressed. Do not spend the remaining rounds on
   the same defect.
4. Apply this table in order:

| Condition | Next |
|---|---|
| Rework rounds used = 3 and (`blocking` or `human` is non-empty) | Write `verdict.json` with `ESCALATE`, list the surviving P0/P1 and unanswered questions, and stop. |
| `blocking` and `human` are empty | Write `handoff/prd/verdict.json` with `READY`, cycle = review round, reason `no P0/P1 after review <n>`. Stop and ask the human to accept. |
| `human` is non-empty | Group the human questions into one message. Record the answers in `handoff/prd/human-answers-<n+1>.md`. Launch author round n+1 with the rework brief when one exists and the answers. If no answer, `ESCALATE`. |
| `blocking` non-empty | Write `handoff/prd/rework-<n+1>.json` with every blocking finding. Launch author round n+1. |

Rework brief shape. Write it from
`.agents/skills/functional-analysis-v2/templates/rework.json`, not from prose:

```json
{
  "role": "prd_rework",
  "round": 2,
  "blocking_count": 2,
  "instructions": [
    {
      "id": "RW-001",
      "source": "RF-003",
      "priority": "P0",
      "dimension": "lifecycle",
      "location": "Tasks/KEY/PRD.md:88",
      "issue": "The PRD never states whether a cancelled heat can be reactivated.",
      "required_action": "Add the forbidden transition and the user-visible outcome.",
      "resolution": "author"
    }
  ],
  "non_blocking": [
    {
      "id": "RF-007",
      "priority": "P2",
      "dimension": "consistency",
      "issue": "Two labels name the same entity.",
      "required_action": "Use one term."
    }
  ]
}
```

Validate it:

```bash
node .agents/tools/verify_handoff.mjs handoff/prd/rework-<n+1>.json
```

The verdict uses the existing `orchestrator` handoff shape; write it from
`.agents/skills/functional-analysis-v2/templates/verdict.json` and validate it
with the same command.

Rules for the brief:

- Copy P0/P1 findings verbatim enough to act on. Do not add new requirements.
- `non_blocking` carries `P2` only, and the author may defer it with a reason.
- If the author recorded a `disagreement`, add it to the next reviewer's input as
  an explicit item. The reviewer must uphold it with evidence or withdraw it.
- A `P2` never blocks acceptance. It is reported as a follow-up.
- Do not turn a `P2` into a `P0/P1` during the gate. Only the reviewer assigns
  priority.

## 8. Stage 4: Human acceptance

1. Keep Meta status as `draft`.
2. Present the PRD path and a short audit: rounds used, P0/P1 resolved, P2
   follow-ups, assumptions, open questions, and remaining risks.
3. Ask the human to accept the PRD.
4. On explicit acceptance, set Meta status to `accepted`.
5. Do not start `spec-kit-ears` in the same run before acceptance is explicit.

A PRD with a non-empty Open questions section is not ready for acceptance. An
accepted `[ASSUMPTION]` stays marked unless the human explicitly confirms it as a
rule.

## 9. Stop and escalate

Write `verdict.json` with `ESCALATE` and a non-empty reason when:

- A model id is unavailable, or the runtime cannot select a model per role.
- Rework round 3 ends with a P0 or P1.
- The same P0/P1 survives two consecutive reviews.
- The reviewer edits the PRD or a product file.
- An author or reviewer handoff fails validation twice.
- The author changes product code, a spec, a migration, or `.planning/`.
- A P0/P1 needs a human product decision and the human does not answer.
- The author and reviewer disagree on scope and evidence does not settle it.

Save the current PRD and the last review. Do not run another round without new
information.

## 10. Outputs

- `Tasks/<KEY>/PRD.md`, English, `draft` until human acceptance.
- `handoff/prd/author-<n>.json` for every author round.
- `handoff/prd/review-<n>.json` for every review round.
- `handoff/prd/rework-<n>.json` only when a review has P0/P1.
- `handoff/prd/human-answers-<n>.md` only when a question needs a human decision.
- `handoff/prd/verdict.json` with `READY` or `ESCALATE`.
- No product code, tests, EARS specification, architecture document, or
  `.planning/` wave.

## 11. Definition of done

- The last review has no P0 or P1.
- `handoff/prd/verdict.json` validates and says `READY`.
- Every author and reviewer handoff validates.
- The reviewer fingerprint shows no PRD edit and no product edit.
- The PRD is `draft`, and the human has been asked to accept it.
- P2 follow-ups and remaining assumptions are listed, not hidden.

## 12. Exit

State the PRD path, the number of rounds, the resolved P0/P1 count, and the P2
follow-ups. When accepted, say the next skill is `spec-kit-ears`; `architecture`
may follow when system analysis is needed. Ask whether to proceed only after
acceptance.
