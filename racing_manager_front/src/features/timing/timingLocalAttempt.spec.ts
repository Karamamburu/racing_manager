import { describe, expect, it } from 'vitest';
import { deriveLocalAttempts } from './timingLocalAttempt';
import type { TimingOfflineEntryView, TimingOfflineView } from './timingOffline';
import type { TimingQueueItem } from './timingQueue';
import type {
  StartOfflineTimingAttemptRequest,
  TimingSurfaceView,
} from './types';

const LOCAL_ATTEMPT = 'local-attempt';
const LOCAL_EPOCH = 'local-epoch';
const START = '2026-11-18T09:00:00.000Z';

function participant(
  enrollmentId: string,
  startNumber: number,
  overrides: Partial<TimingSurfaceView['categories'][number]['participants'][number]> = {},
): TimingSurfaceView['categories'][number]['participants'][number] {
  return {
    enrollmentId,
    registrationId: `registration-${enrollmentId}`,
    startNumber,
    fullName: `Участник ${startNumber}`,
    sectionId: 'CATEGORY',
    passCount: 0,
    requiredLaps: 3,
    lastPassAt: null,
    state: 'WAITING',
    excludedReason: null,
    ...overrides,
  };
}

function surface(): TimingSurfaceView {
  return {
    eventId: 'event-1',
    captureWorkstationInstanceId: 'ws-1',
    categories: [
      {
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
        participants: [
          participant('enrollment-1', 10),
          participant('enrollment-2', 11),
          participant('enrollment-3', 12, {
            state: 'EXCLUDED',
            excludedReason: 'RACE_SECTION',
          }),
        ],
        pendingFinishes: [],
        lastAttempts: [],
        blockKey: 'category-block',
      },
    ],
    anonymousSplits: [],
  };
}

function startItem(overrides: Partial<TimingQueueItem> = {}): TimingQueueItem {
  const payload: StartOfflineTimingAttemptRequest = {
    startId: 'start-a',
    formatId: 1,
    gender: 'M',
    workstationInstanceId: 'ws-1',
    officialStartedAt: START,
    roster: [
      {
        enrollmentId: 'enrollment-1',
        registrationId: 'registration-enrollment-1',
        startNumber: 10,
        sectionId: 'CATEGORY',
        requiredLaps: 3,
        excludedReason: null,
      },
      {
        enrollmentId: 'enrollment-2',
        registrationId: 'registration-enrollment-2',
        startNumber: 11,
        sectionId: 'CATEGORY',
        requiredLaps: 3,
        excludedReason: null,
      },
      {
        enrollmentId: 'enrollment-3',
        registrationId: 'registration-enrollment-3',
        startNumber: 12,
        sectionId: 'CATEGORY',
        requiredLaps: 3,
        excludedReason: 'RACE_SECTION',
      },
    ],
    localAttemptId: LOCAL_ATTEMPT,
    localClockEpochId: LOCAL_EPOCH,
    deviceSequence: 1,
  };
  return {
    id: 'start',
    attemptId: LOCAL_ATTEMPT,
    workstationInstanceId: 'ws-1',
    deviceSequence: 1,
    operation: 'START',
    payload,
    status: 'PENDING',
    createdAt: START,
    localRoster: [
      {
        enrollmentId: 'enrollment-1',
        fullName: 'Иван Первый',
        sectionId: 'CATEGORY',
        startNumber: 10,
        requiredLaps: 3,
        excludedReason: null,
      },
      {
        enrollmentId: 'enrollment-2',
        fullName: 'Пётр Второй',
        sectionId: 'CATEGORY',
        startNumber: 11,
        requiredLaps: 3,
        excludedReason: null,
      },
    ],
    ...overrides,
  };
}

