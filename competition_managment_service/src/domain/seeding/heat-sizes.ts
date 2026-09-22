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

  if (heatSize != null) {
    return Math.min(participantCount, Math.max(1, Math.ceil(participantCount / heatSize)));
  }

  if (heatCount != null) {
    return Math.min(heatCount, participantCount);
  }

  throw new DomainError(
    ErrorCodes.SEEDING_INVALID,
    'HEATS layout requires heatCount and/or heatSize.',
    path,
  );
}
