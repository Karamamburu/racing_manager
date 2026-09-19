import { DomainError, ErrorCodes } from '../domain/errors';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readString(value: unknown, path: string, required = true): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new DomainError(ErrorCodes.FORMAT_INVALID, `${path} is required.`, path);
    }
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new DomainError(ErrorCodes.FORMAT_INVALID, `${path} must be a string.`, path);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) {
      throw new DomainError(ErrorCodes.FORMAT_INVALID, `${path} is required.`, path);
    }
    return undefined;
  }
  return trimmed;
}

export function readInteger(value: unknown, path: string, required = true): number | undefined {
  if (value === undefined || value === null) {
    if (required) {
      throw new DomainError(ErrorCodes.FORMAT_INVALID, `${path} is required.`, path);
    }
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new DomainError(ErrorCodes.FORMAT_INVALID, `${path} must be an integer.`, path);
  }
  return value;
}

export function readNumber(value: unknown, path: string, required = true): number | undefined {
  if (value === undefined || value === null) {
    if (required) {
      throw new DomainError(ErrorCodes.FORMAT_INVALID, `${path} is required.`, path);
    }
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new DomainError(ErrorCodes.FORMAT_INVALID, `${path} must be a number.`, path);
  }
  return value;
}

export function readObject(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new DomainError(ErrorCodes.FORMAT_INVALID, `${path} must be an object.`, path);
  }
  return value;
}

export function readArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new DomainError(ErrorCodes.FORMAT_INVALID, `${path} must be an array.`, path);
  }
  return value;
}

export function readMeta(value: unknown, path: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new DomainError(ErrorCodes.PARTICIPANT_INVALID, `${path} must be an object.`, path);
  }
  return value;
}
