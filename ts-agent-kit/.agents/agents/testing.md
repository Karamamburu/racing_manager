# Testing rules

API tests run on Jest. Web tests run on Vitest and Testing Library. Do not use the API test runner to render React, or the web runner to boot Nest.

## Unit tests

- Fast, no network, no PostgreSQL, no shared mutable state between tests.
- Do not boot the HTTP server in a unit test.
- Prefer a fake repository over `jest.mock` / `vi.mock` of the module under test.

```ts
class FakeLinkRepository {
  private readonly rows = new Map<string, Link>();

  async add(link: Link): Promise<Link> {
    this.rows.set(link.code, link);
    return link;
  }

  async findByCode(code: string): Promise<Link | null> {
    return this.rows.get(code) ?? null;
  }
}
```

- The fake matches the real method signatures, including `null` when the row is missing.
- Assert the result and the stored state. Do not assert "the mock was called" as the only check.
- Cover the happy path, the edges (`""`, `0`, `null`, whitespace), the error path, and a regression for each bug you fix.
- Names start with `test` or `it` and say the behavior: `it("rejects a file URL")`.

Web unit tests mock `apps/web/src/api/` client functions. They do not mock Prisma, because the web app does not have it.

## Integration tests

- The path is HTTP, service, repository, PostgreSQL.
- Use supertest against the Nest app.
- Apply migrations to the test database before the suite (`prisma migrate deploy`).
- Isolate rows. Prefer a transaction that rolls back per test, or truncate the touched tables in a fixture that runs before and after each test. A passing test must not depend on order.
- Assert status, JSON, and the row when the behavior is a write.
- Do not follow redirects unless the test is about the redirect target. Assert `Location` on the redirect response.

## Web tests

- Testing Library queries by role, label, or text. Avoid container queries that break when markup shifts without a behavior change.
- Assert what the user sees and what the API client was asked to send.

## Coverage

- A test task names its scope: one module, or the app.
- Unit scope for a service aims at 100% branch coverage of that module.
- The project threshold lives in the Jest config (`coverageThreshold`) and the Vitest config. The number may stay or rise. It may not fall.
- Forbidden ways to go green: `skip`, `xit`, `it.todo` left in the diff, deleting an assertion, `/* istanbul ignore */`, or excluding the file you just made risky.
- Record the command, the commit, the passed count, and the branch percentage in the task note when the skill asks for a coverage proof.

## A green run is not proof of the behavior

For parse, scrape, import, or transform work, compare the output to an independent expected count or fixture. "The function returned without throwing" and "the array is non-empty" both pass when data was dropped. A metric that compares the result to the same truncated input stays green while the bug is live.

For a data bug, run the real path (HTTP, service, real source or a fixture that is not the code under test) and compare the count before calling the task done.
