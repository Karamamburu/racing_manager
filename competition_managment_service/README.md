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

## Organizer cycle: propose, edit, confirm

The service suggests a knockout grid for the actual field. An administrator can accept it or add/remove a round (for example drop 1/4 and run two larger 1/2 heats) **before start lists** and again **after results, before advance**.

Typical flow:

1. `POST /v1/plans/propose` with `{ "participantCount": 24 }` — or create a competition without `presetId`/`format` and the same planner runs from the entry list.
2. Optionally `PUT /v1/competitions/:id/plan` with `{ "removeStageIds": ["qf"] }` (or a full `format`) while the competition is still `DRAFT`.
3. Seed and record the prologue.
4. `GET /v1/competitions/:id/stages/prologue/proposal` — remaining grid from the number of OK finishers.
5. Optionally `PUT /v1/competitions/:id/plan` again (drop 1/4, raise 1/2 `heatSize`).
6. `POST .../advance` uses the confirmed snapshot. A one-off `routes` override still works.

Planner defaults: preferred heat size **6**, max **8**. Rounds exist only while they keep heats at that size:

- 5 → prologue + one final
- 12 → prologue, 2×1/2, Final A/B (no 1/4)
- 17 → prologue, 3×1/4 (6/6/5), 2×1/2, Final A/B
- 24 → prologue, 4×1/4, 2×1/2, Final A/B
- 48 → prologue, 1/8, 1/4, 1/2, Final A/B

Dropping 1/4 after a 24-person proposal rewires prologue → 1/2 and raises semifinal `heatSize` to 12 so two heats remain.

## Compute API (stateless)

- `GET /health`
- `GET /v1/presets` / `GET /v1/presets/:id`
- `POST /v1/formats/validate`
- `POST /v1/plans/propose` — `{ participantCount, preferredHeatSize?, maxHeatSize?, includePrologue?, includeFinalB? }`
- `POST /v1/plans/revise` — `{ format, participantCount, removeStageIds?, addStages?, patchHeats? }`
- `POST /v1/stages/start-lists`
- `POST /v1/stages/advance`

## Persisted competitions

- `POST /v1/competitions` — `{ name?, participants, presetId? | format? }` plus optional planner fields. If neither `presetId` nor `format` is sent, the service proposes a grid from `participants.length`.
- `GET /v1/competitions/:id`
- `GET /v1/competitions/:id/plan` — current snapshot plus per-stage rationale (expected field and heat sizes)
- `PUT /v1/competitions/:id/plan` — `{ format }` and/or `{ removeStageIds, addStages, patchHeats }`. In `DRAFT` the whole graph can change; after the first seed only **PENDING** remaining stages can be added or removed. `SEEDED` / `COMPLETED` stages stay.
- `GET /v1/competitions/:id/stages/:stageId/proposal` — after results, before advance
- `POST /v1/competitions/:id/stages/:stageId/start-lists` — optional `{ manualHeats }`
- `POST /v1/competitions/:id/stages/:stageId/advance` — optional `{ routes }` so the judge can still choose how many advance and to which stage

Heats follow the field: `heatSize` is a cap, the number of heats is `ceil(n / heatSize)` (and never more than `n`). A template of 4×6 still works for 20 people (4 heats of 5) or 10 (2 heats of 5).

Judge override example after a 20-person prologue (if the plan was not edited first):

```json
{
  "routes": [
    { "cut": { "type": "TOP_N", "n": 12 }, "toStageId": "sf" }
  ]
}
```

If `routes` is omitted, the **confirmed** format is used (planner default is `TOP_N` into the next round, not a hard 50%).

The `knockout-24` preset remains a 24-person template. Prefer the planner for an arbitrary field.

If the volume already exists from an earlier schema:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_place_only.sql
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_flexible_field.sql
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/migrate_eighthfinal.sql
npx prisma generate
```

Example — let the service propose a grid for four riders:

```bash
curl -sS -X POST http://localhost:4100/v1/competitions \
  -H 'Content-Type: application/json' \
  -d '{"name":"Sprint","participants":[{"id":"p1","seed":1},{"id":"p2","seed":2},{"id":"p3","seed":3},{"id":"p4","seed":4}]}'
```

Drop quarterfinals on a 24-person draft:

```bash
curl -sS -X PUT http://localhost:4100/v1/competitions/$ID/plan \
  -H 'Content-Type: application/json' \
  -d '{"removeStageIds":["qf"]}'
```
