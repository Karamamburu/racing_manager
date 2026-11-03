# Logging rules

Use one structured logger for `apps/api`, configured at startup (Nest's logger wired to pino, or pino directly). Do not add a second logging stack in a feature.

## Rules

- No `console.log` in `apps/api` or `apps/web` production code. A temporary debug log is removed before commit.
- The message is a stable event name. Data goes in fields.

```ts
logger.info({ orderId, durationMs }, "order processed");
```

An interpolated message (`order ${orderId} processed`) makes every line unique and breaks grouping.

- Never put passwords, tokens, `Authorization`, cookies, or raw payment data in fields. A redaction list is a backstop. Passing `password` into the logger is still a defect.
- Do not log inside a tight loop. Log the outcome, or sample.
- Bind `requestId` for the request (from `X-Request-ID` or a generated id) and clear it when the request ends.

## Levels

| Level | When |
|---|---|
| `debug` | Local diagnosis. Off in production. |
| `info` | A business event you would search for later. |
| `warn` | Handled oddity: retry, fallback. |
| `error` | The operation failed and a person may need to look. |
| `fatal` | The process cannot serve traffic. |

Production level is `info` and above. `LOG_LEVEL=debug` is local.

## Shape

- Production lines are JSON, one event per line.
- Development may use a pretty printer.
- Include `requestId` on request-scoped logs.

## Merge blockers

- `console.log` left in the diff.
- A template string as the only log message when fields exist.
- A secret-shaped field name in the log call.
- A new `Logger` instance that bypasses the app's configured logger.
