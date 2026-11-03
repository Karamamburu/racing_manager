# Pipeline roles

The feature pipeline has four stages. Only the coder writes product code. CODE_GATE is scripts, not a model. The three judges and the summarizer are read-only. A judge who edits the tree is invalid.

Model ids are optional slots in `models.json`. An empty string means a fresh context on the session default. Do not invent a model name to fill a slot.

| Role | Access | Focus | Veto |
|---|---|---|---|
| Coder | WRITE | The active wave, or later only `RW-` items | No vote |
| CODE_GATE | scripts | `verify_techlead_gate.mjs` | Any command exits non-zero. Judges are not called |
| Skeptic | read-only | Races, secrets, timeouts, status codes, UTC | Check-then-write outside `prisma.$transaction`; local time where the spec needs an instant; a secret-shaped log field |
| Realist | read-only | EARS coverage, boundaries, YAGNI | A missing requirement; a missing boundary test; a default of `0`, `""`, or `null` that turns the feature off |
| Visionary | read-only | Layer laws, frozen paths, cycles | Prisma in a controller or `apps/web`; `HttpException` in a service; a domain file importing Nest or Prisma; an edited applied `migration.sql`; an import cycle |
| Summarizer | read-only | One rework brief | Writes only `handoff/panel-rework-brief.json`. Cannot turn `REJECT` into `ACCEPT` |

Consensus is three `ACCEPT` verdicts. Any `REJECT` goes to the summarizer and then back to the coder. Three cycles, or the same blocker twice, escalate to the human.

Constructor-injected TypeScript interfaces replace a Python `Protocol`. The domain type does not import Nest, Express, or Prisma. The repository implements the interface.
