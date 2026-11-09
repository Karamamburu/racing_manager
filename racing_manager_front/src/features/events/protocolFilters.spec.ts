import { describe, expect, it } from 'vitest';
import type { EventParticipant } from '../../shared/types/event';
import {
  collectProtocolFilterValues,
  emptyProtocolFilters,
  filterProtocolParticipants,
  hasActiveProtocolFilters,
} from './protocolFilters';

function participant(
  id: string,
  overrides: Partial<EventParticipant> = {},
): EventParticipant {
  return {
    id,
    enrollmentId: `enrollment-${id}`,
    startId: 'start-1',
    startLabel: 'Старт',
    sortOrder: 0,
    enrollmentStatus: 'REGISTERED',
    userId: null,
    fullName: `Участник ${id}`,
    birthYear: null,
    gender: 'M',
    city: null,
    district: null,
    team: null,
    startNumber: null,
    finishTimeMs: null,
    outcome: null,
    place: null,
    format: null,
    laps: [],
    status: 'CONFIRMED',
    isCupEligible: false,
    note: null,
    registeredAt: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

const rows: EventParticipant[] = [
  participant('1', {
    fullName: 'Иван Петров',
    city: ' Москва ',
    team: 'Метеор',
  }),
  participant('2', {
    fullName: 'Мария Иванова',
    city: 'москва',
    team: ' метеор ',
  }),
  participant('3', {
    fullName: 'Пётр Сидоров',
    city: 'Химки',
    team: 'Сокол',
  }),
  participant('4', {
    fullName: 'Анна Смирнова',
    city: 'Путилково',
    team: null,
  }),
  participant('5', {
    fullName: 'Олег Безгородов',
    city: '   ',
    team: '',
  }),
];

describe('collectProtocolFilterValues', () => {
  it('trims, drops blanks, de-duplicates case-insensitively, and sorts', () => {
    expect(collectProtocolFilterValues(rows, 'city')).toEqual([
      'Москва',
      'Путилково',
      'Химки',
    ]);
    expect(collectProtocolFilterValues(rows, 'team')).toEqual([
      'Метеор',
      'Сокол',
    ]);
  });

  it('returns no options for an empty protocol', () => {
    expect(collectProtocolFilterValues([], 'city')).toEqual([]);
  });
});

describe('hasActiveProtocolFilters', () => {
  it('stays inactive for blank query and empty selections', () => {
    expect(hasActiveProtocolFilters(emptyProtocolFilters)).toBe(false);
    expect(hasActiveProtocolFilters({ query: '   ', cities: [], teams: [] })).toBe(
      false,
    );
  });

  it('activates for a query, a city, or a team', () => {
    expect(hasActiveProtocolFilters({ query: 'иван', cities: [], teams: [] })).toBe(
      true,
    );
    expect(hasActiveProtocolFilters({ query: '', cities: ['Химки'], teams: [] })).toBe(
      true,
    );
    expect(hasActiveProtocolFilters({ query: '', cities: [], teams: ['Сокол'] })).toBe(
      true,
    );
  });
});

describe('filterProtocolParticipants', () => {
  it('returns every row unchanged when all controls are empty', () => {
    const result = filterProtocolParticipants(rows, emptyProtocolFilters);
    expect(result).toHaveLength(rows.length);
    expect(rows).toHaveLength(5);
  });

  it('matches a trimmed case-insensitive substring of fullName', () => {
    const result = filterProtocolParticipants(rows, {
      ...emptyProtocolFilters,
      query: '  ПЕТРОВ ',
    });
    expect(result.map((row) => row.id)).toEqual(['1']);
  });

  it('treats ё and е as equal in search', () => {
    const result = filterProtocolParticipants(rows, {
      ...emptyProtocolFilters,
      query: 'петр',
    });
    expect(result.map((row) => row.id)).toEqual(['1', '3']);
  });

  it('does not mutate the input array', () => {
    const snapshot = [...rows];
    filterProtocolParticipants(rows, {
      ...emptyProtocolFilters,
      cities: ['Химки'],
    });
    expect(rows).toEqual(snapshot);
  });

  it('combines multiple cities with OR', () => {
    const result = filterProtocolParticipants(rows, {
      ...emptyProtocolFilters,
      cities: ['Химки', 'Путилково'],
    });
    expect(result.map((row) => row.id)).toEqual(['3', '4']);
  });

  it('combines multiple teams with OR and trims selected values', () => {
    const result = filterProtocolParticipants(rows, {
      ...emptyProtocolFilters,
      teams: [' сокол ', 'МЕТЕОР'],
    });
    expect(result.map((row) => row.id)).toEqual(['1', '2', '3']);
  });

  it('combines search, city, and team with AND', () => {
    const result = filterProtocolParticipants(rows, {
      query: 'мария',
      cities: ['Москва'],
      teams: ['Метеор'],
    });
    expect(result.map((row) => row.id)).toEqual(['2']);
  });

  it('never matches a blank city or team when a value is selected', () => {
    expect(
      filterProtocolParticipants(rows, {
        ...emptyProtocolFilters,
        cities: ['Химки'],
      }).map((row) => row.id),
    ).not.toContain('5');
    expect(
      filterProtocolParticipants(rows, {
        ...emptyProtocolFilters,
        teams: ['Сокол'],
      }).map((row) => row.id),
    ).not.toContain('5');
  });

  it('returns an empty array when nothing matches', () => {
    expect(
      filterProtocolParticipants(rows, {
        ...emptyProtocolFilters,
        query: 'нет-такого',
      }),
    ).toEqual([]);
  });
});
