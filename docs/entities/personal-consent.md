---
type: entity
updated: 2026-11-03
sources:
  - racing_manager_back/prisma/schema.prisma
  - policy.md
---

# Entity: Personal data consent

Tracks grant/revoke of personal-data related documents for a [User](user-and-roles.md).

## Document types

| Type | Meaning |
|---|---|
| `PRIVACY_POLICY` | Site privacy policy acknowledgment |
| `PERSONAL_DATA_CONSENT` | Consent to process personal data |
| `PERSONAL_DATA_DISTRIBUTION_CONSENT` | Consent to publish data in public protocols / distribution |

## Actions and sources

- Actions: `GRANTED` | `REVOKED`
- Sources: `PROFILE_UPDATE` | `REGISTRATION` | `REVOKE`

Events are append-style history (`PersonalConsentEvent`). Cabinet/`personal` module and registration flows collect checkboxes; Policy page renders legal copy.

Full Russian legal text: repo `policy.md`. Do not paste it into the wiki.

## Links

- Domain: [personal](../domains/personal.md)
- Front: shared personalConsent / Policy pages
