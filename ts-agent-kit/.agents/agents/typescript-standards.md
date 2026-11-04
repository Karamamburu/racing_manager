# TypeScript standards

`strict` is on in every `tsconfig.json` that this kit governs. `pnpm typecheck` is `tsc --noEmit` for `apps/api` and `apps/web`.

Cite a rule as `§N` in review comments.

## §1. Types

Annotate exported functions, public methods, and DTO fields. Let inference stand for obvious locals.

```ts
// missing a return type on an exported function
export function createLink(url: string) {
  return { url };
}

// exported contract is explicit
export function createLink(url: string): Link {
  return { url, code: newCode() };
}
```

- `unknown` for untrusted input. Narrow it before use. `any` is forbidden without written approval.
- `T | null` is a value. `T | undefined` is absence. Do not mix them in one field to mean the same thing.
- Discriminated unions for results and domain errors, with a literal `kind` (or `status`) on every member.
- No `!` non-null assertions on values that came from I/O. Check, then use.
- `@ts-ignore` and `@ts-expect-error` need written approval and a comment that names the reason.

## §2. Values and DTOs

- A domain type is a TypeScript type or class with no Nest HTTP imports and no `PrismaClient`.
- A DTO is the HTTP boundary (`class-validator` on the API, a typed response on the client). Do not return `Record<string, unknown>` from a controller as the public contract.
- `as` casts at the boundary are a smell. Parse with a validator or a type guard.

## §3. Errors

```ts
try {
  await repo.save(link);
} catch {
  // swallowed
}

try {
  await repo.save(link);
} catch (error: unknown) {
  throw new LinkPersistError(code, { cause: error });
}
```

- Catch a type you can handle, or rethrow. Do not catch `unknown` and continue as if the call succeeded.
- Do not return `null` to hide a failure that the caller cannot distinguish from "not found".
- Fail fast on invalid input. Do not store a broken value and hope a later layer notices.

## §4. SOLID

- One module, one reason to change. A link service does not send mail.
- Depend on a repository interface the service can take in its constructor. The Nest provider binds the Prisma implementation.
- A fake repository used in tests must honor the same return types, including `null` for a missing row.

## §5. Async

The API is async end to end. Controllers, services, and repositories `await` Prisma and outbound I/O.

- Do not call a sync blocking client (`readFileSync` on the request path, a sync HTTP client) inside an async handler.
- `Promise.all` is for independent calls that may all fail together only if you handle the rejection. Prefer `Promise.allSettled` when partial success is the requirement.
- Every outbound call has a timeout, including cleanup (`disconnect`, `abort`) in `finally`.

## §6. Simplicity

- The simplest code that meets the requirement. A second abstraction appears when a second real caller exists.
- If a function name wants "and", split it.
- A comment that explains what the next line does is a sign the line should be clearer. Comments explain why.

## §7. DRY

- One place for a business rule. Two similar blocks with different meaning stay separate. Do not merge them into one function with five flags.

## §8. Names and constants

- `camelCase` for functions and variables, `PascalCase` for types and classes, `UPPER_SNAKE_CASE` for constants.
- No magic numbers. A timeout, a limit, a retry count is a named constant.

```ts
const MAX_CODE_ATTEMPTS = 5;
```

## §9. Function arguments

- No mutable default (`options: string[] = []` shares one array). Default to `undefined` and create the array inside the function.
- A long parameter list becomes a typed object.

## §10. Public contracts

- Adding a response field is allowed when it is optional and old clients still work.
- Renaming, removing, or changing the meaning of a response field, or changing an existing status code, stops the task until the human confirms a breaking change.
