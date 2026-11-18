import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TimingMetricsPanel } from './TimingMetrics';
import { computeTimingMetrics } from './timingMetricsModel';
import type {
  TimingAnonymousSplitView,
  TimingCategoryBlockView,
  TimingParticipantTileView,
  TimingPassView,
  TimingSurfaceView,
} from './types';

function participant(
  overrides: Partial<TimingParticipantTileView> = {},
): TimingParticipantTileView {
  return {
    enrollmentId: 'enrollment-1',
    registrationId: 'registration-1',
    startNumber: 1,
    fullName: 'Иван Петров',
    sectionId: '3 - Мужчины (24–40)',
    passCount: 0,
    requiredLaps: 3,
    lastPassAt: null,
    state: 'WAITING',
    excludedReason: null,
    ...overrides,
  };
}

function block(
  overrides: Partial<TimingCategoryBlockView> = {},
): TimingCategoryBlockView {
  return {
    startId: 'start-a',
    formatId: 1,
    gender: 'M',
    state: 'NOT_STARTED',
    lapCount: 3,
    attemptId: null,
    officialStartedAt: null,
    elapsedMs: null,
    startControlEnabled: true,
    blockReason: null,
    capturesComplete: false,
    finished: false,
    participants: [participant()],
    pendingFinishes: [],
    lastAttempts: [],
    ...overrides,
  };
}

function pendingFinish(): TimingPassView {
  return {
    passId: 'pass-1',
    attemptId: 'attempt-1',
    enrollmentId: null,
    lapNumber: null,
    rawCapturedAt: '2026-11-15T10:00:00.000Z',
    officialAt: '2026-11-15T10:00:00.000Z',
    officialElapsedMs: 1000,
    status: 'PENDING',
  };
}

function anonymousSplit(): TimingAnonymousSplitView {
  return {
    splitId: 'split-1',
    attemptId: null,
    capturedAt: '2026-11-15T10:00:00.000Z',
    status: 'QUEUED',
  };
}

function surface(overrides: Partial<TimingSurfaceView> = {}): TimingSurfaceView {
  return {
    eventId: 'event-1',
    captureWorkstationInstanceId: null,
    categories: [],
    anonymousSplits: [],
    ...overrides,
  };
}

afterEach(cleanup);

