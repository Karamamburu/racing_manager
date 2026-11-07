import {
  buildAutoStartLabel,
  normalizeStartDisplayName,
  normalizeStartLabelForComparison,
  resolveStartLabel,
} from './starts-label';

describe('starts-label', () => {
  describe('normalizeStartDisplayName', () => {
    it.each([null, undefined, '', '   ', '\t\n'])(
      'normalizes blank value %p to null',
      (value) => {
        expect(normalizeStartDisplayName(value)).toBeNull();
      },
    );

    it('trims a non-blank display name', () => {
      expect(normalizeStartDisplayName('  Заезд A  ')).toBe('Заезд A');
    });
  });

  describe('buildAutoStartLabel', () => {
    it('uses the cup race purpose label and derived distance', () => {
      expect(
        buildAutoStartLabel({
          purposeType: 'CUP_RACE',
          lapCount: 5,
          lapLengthMeters: 2000,
        }),
      ).toBe('Кубковая гонка — 10 км');
    });

    it('uses the control training purpose label and legacy override', () => {
      expect(
        buildAutoStartLabel({
          purposeType: 'CONTROL_TRAINING',
          lapCount: 2,
          lapLengthMeters: 2750,
          legacyEffectiveDistanceM: 5600,
        }),
      ).toBe('Контрольная тренировка — 5.6 км');
    });
  });

  describe('resolveStartLabel', () => {
    it('prefers a trimmed display name', () => {
      expect(
        resolveStartLabel({
          purposeType: 'CUP_RACE',
          lapCount: 1,
          lapLengthMeters: 1000,
          displayName: '  Элита  ',
        }),
      ).toBe('Элита');
    });

    it('falls back to the auto-label for a blank display name', () => {
      expect(
        resolveStartLabel({
          purposeType: 'CUP_RACE',
          lapCount: 1,
          lapLengthMeters: 1000,
          displayName: '   ',
        }),
      ).toBe('Кубковая гонка — 1 км');
    });
  });

  describe('normalizeStartLabelForComparison', () => {
    it('trims and lowercases for uniqueness checks', () => {
      expect(
        normalizeStartLabelForComparison('  Кубковая ГОНКА — 10 км '),
      ).toBe('кубковая гонка — 10 км');
    });
  });
});
