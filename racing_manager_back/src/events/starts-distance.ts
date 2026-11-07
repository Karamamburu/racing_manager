export interface StartDistanceConfig {
  lapCount: number;
  lapLengthMeters: number;
  legacyEffectiveDistanceM?: number | null;
}

export function displayedDistanceMeters(start: StartDistanceConfig): number {
  return (
    start.legacyEffectiveDistanceM ?? start.lapCount * start.lapLengthMeters
  );
}

export function formatStartDistanceKm(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) {
    throw new RangeError('Distance must be a non-negative finite number');
  }

  return String(Number((meters / 1000).toFixed(2)));
}
