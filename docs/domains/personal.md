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

## Code

- API: `racing_manager_back/src/personal/`
- Front: `features/personal`, `pages/CabinetPage`, `pages/PolicyPage`, `shared/personalConsent`

## Breakage signals

- Consent document type added/removed without migration and UI.
- Profile DTO fields renamed; PATCH semantics changed.
- Revoke/grant source codes changed.
