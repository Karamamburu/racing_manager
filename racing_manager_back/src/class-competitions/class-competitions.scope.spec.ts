import {
  currentPlacement,
  placementKey,
  racePlacementForRow,
  remainderGroupIds,
  targetForSection,
  type RaceScopeRow,
} from './race-scope';

const CATEGORIES = [
  { number: 1, groupIds: ['AGE_21_23'] as const },
  { number: 2, groupIds: ['AGE_24_40'] as const },
];
const CONTROL_YEAR = 2026;

function race(overrides: Partial<RaceScopeRow>): RaceScopeRow {
  return {
    id: 'race-1',
    startId: 'start-1',
    formatId: 1,
    gender: 'M',
    sectionId: 'CATEGORY_2',
    sectionKind: 'CATEGORY_NUMBER',
    targetKey: 'GROUPS:AGE_24_40',
    targetGroupIds: ['AGE_24_40'],
    targetWholeCategory: false,
    frozenTitle: 'Категория 2',
    frozenSubtitle: '24–40',
    frozenYoungestBound: 24,
    frozenMemberBounds: [24],
    frozenSectionNumber: 2,
    capturedEnrollmentIds: [],
    capturedRegistrationIds: [],
    ...overrides,
  };
}

describe('race scope', () => {
  it('derives a stable target key from the configured group set, not a number', () => {
    const target = targetForSection('CATEGORY_2', [...CATEGORIES]);
    expect(target.targetKey).toBe('GROUPS:AGE_24_40');
    expect(target.targetGroupIds).toEqual(['AGE_24_40']);
    expect(target.subtitle).toBe('24–40');
  });

  it('does not let a renumbered sibling section inherit a race', () => {
    const raceRow = race({});
    const renumbered = currentPlacement(2005, CONTROL_YEAR, [
      { number: 1, groupIds: ['AGE_24_40'] },
      { number: 2, groupIds: ['AGE_21_23'] },
    ]);
    expect(renumbered.sectionId).toBe('CATEGORY_2');
    expect(
      racePlacementForRow([raceRow], {
        enrollmentId: null,
        registrationId: 'registration-2',
        placement: renumbered,
      }),
    ).toBeNull();
  });

  it('places a non-captured row in a race only when membership matches exactly', () => {
    const raceRow = race({});
    const matching = currentPlacement(1990, CONTROL_YEAR, [...CATEGORIES]);
    expect(
      racePlacementForRow([raceRow], {
        enrollmentId: 'enrollment-1',
        registrationId: 'registration-1',
        placement: matching,
      })?.role,
    ).toBe('OUTSIDE_RACE');

    const sibling = currentPlacement(2005, CONTROL_YEAR, [...CATEGORIES]);
    expect(
      racePlacementForRow([raceRow], {
        enrollmentId: 'enrollment-2',
        registrationId: 'registration-2',
        placement: sibling,
      }),
    ).toBeNull();
  });

  it('captured membership wins over the current configuration', () => {
    const raceRow = race({ capturedEnrollmentIds: ['enrollment-1'] });
    expect(
      racePlacementForRow([raceRow], {
        enrollmentId: 'enrollment-1',
        registrationId: 'registration-1',
        placement: currentPlacement(2005, CONTROL_YEAR, [...CATEGORIES]),
      })?.role,
    ).toBe('CAPTURED');
  });

  it('keeps a whole-category race open to every active row', () => {
    const whole = race({
      targetKey: 'WHOLE',
      targetWholeCategory: true,
      targetGroupIds: [],
      sectionId: 'CATEGORY',
      sectionKind: 'CATEGORY',
    });
    expect(
      racePlacementForRow([whole], {
        enrollmentId: 'enrollment-9',
        registrationId: 'registration-9',
        placement: currentPlacement(2005, CONTROL_YEAR, [...CATEGORIES]),
      })?.role,
    ).toBe('OUTSIDE_RACE');
  });

  it('derives the remainder set from the groups no category owns', () => {
    const remainder = remainderGroupIds([...CATEGORIES]);
    expect(remainder).not.toContain('AGE_21_23');
    expect(remainder).not.toContain('AGE_24_40');
    expect(remainder).toContain('AGE_61_PLUS');
    expect(
      placementKey(currentPlacement(2005, CONTROL_YEAR, [...CATEGORIES])),
    ).toBe('GROUPS:AGE_21_23');
  });
});