function passEntry(
  id: string,
  kind: 'NUMBER' | 'TILE',
  overrides: Partial<TimingOfflineEntryView> = {},
): TimingOfflineEntryView {
  return {
    id,
    kind,
    kindLabel: 'Отметка',
    operation: 'PASS',
    status: 'PENDING',
    unsent: true,
    rejected: false,
    isSending: false,
    pressTime: '2026-11-18T09:00:10.000Z',
    attemptId: LOCAL_ATTEMPT,
    blockKey: 'category-block',
    enrollmentId: kind === 'TILE' ? 'enrollment-2' : null,
    startNumber: kind === 'NUMBER' ? 10 : null,
    fullName: null,
    sectionId: null,
    pendingMarks: 1,
    confirmedLapsRetired: 0,
    withdraws: null,
    pairId: null,
    pairRole: null,
    reason: null,
    deviceSequence: 2,
    localAnchorAttemptId: null,
    elapsedMs: 10_000,
    captureDeviceSequence: null,
    ...overrides,
  };
}

function offline(entries: TimingOfflineEntryView[]): TimingOfflineView {
  return {
    entries,
    unsentEntries: entries,
    rejectedEntries: [],
    participantMarks: [],
    blockMarks: [],
    totals: {
      unsentEntries: entries.length,
      sendingEntries: 0,
      waitingEntries: entries.length,
      unsentByKind: {
        NUMBER: 0,
        TILE: 0,
        PENDING_FINISH: 0,
        ANONYMOUS_SPLIT: 0,
        START: 1,
        PASS: 0,
        BIND: 0,
        UNDO: 0,
        ANONYMOUS_ASSIGN: 0,
      },
      pendingMarks: 0,
      unattributedPendingMarks: 0,
      confirmedLapsRetiring: 0,
      rejectedEntries: 0,
      hasUnsent: true,
      hasRejected: false,
    },
  };
}

describe('deriveLocalAttempts', () => {
  it('merges a running local block with the frozen roster, local pass counts and elapsed time', () => {
    const result = deriveLocalAttempts({
      surface: surface(),
      offline: offline([
        passEntry('pass-1', 'NUMBER'),
        passEntry('pass-2', 'TILE', { pressTime: '2026-11-18T09:00:20.000Z' }),
      ]),
      startItems: [startItem()],
      nowMs: Date.parse(START) + 90_000,
    });

    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({
      localAttemptId: LOCAL_ATTEMPT,
      localClockEpochId: LOCAL_EPOCH,
      officialStartedAt: START,
      lapCount: 3,
    });
    const [block] = result.mergedSurface.categories;
    expect(block).toMatchObject({
      state: 'RUNNING',
      attemptId: LOCAL_ATTEMPT,
      local: true,
      localAttemptId: LOCAL_ATTEMPT,
      localClockEpochId: LOCAL_EPOCH,
      officialStartedAt: START,
      elapsedMs: 90_000,
      startControlEnabled: false,
      capturesComplete: false,
      blockKey: 'category-block',
    });
    expect(block.participants.map((row) => [row.enrollmentId, row.passCount, row.state])).toEqual([
      ['enrollment-1', 1, 'RACING'],
      ['enrollment-2', 1, 'RACING'],
      ['enrollment-3', 0, 'EXCLUDED'],
    ]);
    expect(block.participants[0].fullName).toBe('Иван Первый');
    expect(block.participants[1].fullName).toBe('Пётр Второй');
  });

  it('does not merge a Start item that is already applied', () => {
    const result = deriveLocalAttempts({
      surface: surface(),
      offline: offline([]),
      startItems: [startItem({ status: 'APPLIED' })],
      nowMs: Date.parse(START) + 90_000,
    });

    expect(result.attempts).toEqual([]);
    expect(result.mergedSurface.categories[0].state).toBe('NOT_STARTED');
  });

  it('ignores a pass of another attempt and a withdrawn pair capture', () => {
    const result = deriveLocalAttempts({
      surface: surface(),
      offline: offline([
        passEntry('pass-other', 'NUMBER', {
          attemptId: 'other-attempt',
          startNumber: 10,
        }),
        passEntry('pass-withdrawn', 'NUMBER', {
          startNumber: 10,
          pairRole: 'CAPTURE',
        }),
      ]),
      startItems: [startItem()],
      nowMs: Date.parse(START) + 10_000,
    });

    const [block] = result.mergedSurface.categories;
    expect(block.participants[0].passCount).toBe(0);
  });
});
