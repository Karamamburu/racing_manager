# VPS rental checklist (year 1)

Rent two VPS in the **same region** with a **private network** (or VPC). Do not expose DB/MinIO ports on the public NIC.

## Specs

| Host | Role | vCPU | RAM | Disk | Public ports |
|------|------|------|-----|------|--------------|
| **app** | nginx TLS, front, API, CMS, Authentik, Alloy | 4 | 8 GB | 40–60 GB SSD | 22, 80, 443 |
| **data** | Postgres ×3 (main, CMS, Authentik), MinIO, Alloy (DB logs) | 2 | 4 GB | 80–160 GB SSD | 22 only |

Optional **stage**: one VPS 2–4 vCPU / 4–8 GB / 60 GB — use [`stage/`](stage/).

Providers that work well: Hetzner, Selectel, Timeweb, Yandex Cloud. Prefer the region closest to users (MSK/SPB or nearby EU).

## After create

1. Note public IPs and **private IPs** (`DATA_PRIVATE_IP`, `APP_PRIVATE_IP`).
2. Install Docker Engine + Compose plugin on both hosts.
3. Open firewall:
   - **app**: TCP 22 (admin IP), 80, 443
   - **data**: TCP 22 (admin IP); from `APP_PRIVATE_IP` only: `5432` (main), `5433` (cms), `5434` (authentik), `9000` (MinIO API)
4. Copy [`data/`](data/) to the data host and [`app/`](app/) to the app host (or clone this repo).
5. Fill `.env` from each `.env.example` (`DATA_HOST` = data private IP on the app host).
6. Start **data** first, then **app** (see [README.md](README.md)).

## Network sketch

```
Internet ──► app:80/443 (nginx)
               │
               ├── front / api / cms / authentik (localhost docker net)
               │
               └── private net ──► data:5432,5433,5434,9000
```

## Checklist

- [ ] app VPS created (4/8, 40–60 GB)
- [ ] data VPS created (2/4, 80–160 GB)
- [ ] Private network / VPC attached to both
- [ ] Firewall rules applied
- [ ] Docker installed on both
- [ ] DNS A records: apex (or `www`), `auth`, `media` → app public IP
