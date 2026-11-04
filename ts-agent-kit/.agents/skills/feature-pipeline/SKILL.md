---
name: feature-pipeline
description: >
  Runs a closed feature loop: a coder who writes, a mechanical CODE_GATE, a
  read-only panel of Skeptic, Realist, and Visionary, and a summarizer that
  turns any rejection into a rework brief. Use for feature-sized NestJS or
  React work after an EARS spec exists. Do not use for a one or two file fix
  (small-fix) or when the human asked for a single reviewer
  (orchestrate-coder-reviewer-summarizer).
owner: tbd
freedom: strict
last_reviewed: 2026-10-29
---

# Skill: Feature pipeline

The current agent is the orchestrator. It does not play the coder or a judge. Each role starts in a fresh context and reads only its role file, the EARS spec, the diff, and the previous handoff.

Read `.agents/pipeline/ROLES.md` before the first launch. Model ids, if any, come from `.agents/pipeline/models.json`. An empty slot still gets its own context. Do not invent a model name.

## 1. When

- **Use when** a feature wave has an accepted `specs/*-ears.md` and should pass the four-stage loop before merge.
- **Do not use** for `small-fix`, and do not use when the human asked for one reviewer. That remains `orchestrate-coder-reviewer-summarizer`.

## 2. Inputs

- Product root is the working directory.
- The EARS spec and, when `.planning/STATE.md` exists, the active wave.
- A clean tree, or a human note naming dirty files to leave alone.

## 3. Steps

### Stage 1: Coder

1. Start a fresh context. Give it `.agents/agents/roles/coder.md`, the spec, the active wave, and on cycle 2 or later only `handoff/panel-rework-brief.json`.
2. The coder may edit product code and tests. On a later cycle it fixes only `RW-` items and does not add scope.
3. It writes `handoff/coder.json` from `.agents/templates/handoff/coder.json`.
4. Validate:

```bash
node .agents/tools/verify_handoff.mjs handoff/coder.json
```

One invalid file gets one format retry. A second failure writes `handoff/verdict.json` with `ESCALATE` and stops.

### Stage 2: CODE_GATE

Run from the product root:

```bash
node .agents/tools/verify_techlead_gate.mjs
```

- Exit 0: continue to the panel.
- Any other exit: write `handoff/gate-failure.json` from the template, validate it, and return that file to a new coder context. Do not call the judges.

### Stage 3: Panel

Run only after the gate exits 0. Start three fresh contexts, one each for `.agents/agents/roles/skeptic.md`, `realist.md`, and `visionary.md`. They receive the spec, the diff, and `handoff/coder.json`. They do not receive each other's verdicts.

Before each judge:

```bash
mkdir -p handoff/fingerprints
git status --porcelain > handoff/fingerprints/<role>.before
```

After the judge:

```bash
git status --porcelain > handoff/fingerprints/<role>.after
diff -u handoff/fingerprints/<role>.before handoff/fingerprints/<role>.after
```

A non-empty diff invalidates that judge, including a "helpful" edit. Restore the tree and treat the pass as failed.

Each judge writes `handoff/judge-<role>.json`. Validate each file. Verdict is only `ACCEPT` or `REJECT`.

### Stage 4: Consensus

- Three `ACCEPT` verdicts: the orchestrator writes `handoff/verdict.json` with `VERDICT: READY` and stops. The summarizer is not called. Do not push or open a merge request.
- Any `REJECT`: start a fresh summarizer context with `.agents/agents/roles/summarizer.md` and the three judge files. It writes only `handoff/panel-rework-brief.json`. Validate it. The summarizer cannot change a rejection into acceptance.
- Fingerprint the summarizer the same way as a judge. Then start cycle + 1 with a new coder context.

## 4. Stop

Write `VERDICT: ESCALATE` and tell the human when:

- Cycle 3 ends without three `ACCEPT` verdicts.
- The same blocker location and issue survives two rounds.
- A handoff fails validation twice.
- A judge or the summarizer changes the worktree.
- The coder weakens a test, lowers a coverage threshold, or edits a frozen path.

Do not open a merge request inside this skill.

## 5. Outputs

- `handoff/coder.json`, `handoff/judge-skeptic.json`, `handoff/judge-realist.json`, `handoff/judge-visionary.json`
- `handoff/panel-rework-brief.json` only when a judge rejected
- `handoff/gate-failure.json` only when the gate failed
- `handoff/verdict.json` with `READY` or `ESCALATE`

## 6. Definition of done

- `handoff/verdict.json` validates and says `READY`.
- The last CODE_GATE exited 0.
- Judge and summarizer fingerprints are empty diffs.
- Nothing was pushed or merged.
