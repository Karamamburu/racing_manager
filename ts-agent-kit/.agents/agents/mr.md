# Merge request rules

A merge request is short enough to review and specific enough to test.

- Say what changed.
- Say why.
- List the commands that ran and their results.
- Name the risks.
- If rollout can fail in production, include a rollout note and a rollback note. For a schema change, the rollback note points at `down.sql` and says whether it is safe on data that already exists.

Title shape: `feat: add link expiry`, `fix: reject file URLs`, `hotfix: stop null code on create`.

Link the ticket. Do not auto-merge. A human approves.
