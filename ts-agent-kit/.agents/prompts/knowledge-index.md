# Knowledge index

## Mode A — this kit is the open workspace

```text
Ticket: <KEY>
Domain: <name>
Product repo: <path>
Read AGENTS.md, then .agents/skills/knowledge-index/SKILL.md.
Read docs/INDEX.md and one docs/domains page. If the index is missing, copy .agents/templates/docs/.
Run node .agents/tools/build_dependency_graph.mjs from the product root.
Read only the target module and its direct neighbors.

Done: cycles is empty and verify_kb_sync.mjs exits 0. Do not implement the change.
```

## Mode B — kit vendored into the app

```text
Ticket: <KEY>
Domain: <name>
Read the product AGENTS.md, then .agents/skills/knowledge-index/SKILL.md.
One domain page, then the import neighbors only.

Done: the graph has no cycles and the knowledge-index check exits 0.
```
