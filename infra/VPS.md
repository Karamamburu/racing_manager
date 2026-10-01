# VPS rental checklist (year 1)

Rent two VPS in the **same region** with a **private network** (or VPC). Do not expose DB/MinIO ports on the public NIC.

## Specs

| Host | Role | vCPU | RAM | Disk | Public ports |
|------|------|------|-----|------|--------------|
| **jump** | Bastion (SSH entry) | 1–2 | 1–2 GB | 20 GB | 22 (admin) |
| **app** | nginx TLS, front, API, CMS, Authentik, Alloy | 4 | 8 GB | 40–60 GB SSD | 80, 443; 22/3389 from jump only |
| **data** | Postgres ×3 (main, CMS, Authentik), MinIO, Alloy (DB logs) | 2 | 4 GB | 80–160 GB SSD | 22/3389 from jump; DB/MinIO only from app |

Optional **stage**: one VPS 2–4 vCPU / 4–8 GB / 60 GB — use [`stage/`](stage/).

Providers that work well: Hetzner, Selectel, Timeweb, Yandex Cloud. Prefer the region closest to users (MSK/SPB or nearby EU).

## After create

1. Note public IPs and **private IPs** (`DATA_PRIVATE_IP`, `APP_PRIVATE_IP`).
2. Install Docker Engine + Compose plugin on both hosts.
3. Configure access + firewall per **[ACCESS.md](ACCESS.md)** (jump bastion; SSH/RDP to app/data only from jump). Never enable ufw without jump-sourced **22** (and **3389** if RDP) already allowed.
4. Copy [`data/`](data/) to the data host and [`app/`](app/) to the app host (or clone this repo).
5. Fill `.env` from each `.env.example` (`DATA_HOST` = data private IP, or public IP of data if there is no private net).
6. Start **data** first, then **app** (see [README.md](README.md)).

## Firewall (ufw)

Production rules, SSH aliases, Beekeeper tunnels: **[ACCESS.md](ACCESS.md)**.

Generic template (edit IPs before use): [`scripts/firewall.sh`](scripts/firewall.sh). Prefer manual rules matching ACCESS.md over opening admin ports to `0.0.0.0/0`.

## Network sketch

```
Mac ──SSH──► jump ──SSH──► app / data
Internet ──► app:80/443 (nginx)
               │
               ├── front / api / cms / authentik (localhost docker net)
               │
               └── (restricted) ──► data:5432,5433,5434,9000
```

## Checklist

- [ ] jump VPS created (bastion)
- [ ] app VPS created (4/8, 40–60 GB)
- [ ] data VPS created (2/4, 80–160 GB)
- [ ] Private network / VPC attached (or firewall restricts DB to app IP)
- [ ] `~/.ssh/config` with ProxyJump (see [ACCESS.md](ACCESS.md))
- [ ] Firewall: app/data admin only from jump; DB only from app
- [ ] `ssh app` / `ssh data` verified before removing broad `22` rules
- [ ] Docker installed on app and data
- [ ] DNS A records: apex (or `www`), `auth`, `media` → app public IP
