# Racing Manager DB

Postgres schema lives in `db/init.sql`. Docker Compose applies it only on the **first** start of an empty volume.

If the database already exists, apply SQL patches from `db/migrate_*.sql`. For participation formats:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_event_formats.sql
```

For one active guest registration per person (name + birth year) on an event. Logged-in users are unique by `user_id` only.

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_person_unique.sql
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_guest_person_unique.sql
```

## Roles

Participants have no rows in `user_roles`. Admin roles are granted in SQL after the person has logged in once (Authentik creates the `users` row).

| Code | Meaning |
|---|---|
| `ADMINISTRATOR` | Full admin (track + events + registrations) |
| `ORGANIZER` | Events and registrations on Алёшкино |

Grant:

```sql
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
CROSS JOIN roles r
WHERE u.email = 'you@example.com'
  AND r.code = 'ADMINISTRATOR'
ON CONFLICT DO NOTHING;
```

Revoke:

```sql
DELETE FROM user_roles ur
USING users u, roles r
WHERE ur.user_id = u.id
  AND ur.role_id = r.id
  AND u.email = 'you@example.com'
  AND r.code = 'ADMINISTRATOR';
```

Check without UI: sign in, then `GET /admin/ping` (session cookie required). `403` means the user is logged in but has no admin role yet.

## Create an event

`POST /admin/events` — `ADMINISTRATOR` or `ORGANIZER`. Track is always Алёшкино.

From the frontend origin (`http://localhost:5173`):

```js
fetch('/api/admin/events', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'КТ Алёшкино',
    eventType: 'TIME_TRIAL',
    sport: 'SKI',
    formatIds: [1, 2],
    eventDate: '2026-12-06',
    distanceKm: 10.5,
    description: 'Контрольная тренировка',
    registrationOpen: '2026-11-01T09:00:00.000Z',
    registrationClose: '2026-12-05T21:00:00.000Z',
  }),
}).then((r) => r.json()).then(console.log)
```

`eventType`: `RACE` (default) or `TIME_TRIAL`. `sport`: `RUN`, `SKI`, `ROLLER_SKI`, `BIKE`.
`formatIds`: required for SKI and ROLLER_SKI (catalog from `GET /participation-formats?sport=SKI`). Omit or send `[]` for RUN and BIKE.

