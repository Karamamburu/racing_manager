import type { EventParticipant } from '../../shared/types/event';
import type {
  AgeSectionView,
  ClassificationSection,
  GenderGroup,
} from './protocolGroups';

export type ProtocolFilters = {
  query: string;
  cities: string[];
  teams: string[];
};

export const emptyProtocolFilters: ProtocolFilters = {
  query: '',
  cities: [],
  teams: [],
};

export type ProtocolFilterField = 'city' | 'team';

function normalizedValue(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function comparisonKey(value: string): string {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

/**
 * Distinct non-empty values of one protocol column, trimmed, de-duplicated
 * case-insensitively, and sorted for a Russian-speaking organizer.
 */
export function collectProtocolFilterValues(
  rows: EventParticipant[],
  field: ProtocolFilterField,
): string[] {
  const byKey = new Map<string, string>();
  for (const row of rows) {
    const value = normalizedValue(row[field]);
    if (value === null) continue;
    const key = comparisonKey(value);
    if (!byKey.has(key)) byKey.set(key, value);
  }
  return [...byKey.values()].sort((left, right) => left.localeCompare(right, 'ru'));
}

export function hasActiveProtocolFilters(filters: ProtocolFilters): boolean {
  return (
    filters.query.trim().length > 0 ||
    filters.cities.length > 0 ||
    filters.teams.length > 0
  );
}

function matchesSelectedValue(
  value: string | null,
  selected: string[],
): boolean {
  if (selected.length === 0) return true;
  const normalized = normalizedValue(value);
  if (normalized === null) return false;
  const key = comparisonKey(normalized);
  return selected.some((item) => comparisonKey(item.trim()) === key);
}

/**
 * Client-side protocol search: case-insensitive substring on `fullName`,
 * AND across controls, OR within each multi-select. The input array is
 * never mutated.
 */
export function filterProtocolParticipants(
  rows: EventParticipant[],
  filters: ProtocolFilters,
): EventParticipant[] {
  const query = comparisonKey(filters.query.trim());
  return rows.filter((row) => {
    if (query.length > 0 && !comparisonKey(row.fullName).includes(query)) {
      return false;
    }
    if (!matchesSelectedValue(row.city, filters.cities)) return false;
    if (!matchesSelectedValue(row.team, filters.teams)) return false;
    return true;
  });
}

export type FilteredAgeSection = AgeSectionView & {
  visibleRows: EventParticipant[];
};

export type FilteredClassificationSection = Omit<
  ClassificationSection,
  'ageSections'
> & {
  visibleRows: EventParticipant[];
  ageSections: FilteredAgeSection[];
};

export type FilteredGenderGroup = Omit<GenderGroup, 'sections'> & {
  sections: FilteredClassificationSection[];
};

/**
 * Applies the protocol search and filters to every age section, protocol
 * category and gender group. `visibleRows` is what the protocol renders and
 * counts, so an age section or protocol category with no visible row is
 * dropped (U-26, W-10, S-07). `rows` keeps the full set, so category-level
 * actions such as «Завершить гонку» still see every row (U-28).
 */
export function filterProtocolGroups(
  groups: GenderGroup[],
  filters: ProtocolFilters,
): FilteredGenderGroup[] {
  return groups
    .map((group) => ({
      ...group,
      sections: group.sections
        .map((section) => ({
          ...section,
          visibleRows: filterProtocolParticipants(section.rows, filters),
          ageSections: section.ageSections
            .map((ageSection) => ({
              ...ageSection,
              visibleRows: filterProtocolParticipants(
                ageSection.rows,
                filters,
              ),
            }))
            .filter((ageSection) => ageSection.visibleRows.length > 0),
        }))
        .filter((section) => section.visibleRows.length > 0),
    }))
    .filter((group) => group.sections.length > 0);
}
