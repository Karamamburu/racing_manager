import { resolve } from 'node:path';
import type { Params } from 'nestjs-pino';

const DEFAULT_LOG_FILE = resolve(
  __dirname,
  '../../../observability/logs/racing_manager_back.log',
);

export function buildPinoParams(service: string): Params {
  const rawPath = process.env.LOG_FILE_PATH?.trim() || DEFAULT_LOG_FILE;
  const logFilePath = resolve(rawPath);

  const isProd = process.env.NODE_ENV === 'production';
  const level = process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug');

  const targets: Array<{
    target: string;
    level: string;
    options: Record<string, unknown>;
  }> = [
    {
      target: 'pino/file',
      level,
      options: { destination: logFilePath, mkdir: true },
    },
  ];

  if (!isProd) {
    targets.unshift({
      target: 'pino-pretty',
      level,
      options: { singleLine: true, colorize: true },
    });
  }

  return {
    pinoHttp: {
      level,
      base: { service },
      transport: { targets },
      autoLogging: true,
      quietReqLogger: true,
    },
  };
}
