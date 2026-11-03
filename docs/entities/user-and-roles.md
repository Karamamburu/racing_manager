---
type: entity
updated: 2026-11-03
sources:
  - racing_manager_back/prisma/schema.prisma
  - racing_manager_back/src/auth/role-codes.ts
---

# Entity: User and roles

## User

- Linked by `authentikId` (unique); `userName` unique; optional email/name/gender/birthDate/city/district/team.
- Created/updated on OIDC login (`UsersService.registerFromOidcProfile`).
- Owns registrations, consent events, optionally created events/news.

## Roles

Via `Role` / `UserRole`. Application codes include:

- `ADMINISTRATOR`
- `ORGANIZER`

Guards: session required for private routes; `@Roles(...)` for admin/organizer actions. Front helpers gate UI (e.g. can create events / manage news).

## Links

- [auth-session](../concepts/auth-session.md) · [auth domain](../domains/auth.md)
