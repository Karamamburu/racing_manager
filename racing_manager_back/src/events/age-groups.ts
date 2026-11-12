export type AgeGroupId =
  | 'AGE_LE_14'
  | 'AGE_15_16'
  | 'AGE_17_18'
  | 'AGE_19_20'
  | 'AGE_21_23'
  | 'AGE_24_40'
  | 'AGE_41_50'
  | 'AGE_51_60'
  | 'AGE_61_PLUS';

export type AgePresetId = 'PRESET_JUNIOR_UNDER_24' | 'PRESET_MASTERS_41_PLUS';

export type AgeSectionId =
  | AgeGroupId
  | AgePresetId
  | 'REMAINDER'
  | 'NO_BIRTH_YEAR';

export type AgeSectionKind = 'BASE_GROUP' | 'PRESET';

export type StoredAgeSection = {
  sectionId: AgeSectionId;
  sectionKind: AgeSectionKind;
  sortOrder: number;
};

export const AGE_GROUPS: readonly {
  id: AgeGroupId;
  minAge: number;
  maxAge: number | null;
  displayRange: string;
  youngestBound: number;
  labels: { M: string; F: string };
}[] = [
  {
    id: 'AGE_LE_14',
    minAge: 0,
    maxAge: 14,
    displayRange: '≤14',
    youngestBound: 0,
    labels: { M: 'Юноши младшего возраста', F: 'Девушки младшего возраста' },
  },
  {
    id: 'AGE_15_16',
    minAge: 15,
    maxAge: 16,
    displayRange: '15–16',
    youngestBound: 15,
    labels: { M: 'Юноши среднего возраста', F: 'Девушки среднего возраста' },
  },
  {
    id: 'AGE_17_18',
    minAge: 17,
    maxAge: 18,
    displayRange: '17–18',
    youngestBound: 17,
    labels: { M: 'Юноши старшего возраста', F: 'Девушки старшего возраста' },
  },
  {
    id: 'AGE_19_20',
    minAge: 19,
    maxAge: 20,
    displayRange: '19–20',
    youngestBound: 19,
    labels: { M: 'Юниоры', F: 'Юниорки' },
  },
  {
    id: 'AGE_21_23',
    minAge: 21,
    maxAge: 23,
    displayRange: '21–23',
    youngestBound: 21,
    labels: { M: 'Юниоры', F: 'Юниорки' },
  },
  {
    id: 'AGE_24_40',
    minAge: 24,
    maxAge: 40,
    displayRange: '24–40',
    youngestBound: 24,
    labels: { M: 'Мужчины', F: 'Женщины' },
  },
  {
    id: 'AGE_41_50',
    minAge: 41,
    maxAge: 50,
    displayRange: '41–50',
    youngestBound: 41,
    labels: { M: 'Мастер 1', F: 'Мастер 1' },
  },
  {
    id: 'AGE_51_60',
    minAge: 51,
    maxAge: 60,
    displayRange: '51–60',
    youngestBound: 51,
    labels: { M: 'Мастер 2', F: 'Мастер 2' },
  },
  {
    id: 'AGE_61_PLUS',
    minAge: 61,
    maxAge: null,
    displayRange: '61+',
    youngestBound: 61,
    labels: { M: 'Мастер 3', F: 'Мастер 3' },
  },
];

export const AGE_PRESETS: readonly {
  id: AgePresetId;
  title: string;
  groupIds: readonly AgeGroupId[];
  youngestBound: number;
}[] = [
  {
    id: 'PRESET_JUNIOR_UNDER_24',
    title: 'Юниоры и младше (<24)',
    groupIds: ['AGE_LE_14', 'AGE_15_16', 'AGE_17_18', 'AGE_19_20', 'AGE_21_23'],
    youngestBound: 0,
  },
  {
    id: 'PRESET_MASTERS_41_PLUS',
    title: 'Мастера 41+',
    groupIds: ['AGE_41_50', 'AGE_51_60', 'AGE_61_PLUS'],
    youngestBound: 41,
  },
];

export const REMAINDER_TITLE = 'Остальные участники';

export const NO_BIRTH_YEAR_TITLE = 'Возраст не указан';

const DEFAULT_TIME_ZONE = 'Europe/Moscow';
const SEASON_START_MONTH = 7;
const REMAINDER_BOUND = Number.MAX_SAFE_INTEGER - 1;
const NO_BIRTH_YEAR_BOUND = Number.MAX_SAFE_INTEGER;

function findAgeGroup(id: string): (typeof AGE_GROUPS)[number] | undefined {
  return AGE_GROUPS.find((group) => group.id === id);
}

