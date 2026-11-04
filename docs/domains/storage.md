---
type: domain
updated: 2026-11-03
---

# Domain: storage

## Responsibility

S3-compatible object storage (MinIO local / cloud) and media serving paths.

## Public contracts

- `GET /media/:prefix/:year/:month/:filename`
- Admin news media upload
- Env names: see `racing_manager_db/README.md` (S3_*)

## Code

- API: `racing_manager_back/src/storage/`
- Local: MinIO in `racing_manager_db`

## Breakage signals

- Public media URL prefix changed (breaks news HTML).
- Bucket/path-style config changed without redeploy notes.
