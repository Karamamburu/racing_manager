import type { AgeGroupId } from '../../shared/types/event';

export type AgeCategoryGroup = {
  id: AgeGroupId;
  range: string;
  labels: { M: string; F: string };
  youngestBound: number;
};

/**
 * FLGR base groups in ascending age order, with the dialog labels and ranges.
 * This is the only catalog the custom age categories and the protocol share.
 */
export const AGE_CATEGORY_GROUPS: readonly AgeCategoryGroup[] = [
  {
    id: 'AGE_LE_14',
    range: '≤14',
    labels: {
      M: 'Юноши младшего возраста',
      F: 'Девушки младшего возраста',
    },
    youngestBound: 0,
  },
  {
    id: 'AGE_15_16',
    range: '15–16',
    labels: {
      M: 'Юноши среднего возраста',
      F: 'Девушки среднего возраста',
    },
    youngestBound: 15,
  },
  {
    id: 'AGE_17_18',
    range: '17–18',
    labels: {
      M: 'Юноши старшего возраста',
      F: 'Девушки старшего возраста',
    },
    youngestBound: 17,
  },
  {
    id: 'AGE_19_20',
    range: '19–20',
    labels: { M: 'Юниоры', F: 'Юниорки' },
    youngestBound: 19,
  },
  {
    id: 'AGE_21_23',
    range: '21–23',
    labels: { M: 'Юниоры', F: 'Юниорки' },
    youngestBound: 21,
  },
  {
    id: 'AGE_24_40',
    range: '24–40',
    labels: { M: 'Мужчины', F: 'Женщины' },
    youngestBound: 24,
  },
  {
    id: 'AGE_41_50',
    range: '41–50',
    labels: { M: 'Мастер 1', F: 'Мастер 1' },
    youngestBound: 41,
  },
  {
    id: 'AGE_51_60',
    range: '51–60',
    labels: { M: 'Мастер 2', F: 'Мастер 2' },
    youngestBound: 51,
  },
  {
    id: 'AGE_61_PLUS',
    range: '61+',
    labels: { M: 'Мастер 3', F: 'Мастер 3' },
    youngestBound: 61,
  },
];

export const CATEGORY_TITLE_PREFIX = 'Возрастная категория';

function findGroup(groupId: AgeGroupId): AgeCategoryGroup | undefined {
  return AGE_CATEGORY_GROUPS.find((group) => group.id === groupId);
}

export function categoryTitle(number: number): string {
  return `${CATEGORY_TITLE_PREFIX} ${number}`;
}

export function groupRange(groupId: AgeGroupId): string {
  return findGroup(groupId)?.range ?? groupId;
}

export function groupLabel(groupId: AgeGroupId, gender: 'M' | 'F'): string {
  return findGroup(groupId)?.labels[gender] ?? groupId;
}

/** Member ranges in ascending age order, joined by `, `. */
export function categorySubtitle(groupIds: readonly AgeGroupId[]): string {
  const members = new Set(groupIds);
  return AGE_CATEGORY_GROUPS.filter((group) => members.has(group.id))
    .map((group) => group.range)
    .join(', ');
}

/** Smallest member bound; a category without groups sorts after every other. */
export function categoryYoungestBound(
  groupIds: readonly AgeGroupId[],
): number {
  const members = new Set(groupIds);
  let bound = Number.POSITIVE_INFINITY;
  for (const group of AGE_CATEGORY_GROUPS) {
    if (members.has(group.id) && group.youngestBound < bound) {
      bound = group.youngestBound;
    }
  }
  return bound;
}

/**
 * Ascending by the youngest member bound. `sort` is stable, so equal bounds
 * keep their payload order.
 */
export function orderCategoriesByAge<
  T extends { groupIds: readonly AgeGroupId[] },
>(categories: readonly T[]): T[] {
  return [...categories].sort((left, right) => {
    const leftBound = categoryYoungestBound(left.groupIds);
    const rightBound = categoryYoungestBound(right.groupIds);
    if (leftBound === rightBound) return 0;
    return leftBound < rightBound ? -1 : 1;
  });
}
