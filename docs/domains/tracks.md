---
type: domain
updated: 2026-11-03
---

# Domain: tracks

## Responsibility

Track catalog used by events and news.

## Public contracts

- `GET /tracks`
- Entity: [Track](../entities/track.md)

## Code

- API: `racing_manager_back/src/tracks/`
- Front: `features/tracks`, Tracks/Track pages

## Breakage signals

- Track list/detail fields renamed/removed.
- Soft-delete / `isActive` semantics changed without front updates.
