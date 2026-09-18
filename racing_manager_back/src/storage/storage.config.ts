import { ConfigService } from '@nestjs/config';

export type S3StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  publicBaseUrl: string;
  createBucket: boolean;
  publicRead: boolean;
  maxUploadBytes: number;
};

const DEFAULT_MAX_UPLOAD_BYTES = 80 * 1024 * 1024;

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function readRequired(config: ConfigService, key: string): string {
  const value = config.get<string>(key)?.trim();
  if (!value) {
    throw new Error(`${key} is not defined`);
  }
  return value;
}

export function loadS3StorageConfig(config: ConfigService): S3StorageConfig {
  const endpoint = readRequired(config, 'S3_ENDPOINT').replace(/\/+$/, '');
  const bucket = readRequired(config, 'S3_BUCKET');
  const publicBaseUrl = (
    config.get<string>('S3_PUBLIC_BASE_URL')?.trim() ||
    `${endpoint}/${bucket}`
  ).replace(/\/+$/, '');
  const maxRaw = config.get<string>('S3_MAX_UPLOAD_BYTES');
  const maxUploadBytes = maxRaw ? Number(maxRaw) : DEFAULT_MAX_UPLOAD_BYTES;

  return {
    endpoint,
    region: config.get<string>('S3_REGION')?.trim() || 'us-east-1',
    bucket,
    accessKeyId: readRequired(config, 'S3_ACCESS_KEY'),
    secretAccessKey: readRequired(config, 'S3_SECRET_KEY'),
    forcePathStyle: readBool(config.get<string>('S3_FORCE_PATH_STYLE'), true),
    publicBaseUrl,
    createBucket: readBool(config.get<string>('S3_CREATE_BUCKET'), true),
    publicRead: readBool(config.get<string>('S3_PUBLIC_READ'), true),
    maxUploadBytes:
      Number.isFinite(maxUploadBytes) && maxUploadBytes > 0
        ? maxUploadBytes
        : DEFAULT_MAX_UPLOAD_BYTES,
  };
}

export { DEFAULT_MAX_UPLOAD_BYTES };
