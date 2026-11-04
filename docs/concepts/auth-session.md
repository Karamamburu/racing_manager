---
type: concept
updated: 2026-11-03
sources:
  - infra/AUTHENTIK.md
  - racing_manager_back/src/auth
---

# Concept: Auth and session

Primary model is **cookie session after OIDC**, not JWT-to-API.

## Flow

1. User hits `auth/login` (or register) → Authentik OIDC (`AUTHENTIK_ISSUER_URL`, confidential client).
2. Callback establishes `express-session`; identity in session (`userSub`, username/email/name).
3. App user row upserted by `authentikId`.
4. Guards: `SessionAuthGuard` (logged in); `RolesGuard` + `@Roles` for admin/organizer; cookie presence guards where needed.
5. Logout may invalidate IdP session across hostnames (prod: see `infra/AUTHENTIK.md`).

## Front

`features/auth` session queries; role helpers for UI affordances.

## Links

- [user-and-roles](../entities/user-and-roles.md) · [auth domain](../domains/auth.md) · [infra](../packages/infra.md)
