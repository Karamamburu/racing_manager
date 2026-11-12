import { describe, expect, it } from 'vitest';
import type { AgeGroupId } from '../../shared/types/event';
import {
  AGE_CATEGORY_GROUPS,
  countAgeGroups,
  groupName,
  groupOptionLabel,
  isAddDisabled,
  visibleGroupIds,
} from './ageCategories';

const COMBINED_NAMES = [
  'Юноши и девушки младшего возраста',
  'Юноши и девушки среднего возраста',
  'Юноши и девушки старшего возраста',
  'Юниоры и юниорки',
  'Юниоры и юниорки',
  'Мужчины и женщины',
  'Мастер 1',
  'Мастер 2',
  'Мастер 3 (ветераны)',
];

const ALL_GROUP_IDS: AgeGroupId[] = [
  'AGE_LE_14',
  'AGE_15_16',
  'AGE_17_18',
  'AGE_19_20',
  'AGE_21_23',
  'AGE_24_40',
  'AGE_41_50',
  'AGE_51_60',
  'AGE_61_PLUS',
];

function zeroCounts(): Record<AgeGroupId, number> {
  const counts: Record<AgeGroupId, number> = {
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
  return counts;
}

describe('ageCategories catalog', () => {
  it('carries the nine official combined FLGR names in age order', () => {
    expect(AGE_CATEGORY_GROUPS.map((group) => group.name)).toEqual(
      COMBINED_NAMES,
    );
    expect(AGE_CATEGORY_GROUPS.map((group) => group.id)).toEqual(ALL_GROUP_IDS);
    for (const group of AGE_CATEGORY_GROUPS) {
      expect(groupName(group.id)).toBe(group.name);
    }
  });

  it('labels a picker option with the count, the combined name and the range', () => {
    expect(groupOptionLabel('AGE_LE_14', 0)).toBe(
      '0 - Юноши и девушки младшего возраста (≤14)',
    );
    expect(groupOptionLabel('AGE_15_16', 4)).toBe(
      '4 - Юноши и девушки среднего возраста (15–16)',
    );
    expect(groupOptionLabel('AGE_24_40', 7)).toBe(
      '7 - Мужчины и женщины (24–40)',
    );
    expect(groupOptionLabel('AGE_61_PLUS', 12)).toBe(
      '12 - Мастер 3 (ветераны) (61+)',
    );
  });

  it('distinguishes the two junior bands by their ranges', () => {
    expect(groupOptionLabel('AGE_19_20', 3)).toBe(
      '3 - Юниоры и юниорки (19–20)',
    );
    expect(groupOptionLabel('AGE_21_23', 0)).toBe(
      '0 - Юниоры и юниорки (21–23)',
    );
  });
});

describe('countAgeGroups', () => {
  it('zero-fills every base group for an empty row list', () => {
    expect(countAgeGroups([])).toEqual(zeroCounts());
    expect(Object.keys(countAgeGroups([]))).toEqual(ALL_GROUP_IDS);
  });

  it('counts one per row and repeats the same group', () => {
    const counts = countAgeGroups([
      { ageGroupId: 'AGE_24_40' },
      { ageGroupId: 'AGE_24_40' },
      { ageGroupId: 'AGE_24_40' },
      { ageGroupId: 'AGE_61_PLUS' },
    ]);
    expect(counts.AGE_24_40).toBe(3);
    expect(counts.AGE_61_PLUS).toBe(1);
    expect(counts.AGE_LE_14).toBe(0);
  });

  it('ignores missing, null and unknown group ids', () => {
    const counts = countAgeGroups([
      { ageGroupId: null },
      { ageGroupId: undefined },
      {},
      { ageGroupId: 'AGE_RETIRED' },
      { ageGroupId: 'AGE_15_16' },
    ]);
    expect(counts).toEqual({ ...zeroCounts(), AGE_15_16: 1 });
  });
});

describe('visibleGroupIds', () => {
  it('offers only populated groups in catalog order', () => {
    const counts = zeroCounts();
    counts.AGE_61_PLUS = 2;
    counts.AGE_LE_14 = 5;
    counts.AGE_41_50 = 1;
    expect(visibleGroupIds(counts, [])).toEqual([
      'AGE_LE_14',
      'AGE_41_50',
      'AGE_61_PLUS',
    ]);
  });

  it('keeps a selected zero-count group offered in catalog order', () => {
    const counts = zeroCounts();
    counts.AGE_24_40 = 1;
    expect(visibleGroupIds(counts, ['AGE_21_23', 'AGE_61_PLUS'])).toEqual([
      'AGE_21_23',
      'AGE_24_40',
      'AGE_61_PLUS',
    ]);
  });

  it('offers nothing when no group is populated and none is selected', () => {
    expect(visibleGroupIds(zeroCounts(), [])).toEqual([]);
  });
});

describe('isAddDisabled', () => {
  it('disables add while no group is populated', () => {
    expect(isAddDisabled(zeroCounts(), [])).toBe(true);
    expect(isAddDisabled(zeroCounts(), ['AGE_24_40'])).toBe(true);
  });

  it('keeps add available while a populated group is unassigned', () => {
    const counts = zeroCounts();
    counts.AGE_24_40 = 2;
    counts.AGE_41_50 = 1;
    expect(isAddDisabled(counts, [])).toBe(false);
    expect(isAddDisabled(counts, ['AGE_24_40'])).toBe(false);
  });

  it('disables add once every populated group is assigned', () => {
    const counts = zeroCounts();
    counts.AGE_24_40 = 2;
    counts.AGE_41_50 = 1;
    expect(isAddDisabled(counts, ['AGE_24_40', 'AGE_41_50'])).toBe(true);
  });

  it('does not treat a selected zero-count group as addable', () => {
    const counts = zeroCounts();
    counts.AGE_15_16 = 1;
    expect(isAddDisabled(counts, ['AGE_15_16', 'AGE_51_60'])).toBe(true);
  });
});
