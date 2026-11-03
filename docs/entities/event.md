---
type: entity
updated: 2026-11-03
sources:
  - racing_manager_back/prisma/schema.prisma
---

# Entity: Event

Race or time trial bound to a [Track](track.md).

## Fields (conceptual)

- Track, name, sport (`RUN` | `SKI` | `ROLLER_SKI` | `BIKE`), kind (`RACE` | `TIME_TRIAL`)
- `eventDate`, optional `distanceKm`, description, optional `mapLink`
- Registration window: `registrationOpen` / `registrationClose`
- Status: `PLANNED` → `IN_PROGRESS` → `DONE` / `CANCELLED` (often synced by Moscow calendar date)
- Optional creator user; formats via `EventFormat` ↔ `ParticipationFormat`; optional `EventLap`s
- Related: [registrations](registration.md), [class competitions](class-competition.md), category finishes

## Status meanings

| Status | Meaning |
|---|---|
| `PLANNED` | Scheduled / not started |
| `IN_PROGRESS` | Active race day window |
| `DONE` | Finished |
| `CANCELLED` | Cancelled |

## Links

- Domain: [events](../domains/events.md)
- Package: [back](../packages/back.md)
