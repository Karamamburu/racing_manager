---
name: react-feature
description: >
  Builds a React feature in apps/web test-first: API client, hook, then
  component, using Testing Library. Use when adding user-visible UI behavior
  that calls the Nest API. Do not use for API-only work (nest-feature) or for
  business rules that the API already owns.
owner: tbd
freedom: guided
last_reviewed: 2026-10-28
---

# Skill: React feature

## 1. When

- **Use when** the user should see or do something new in `apps/web`.
- **Do not use** for API-only work (`nest-feature`) or for a rule that must be enforced even when the UI is bypassed. That rule belongs in the Nest service. The UI may repeat a check for feedback. It is not the source of truth.

## 2. Inputs

- Stop if this is new behavior and `specs/<feature>-ears.md` is missing or `.planning/STATE.md` has no active wave. Run `spec-kit-ears` and `open-gsd-pipeline` first. Do not write those files here.
- The HTTP contract exists or is specified: method, path, request body, response body, error statuses.
- If both apps change in one task, `feature` runs `nest-feature` first so the contract is real before the client is written.
- You have read `.agents/agents/architecture.md` and `.agents/agents/testing.md`.

## 3. Steps

### Phase 1: Contract

1. Name the endpoint and the types the client will send and receive.
2. Put those types next to the client function in `apps/web/src/api/`. Do not import Prisma types into the web app.

### Phase 2: Red test

1. Write a Testing Library test under the feature folder.
2. Query by role, label, or text.
3. Run the test. It must fail because the UI does not do the thing yet.

### Phase 3: Client

1. Add a function in `apps/web/src/api/` that performs the HTTP call and returns a typed result.
2. The test for that function asserts the request payload (method, path, body), not only a 200.

### Phase 4: Hook and component

1. A hook owns the request state (idle, loading, error, success).
2. The component renders that state. It does not call `fetch` directly.
3. No secrets, no database URLs, and no business rule that contradicts the API.

### Phase 5: Verify

1. `pnpm --filter web test` (or the repo's web test script) is green.
2. If a coverage threshold exists for the web app, do not lower it.

## 4. Outputs

- API client function, hook, component, and a Testing Library test.
- No edits under `apps/api` unless `feature` or `nest-feature` is also in scope and says so.

## 5. Definition of done

1. `pnpm lint`, `pnpm format:check`, and `pnpm typecheck` return 0.
2. Web tests return 0.
3. The test shows the payload the client sends for the happy path and the message the user sees on the error status the API returns.

## 6. Stop and rollback

- If the UI needs a contract the API does not have, stop and switch to `nest-feature` (or `feature`). Do not fake the response in the component and call the feature done.
- If the test only passes by querying a CSS class or a test id that the user never sees, rewrite the query. Do not weaken the assertion.
- No Prisma and no server secrets in `apps/web`.
