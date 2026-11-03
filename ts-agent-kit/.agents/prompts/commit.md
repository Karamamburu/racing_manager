# Commit

## Mode A — this kit is the open workspace

```text
Product repo: <path>
Read AGENTS.md section 6 and section 8.
Stage only files that belong to the current skill.
Message: [agent] <type>(<scope>): <english result>
Types: feat, fix, hotfix, refactor, test, docs, chore.
Do not use --no-verify. Do not push.

Done: git status is clean and the message matches the diff.
```

## Mode B — kit vendored into the app

```text
Read the product AGENTS.md sections on anti-cheat and commits.
Stage only the current skill's files.
Message: [agent] <type>(<scope>): <english result>
Do not skip hooks. Do not push.

Done: git status is clean.
```
