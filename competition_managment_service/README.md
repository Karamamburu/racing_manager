# Competition management service

Sport-agnostic engine for stages, heats, seeding, and advancement, with optional persistence in Postgres 16.

## Database

Postgres is a separate Compose stack (port **5434**, so it does not clash with racing_manager on 5433). Schema in `db/init.sql` is applied only on the first start of an empty volume.

```bash
cp env.example .env
docker compose up -d
npx prisma generate
npm run start:dev
```

`DATABASE_URL` in `.env` must match the Compose credentials.

## Compute API (stateless)

- `GET /health`
- `GET /v1/presets` / `GET /v1/presets/:id`
- `POST /v1/formats/validate`
- `POST /v1/stages/start-lists`
- `POST /v1/stages/advance`

## Persisted competitions

- `POST /v1/competitions` — `{ name?, presetId? | format, participants }`
- `GET /v1/competitions/:id`
- `POST /v1/competitions/:id/stages/:stageId/start-lists` — optional `{ manualHeats }`
- `PUT /v1/competitions/:id/stages/:stageId/results` — `{ heatResults }` with `{ participantId, status, place }` (place is required for `OK`; the caller owns times)

If the volume already exists from an earlier schema:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_place_only.sql
npx prisma generate
```
- `POST /v1/competitions/:id/stages/:stageId/advance`

Example (after `docker compose up -d`):

```bash
curl -sS -X POST http://localhost:4100/v1/competitions \
  -H 'Content-Type: application/json' \
  -d '{"name":"Sprint","presetId":"knockout-24","participants":[{"id":"p1","seed":1},{"id":"p2","seed":2},{"id":"p3","seed":3},{"id":"p4","seed":4}]}'
```
