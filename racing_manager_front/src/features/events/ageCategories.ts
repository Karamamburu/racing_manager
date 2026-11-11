import type { AgeGroupId } from '../../shared/types/event';

export type AgeCategoryGroup = {
  id: AgeGroupId;
  range: string;
  /** Official combined FLGR name, identical for both genders. */
  name: string;
  youngestBound: number;
};

/**
 * FLGR base groups in ascending age order, with the official combined names
 * from `docs/flgr-age-categories.md` and the display ranges.
 * This is the only catalog the custom age categories and the protocol share.
 */
export const AGE_CATEGORY_GROUPS: readonly AgeCategoryGroup[] = [
  {
    id: 'AGE_LE_14',
    range: '≤14',
    name: 'Юноши и девушки младшего возраста',
    youngestBound: 0,
  },
  {
    id: 'AGE_15_16',
    range: '15–16',
    name: 'Юноши и девушки среднего возраста',
    youngestBound: 15,
  },
  {
    id: 'AGE_17_18',
    range: '17–18',
    name: 'Юноши и девушки старшего возраста',
    youngestBound: 17,
  },
  {
    id: 'AGE_19_20',
    range: '19–20',
    name: 'Юниоры и юниорки',
    youngestBound: 19,
  },
  {
    id: 'AGE_21_23',
    range: '21–23',
    name: 'Юниоры и юниорки',
    youngestBound: 21,
  },
  {
    id: 'AGE_24_40',
    range: '24–40',
    name: 'Мужчины и женщины',
    youngestBound: 24,
  },
  {
    id: 'AGE_41_50',
    range: '41–50',
    name: 'Мастер 1',
    youngestBound: 41,
  },
  {
    id: 'AGE_51_60',
    range: '51–60',
    name: 'Мастер 2',
    youngestBound: 51,
  },
  {
    id: 'AGE_61_PLUS',
    range: '61+',
    name: 'Мастер 3 (ветераны)',
    youngestBound: 61,
  },
];

export const CATEGORY_TITLE_PREFIX = 'Категория';

function findGroup(groupId: AgeGroupId): AgeCategoryGroup | undefined {
  return AGE_CATEGORY_GROUPS.find((group) => group.id === groupId);
}

function isAgeGroupId(value: string): value is AgeGroupId {
  return AGE_CATEGORY_GROUPS.some((group) => group.id === value);
}

function emptyCounts(): Record<AgeGroupId, number> {
  return {
    AGE_LE_14: 0,
    AGE_15_16: 0,
    AGE_17_18: 0,
    AGE_19_20: 0,
    AGE_21_23: 0,
    AGE_24_40: 0,
    AGE_41_50: 0,
    AGE_51_60: 0,
    AGE_61_PLUS: 0,
  };
}

export function categoryTitle(number: number): string {
  return `${CATEGORY_TITLE_PREFIX} ${number}`;
}

export function groupRange(groupId: AgeGroupId): string {
  return findGroup(groupId)?.range ?? groupId;
}

/** Official combined group name; gender-independent by design. */
export function groupName(groupId: AgeGroupId): string {
  return findGroup(groupId)?.name ?? groupId;
}

/**
 * @deprecated The combined names no longer depend on gender; use
 * {@link groupName}. The gender argument is ignored and the wrapper goes away
 * once the dialog stops passing it.
 */
export function groupLabel(groupId: AgeGroupId, gender: 'M' | 'F'): string {
  // Gender no longer selects a name; the combined official name wins.
  void gender;
  return groupName(groupId);
}

/** Picker option label: count first, then the official name and its range. */
export function groupOptionLabel(groupId: AgeGroupId, count: number): string {
  return `${count} - ${groupName(groupId)} (${groupRange(groupId)})`;
}

/** Participant count per base group; every group is present, zero-filled. */
export function countAgeGroups(
  rows: readonly { ageGroupId?: string | null }[],
): Record<AgeGroupId, number> {
  const counts = emptyCounts();
  for (const row of rows) {
    const groupId = row.ageGroupId;
    if (groupId == null) continue;
    if (!isAgeGroupId(groupId)) continue;
    counts[groupId] += 1;
  }
  return counts;
}

/**
 * Groups the picker offers: a populated group or one selected in the draft,
 * always in catalog order.
 */
export function visibleGroupIds(
  counts: Record<AgeGroupId, number>,
  selected: readonly AgeGroupId[],
): AgeGroupId[] {
  const chosen = new Set(selected);
  return AGE_CATEGORY_GROUPS.filter(
    (group) => counts[group.id] > 0 || chosen.has(group.id),
  ).map((group) => group.id);
}

/**
 * Add is unavailable while no group is populated and while every populated
 * group already sits in an assigned tab; releasing one populated group brings
 * the action back.
 */
export function isAddDisabled(
  counts: Record<AgeGroupId, number>,
  assigned: readonly AgeGroupId[],
): boolean {
  const populated = AGE_CATEGORY_GROUPS.filter(
    (group) => counts[group.id] > 0,
  );
  if (populated.length === 0) return true;
  const taken = new Set(assigned);
  return populated.every((group) => taken.has(group.id));
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
