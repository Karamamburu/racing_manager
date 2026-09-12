export const MAX_EVENT_LAP_COUNT = 50;

export function buildEventLapsPayload(
  lapCount: number,
  lapDistanceKm: number,
): { lapNumber: number; distanceKm: number }[] {
  return Array.from({ length: lapCount }, (_, index) => ({
    lapNumber: index + 1,
    distanceKm: lapDistanceKm,
  }));
}
