# Nginx reverse proxy

Path-based reverse proxy for Racing Manager. One public entry; front and API upstreams are set in `.env` so stage only needs different addresses.

## Routing

| Path | Upstream | Behavior |
|------|----------|----------|
| `/api/` | `UPSTREAM_API` | strips `/api` prefix (same as Vite) |
| `/media/` | `UPSTREAM_API` | full path forwarded |
| `/` | `UPSTREAM_FRONT` | SPA + front `/health` |

CMS (`:4100`) is not exposed — the API reaches it via `CMS_BASE_URL`.

## Setup

```bash
cp .env.example .env
docker compose up -d
```

Local defaults (apps on the host):

```env
UPSTREAM_FRONT=host.docker.internal:5173
UPSTREAM_API=host.docker.internal:4000
```

Public URL: http://localhost:8080

## Checks

With front (`5173`) and back (`4000`) running:

```bash
curl -sS http://localhost:8080/health
curl -sS http://localhost:8080/api/health
```

## Stage

Use the same compose and template. Only change upstreams in `.env`:

```env
UPSTREAM_FRONT=10.0.1.10:5173
UPSTREAM_API=10.0.1.11:4000
```

Then:

```bash
docker compose up -d
```

TLS is out of scope for now (HTTP on container port 80 → host `8080`).
