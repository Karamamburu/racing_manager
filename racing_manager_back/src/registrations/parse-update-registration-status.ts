import { BadRequestException } from '@nestjs/common';
import {
  isManageableRegistrationStatus,
  type RegistrationStatusCode,
} from './registration-status';

export function parseUpdateRegistrationStatusBody(
  body: unknown,
): RegistrationStatusCode {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Request body must be an object.');
  }
  const status = (body as { status?: unknown }).status;
  if (typeof status !== 'string' || !status.trim()) {
    throw new BadRequestException('status is required.');
  }
  const normalized = status.trim().toUpperCase();
  if (!isManageableRegistrationStatus(normalized)) {
    throw new BadRequestException(
      'status must be REGISTERED, CONFIRMED, DNS, DNF, QQ, DSQ or CANCELLED.',
    );
  }
  return normalized;
}
