import { describe, expect, it } from 'vitest';
import { deriveLocalSplits } from './timingLocalSplits';
import type { TimingOfflineEntryView, TimingOfflineView } from './timingOffline';
import type {
  TimingAnonymousSplitView,
  TimingLocalAttemptView,
  TimingSurfaceView,
} from './types';

const SERVER_START = '2026-11-18T09:00:30.000Z';
const LOCAL_START = '2026-11-18T09:00:00.000Z';
const LOCAL_ATTEMPT = 'local-attempt';

function block(
  overrides: Partial<TimingSurfaceView['categories'][number]> = {},
): TimingSurfaceView['categories'][number] {
  return {
    startId: 'start-a',
    formatId: 1,
    gender: 'M',
    state: 'RUNNING',
    lapCount: 3,
    attemptId: 'server-attempt',
    officialStartedAt: SERVER_START,
    elapsedMs: 30_000,
    startControlEnabled: false,
    blockReason: null,
    capturesComplete: false,
    finished: false,
    participants: [],
    pendingFinishes: [],
    lastAttempts: [],
    blockKey: 'server-block',
    ...overrides,
  };
}

function surface(
  overrides: Partial<TimingSurfaceView> = {},
): TimingSurfaceView {
  return {
    eventId: 'event-1',
    captureWorkstationInstanceId: 'ws-1',
    categories: [block()],
    anonymousSplits: [],
    ...overrides,
  };
}

function localAttempt(): TimingLocalAttemptView {
  return {
    localAttemptId: LOCAL_ATTEMPT,
    localClockEpochId: 'local-epoch',
    startId: 'start-a',
    formatId: 1,
    gender: 'M',
    officialStartedAt: LOCAL_START,
    lapCount: 3,
    roster: [],
    deviceSequence: 1,
  };
}

function entry(
  overrides: Partial<TimingOfflineEntryView> = {},
): TimingOfflineEntryView {
  return {
    id: 'entry-1',
    kind: 'ANONYMOUS_SPLIT',
    kindLabel: 'Отсечка без номера',
    operation: 'PASS',
    status: 'PENDING',
    unsent: true,
    rejected: false,
    isSending: false,
    pressTime: '2026-11-18T09:01:00.000Z',
    attemptId: 'event:event-1',
    blockKey: null,
    enrollmentId: null,
    startNumber: null,
    fullName: null,
    sectionId: null,
    pendingMarks: 0,
    confirmedLapsRetired: 0,
    withdraws: null,
    pairId: null,
    pairRole: null,
    reason: null,
    deviceSequence: 3,
    localAnchorAttemptId: LOCAL_ATTEMPT,
    elapsedMs: 60_000,
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
        ANONYMOUS_SPLIT: entries.length,
        START: 0,
        PASS: 0,
        BIND: 0,
        UNDO: 0,
        ANONYMOUS_ASSIGN: 0,
      },
      pendingMarks: 0,
      unattributedPendingMarks: 0,
      confirmedLapsRetiring: 0,
      rejectedEntries: 0,
      hasUnsent: entries.length > 0,
      hasRejected: false,
    },
  };
}

function serverSplit(
  overrides: Partial<TimingAnonymousSplitView> = {},
): TimingAnonymousSplitView {
  return {
    splitId: 'server-split',
    attemptId: null,
    capturedAt: '2026-11-18T09:02:00.000Z',
    status: 'QUEUED',
    captureDeviceSequence: 5,
    ...overrides,
  };
}

describe('deriveLocalSplits', () => {
  it('merges server and local splits in capture order and derives the official local time', () => {
    const local = entry();
    const result = deriveLocalSplits({
      surface: surface({ anonymousSplits: [serverSplit()] }),
      offline: offline([local]),
      localAttempts: [localAttempt()],
    });

    expect(result.splits.map((split) => split.splitId)).toEqual([
      'entry-1',
      'server-split',
    ]);
    const merged = result.splits[0];
    expect(merged).toMatchObject({
      localSplitId: 'entry-1',
      capturedAt: '2026-11-18T09:01:00.000Z',
      unsent: true,
      sending: false,
      assigned: false,
      captureDeviceSequence: 3,
    });
    expect(merged.candidates?.map((candidate) => candidate.attemptId)).toEqual([
      'server-attempt',
      LOCAL_ATTEMPT,
    ]);
    expect(merged.candidates?.[0].officialElapsedMs).toBe(30_000);
    expect(merged.candidates?.[1].officialElapsedMs).toBe(60_000);
    expect(result.localUnassignedCount).toBe(1);
  });

  it('marks a split whose queued assignment names its capture sequence', () => {
    const assignment = entry({
      id: 'assign-1',
      kind: 'ANONYMOUS_ASSIGN',
      kindLabel: 'Присвоение отсечки',
      operation: 'ANONYMOUS_ASSIGN',
      captureDeviceSequence: 3,
      startNumber: 17,
      localAnchorAttemptId: null,
      elapsedMs: null,
    });
    const result = deriveLocalSplits({
      surface: surface({ anonymousSplits: [serverSplit({ captureDeviceSequence: 3 })] }),
      offline: offline([entry(), assignment]),
      localAttempts: [localAttempt()],
    });

    const local = result.splits.find((split) => split.localSplitId === 'entry-1');
    expect(local?.assigned).toBe(true);
    expect(local?.assignedNumber).toBe(17);
    expect(result.localUnassignedCount).toBe(0);
    // The same capture sequence marks a server row whose split already arrived.
    const server = result.splits.find((split) => split.splitId === 'server-split');
    expect(server?.assigned).toBe(true);
    expect(server?.assignedNumber).toBe(17);
  });

  it('keeps a sending split and excludes it from the unassigned count only when assigned', () => {
    const sending = entry({ isSending: true, status: 'SENT', unsent: true });
    const result = deriveLocalSplits({
      surface: surface(),
      offline: offline([sending]),
      localAttempts: [localAttempt()],
    });

    expect(result.splits).toHaveLength(1);
    expect(result.splits[0]).toMatchObject({
      sending: true,
      unsent: true,
    });
    expect(result.localUnassignedCount).toBe(1);
  });

  it('does not show a split whose capture has an unsent withdrawal', () => {
    const result = deriveLocalSplits({
      surface: surface(),
      offline: offline([entry({ pairRole: 'CAPTURE' })]),
      localAttempts: [localAttempt()],
    });

    expect(result.splits).toEqual([]);
    expect(result.localUnassignedCount).toBe(0);
  });
});
