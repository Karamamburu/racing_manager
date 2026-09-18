# Racing Manager DB

Postgres schema lives in `db/init.sql`. Docker Compose applies it only on the **first** start of an empty volume.

Local object storage is MinIO (S3-compatible). The API listens on `localhost:9100` so it does not clash with Authentik on `9000`. Console: `http://localhost:9101`.

```bash
docker compose up -d
```

To switch the backend to a Russian cloud S3 later, keep the same env names in `racing_manager_back/.env` and point them at the provider. News HTML stores `/media/...` paths, so existing articles stay valid.

```
S3_ENDPOINT=https://storage.yandexcloud.net
S3_REGION=ru-central1
S3_BUCKET=your-bucket
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_BASE_URL=https://storage.yandexcloud.net/your-bucket
S3_CREATE_BUCKET=false
S3_PUBLIC_READ=false
```

Timestamps are stored as `TIMESTAMPTZ` and shown in `Europe/Moscow` (`UTC+3`). Set this on an existing cluster:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_moscow_timezone.sql
```

Then restart the container so new sessions pick up `timezone=Europe/Moscow`.

If the database already exists, apply SQL patches from `db/migrate_*.sql`. For participation formats:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_event_formats.sql
```

For event status `IN_PROGRESS`:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_event_status.sql
```

For registration statuses `DNS`, `DNF`, `QQ`, `DSQ`:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_registration_status.sql
```

For event laps and split times:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_laps.sql
```

For personal data consent documents and grant/revoke events:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_personal_consent.sql
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_personal_data_consent_document.sql
```

For one active guest registration per person (name + birth year) on an event. Logged-in users are unique by `user_id` only.

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_person_unique.sql
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_guest_person_unique.sql
```

For an optional nakarte.me track link on an event:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_event_map_link.sql
```

For track-scoped news articles:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_news.sql
```

## Roles

Participants have no rows in `user_roles`. Admin roles are granted in SQL after the person has logged in once (Authentik creates the `users` row).

| Code | Meaning |
|---|---|
| `ADMINISTRATOR` | Full admin (track + events + registrations + news) |
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
    laps: [
      { lapNumber: 1, distanceKm: 2.5 },
      { lapNumber: 2, distanceKm: 2.5 },
      { lapNumber: 3, distanceKm: 2.5 },
    ],
    description: 'Контрольная тренировка',
    registrationOpen: '2026-11-01T09:00:00.000Z',
    registrationClose: '2026-12-05T21:00:00.000Z',
  }),
}).then((r) => r.json()).then(console.log)
```

`eventType`: `RACE` (default) or `TIME_TRIAL`. `sport`: `RUN`, `SKI`, `ROLLER_SKI`, `BIKE`.
`formatIds`: required for SKI and ROLLER_SKI (catalog from `GET /participation-formats?sport=SKI`). Omit or send `[]` for RUN and BIKE.
`laps`: required. Numbered from 1. `events.distance_km` is the sum of lap distances.

Results for an event with laps: `PUT /events/:eventId/registrations/:registrationId/result` with `{ laps: [{ lapNumber: 1, timeMilliseconds: 123000 }] }`. The finish time is the sum of recorded laps and is not set directly.

## News

Public catalog: `GET /news`, `GET /news/:id`. Optional `?trackId=` filter.

Create / update / delete: `ADMINISTRATOR` only. Images and videos from the editor go to S3 via `POST /admin/news/media` (`multipart/form-data` field `file`). The editor inserts a stable `/media/...` URL. `GET /media/*` redirects to the configured S3 public URL.

```js
fetch('/api/admin/news', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    trackId: '3d8f1a62-7c4e-4b91-9e2a-0b6c8d4e1f20',
    title: 'Сезон в Алёшкино открыт',
    body: '<h2>Старт сезона</h2><p>Контрольные тренировки продолжаются.</p>',
  }),
}).then((r) => r.json()).then(console.log)
```

Active tracks for the news form: `GET /tracks`.

