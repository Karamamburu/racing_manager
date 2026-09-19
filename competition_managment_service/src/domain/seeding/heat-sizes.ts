import { DomainError, ErrorCodes } from '../errors';

export function balancedHeatSizes(participantCount: number, heatCount: number): number[] {
  const base = Math.floor(participantCount / heatCount);
  const remainder = participantCount % heatCount;
  return Array.from({ length: heatCount }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function resolveHeatCount(
  participantCount: number,
  heatCount: number | undefined,
  heatSize: number | undefined,
  path = 'format.heats',
): number {
  if (participantCount < 1) {
    throw new DomainError(
      ErrorCodes.SEEDING_INVALID,
      'Cannot assign heats without participants.',
      path,
    );
  }

  if (heatCount != null && heatSize != null) {
    if (heatCount > participantCount) {
      throw new DomainError(
        ErrorCodes.SEEDING_INVALID,
        `heatCount (${heatCount}) cannot exceed participant count (${participantCount}).`,
        `${path}.heatCount`,
      );
    }
    if (heatCount * heatSize < participantCount) {
      throw new DomainError(
        ErrorCodes.SEEDING_INVALID,
        `heatCount * heatSize (${heatCount * heatSize}) is less than participant count (${participantCount}).`,
        path,
      );
    }
    const maxSize = Math.ceil(participantCount / heatCount);
    if (maxSize > heatSize) {
      throw new DomainError(
        ErrorCodes.SEEDING_INVALID,
        `Balanced heats of ${heatCount} would have size ${maxSize}, exceeding heatSize ${heatSize}.`,
        path,
      );
    }
    return heatCount;
  }

  if (heatCount != null) {
    if (heatCount > participantCount) {
      throw new DomainError(
        ErrorCodes.SEEDING_INVALID,
        `heatCount (${heatCount}) cannot exceed participant count (${participantCount}).`,
        `${path}.heatCount`,
      );
    }
    return heatCount;
  }

  if (heatSize != null) {
    return Math.ceil(participantCount / heatSize);
  }

  throw new DomainError(
    ErrorCodes.SEEDING_INVALID,
    'HEATS layout requires heatCount and/or heatSize.',
    path,
  );
}
