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

export type NewsMediaKind = 'image' | 'video' | 'document';

export type ParsedNewsMedia = {
  buffer: Buffer;
  contentType: string;
  extension: string;
  originalName: string;
  kind: NewsMediaKind;
};

type AllowedType = {
  extension: string;
  contentType: string;
  kind: NewsMediaKind;
};

const ALLOWED_TYPES: AllowedType[] = [
  { extension: '.jpg', contentType: 'image/jpeg', kind: 'image' },
  { extension: '.jpeg', contentType: 'image/jpeg', kind: 'image' },
  { extension: '.png', contentType: 'image/png', kind: 'image' },
  { extension: '.gif', contentType: 'image/gif', kind: 'image' },
  { extension: '.webp', contentType: 'image/webp', kind: 'image' },
  { extension: '.mp4', contentType: 'video/mp4', kind: 'video' },
  { extension: '.webm', contentType: 'video/webm', kind: 'video' },
  { extension: '.mov', contentType: 'video/quicktime', kind: 'video' },
  { extension: '.ogv', contentType: 'video/ogg', kind: 'video' },
  { extension: '.ogg', contentType: 'video/ogg', kind: 'video' },
  { extension: '.pdf', contentType: 'application/pdf', kind: 'document' },
  { extension: '.doc', contentType: 'application/msword', kind: 'document' },
  {
    extension: '.docx',
    contentType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'document',
  },
  { extension: '.xls', contentType: 'application/vnd.ms-excel', kind: 'document' },
  {
    extension: '.xlsx',
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    kind: 'document',
  },
];

const MIME_TO_TYPE = new Map(
  ALLOWED_TYPES.filter((type) => type.extension !== '.jpeg').map((type) => [
    type.contentType,
    type,
  ]),
);
const EXT_TO_TYPE = new Map(ALLOWED_TYPES.map((type) => [type.extension, type]));

const OLE_MAGIC = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const PDF_MAGIC = Buffer.from('%PDF');
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const GIF87_MAGIC = Buffer.from('GIF87a');
const GIF89_MAGIC = Buffer.from('GIF89a');
const WEBP_MARK = Buffer.from('WEBP');
const OGG_MAGIC = Buffer.from('OggS');
const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const VBA_PROJECT = Buffer.from('_VBA_PROJECT', 'utf16le');

function startsWithMagic(buffer: Buffer, magic: Buffer): boolean {
  return (
    buffer.length >= magic.length &&
    buffer.subarray(0, magic.length).equals(magic)
  );
}

function containsBytes(buffer: Buffer, value: Buffer): boolean {
  return buffer.includes(value);
}

function containsAscii(buffer: Buffer, value: string): boolean {
  return containsBytes(buffer, Buffer.from(value, 'utf8'));
}

function looksLikeHtml(buffer: Buffer): boolean {
  const head = buffer
    .subarray(0, 256)
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart()
    .toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html');
}

