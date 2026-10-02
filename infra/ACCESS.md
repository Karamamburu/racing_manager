# Server access

Production hosts and how to reach them. SSH/RDP to **app** and **data** only via the **jump** bastion — do not open ports `22` / `3389` to the internet on those hosts.

```text
Mac ──SSH──► jump (78.40.217.232)
               ├──SSH/RDP──► app  (77.91.95.235)
               └──SSH/RDP──► data (141.105.68.153)

Internet ──80/443──► app
app ──5432/5433/5434──► data
Internet ──✗──► app/data :22 :3389 ; data :5432…5434
```

## Inventory

| Alias | Role | Public IP | Linux user |
|-------|------|-----------|------------|
| `jump` | Bastion (SSH entry only) | `78.40.217.232` | `karamamburu` |
| `app` | nginx, front, API, CMS, Authentik | `77.91.95.235` | `karamamburu` |
| `data` | Postgres ×3 | `141.105.68.153` | `karamamburu` |

Key: `~/.ssh/id_ed25519` (same key on Mac and authorized on all three hosts).

## Local SSH config

Put this in `~/.ssh/config` on your machine (do not commit private keys into the repo):

```sshconfig
Host jump
  HostName 78.40.217.232
  User karamamburu
  IdentityFile ~/.ssh/id_ed25519

Host app
  HostName 77.91.95.235
  User karamamburu
  ProxyJump jump
  IdentityFile ~/.ssh/id_ed25519

Host data
  HostName 141.105.68.153
  User karamamburu
  ProxyJump jump
  IdentityFile ~/.ssh/id_ed25519
```

Connect:

```bash
ssh jump
ssh app
ssh data
```

Without aliases: `ssh -J karamamburu@78.40.217.232 karamamburu@77.91.95.235`.

## Firewall expectations (ufw)

### jump

- Allow SSH (`22`) from your admin IPs (or broader if your egress IP changes often).
- This is the only host that should accept admin SSH from outside the private set.

### app

| Allow | From |
|-------|------|
| `22`, `3389` | `78.40.217.232` (jump) only |
| `80`, `443` | anywhere |

### data

| Allow | From |
|-------|------|
| `22`, `3389` | `78.40.217.232` (jump) only |
| `5432`, `5433`, `5434` | `77.91.95.235` (app) only |

Example on **app** (run over an existing session; verify a second login via jump before closing):

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 78.40.217.232 to any port 22 proto tcp comment 'ssh-from-jump'
sudo ufw allow from 78.40.217.232 to any port 3389 proto tcp comment 'rdp-from-jump'
sudo ufw allow 80/tcp comment 'http'
sudo ufw allow 443/tcp comment 'https'
sudo ufw enable
sudo ufw status numbered
```

On **data**, same SSH/RDP-from-jump rules, plus:

```bash
sudo ufw allow from 77.91.95.235 to any port 5432 proto tcp comment 'postgres-main'
sudo ufw allow from 77.91.95.235 to any port 5433 proto tcp comment 'postgres-cms'
sudo ufw allow from 77.91.95.235 to any port 5434 proto tcp comment 'postgres-authentik'
```

Safe rollout: add jump rules first, test `ssh app` / `ssh data`, then delete any leftover `Anywhere` rules for `22`/`3389`.

Lockout recovery: provider VNC/serial console → temporarily `sudo ufw allow 22/tcp` or `sudo ufw disable`, fix rules, re-test via jump.

## Beekeeper (Postgres not public)

Tunnel via **jump → app**; the DB connection originates from the app IP:

```bash
ssh -L 15432:141.105.68.153:5432 app
# optional extra forwards:
#   -L 15433:141.105.68.153:5433
#   -L 15434:141.105.68.153:5434
```

In Beekeeper: Host `127.0.0.1`, Port `15432` (or `15433` / `15434`). Credentials from `infra/data/.env` on the data host (not committed).

## RDP

If Ubuntu Desktop / xrdp is enabled, connect to **app** or **data** only after reaching the network path that ufw allows (typically via jump / VPN, not directly from the public internet). Prefer SSH for day-to-day work.

## Related

- Rental / sizing checklist: [VPS.md](VPS.md)
- Example script (generic): [scripts/firewall.sh](scripts/firewall.sh)
