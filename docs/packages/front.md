---
type: package
updated: 2026-11-03
---

# Package: racing_manager_front

Public SPA for Racing Manager.

## Stack

React 19, Vite 7, TypeScript, Ant Design 5, React Router 7, TanStack Query, Zustand, Axios, Jodit (news), DOMPurify, cookieconsent.

## Layout

```text
src/
  pages/       # route screens
  features/    # domain services + React Query hooks
  shared/      # ApiClient, layout, theme, consent helpers
```

**Pages:** Main, Calendar, Event, Tracks/Track, News (+ editor), Cabinet, Policy.

**Features:** auth, events, registrations, personal, tracks, news, class-competitions, main.

**Shared:** `shared/api/ApiClient.ts`, AppShell, cookie/personal consent, query client, date/status helpers.

## Routes (see `src/App.tsx`)

`/`, `/cabinet`, `/calendar`, `/tracks`, `/news`, `/events/:id`, `/policy`, and related nested/editor routes.

## Rules of thumb

- HTTP only through the shared API client.
- Business rules that already live in the API must not be reimplemented in the UI.
- No Prisma, no secrets in the front.

## Links

- [overview](../overview.md) · [auth-session](../concepts/auth-session.md) · [domains](../INDEX.md)
