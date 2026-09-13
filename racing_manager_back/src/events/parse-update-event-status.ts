import { BadRequestException } from '@nestjs/common';
import { isEventStatus, type EventStatusCode } from './event-status';

export function parseUpdateEventStatusBody(body: unknown): EventStatusCode {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be an object.');
  }
  const status = (body as { status?: unknown }).status;
  if (typeof status !== 'string' || !status.trim()) {
    throw new BadRequestException('status is required.');
  }
  const normalized = status.trim().toUpperCase();
  if (!isEventStatus(normalized)) {
    throw new BadRequestException(
      'status must be PLANNED, IN_PROGRESS, DONE or CANCELLED.',
    );
  }
  return normalized;
}
