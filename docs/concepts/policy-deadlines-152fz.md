---
type: concept
updated: 2026-11-04
sources:
  - racing_manager_front/src/pages/PolicyPage/
  - Federal Law No. 152-FZ (as amended)
---

# Concept: Policy deadlines vs 152-FZ

Audit of time limits in PolicyPage legal copy against Federal Law No. 152-FZ. Russian UI text stays in source; this page is the English checklist.

Sources: `PrivacyPolicyContent.tsx`, `CookiesPolicyContent.tsx`, `DataDistributionConsentContent.tsx`, `PersonalDataConsentContent.tsx`.

## Verdict

No policy deadline exceeds a statutory maximum. Operator-chosen retention periods are within the operator’s discretion (must match stated purposes).

Shorter commitments are allowed; longer ones are not.

## Statutory action / response deadlines

| Policy clause | Deadline in copy | Norm | Status |
|---|---|---|---|
| Privacy 8.3; Cookies 8.4 | Answer subject request in 10 working days (+5 with motivated notice in Privacy) | Arts. 14, 20 | OK (Cookies omits +5; still within max) |
| Privacy 9.2 | Clarify inaccurate data in 7 working days | Art. 21(2) | OK |
| Privacy 9.2 | Stop unlawful processing in 3 working days; destroy in 10 if legality impossible | Art. 21(3) | OK |
| Privacy 9.3; §5.1–5.2 destroy | Stop + destroy after consent withdraw in 30 days | Art. 21(5) | OK |
| Privacy 9.5; §5 destroy after purpose | Destroy/de-identify within 30 days of purpose end | Art. 21(4) | OK |
| Privacy 7.2 | Breach notice to authority: 24h, then investigation results 72h | Art. 21(3.1) | OK |
| Privacy 9.4; Distribution 6.2 | Stop protocol publication in 3 working days | Art. 10.1(14) | OK as outer bound; see nuance |
| Distribution 5.2 | Publish subject prohibitions/conditions in 3 working days | Art. 10.1(10) | OK |

## Operator-defined retention (not fixed by 152-FZ maxima)

| Policy clause | Period | Note |
|---|---|---|
| Privacy 5.3 | 3 years after event | Purpose: protests / result confirmation (often aligned with civil limitation) |
| Privacy 5.6 | 3 years after consent revoke / account delete | Proof of consent |
| Privacy 5.7 | Tech logs ≤ 30 days | |
| Privacy 6.7 | Backups ≤ 14 days | |
| Cookies 5.3 | Consent cookie 6 months, then re-prompt | No fixed 152-FZ re-prompt period; 6–12 months common practice |

`PersonalDataConsentContent` has no numeric action deadlines; it defers to the privacy policy.

## Soft gaps (not illegal longer deadlines)

1. **Art. 20(3)** — when the subject supplies proof that data is illegally obtained or not needed for the stated purpose, destroy/correct within **7 working days**. Privacy 9.2 covers the Art. 21(3) path only.
2. **Art. 21(5.1)** — demand to **stop processing** (not the same as consent withdraw): **10 working days** (+5). Privacy states the 30-day consent-withdraw path (Art. 21(5)) but not this separate demand.
3. **Art. 10.1(13)** — for the operator who received distribution consent, consent ends **on receipt** of the demand; Art. 10.1(14)’s 3 working days applies to any person processing the distributed data. Copy that only says “within 3 working days” is a common template; tighter wording would note immediate cessation of consent plus technical takedown within 3 working days.

## Links

- Entity: [personal-consent](../entities/personal-consent.md)
- Domain: [personal](../domains/personal.md)
