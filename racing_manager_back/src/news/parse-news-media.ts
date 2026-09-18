import {
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';

export type UploadedMediaFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

export type ParsedNewsMedia = {
  buffer: Buffer;
  contentType: string;
  extension: string;
};

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/ogg': '.ogv',
};

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.ogv': 'video/ogg',
  '.ogg': 'video/ogg',
};

function extensionFromName(name: string | undefined): string | null {
  if (!name) return null;
  const match = name.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : null;
}

export function parseUploadedNewsMedia(
  file: UploadedMediaFile | undefined,
  maxBytes: number,
): ParsedNewsMedia {
  if (!file?.buffer?.length) {
    throw new BadRequestException('file is required.');
  }
  if ((file.size ?? file.buffer.length) > maxBytes) {
    throw new PayloadTooLargeException(
      `file must be at most ${maxBytes} bytes.`,
    );
  }

  const nameExt = extensionFromName(file.originalname);
  const mime = (file.mimetype ?? '').toLowerCase();
  let contentType = mime;
  let extension = MIME_TO_EXT[mime];

  if (!extension && nameExt && EXT_TO_MIME[nameExt]) {
    contentType = EXT_TO_MIME[nameExt];
    extension = MIME_TO_EXT[contentType] ?? nameExt;
  }

  if (!extension) {
    throw new BadRequestException(
      'Unsupported media type. Upload jpeg, png, gif, webp, mp4, webm, mov or ogg.',
    );
  }

  return {
    buffer: file.buffer,
    contentType,
    extension,
  };
}
