# Authentik (OIDC) — production

Authentik runs on the **app** host (`authentik_server` / `authentik_worker`) and stores data in **Postgres on the data host** (`racing_manager_authentik_db` on private port `5434`).

Public entry: `https://AUTH_DOMAIN` (proxied by nginx). Do not publish Authentik ports on the host.

## First boot

1. Start data compose, then app compose (HTTP mode is fine).
2. Open `https://AUTH_DOMAIN/` (or `http://` before certs) and complete the initial setup wizard (akadmin password).
3. Create an OAuth2/OpenID Provider + Application:

| Field | Value |
|-------|--------|
| Application slug | `racing-manager` (must match `OIDC_APP_SLUG`) |
| Redirect URI | `http(s)://DOMAIN/api/auth/callback` (match `PUBLIC_SCHEME`) |
| Client type | Confidential |
| Signing key | default authentik self-signed (or your cert) |

4. Copy Client ID / Client Secret into `infra/app/.env` as `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET`.
5. Restart API: `docker compose up -d api`.

Issuer URL used by the API (scheme follows `PUBLIC_SCHEME` in app `.env`):

```text
http(s)://AUTH_DOMAIN/application/o/OIDC_APP_SLUG/
```

## Logout / login redirects

Configured on the API container (same scheme as `PUBLIC_SCHEME`):

- `POST_LOGIN_REDIRECT_URI=<scheme>://DOMAIN/`
- `POST_LOGOUT_REDIRECT_URI=<scheme>://DOMAIN/`

Logout destroys the app session, then:

- If Authentik and the app share a hostname (local `localhost`), the API returns to `POST_LOGOUT_REDIRECT_URI` and clears Authentik cookies on that host.
- If they differ (`AUTH_DOMAIN` vs `DOMAIN`), the browser is sent to Authentik's `default-invalidation-flow`, which ends the IdP session. Nginx on `AUTH_DOMAIN` serves `/logout-return` and sends the browser back to the app. Do not proxy that path to Authentik.

## Admin UI exposure

Login flows must stay public. Restrict `/if/admin` later with nginx `allow`/`deny` if you want admin only from VPN/office IPs.
