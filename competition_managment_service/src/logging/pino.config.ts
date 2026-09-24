import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
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
  const rawPath = process.env.LOG_FILE_PATH?.trim() || DEFAULT_LOG_FILE;
  const logFilePath = resolve(rawPath);

  const isProd = process.env.NODE_ENV === 'production';
  const consoleLevel = process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug');
  const fileLevel = process.env.LOG_FILE_LEVEL ?? 'info';

  const targets: Array<{
    target: string;
    level: string;
    options: Record<string, unknown>;
  }> = [
    {
      target: 'pino/file',
      level: fileLevel,
      options: { destination: logFilePath, mkdir: true },
    },
  ];

  if (!isProd) {
    targets.unshift({
      target: 'pino-pretty',
      level: consoleLevel,
      options: { singleLine: true, colorize: true },
    });
  }

  return {
    pinoHttp: {
      level: consoleLevel,
      base: { service },
      transport: { targets },
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
