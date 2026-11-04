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
- If they differ (`AUTH_DOMAIN` vs `DOMAIN`), the browser is sent to `https://AUTH_DOMAIN/logout-start`. Nginx starts Authentik's `default-invalidation-flow` (this ends the IdP session) and then redirects `/` back to the app. That return path is required because the flow drops `next` when it logs the user out, and Authentik would otherwise open its own login form.

## Admin UI exposure

Login flows must stay public. Restrict `/if/admin` later with nginx `allow`/`deny` if you want admin only from VPN/office IPs.

## Adding a new enrollment attribute (checklist)

When the API should receive a new claim from Authentik (same pattern as `consent` / `distribution_consent`), update **all three** places. Omitting the write policy leaves the claim stuck at the mapping default (`False`).

1. **Create Prompt** — Customization → Prompts: add the field (checkbox/text) with a stable field name, e.g. `distribution_consent`.
2. **Scope mapping `consent`** — Providers → property mappings (scope name `consent`): add the key to the returned dict so it is emitted on the ID token / userinfo when the API requests scope `consent`.
3. **Prompt stage** — add the new Prompt to `default-source-enrollment-prompt`.
4. **Write policy** — on stage `default-source-enrollment-write`, update policy `add-registration-data-to-attributes` so enrollment values are copied into `prompt_data["attributes.<name>"]` (booleans via a small helper). Without this, `request.user.attributes.get("<name>", False)` stays `False`.

### Example: scope mapping `consent`

```python
return {
    "distribution_consent": request.user.attributes.get("distribution_consent", False),
    "consent": request.user.attributes.get("consent", False),
    "first_name": request.user.attributes.get("first_name"),
    "last_name": request.user.attributes.get("last_name"),
    "birth_date": request.user.attributes.get("birth_date"),
    "gender": request.user.attributes.get("gender"),
}
```

### Example: policy `add-registration-data-to-attributes`

```python
prompt_data = request.context.get("prompt_data", {})
attrs = prompt_data.get("attributes") if isinstance(prompt_data.get("attributes"), dict) else {}

def pick(key):
    value = prompt_data.get(key)
    if value is None:
        value = attrs.get(key)
    return value

def as_bool(value):
    return value in (True, "true", "True", "on", "1", 1)

consent = pick("consent")
distribution_consent = pick("distribution_consent")
first_name = pick("first_name")
last_name = pick("last_name")
birth_date = pick("birth_date")
gender = pick("gender")

prompt_data["attributes.consent"] = as_bool(consent)
prompt_data["attributes.distribution_consent"] = as_bool(distribution_consent)
if first_name not in (None, ""):
    prompt_data["attributes.first_name"] = first_name
if last_name not in (None, ""):
    prompt_data["attributes.last_name"] = last_name
if birth_date not in (None, ""):
    prompt_data["attributes.birth_date"] = birth_date
if gender not in (None, ""):
    prompt_data["attributes.gender"] = gender

request.context["prompt_data"] = prompt_data
return True
```

### Verify

Register a **new** user with the field set. In Admin → User → Attributes the key must be `true` (or the expected value). Then confirm the API receives the claim (for distribution consent: a `PERSONAL_DATA_DISTRIBUTION_CONSENT` / `GRANTED` / `REGISTRATION` row).
