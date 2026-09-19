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
- `POST /v1/competitions/:id/stages/:stageId/advance` — optional `{ routes }` so the judge can choose how many advance and to which stage (for example skip 1/4 and send 12 straight to 1/2)

Heats follow the field: `heatSize` is a cap, the number of heats is `ceil(n / heatSize)` (and never more than `n`). A template of 4×6 still works for 20 people (4 heats of 5) or 10 (2 heats of 5).

Judge override example after a 20-person prologue:

```json
{
  "routes": [
    { "cut": { "type": "TOP_N", "n": 12 }, "toStageId": "sf" }
  ]
}
```

If `routes` is omitted, the format default is used (knockout-24: top 50% into 1/4).

If the volume already exists from an earlier schema:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_place_only.sql
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_flexible_field.sql
npx prisma generate
```

Example (after `docker compose up -d`):

```bash
curl -sS -X POST http://localhost:4100/v1/competitions \
  -H 'Content-Type: application/json' \
  -d '{"name":"Sprint","presetId":"knockout-24","participants":[{"id":"p1","seed":1},{"id":"p2","seed":2},{"id":"p3","seed":3},{"id":"p4","seed":4}]}'
```
