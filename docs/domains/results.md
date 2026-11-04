---
type: domain
updated: 2026-11-03
---

# Domain: results

## Responsibility

Upsert timing/results for a registration; category finishes on events; ranking helpers.

## Public contracts

- `PUT /events/:eventId/registrations/:registrationId/result`
- Event admin category finish endpoints under `admin/events`
- Ties to [Registration](../entities/registration.md) statuses (`FINISHED`, DNS/DNF/…)

## Code

- API: `racing_manager_back/src/results/`, parts of `events/`, `ranking/`

## Breakage signals

- Result payload shape or lap structure changed.
- Status transitions from results diverge from registration enum.
