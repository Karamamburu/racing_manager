---
type: package
updated: 2026-11-03
---

# Package: racing_manager_back

Main NestJS API for Racing Manager.

## Stack

NestJS 11, Prisma 6 → Postgres, express-session, openid-client (Authentik), nestjs-pino, AWS S3 SDK (MinIO/Timeweb), multer, sanitize-html.

Prisma client output: `generated/prisma`. Schema: `prisma/schema.prisma`.

## Modules (`src/`)

| Module | Responsibility |
|---|---|
| `auth` | OIDC + session, role guards |
| `users` | Upsert from OIDC profile |
| `personal` | Profile update, stats, consent |
| `admin` | Admin ping / gates |
| `events` | CRUD, catalog, formats, status sync |
| `registrations` | Create/update/status (user + guest) |
| `class-competitions` | CMS client + heat/qualify orchestration |
| `results` | Result upsert |
| `tracks`, `news`, `main`, `storage` | Catalogs, content, S3 media |
| `health`, `logging`, `prisma`, `time`, `ranking` | Cross-cutting |

Pattern today: `*.module.ts` / `*.controller.ts` / `*.service.ts` (+ parse helpers). Kit layer law prefers Repository; product may still call Prisma from services—prefer converging when touching a module.

## Public surface (selected)

- `GET/… auth/*` — session, login, register, callback, logout
- `GET/PATCH personal`
- `GET events`, `GET events/:id`; admin under `admin/events`
- `events/:eventId/registrations/*`
- `events/:eventId/class-competitions/*`
- `events/:eventId/registrations/:registrationId/result`
- `tracks`, `news`, `admin/news`, `media/...`, `health`

CMS is called via `CMS_BASE_URL`; not exposed as the public site API.

## Links

- [data-model](../concepts/data-model.md) · [auth-session](../concepts/auth-session.md) · [cms](cms.md)
