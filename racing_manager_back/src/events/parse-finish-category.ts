import { BadRequestException } from '@nestjs/common';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ParsedFinishCategory = {
  startId: string;
  formatId: number | null;
  gender: 'M' | 'F';
};

export function parseFinishCategoryBody(body: unknown): ParsedFinishCategory {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be an object.');
  }
  const raw = body as {
    startId?: unknown;
    formatId?: unknown;
    gender?: unknown;
  };
  if (typeof raw.startId !== 'string' || !UUID.test(raw.startId)) {
    throw new BadRequestException('startId must be a UUID.');
  }
  let formatId: number | null = null;
  if (raw.formatId != null) {
    if (
      typeof raw.formatId !== 'number' ||
      !Number.isInteger(raw.formatId) ||
      raw.formatId < 1
    ) {
      throw new BadRequestException('formatId must be an integer or null.');
    }
    formatId = raw.formatId;
  }
  if (raw.gender !== 'M' && raw.gender !== 'F') {
    throw new BadRequestException('gender must be M or F.');
  }
  return { startId: raw.startId, formatId, gender: raw.gender };
}
