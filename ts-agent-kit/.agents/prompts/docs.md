# Docs

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Change: <API, env, dependency, or decision>
Product repo: <path>
Read AGENTS.md, then .agents/skills/docs/SKILL.md and .agents/agents/docs.md.
Write the ADR before code if the decision is hard to undo.

Done: TSDoc on public symbols, a changelog line if users can see the change,
README updated if a command or env var changed.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Change: <API, env, dependency, or decision>
Read the product AGENTS.md, then .agents/skills/docs/SKILL.md and .agents/agents/docs.md.

Done: TSDoc, changelog, and README match the change.
```
