import { BadRequestException } from '@nestjs/common';

export type ParsedFinishCategory = {
  formatId: number | null;
  gender: 'M' | 'F';
};

export function parseFinishCategoryBody(body: unknown): ParsedFinishCategory {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be an object.');
  }
  const raw = body as { formatId?: unknown; gender?: unknown };
  let formatId: number | null = null;
  if (raw.formatId != null) {
    if (typeof raw.formatId !== 'number' || !Number.isInteger(raw.formatId) || raw.formatId < 1) {
      throw new BadRequestException('formatId must be an integer or null.');
    }
    formatId = raw.formatId;
  }
  if (raw.gender !== 'M' && raw.gender !== 'F') {
    throw new BadRequestException('gender must be M or F.');
  }
  return { formatId, gender: raw.gender };
}
