import { describe, expect, it } from 'vitest';
import type { StartResponse } from '../../shared/types/event';
import {
  buildEnrollments,
  initialEnrollments,
  setEnrollmentFormat,
  toggleEnrollmentStart,
} from './enrollmentPayload';

const starts: StartResponse[] = [
  {
    id: 'start-a',
    purposeType: 'CUP_RACE',
    formatIds: [1, 2],
    lapCount: 5,
    lapLengthMeters: 2000,
    displayName: null,
    sortOrder: 0,
    resolvedLabel: 'Кубковая гонка — 10 км',
    legacyEffectiveDistanceM: null,
    displayedDistanceMeters: 10000,
  },
  {
    id: 'start-b',
    purposeType: 'CONTROL_TRAINING',
    formatIds: [1],
    lapCount: 1,
    lapLengthMeters: 1000,
    displayName: 'Разминка',
    sortOrder: 1,
    resolvedLabel: 'Разминка',
    legacyEffectiveDistanceM: null,
    displayedDistanceMeters: 1000,
  },
];

describe('initialEnrollments', () => {
  it('preselects the first start with the initial format when it fits', () => {
    expect(initialEnrollments(starts, 2)).toEqual([
      { startId: 'start-a', formatId: 2 },
    ]);
  });

  it('falls back to the first format of the first start', () => {
    expect(initialEnrollments(starts)).toEqual([
      { startId: 'start-a', formatId: 1 },
    ]);
    expect(initialEnrollments(starts, 99)).toEqual([
      { startId: 'start-a', formatId: 1 },
    ]);
  });

  it('prefers an explicitly clicked start over the first matching format', () => {
    expect(initialEnrollments(starts, 1, 'start-b')).toEqual([
      { startId: 'start-b', formatId: 1 },
    ]);
  });

  it('returns an empty selection when the event has no starts', () => {
    expect(initialEnrollments([])).toEqual([]);
  });
});

describe('enrollment selection helpers', () => {
  it('adds a start with its first format and removes it again', () => {
    const current = [{ startId: 'start-a', formatId: 1 }];
    const added = toggleEnrollmentStart(starts, current, 'start-b', true);
    expect(added).toEqual([
      { startId: 'start-a', formatId: 1 },
      { startId: 'start-b', formatId: 1 },
    ]);

    expect(toggleEnrollmentStart(starts, added, 'start-b', false)).toEqual([
      { startId: 'start-a', formatId: 1 },
    ]);
  });

  it('does not add the same start twice', () => {
    const current = [{ startId: 'start-a', formatId: 1 }];
    expect(toggleEnrollmentStart(starts, current, 'start-a', true)).toEqual(
      current,
    );
  });

  it('changes the format only for the selected start', () => {
    expect(
      setEnrollmentFormat(
        [
          { startId: 'start-a', formatId: 1 },
          { startId: 'start-b', formatId: 1 },
        ],
        'start-a',
        2,
      ),
    ).toEqual([
      { startId: 'start-a', formatId: 2 },
      { startId: 'start-b', formatId: 1 },
    ]);
  });
});

describe('buildEnrollments', () => {
  it('sends one enrollment even for a single-start event', () => {
    expect(buildEnrollments([{ startId: 'start-a', formatId: 1 }])).toEqual([
      { startId: 'start-a', formatId: 1 },
    ]);
  });

  it('sends start and format for each selected start', () => {
    expect(
      buildEnrollments([
        { startId: 'start-a', formatId: 2 },
        { startId: 'start-b', formatId: 1 },
      ]),
    ).toEqual([
      { startId: 'start-a', formatId: 2 },
      { startId: 'start-b', formatId: 1 },
    ]);
  });
});
