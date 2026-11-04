---
type: package
updated: 2026-11-03
---

# Package: infra, nginx, observability

Ops and edge routing for Racing Manager.

## Local nginx

Path-based reverse proxy: SPA, `/api` → API, `/media` → storage. Details: `nginx/README.md`.

## Production / stage (`infra/`)

- Prod: typically two-host layout (data host with Postgres instances; app host with nginx TLS, front, API, CMS, Authentik).
- Stage: single-box Compose (`infra/stage/`).
- Auth IdP: Authentik (`infra/AUTHENTIK.md`).
- Backups: `infra/backups/` (pg_dump + optional S3 mirror).
- Access notes: `infra/ACCESS.md` (sensitive ops info—do not echo into chat casually).

## Observability

Logs stay in the Russian Federation (152-FZ). No external log shipper to foreign SaaS by default. See `observability/README.md`.

## Links

- [auth-session](../concepts/auth-session.md) · [local-dev](../concepts/local-dev.md) · [overview](../overview.md)