function findPreset(id: string): (typeof AGE_PRESETS)[number] | undefined {
  return AGE_PRESETS.find((preset) => preset.id === id);
}

function youngestBoundOf(
  section: Pick<StoredAgeSection, 'sectionId' | 'sectionKind'>,
): number {
  const group = findAgeGroup(section.sectionId);
  if (group) {
    return group.youngestBound;
  }
  const preset = findPreset(section.sectionId);
  if (preset) {
    return preset.youngestBound;
  }
  if (section.sectionId === 'REMAINDER') {
    return REMAINDER_BOUND;
  }
  return NO_BIRTH_YEAR_BOUND;
}

/**
 * The season runs 1 July – 30 June, so the season's `controlYear` is the
 * calendar year it ends in, derived from the event's date in the event zone.
 */
export function resolveControlYear(
  eventDate: Date,
  timeZone = DEFAULT_TIME_ZONE,
): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(eventDate);
  const yearPart = parts.find((part) => part.type === 'year');
  const monthPart = parts.find((part) => part.type === 'month');
  const year = yearPart ? Number(yearPart.value) : Number.NaN;
  const month = monthPart ? Number(monthPart.value) : Number.NaN;
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    throw new RangeError('Event date cannot be resolved in the event zone');
  }
  return month >= SEASON_START_MONTH ? year + 1 : year;
}

export function ageGroupFor(
  birthYear: number | null,
  controlYear: number,
): AgeGroupId | null {
  if (birthYear === null || birthYear > controlYear) {
    return null;
  }
  const age = controlYear - birthYear;
  const group = AGE_GROUPS.find(
    (candidate) =>
      age >= candidate.minAge &&
      (candidate.maxAge === null || age <= candidate.maxAge),
  );
  return group ? group.id : null;
}

export function sectionForBirthYear(
  birthYear: number | null,
  controlYear: number,
  sections: readonly StoredAgeSection[],
): AgeSectionId {
  const groupId = ageGroupFor(birthYear, controlYear);
  if (groupId === null) {
    return 'NO_BIRTH_YEAR';
  }
  const preset = sections.find(
    (section) =>
      section.sectionKind === 'PRESET' &&
      groupIdsInSection(section).includes(groupId),
  );
  if (preset) {
    return preset.sectionId;
  }
  const base = sections.find(
    (section) =>
      section.sectionKind === 'BASE_GROUP' && section.sectionId === groupId,
  );
  return base ? base.sectionId : 'REMAINDER';
}

export function groupIdsInSection(
  section: Pick<StoredAgeSection, 'sectionId' | 'sectionKind'>,
): readonly AgeGroupId[] {
  if (section.sectionKind === 'PRESET') {
    return findPreset(section.sectionId)?.groupIds ?? [];
  }
  return isAgeGroupId(section.sectionId) ? [section.sectionId] : [];
}

export function sectionTitle(
  section: Pick<StoredAgeSection, 'sectionId' | 'sectionKind'>,
  gender: 'M' | 'F',
): string {
  if (section.sectionId === 'REMAINDER') {
    return REMAINDER_TITLE;
  }
  if (section.sectionId === 'NO_BIRTH_YEAR') {
    return NO_BIRTH_YEAR_TITLE;
  }
  if (section.sectionKind === 'PRESET') {
    const preset = findPreset(section.sectionId);
    if (preset) {
      return preset.title;
    }
  }
  if (isAgeGroupId(section.sectionId)) {
    const group = findAgeGroup(section.sectionId);
    if (group) {
      return `${group.labels[gender]} (${group.displayRange})`;
    }
  }
  throw new RangeError(`Unknown age section: ${section.sectionId}`);
}

export function orderSections(
  sections: readonly StoredAgeSection[],
): StoredAgeSection[] {
  return [...sections].sort((a, b) => {
    const boundDifference = youngestBoundOf(a) - youngestBoundOf(b);
    if (boundDifference !== 0) {
      return boundDifference;
    }
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    if (a.sectionId === b.sectionId) {
      return 0;
    }
    return a.sectionId < b.sectionId ? -1 : 1;
  });
}

export function isAgeGroupId(value: string): value is AgeGroupId {
  return AGE_GROUPS.some((group) => group.id === value);
}

export function isAgePresetId(value: string): value is AgePresetId {
  return AGE_PRESETS.some((preset) => preset.id === value);
}

export function isStoredSectionId(value: string): boolean {
  return isAgeGroupId(value) || isAgePresetId(value);
}

