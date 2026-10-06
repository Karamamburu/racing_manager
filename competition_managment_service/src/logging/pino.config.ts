import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import pino from 'pino';
import pretty from 'pino-pretty';
import type { Params } from 'nestjs-pino';

const DEFAULT_LOG_FILE = resolve(
  __dirname,
  '../../../observability/logs/competition_managment_service.log',
);

const IGNORE_PATH_PREFIXES = ['/health'];

function shouldIgnorePath(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.split('?')[0] ?? url;
  return IGNORE_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

export function buildPinoParams(service: string): Params {
  const isProd = process.env.NODE_ENV === 'production';
  // Default info: skip noisy HTTP "request completed" DEBUG lines.
  const consoleLevel = process.env.LOG_LEVEL ?? 'info';
  const fileLevel = process.env.LOG_FILE_LEVEL ?? 'info';

  // multistream (not transport.targets) so formatters.level is allowed by Pino.
  // Production: JSON on stdout so Alloy tails the container. Local: file for Alloy + pretty console.
  const streams: pino.StreamEntry[] = isProd
    ? [
        {
          level: consoleLevel as pino.Level,
          stream: pino.destination(1),
        },
      ]
    : [
        {
          level: consoleLevel as pino.Level,
          stream: pretty({ colorize: true, singleLine: true, sync: true }),
        },
        {
          level: fileLevel as pino.Level,
          stream: pino.destination({
            dest: resolve(process.env.LOG_FILE_PATH?.trim() || DEFAULT_LOG_FILE),
            mkdir: true,
            sync: false,
          }),
        },
      ];

  return {
    pinoHttp: {
      level: consoleLevel,
      base: { service },
      // Grafana/Loki expect textual levels (info/warn/error), not Pino numbers (30/40/50).
      formatters: {
        level: (label: string) => ({ level: label }),
      },
      stream: pino.multistream(streams),
      autoLogging: {
        ignore: (req: IncomingMessage) => shouldIgnorePath(req.url),
      },
      quietReqLogger: true,
      serializers: {
        req: (req: IncomingMessage & { id?: string }) => ({
          id: req.id,
          method: req.method,
          url: (req.url ?? '').split('?')[0],
        }),
        res: (res: ServerResponse) => ({
          statusCode: res.statusCode,
        }),
      },
      customProps: (req: IncomingMessage) => {
        const withMeta = req as IncomingMessage & { id?: string };
        return {
          requestId: withMeta.id,
        };
      },
      customLogLevel: (
        req: IncomingMessage,
        res: ServerResponse,
        err?: Error,
      ): 'error' | 'warn' | 'info' | 'debug' => {
        if (err || res.statusCode >= 500) return 'warn';
        if (res.statusCode >= 400) return 'info';
        const method = (req.method ?? 'GET').toUpperCase();
        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
          return 'debug';
        }
        return 'info';
      },
    },
  };
}
