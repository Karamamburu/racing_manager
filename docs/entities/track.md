---
type: entity
updated: 2026-11-03
sources:
  - racing_manager_back/prisma/schema.prisma
---

# Entity: Track

Venue / course catalog entry.

- Name, optional city, description, optional map link
- `isActive` flag
- Has many [Events](event.md) and news items

Public catalog: `GET /tracks`. Domain: [tracks](../domains/tracks.md).
