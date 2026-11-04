# Hotfix rules

1. Shrink the change before writing it. One defect, one fix.
2. Branch from the default branch: `hotfix/<KEY>-<short-description>`.
3. Add a regression test that failed before the fix and passes after it.
4. No refactor, no drive-by cleanup, no new dependency "while we are here".
5. State how to roll the change back. If the fix is a schema change, name the `down.sql` and what data it destroys.

If the fix needs more than about 20 lines of product code, it is a `bugfix`, not a hotfix. Stop and agree the switch with the human. Do not stretch the hotfix to fit.

After the fix, show that the production symptom is gone on the path that failed. A green unit test of a nearby function is not that proof.
