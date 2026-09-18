import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { loadS3StorageConfig, type S3StorageConfig } from './storage.config';

export type UploadObjectInput = {
  prefix: string;
  buffer: Buffer;
  contentType: string;
  extension: string;
  originalName?: string;
};

export type StoredObject = {
  key: string;
  url: string;
  contentType: string;
  size: number;
  originalName: string | null;
};

const MEDIA_KEY_PATTERN =
  /^(news)\/(\d{4})\/(\d{2})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([a-z0-9]+)$/i;

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly settings: S3StorageConfig;
  private readonly client: S3Client;

  constructor(config: ConfigService) {
    this.settings = loadS3StorageConfig(config);
    this.client = new S3Client({
      region: this.settings.region,
      endpoint: this.settings.endpoint,
      forcePathStyle: this.settings.forcePathStyle,
      credentials: {
        accessKeyId: this.settings.accessKeyId,
        secretAccessKey: this.settings.secretAccessKey,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  get maxUploadBytes(): number {
    return this.settings.maxUploadBytes;
  }

  async onModuleInit() {
    const attempts = 10;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        if (this.settings.createBucket) {
          await this.ensureBucket();
        }
        if (this.settings.publicRead) {
          await this.ensurePublicRead();
        }
        this.logger.log(
          `S3 storage ready (${this.settings.endpoint}/${this.settings.bucket})`,
        );
        return;
      } catch (error) {
        if (attempt === attempts) {
          this.logger.error(
            'S3 is unavailable. Media uploads will fail until it is reachable.',
            error as Error,
          );
          return;
        }
        this.logger.warn(
          `S3 is not ready yet, retrying (${attempt}/${attempts})`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  async upload(input: UploadObjectInput): Promise<StoredObject> {
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const key = `${input.prefix}/${year}/${month}/${randomUUID()}${input.extension}`;

    const inline =
      input.contentType.startsWith('image/') ||
      input.contentType.startsWith('video/');
    const downloadName = input.originalName?.replace(/[\r\n"]/g, '') || 'file';
    const asciiName = downloadName.replace(/[^\x20-\x7e]/g, '_') || 'file';
    const contentDisposition = inline
      ? null
      : `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.settings.bucket,
          Key: key,
          Body: input.buffer,
          ContentType: input.contentType,
          CacheControl: 'public, max-age=31536000, immutable',
          ...(contentDisposition
            ? { ContentDisposition: contentDisposition }
            : {}),
        }),
      );
    } catch (error) {
      this.logger.error('Failed to upload object to S3', error as Error);
      throw new InternalServerErrorException('Failed to store media file.');
    }

    return {
      key,
      url: this.toAppUrl(key),
      contentType: input.contentType,
      size: input.buffer.length,
      originalName: input.originalName ?? null,
    };
  }

  parseMediaKey(raw: string): string {
    const key = decodeURIComponent(raw).replace(/^\/+/, '');
    if (!MEDIA_KEY_PATTERN.test(key)) {
      throw new NotFoundException('Media file not found.');
    }
    return key;
  }

  toReadableUrl(key: string): string {
    return `${this.settings.publicBaseUrl}/${key}`;
  }

  toAppUrl(key: string): string {
    return `/media/${key}`;
  }

  private async ensureBucket() {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.settings.bucket }),
      );
      return;
    } catch {
      this.logger.log(`Creating S3 bucket ${this.settings.bucket}`);
    }

    await this.client.send(
      new CreateBucketCommand({ Bucket: this.settings.bucket }),
    );
  }

  private async ensurePublicRead() {
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicRead',
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.settings.bucket}/*`],
        },
      ],
    });

    try {
      await this.client.send(
        new PutBucketPolicyCommand({
          Bucket: this.settings.bucket,
          Policy: policy,
        }),
      );
    } catch (error) {
      this.logger.warn(
        'Could not apply public-read bucket policy. Set it in the S3 console if objects must be readable.',
      );
      this.logger.debug(error as Error);
    }
  }
}
