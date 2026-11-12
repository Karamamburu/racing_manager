import {
  AGE_GROUPS,
  NO_BIRTH_YEAR_TITLE,
  REMAINDER_TITLE,
  ageGroupFor,
  categoryForBirthYear,
  categorySubtitle,
  categoryTitle,
  categoryYoungestBound,
  type AgeCategory,
} from '../events/age-groups';

export const RACE_SECTION_IDS = [
  'CATEGORY',
  'REMAINDER',
  'NO_BIRTH_YEAR',
] as const;

export type RaceSectionKind =
  | 'CATEGORY'
  | 'CATEGORY_NUMBER'
  | 'REMAINDER'
  | 'NO_BIRTH_YEAR';

export const REMAINDER_BOUND = 1_000_000;
export const NO_BIRTH_YEAR_BOUND = 1_000_001;

export type RaceScopeRow = {
  id: string;
  startId: string | null;
  formatId: number | null;
  gender: string;
  sectionId: string | null;
  sectionKind: string | null;
  targetKey: string;
  targetGroupIds: string[];
  targetWholeCategory: boolean;
  frozenTitle: string | null;
  frozenSubtitle: string | null;
  frozenYoungestBound: number | null;
  frozenMemberBounds: number[];
  frozenSectionNumber: number | null;
  capturedEnrollmentIds: string[];
  capturedRegistrationIds: string[];
};

export type RaceTarget = {
  sectionId: string;
  sectionKind: RaceSectionKind;
  targetKey: string;
  targetGroupIds: string[];
  targetWholeCategory: boolean;
  title: string;
  subtitle: string | null;
  youngestBound: number;
  memberBounds: number[];
  sectionNumber: number | null;
};

export type CurrentPlacement = {
  sectionId: string;
  groupIds: string[];
  wholeCategory: boolean;
  noBirthYear: boolean;
};

export type RacePlacement = {
  race: RaceScopeRow;
  role: 'CAPTURED' | 'OUTSIDE_RACE';
};

export function sectionKindFor(sectionId: string): RaceSectionKind {
  if (sectionId === 'CATEGORY') return 'CATEGORY';
  if (sectionId === 'REMAINDER') return 'REMAINDER';
  if (sectionId === 'NO_BIRTH_YEAR') return 'NO_BIRTH_YEAR';
  if (/^CATEGORY_\d+$/.test(sectionId)) return 'CATEGORY_NUMBER';
  throw new RangeError(`Unknown race section: ${sectionId}`);
}

export function sectionNumberFor(sectionId: string): number | null {
  const match = /^CATEGORY_(\d+)$/.exec(sectionId);
  return match ? Number(match[1]) : null;
}

export function targetKeyFor(
  sectionKind: RaceSectionKind,
  groupIds: readonly string[],
): string {
  if (sectionKind === 'CATEGORY') return 'WHOLE';
  if (sectionKind === 'NO_BIRTH_YEAR') return 'NO_BIRTH_YEAR';
  const prefix = sectionKind === 'REMAINDER' ? 'REMAINDER' : 'GROUPS';
  return `${prefix}:${[...new Set(groupIds)].sort().join('|')}`;
}

function memberBounds(groupIds: readonly string[]): number[] {
  const bounds = groupIds
    .map((id) => AGE_GROUPS.find((group) => group.id === id)?.youngestBound)
    .filter((value): value is number => value != null);
  return [...new Set(bounds)].sort((a, b) => a - b);
}

export function remainderGroupIds(
  categories: readonly AgeCategory[],
): string[] {
  const assigned = new Set(
    categories.flatMap((category) => [...category.groupIds]),
  );
  return AGE_GROUPS.filter((group) => !assigned.has(group.id)).map(
    (group) => group.id,
  );
}

/**
 * Resolves the creation-time target from the section displayed under the
 * current age-category configuration. Throws when the section is not displayed.
 */
