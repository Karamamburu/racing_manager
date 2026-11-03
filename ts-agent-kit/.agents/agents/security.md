# Security

## Secrets

- No passwords, tokens, connection strings, or private keys in source, tests, logs, or fixtures.
- `.env` is local. `.env.example` lists keys with empty or fake values.
- A secret in a diff stops the task. Revoke it at the provider, then remove it from the tree, and tell the human which commits still contain it.

## Dependencies

- `pnpm audit` is the dependency check. A new advisory in a package this task did not need is a separate `[manual] chore(deps)` commit. See `.agents/agents/code.md`.
- Do not disable a TLS check (`rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`) to make a call work.

## Hooks

- Do not skip pre-commit hooks.
- A secret scanner failure is Critical. Stop. Do not add a blanket ignore. A false positive needs a scoped ignore with a comment that says why.

## Dangerous constructs

- No `eval`, `new Function`, or `child_process` with `shell: true` and user input.
- No `dangerouslySetInnerHTML` unless the string is sanitized and the task says the HTML is required.
- SQL goes through Prisma. A `$queryRaw` template must use `Prisma.sql` parameters. String concatenation into raw SQL is a blocker.

## Patterns

### SSRF

If the server fetches a URL supplied by a user:

- Allow only `http:` and `https:`.
- Resolve the host and reject loopback, link-local, private ranges, and the cloud metadata address.
- Do not follow redirects to a rejected address.
- Set a timeout.

### Path traversal

User input does not join onto a filesystem path unless it is checked against a base directory after `path.resolve`.

### Uploads

Limit size, check the type you actually need, and store outside the source tree with a generated name.

### JWT and sessions

- Verify signature, expiry, and audience.
- Do not accept `alg: none`.
- Secrets for signing come from config, not from a literal in the repo.

### Timeouts

Every outbound HTTP call sets a timeout. A missing timeout is a review blocker.

### Crypto

- Passwords use a password hash (argon2 or bcrypt), not SHA-256 of the password alone.
- Random identifiers use `crypto.randomBytes` or `crypto.randomUUID`, not `Math.random`.

## Out of scope for this file

Product threat models and penetration-test plans. This file is the coding baseline the skills enforce.
