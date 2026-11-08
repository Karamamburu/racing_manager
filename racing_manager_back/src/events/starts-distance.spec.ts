import {
  displayedDistanceMeters,
  formatStartDistanceKm,
} from './starts-distance';

describe('starts-distance', () => {
  describe('displayedDistanceMeters', () => {
    it('derives total distance from laps when no legacy override exists', () => {
      expect(
        displayedDistanceMeters({
          lapCount: 5,
          lapLengthMeters: 2000,
        }),
      ).toBe(10000);
    });

    it('uses the legacy override including non-multiple lap distances', () => {
      expect(
        displayedDistanceMeters({
          lapCount: 5,
          lapLengthMeters: 2000,
          legacyEffectiveDistanceM: 10050,
        }),
      ).toBe(10050);
    });

    it('falls back to derived distance when the override is null', () => {
      expect(
        displayedDistanceMeters({
          lapCount: 3,
          lapLengthMeters: 1500,
          legacyEffectiveDistanceM: null,
        }),
      ).toBe(4500);
    });
  });

  describe('formatStartDistanceKm', () => {
    it.each([
      [10000, '10'],
      [10500, '10.5'],
      [10555, '10.55'],
      [1999, '2'],
      [1234, '1.23'],
      [999, '1'],
      [0, '0'],
    ])('formats %d metres as %s km', (meters, expected) => {
      expect(formatStartDistanceKm(meters)).toBe(expected);
    });

    it('rejects negative and non-finite distances', () => {
      expect(() => formatStartDistanceKm(-1)).toThrow(RangeError);
      expect(() => formatStartDistanceKm(Number.NaN)).toThrow(RangeError);
      expect(() => formatStartDistanceKm(Number.POSITIVE_INFINITY)).toThrow(
        RangeError,
      );
    });
  });
});
