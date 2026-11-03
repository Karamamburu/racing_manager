---
type: domain
updated: 2026-11-03
---

# Domain: auth

## Responsibility

OIDC login/register/callback/logout; session read; role guards.

## Public contracts

- `GET /auth/session|login|register|callback|logout`
- Session cookie model — [auth-session](../concepts/auth-session.md)
- Roles: [user-and-roles](../entities/user-and-roles.md)

## Code

- API: `racing_manager_back/src/auth/`, `users/`
- Front: `features/auth`
- Ops: `infra/AUTHENTIK.md`

## Breakage signals

- Session payload shape changed for the front.
- Redirect URIs / logout flow broken across hostnames.
- Role code strings renamed without data migration.
