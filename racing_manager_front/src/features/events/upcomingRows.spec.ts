import { describe, expect, it } from 'vitest';
import type { RecentEventRow, StartResponse } from '../../shared/types/event';
import { buildUpcomingRows } from './upcomingRows';

function start(overrides: Partial<StartResponse> = {}): StartResponse {
  return {
    id: 'start-a',
    purposeType: 'CUP_RACE',
    formatIds: [1],
    lapCount: 5,
    lapLengthMeters: 2000,
    displayName: null,
    routeColor: null,
    sortOrder: 0,
    resolvedLabel: 'Кубковая гонка — 10 км',
    legacyEffectiveDistanceM: null,
    displayedDistanceMeters: 10000,
    ...overrides,
  };
}

function event(overrides: Partial<RecentEventRow> = {}): RecentEventRow {
  return {
    id: 'event-1',
    name: 'Кубок',
    eventDate: '2026-11-07T00:00:00.000Z',
    distanceKm: 10,
    status: 'PLANNED',
    trackName: 'Алёшкино',
    registeredCount: 12,
    starts: [],
    ...overrides,
  };
}

describe('buildUpcomingRows', () => {
  it('creates parent rows with an empty distance and one child per start', () => {
    const rows = buildUpcomingRows([
      event({
        starts: [
          {
            ...start({
              id: 'start-b',
              sortOrder: 1,
              resolvedLabel: 'Разминка',
              displayedDistanceMeters: 1000,
            }),
            registeredCount: 3,
          },
          {
            ...start({ id: 'start-a' }),
            registeredCount: 5,
          },
        ],
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event: 'Кубок',
      distanceKm: null,
      registeredCount: 8,
    });
    expect(rows[0].children?.map((row) => row.event)).toEqual([
      'Кубковая гонка — 10 км',
      'Разминка',
    ]);
    expect(rows[0].children?.[0]).toMatchObject({
      distanceKm: 10,
      registeredCount: 5,
      isStart: true,
    });
    expect(rows[0].children?.[1]).toMatchObject({
      distanceKm: 1,
      registeredCount: 3,
    });
  });

  it('keeps a child row for a single-start event', () => {
    const rows = buildUpcomingRows([
      event({ starts: [{ ...start(), registeredCount: 2 }] }),
    ]);

    expect(rows[0].distanceKm).toBeNull();
    expect(rows[0].children).toHaveLength(1);
    expect(rows[0].registeredCount).toBe(2);
  });

  it('adds no children when the event has no starts', () => {
    const rows = buildUpcomingRows([event()]);

    expect(rows[0].children).toBeUndefined();
    expect(rows[0].distanceKm).toBeNull();
    expect(rows[0].registeredCount).toBe(12);
  });

  it('sums per-start registrations for the parent instead of the event registrations', () => {
    const rows = buildUpcomingRows([
      event({
        registeredCount: 1,
        starts: [
          { ...start({ id: 'start-a' }), registeredCount: 4 },
          { ...start({ id: 'start-b', sortOrder: 1 }), registeredCount: 6 },
        ],
      }),
    ]);

    expect(rows[0].registeredCount).toBe(10);
  });

  it('uses the legacy override as the child distance', () => {
    const rows = buildUpcomingRows([
      event({
        starts: [
          {
            ...start({ legacyEffectiveDistanceM: 9500 }),
            registeredCount: 1,
          },
        ],
      }),
    ]);

    expect(rows[0].children?.[0].distanceKm).toBe(9.5);
  });

  it('does not mutate the input start order', () => {
    const starts = [
      { ...start({ id: 'b', sortOrder: 1 }), registeredCount: 1 },
      { ...start({ id: 'a' }), registeredCount: 1 },
    ];
    buildUpcomingRows([event({ starts })]);

    expect(starts.map((row) => row.id)).toEqual(['b', 'a']);
  });
});
