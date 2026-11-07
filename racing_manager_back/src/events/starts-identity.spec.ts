import {
  areStartsIdentical,
  buildStartIdentity,
  findStartLabelCollisions,
  normalizeStartFormatIds,
  type StartIdentityConfig,
} from './starts-identity';

const baseStart = (
  overrides: Partial<StartIdentityConfig> = {},
): StartIdentityConfig => ({
  purposeType: 'CUP_RACE',
  lapCount: 5,
  lapLengthMeters: 2000,
  formatIds: [1, 2],
  displayName: null,
  ...overrides,
});

describe('starts-identity', () => {
  describe('normalizeStartFormatIds', () => {
    it('sorts and de-duplicates format ids', () => {
      expect(normalizeStartFormatIds([3, 1, 2, 1])).toEqual([1, 2, 3]);
    });
  });

  describe('areStartsIdentical', () => {
    it('treats format order as irrelevant', () => {
      expect(
        areStartsIdentical(
          baseStart({ formatIds: [2, 1] }),
          baseStart({ formatIds: [1, 2] }),
        ),
      ).toBe(true);
    });

    it('treats blank and omitted display names as equal', () => {
      expect(
        areStartsIdentical(
          baseStart({ displayName: '   ' }),
          baseStart({ displayName: null }),
        ),
      ).toBe(true);
    });

    it('compares display names case-insensitively after trimming', () => {
      expect(
        areStartsIdentical(
          baseStart({ displayName: '  Элита ' }),
          baseStart({ displayName: 'элита' }),
        ),
      ).toBe(true);
    });

    it('keeps starts with different purpose types distinct', () => {
      expect(
        areStartsIdentical(
          baseStart({ purposeType: 'CUP_RACE' }),
          baseStart({ purposeType: 'CONTROL_TRAINING' }),
        ),
      ).toBe(false);
    });

    it('detects lap count and lap length differences', () => {
      expect(
        areStartsIdentical(
          baseStart({ lapCount: 4 }),
          baseStart({ lapCount: 5 }),
        ),
      ).toBe(false);
      expect(
        areStartsIdentical(
          baseStart({ lapLengthMeters: 1999 }),
          baseStart({ lapLengthMeters: 2000 }),
        ),
      ).toBe(false);
    });

    it('detects format set differences', () => {
      expect(
        areStartsIdentical(
          baseStart({ formatIds: [1, 2] }),
          baseStart({ formatIds: [1, 3] }),
        ),
      ).toBe(false);
    });

    it('detects display name differences', () => {
      expect(
        areStartsIdentical(
          baseStart({ displayName: 'A' }),
          baseStart({ displayName: 'B' }),
        ),
      ).toBe(false);
    });

    it('builds a stable identity string', () => {
      expect(buildStartIdentity(baseStart())).toBe(
        buildStartIdentity(baseStart({ formatIds: [2, 1], displayName: '  ' })),
      );
    });
  });

  describe('findStartLabelCollisions', () => {
    it('reports colliding auto-labels for the same distance', () => {
      const collisions = findStartLabelCollisions([
        baseStart({ formatIds: [1] }),
        baseStart({ formatIds: [2] }),
      ]);

      expect(collisions).toHaveLength(1);
      expect(collisions[0].indexes).toEqual([0, 1]);
      expect(collisions[0].normalizedLabel).toBe('кубковая гонка — 10 км');
      expect(collisions[0].labels).toEqual(['Кубковая гонка — 10 км']);
    });

    it('allows purpose-only differences because auto-labels differ', () => {
      expect(
        findStartLabelCollisions([
          baseStart({ purposeType: 'CUP_RACE' }),
          baseStart({ purposeType: 'CONTROL_TRAINING' }),
        ]),
      ).toEqual([]);
    });

    it('collides when case or spacing differs only', () => {
      const collisions = findStartLabelCollisions([
        baseStart({ displayName: 'Элита' }),
        baseStart({ displayName: '  элита ' }),
      ]);

      expect(collisions).toHaveLength(1);
      expect(collisions[0].indexes).toEqual([0, 1]);
      expect(collisions[0].labels).toEqual(['Элита', 'элита']);
    });

    it('collides a display name that equals another start auto-label', () => {
      const collisions = findStartLabelCollisions([
        baseStart({ displayName: null }),
        baseStart({ displayName: 'Кубковая гонка — 10 км' }),
      ]);

      expect(collisions).toHaveLength(1);
      expect(collisions[0].indexes).toEqual([0, 1]);
    });

    it('does not report unique labels', () => {
      expect(
        findStartLabelCollisions([
          baseStart({ displayName: 'A' }),
          baseStart({ displayName: 'B' }),
          baseStart({ displayName: null }),
        ]),
      ).toEqual([]);
    });
  });
});
