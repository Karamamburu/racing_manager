# React feature

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Task: <what the user sees or does in apps/web>
Product repo: <path>
The API contract is: <method, path, body, statuses>
Branch feature/<KEY>-<slug>.
Read AGENTS.md, then .agents/skills/react-feature/SKILL.md.
If the API does not exist yet, stop and use nest-feature first.

Done: web tests assert the request payload and the visible error state.
pnpm lint, pnpm format:check, pnpm typecheck, and pnpm test return 0.
Commit prefix [agent].
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Task: <what the user sees or does in apps/web>
The API contract is: <method, path, body, statuses>
Read the product AGENTS.md, then .agents/skills/react-feature/SKILL.md.
Branch feature/<KEY>-<slug>.

Done: the four pnpm commands return 0. Commit prefix [agent].
Report the screen, the payload assertion, and the gate results.
```
