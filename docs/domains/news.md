---
type: domain
updated: 2026-11-03
---

# Domain: news

## Responsibility

Public news catalog and admin create/update/delete + media upload.

## Public contracts

- `GET /news`, `GET /news/:id`
- `admin/news` — POST/PATCH/DELETE, `POST admin/news/media`
- HTML may embed `/media/...` paths

## Code

- API: `racing_manager_back/src/news/`, `storage/`
- Front: `features/news`, News pages/editor

## Breakage signals

- Media URL scheme changed (breaks stored HTML).
- Admin-only routes exposed or auth weakened.
- News body sanitization rules loosened unsafely.