function assertSafePayload(buffer: Buffer, extension: string) {
  if (looksLikeHtml(buffer)) {
    throw new BadRequestException('File content does not match its type.');
  }

  switch (extension) {
    case '.jpg':
    case '.jpeg':
      if (!startsWithMagic(buffer, JPEG_MAGIC)) {
        throw new BadRequestException('File content does not match its type.');
      }
      return;
    case '.png':
      if (!startsWithMagic(buffer, PNG_MAGIC)) {
        throw new BadRequestException('File content does not match its type.');
      }
      return;
    case '.gif':
      if (
        !startsWithMagic(buffer, GIF87_MAGIC) &&
        !startsWithMagic(buffer, GIF89_MAGIC)
      ) {
        throw new BadRequestException('File content does not match its type.');
      }
      return;
    case '.webp':
      if (
        !startsWithMagic(buffer, Buffer.from('RIFF')) ||
        !buffer.subarray(8, 12).equals(WEBP_MARK)
      ) {
        throw new BadRequestException('File content does not match its type.');
      }
      return;
    case '.mp4':
    case '.mov':
      if (!containsAscii(buffer.subarray(0, 64), 'ftyp')) {
        throw new BadRequestException('File content does not match its type.');
      }
      return;
    case '.webm':
      if (!startsWithMagic(buffer, WEBM_MAGIC)) {
        throw new BadRequestException('File content does not match its type.');
      }
      return;
    case '.ogv':
    case '.ogg':
      if (!startsWithMagic(buffer, OGG_MAGIC)) {
        throw new BadRequestException('File content does not match its type.');
      }
      return;
    case '.pdf':
      if (!startsWithMagic(buffer, PDF_MAGIC)) {
        throw new BadRequestException('File content does not match its type.');
      }
      return;
    case '.docx':
      if (!startsWithMagic(buffer, ZIP_MAGIC)) {
        throw new BadRequestException('File content does not match its type.');
      }
      if (!containsAscii(buffer, 'word/document.xml')) {
        throw new BadRequestException('File content does not match its type.');
      }
      if (containsAscii(buffer, 'vbaProject.bin')) {
        throw new BadRequestException('Macro-enabled documents are not allowed.');
      }
      return;
    case '.xlsx':
      if (!startsWithMagic(buffer, ZIP_MAGIC)) {
        throw new BadRequestException('File content does not match its type.');
      }
      if (!containsAscii(buffer, 'xl/workbook.xml')) {
        throw new BadRequestException('File content does not match its type.');
      }
      if (containsAscii(buffer, 'vbaProject.bin')) {
        throw new BadRequestException('Macro-enabled documents are not allowed.');
      }
      return;
    case '.doc':
      if (!startsWithMagic(buffer, OLE_MAGIC)) {
        throw new BadRequestException('File content does not match its type.');
      }
      if (!containsBytes(buffer, Buffer.from('WordDocument', 'utf16le'))) {
        throw new BadRequestException('File content does not match its type.');
      }
      if (containsBytes(buffer, VBA_PROJECT)) {
        throw new BadRequestException('Macro-enabled documents are not allowed.');
      }
      return;
    case '.xls':
      if (!startsWithMagic(buffer, OLE_MAGIC)) {
        throw new BadRequestException('File content does not match its type.');
      }
      if (
        !containsBytes(buffer, Buffer.from('Workbook', 'utf16le')) &&
        !containsBytes(buffer, Buffer.from('Book', 'utf16le'))
      ) {
        throw new BadRequestException('File content does not match its type.');
      }
      if (containsBytes(buffer, VBA_PROJECT)) {
        throw new BadRequestException('Macro-enabled documents are not allowed.');
      }
      return;
    default:
      throw new BadRequestException(
        'Unsupported media type. Upload jpeg, png, gif, webp, mp4, webm, mov, ogg, pdf, doc, docx, xls or xlsx.',
      );
  }
}

function decodeMultipartFilename(name: string | undefined): string | undefined {
  if (!name) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  if (decoded.includes('\uFFFD')) return name;
  return decoded;
}

function extensionFromName(name: string | undefined): string | null {
  if (!name) return null;
  const match = name.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : null;
}

function sanitizeOriginalName(
  name: string | undefined,
  extension: string,
): string {
  const base = (name ?? 'file').split(/[/\\]/).pop() ?? 'file';
  const cleaned = base.replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_').trim() || 'file';
  const withoutExt = cleaned.replace(/\.[a-z0-9]+$/i, '');
  const clipped = withoutExt.slice(0, 80) || 'file';
  return `${clipped}${extension}`;
}

function resolveAllowedType(
  mime: string,
  nameExt: string | null,
): AllowedType | null {
  if (nameExt && EXT_TO_TYPE.has(nameExt)) {
    return EXT_TO_TYPE.get(nameExt) ?? null;
  }
  return MIME_TO_TYPE.get(mime) ?? null;
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

  const originalname = decodeMultipartFilename(file.originalname);
  const nameExt = extensionFromName(originalname);
  const mime = (file.mimetype ?? '').toLowerCase();
  const allowed = resolveAllowedType(mime, nameExt);
  if (!allowed) {
    throw new BadRequestException(
      'Unsupported media type. Upload jpeg, png, gif, webp, mp4, webm, mov, ogg, pdf, doc, docx, xls or xlsx.',
    );
  }

  assertSafePayload(file.buffer, allowed.extension);

  const originalName = sanitizeOriginalName(originalname, allowed.extension);
  return {
    buffer: file.buffer,
    contentType: allowed.contentType,
    extension: allowed.extension === '.jpeg' ? '.jpg' : allowed.extension,
    originalName,
    kind: allowed.kind,
  };
}
