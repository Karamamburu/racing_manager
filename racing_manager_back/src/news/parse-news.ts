import { BadRequestException } from '@nestjs/common';
import { newsHtmlToPlainText, sanitizeNewsHtml } from './sanitize-news-html';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TITLE_LENGTH = 200;
const MAX_BODY_LENGTH = 200_000;

export type ParsedCreateNews = {
  trackId: string;
  title: string;
  body: string;
};

export type ParsedUpdateNews = {
  trackId?: string;
  title?: string;
  body?: string;
};

function readString(
  value: unknown,
  field: string,
  required: boolean,
): string | null {
  if (value === undefined || value === null) {
    if (required) throw new BadRequestException(`${field} is required.`);
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new BadRequestException(`${field} is required.`);
    return null;
  }
  return trimmed;
}

function parseTrackId(value: unknown, required: boolean): string | null {
  const raw = readString(value, 'trackId', required);
  if (!raw) return null;
  if (!UUID_V4.test(raw)) {
    throw new BadRequestException('trackId must be a UUID.');
  }
  return raw;
}

function parseTitle(value: unknown, required: boolean): string | null {
  const title = readString(value, 'title', required);
  if (!title) return null;
  if (title.length > MAX_TITLE_LENGTH) {
    throw new BadRequestException(
      `title must be at most ${MAX_TITLE_LENGTH} characters.`,
    );
  }
  return title;
}

function parseBody(value: unknown, required: boolean): string | null {
  if (value === undefined || value === null) {
    if (required) throw new BadRequestException('body is required.');
    return null;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException('body must be a string.');
  }
  if (value.length > MAX_BODY_LENGTH) {
    throw new BadRequestException(
      `body must be at most ${MAX_BODY_LENGTH} characters.`,
    );
  }
  const body = sanitizeNewsHtml(value);
  if (!newsHtmlToPlainText(body)) {
    if (required) {
      throw new BadRequestException('body must contain text.');
    }
    return null;
  }
  return body;
}

export function parseCreateNewsBody(body: unknown): ParsedCreateNews {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('Request body must be a JSON object.');
  }
  const raw = body as Record<string, unknown>;
  const trackId = parseTrackId(raw.trackId, true);
  const title = parseTitle(raw.title, true);
  const html = parseBody(raw.body, true);
  if (!trackId || !title || !html) {
    throw new BadRequestException('trackId, title and body are required.');
  }
  return { trackId, title, body: html };
}

export function parseUpdateNewsBody(body: unknown): ParsedUpdateNews {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('Request body must be a JSON object.');
  }
  const raw = body as Record<string, unknown>;
  const parsed: ParsedUpdateNews = {};
  if (raw.trackId !== undefined) {
    const trackId = parseTrackId(raw.trackId, true);
    if (trackId) parsed.trackId = trackId;
  }
  if (raw.title !== undefined) {
    const title = parseTitle(raw.title, true);
    if (title) parsed.title = title;
  }
  if (raw.body !== undefined) {
    const html = parseBody(raw.body, true);
    if (html) parsed.body = html;
  }
  if (!parsed.trackId && !parsed.title && !parsed.body) {
    throw new BadRequestException(
      'At least one of trackId, title or body is required.',
    );
  }
  return parsed;
}

export function parseOptionalTrackId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const trackId = parseTrackId(value, false);
  return trackId ?? undefined;
}