export function targetForSection(
  sectionId: string,
  categories: readonly AgeCategory[],
): RaceTarget {
  const kind = sectionKindFor(sectionId);
  if (kind === 'CATEGORY') {
    return {
      sectionId,
      sectionKind: kind,
      targetKey: 'WHOLE',
      targetGroupIds: [],
      targetWholeCategory: true,
      title: 'Категория',
      subtitle: null,
      youngestBound: 0,
      memberBounds: [],
      sectionNumber: null,
    };
  }
  if (kind === 'NO_BIRTH_YEAR') {
    return {
      sectionId,
      sectionKind: kind,
      targetKey: 'NO_BIRTH_YEAR',
      targetGroupIds: [],
      targetWholeCategory: false,
      title: NO_BIRTH_YEAR_TITLE,
      subtitle: null,
      youngestBound: NO_BIRTH_YEAR_BOUND,
      memberBounds: [],
      sectionNumber: null,
    };
  }
  if (kind === 'REMAINDER') {
    const groupIds = remainderGroupIds(categories);
    return {
      sectionId,
      sectionKind: kind,
      targetKey: targetKeyFor(kind, groupIds),
      targetGroupIds: groupIds,
      targetWholeCategory: false,
      title: REMAINDER_TITLE,
      subtitle: null,
      youngestBound: REMAINDER_BOUND,
      memberBounds: memberBounds(groupIds),
      sectionNumber: null,
    };
  }

  const number = sectionNumberFor(sectionId);
  const category = categories.find((item) => item.number === number);
  if (!category) {
    throw new RangeError(`Section ${sectionId} is not displayed`);
  }
  const groupIds = [...category.groupIds];
  return {
    sectionId,
    sectionKind: kind,
    targetKey: targetKeyFor(kind, groupIds),
    targetGroupIds: groupIds,
    targetWholeCategory: false,
    title: categoryTitle(category.number),
    subtitle: categorySubtitle(groupIds) || null,
    youngestBound: categoryYoungestBound(groupIds),
    memberBounds: memberBounds(groupIds),
    sectionNumber: category.number,
  };
}

export function currentPlacement(
  birthYear: number | null,
  controlYear: number,
  categories: readonly AgeCategory[],
): CurrentPlacement {
  if (categories.length === 0) {
    return {
      sectionId: 'CATEGORY',
      groupIds: [],
      wholeCategory: true,
      noBirthYear: false,
    };
  }
  const sectionId = categoryForBirthYear(birthYear, controlYear, categories);
  if (sectionId === 'NO_BIRTH_YEAR') {
    return {
      sectionId,
      groupIds: [],
      wholeCategory: false,
      noBirthYear: true,
    };
  }
  if (sectionId === 'REMAINDER') {
    return {
      sectionId,
      groupIds: remainderGroupIds(categories),
      wholeCategory: false,
      noBirthYear: false,
    };
  }
  const number = sectionNumberFor(sectionId);
  const category = categories.find((item) => item.number === number);
  return {
    sectionId,
    groupIds: category ? [...category.groupIds] : [],
    wholeCategory: false,
    noBirthYear: false,
  };
}

export function placementKey(placement: CurrentPlacement): string {
  if (placement.wholeCategory) return 'WHOLE';
  if (placement.noBirthYear) return 'NO_BIRTH_YEAR';
  const prefix = placement.sectionId === 'REMAINDER' ? 'REMAINDER' : 'GROUPS';
  return `${prefix}:${[...new Set(placement.groupIds)].sort().join('|')}`;
}

/**
 * Places a row in a race of its own protocol category. Captured membership wins;
 * otherwise a non-captured row joins a race only when its current membership is
 * exactly that race's frozen membership.
 */
export function racePlacementForRow(
  races: readonly RaceScopeRow[],
  input: {
    enrollmentId: string | null;
    registrationId: string;
    placement: CurrentPlacement;
  },
): RacePlacement | null {
  for (const race of races) {
    if (
      (input.enrollmentId != null &&
        race.capturedEnrollmentIds.includes(input.enrollmentId)) ||
      race.capturedRegistrationIds.includes(input.registrationId)
    ) {
      return { race, role: 'CAPTURED' };
    }
  }
  const whole = races.find((race) => race.targetWholeCategory);
  if (whole) return { race: whole, role: 'OUTSIDE_RACE' };
  if (input.placement.wholeCategory) {
    return null;
  }
  const key = placementKey(input.placement);
  const matched = races.find(
    (race) => !race.targetWholeCategory && race.targetKey === key,
  );
  return matched ? { race: matched, role: 'OUTSIDE_RACE' } : null;
}

export function ageGroupOf(
  birthYear: number | null,
  controlYear: number,
): string | null {
  return ageGroupFor(birthYear, controlYear);
}