describe('computeTimingMetrics', () => {
  it('counts finished categories, unique participants and blockers', () => {
    const view = surface({
      categories: [
        block({
          startId: 'start-a',
          state: 'COMPLETED',
          finished: true,
          participants: [
            participant({
              enrollmentId: 'enrollment-a',
              requiredLaps: 3,
              passCount: 3,
              state: 'RECORDED',
            }),
            participant({
              enrollmentId: 'enrollment-b',
              requiredLaps: 3,
              passCount: 2,
              state: 'INCOMPLETE',
            }),
          ],
        }),
        block({
          startId: 'start-b',
          participants: [
            participant({
              enrollmentId: 'enrollment-c',
              requiredLaps: 5,
              passCount: 0,
            }),
          ],
        }),
        block({
          startId: 'start-c',
          kind: 'HEAT',
          state: 'RUNNING',
          attemptId: 'attempt-heat',
          capturesComplete: true,
          participants: [
            participant({
              enrollmentId: 'enrollment-d',
              requiredLaps: 2,
              passCount: 2,
              state: 'RECORDED',
            }),
            participant({
              enrollmentId: 'enrollment-e',
              requiredLaps: 2,
              passCount: 1,
              state: 'RACING',
            }),
          ],
          pendingFinishes: [pendingFinish()],
        }),
      ],
      anonymousSplits: [anonymousSplit()],
    });

    expect(computeTimingMetrics(view)).toEqual({
      categoriesTotal: 3,
      categoriesFinished: 1,
      categoriesNotStarted: 1,
      participantsTotal: 5,
      participantsFinished: 2,
      onCourse: 1,
      readyToComplete: 1,
      pendingSplits: 1,
      pendingFinishes: 1,
      remainingPasses: 1,
    });
  });

  it('counts a category whose timing attempt is completed without a protocol finish', () => {
    const view = surface({
      categories: [
        block({ state: 'COMPLETED', finished: false }),
        block({
          startId: 'start-b',
          formatId: 2,
          state: 'COMPLETED',
          finished: false,
        }),
      ],
    });

    const metrics = computeTimingMetrics(view);

    expect(metrics.categoriesTotal).toBe(2);
    expect(metrics.categoriesFinished).toBe(2);
  });

  it('does not count a running, incomplete or cancelled category as finished', () => {
    for (const state of ['RUNNING', 'INCOMPLETE', 'CANCELLED'] as const) {
      const view = surface({
        categories: [block({ state, finished: false })],
      });

      expect(computeTimingMetrics(view).categoriesFinished).toBe(0);
    }
  });

  it('counts a protocol-finished category without a timing attempt', () => {
    const view = surface({
      categories: [block({ state: 'NOT_STARTED', finished: true })],
    });

    expect(computeTimingMetrics(view).categoriesFinished).toBe(1);
  });

  it('does not finish a race category from a closed heat alone', () => {
    const view = surface({
      categories: [
        block({
          startId: 'start-race',
          kind: 'HEAT',
          state: 'COMPLETED',
          finished: false,
        }),
      ],
    });

    expect(computeTimingMetrics(view).categoriesFinished).toBe(0);
  });

  it('finishes a race category when the race is done and its category timing is closed', () => {
    const view = surface({
      categories: [
        block({
          startId: 'start-race',
          state: 'COMPLETED',
          finished: false,
          participants: [
            participant({
              enrollmentId: 'enrollment-race',
              excludedReason: 'RACE_SECTION',
            }),
          ],
        }),
        block({
          startId: 'start-race',
          kind: 'HEAT',
          state: 'COMPLETED',
          finished: true,
        }),
      ],
    });

    const metrics = computeTimingMetrics(view);

    expect(metrics.categoriesTotal).toBe(1);
    expect(metrics.categoriesFinished).toBe(1);
  });

  it('does not finish a mixed category while its category attempt still runs', () => {
    const view = surface({
      categories: [
        block({
          startId: 'start-race',
          state: 'RUNNING',
          finished: false,
        }),
        block({
          startId: 'start-race',
          kind: 'HEAT',
          state: 'COMPLETED',
          finished: true,
        }),
      ],
    });

    expect(computeTimingMetrics(view).categoriesFinished).toBe(0);
  });

  it('keeps race-section and excluded rows out of the participant denominator', () => {
    const view = surface({
      categories: [
        block({
          startId: 'start-race',
          participants: [
            participant({
              enrollmentId: 'enrollment-race',
              excludedReason: 'RACE_SECTION',
            }),
            participant({
              enrollmentId: 'enrollment-out',
              excludedReason: 'EXISTING_OUTCOME',
            }),
          ],
        }),
        block({
          startId: 'start-race',
          kind: 'HEAT',
          participants: [
            participant({
              enrollmentId: 'enrollment-race',
              requiredLaps: 2,
              passCount: 0,
            }),
          ],
        }),
      ],
    });

    const metrics = computeTimingMetrics(view);

    expect(metrics.participantsTotal).toBe(1);
    expect(metrics.participantsFinished).toBe(0);
    expect(metrics.onCourse).toBe(0);
  });
});

describe('TimingMetricsPanel', () => {
  it('renders the referee summary', () => {
    const view = surface({
      categories: [
        block({
          startId: 'start-a',
          state: 'COMPLETED',
          finished: true,
          participants: [
            participant({
              enrollmentId: 'enrollment-a',
              requiredLaps: 3,
              passCount: 3,
              state: 'RECORDED',
            }),
          ],
        }),
        block({
          startId: 'start-b',
          participants: [
            participant({
              enrollmentId: 'enrollment-c',
              requiredLaps: 5,
              passCount: 0,
            }),
          ],
        }),
      ],
      anonymousSplits: [anonymousSplit()],
    });

    render(<TimingMetricsPanel surface={view} />);

    expect(screen.getByText('Ход хронометража')).not.toBeNull();
    expect(screen.getByText('1 из 2 завершено')).not.toBeNull();
    expect(screen.getByText('не начато: 1')).not.toBeNull();
    expect(screen.getByText('1 из 2 финишировали')).not.toBeNull();
    expect(screen.getByText('На дистанции')).not.toBeNull();
    expect(screen.getByText('Готовы к завершению')).not.toBeNull();
    expect(screen.getByText('Требуют внимания')).not.toBeNull();
    expect(screen.getByText('отсечки: 1 · финиши: 0')).not.toBeNull();
    expect(screen.getByText('Осталось отсечек')).not.toBeNull();
  });
});