// ---------------------------------------------------------------------------
// AGE-CATEGORIES: arbitrary age categories built from the base groups.
// The legacy section model above stays exported for the stored rows that are
// still read as conversion input.
// ---------------------------------------------------------------------------

export type AgeCategorySectionId =
  | `CATEGORY_${number}`
  | 'REMAINDER'
  | 'NO_BIRTH_YEAR';

export type AgeCategory = {
  number: number;
  groupIds: readonly AgeGroupId[];
};

export type StoredAgeCategoryRow = {
  categoryNumber: number;
  groupId: string;
};

export const CATEGORY_TITLE_PREFIX = 'Категория';

export function categorySectionId(number: number): AgeCategorySectionId {
  return `CATEGORY_${number}`;
}

export function categoryTitle(number: number): string {
  return `${CATEGORY_TITLE_PREFIX} ${number}`;
}

/**
 * Resolves the known groups of a category once, deduplicated and in catalog
 * order, so every derived value ignores unknown ids the same way.
 */
function knownGroups(
  groupIds: readonly string[],
): (typeof AGE_GROUPS)[number][] {
  const seen = new Set<string>();
  const groups: (typeof AGE_GROUPS)[number][] = [];
  for (const groupId of groupIds) {
    if (seen.has(groupId)) {
      continue;
    }
    const group = findAgeGroup(groupId);
    if (!group) {
      continue;
    }
    seen.add(groupId);
    groups.push(group);
  }
  return groups.sort((a, b) => a.youngestBound - b.youngestBound);
}

export function categorySubtitle(groupIds: readonly AgeGroupId[]): string {
  return knownGroups(groupIds)
    .map((group) => group.displayRange)
    .join(', ');
}

export function categoryYoungestBound(groupIds: readonly AgeGroupId[]): number {
  const groups = knownGroups(groupIds);
  if (groups.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return groups[0].youngestBound;
}

export function normalizeAgeCategories(
  input: readonly { groupIds: readonly string[] }[],
): AgeCategory[] {
  const assigned = new Set<AgeGroupId>();
  const categories: AgeCategory[] = [];
  for (const entry of input) {
    const groupIds = knownGroups(entry.groupIds)
      .map((group) => group.id)
      .filter((groupId) => !assigned.has(groupId));
    if (groupIds.length === 0) {
      continue;
    }
    groupIds.forEach((groupId) => assigned.add(groupId));
    categories.push({ number: categories.length + 1, groupIds });
  }
  return categories;
}

export function categoriesFromStoredRows(
  rows: readonly StoredAgeCategoryRow[],
): AgeCategory[] {
  const groupsByNumber = new Map<number, string[]>();
  const ordered = [...rows].sort((a, b) => a.categoryNumber - b.categoryNumber);
  for (const row of ordered) {
    const groupIds = groupsByNumber.get(row.categoryNumber) ?? [];
    groupIds.push(row.groupId);
    groupsByNumber.set(row.categoryNumber, groupIds);
  }
  return normalizeAgeCategories(
    [...groupsByNumber.values()].map((groupIds) => ({ groupIds })),
  );
}

export function convertLegacySections(
  rows: readonly {
    sectionId: string;
    sectionKind: string;
    sortOrder: number;
  }[],
): AgeCategory[] {
  const ordered = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  const input: { groupIds: readonly string[] }[] = ordered.map((row) => {
    if (row.sectionKind === 'BASE_GROUP' && isAgeGroupId(row.sectionId)) {
      return { groupIds: [row.sectionId] };
    }
    if (row.sectionKind === 'PRESET') {
      return { groupIds: findPreset(row.sectionId)?.groupIds ?? [] };
    }
    return { groupIds: [] };
  });
  return normalizeAgeCategories(input);
}

export function orderCategoriesByAge(
  categories: readonly AgeCategory[],
): AgeCategory[] {
  return categories
    .map((category, index) => ({ category, index }))
    .sort((a, b) => {
      const boundDifference =
        categoryYoungestBound(a.category.groupIds) -
        categoryYoungestBound(b.category.groupIds);
      return boundDifference !== 0 ? boundDifference : a.index - b.index;
    })
    .map((entry) => entry.category);
}

export function categoryForBirthYear(
  birthYear: number | null,
  controlYear: number,
  categories: readonly AgeCategory[],
): AgeCategorySectionId {
  const groupId = ageGroupFor(birthYear, controlYear);
  if (groupId === null) {
    return 'NO_BIRTH_YEAR';
  }
  const category = categories.find((candidate) =>
    candidate.groupIds.includes(groupId),
  );
  return category ? categorySectionId(category.number) : 'REMAINDER';
}
