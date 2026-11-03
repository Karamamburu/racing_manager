---
type: domain
updated: 2026-11-03
---

# Domain: personal

## Responsibility

Cabinet profile update, personal stats, consent grant/revoke for policy documents.

## Public contracts

- `GET/PATCH /personal`
- Consent document types/actions/sources — [personal-consent](../entities/personal-consent.md)
- Front Policy pages + consent checkboxes
- OIDC registration (via [auth](auth.md)): IdP claim `consent` → `PERSONAL_DATA_CONSENT` grant; IdP claim `distribution_consent` → `PERSONAL_DATA_DISTRIBUTION_CONSENT` grant; both only on first user create, source `REGISTRATION`

## Code

- API: `racing_manager_back/src/personal/`
- Registration consent write path: `racing_manager_back/src/users/users.service.ts` (from `auth` callback claims)
- Front: `features/personal`, `pages/CabinetPage`, `pages/PolicyPage`, `shared/personalConsent`

## Breakage signals

- Consent document type added/removed without migration and UI.
- Profile DTO fields renamed; PATCH semantics changed.
- Revoke/grant source codes changed.
- IdP claim `consent` or `distribution_consent` renamed or interpretation changed without updating auth → users registration path.
