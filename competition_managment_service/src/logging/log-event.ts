import type { LoggerService } from '@nestjs/common';

/** Structured business log with Grafana-friendly `msg` (= event name). */
export function logEvent(
  logger: LoggerService,
  fields: Record<string, unknown> & { event: string },
  level: 'log' | 'warn' | 'error' = 'log',
): void {
  logger[level](fields, fields.event);
}
