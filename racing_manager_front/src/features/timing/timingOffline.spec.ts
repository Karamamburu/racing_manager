import { describe, expect, it } from 'vitest';
import type { TimingQueueItem } from './timingQueue';
import {
  deriveTimingOfflineView,
  timingOfflineBlockKey,
  type TimingOfflineView,
} from './timingOffline';
import type {
  TimingCategoryBlockView,
  TimingParticipantTileView,
  TimingSurfaceView,
} from './types';

/**
 * MANUAL-TIMING-4 turns the device outbox into the views the timing page shows:
 * the send-queue rows, the tile and block pending marks, and the page totals.
 * MANUAL-TIMING-5 (Wave 6) splits the unsent total into the captures being sent
 * and the captures still waiting, from the same snapshot as the rows.
 * Nothing here touches the DOM or the network; the surface and the outbox are
 * plain fixtures.
 *
 * The payloads below are the bodies `useTimingCapture` actually stores, so a
 * derivation that only works on a hand-picked shape fails here.
 */

const WORKSTATION = 'ws-1';
const ATTEMPT_A = 'attempt-a';
const ATTEMPT_B = 'attempt-b';
const EVENT_SCOPE = 'event:event-1';

const IVANOV: TimingParticipantTileView = {
  enrollmentId: 'enr-14',
  registrationId: 'reg-14',
  startNumber: 14,
  fullName: 'Иванов Иван',
  sectionId: 'section-1',
  passCount: 1,
  requiredLaps: 2,
  lastPassAt: '2026-11-16T09:59:00.000Z',
  state: 'RACING',
  excludedReason: null,
};

const PETROV: TimingParticipantTileView = {
  enrollmentId: 'enr-17',
  registrationId: 'reg-17',
  startNumber: 17,
  fullName: 'Петров Пётр',
  sectionId: 'section-1',
  passCount: 1,
  requiredLaps: 2,
  lastPassAt: null,
  state: 'RACING',
  excludedReason: null,
};

const SIDOROVA: TimingParticipantTileView = {
  enrollmentId: 'enr-21',
  registrationId: 'reg-21',
  startNumber: 21,
  fullName: 'Сидорова Анна',
  sectionId: 'section-2',
  passCount: 0,
  requiredLaps: 2,
  lastPassAt: null,
  state: 'WAITING',
  excludedReason: null,
};

const BLOCK_A: TimingCategoryBlockView = {
  startId: 'start-a',
  formatId: 1,
  gender: 'M',
  state: 'RUNNING',
  lapCount: 2,
  attemptId: ATTEMPT_A,
  officialStartedAt: '2026-11-16T09:00:00.000Z',
  elapsedMs: 600_000,
  startControlEnabled: false,
  blockReason: null,
  blockKey: 'block-a',
  participants: [IVANOV, PETROV],
  pendingFinishes: [],
  lastAttempts: [],
};

const BLOCK_B: TimingCategoryBlockView = {
  startId: 'start-b',
  formatId: 2,
  gender: 'F',
  state: 'RUNNING',
  lapCount: 2,
  attemptId: ATTEMPT_B,
  officialStartedAt: '2026-11-16T09:30:00.000Z',
  elapsedMs: 300_000,
  startControlEnabled: false,
  blockReason: null,
  blockKey: 'block-b',
  participants: [SIDOROVA],
  pendingFinishes: [],
  lastAttempts: [],
};

const SURFACE: TimingSurfaceView = {
  eventId: 'event-1',
  captureWorkstationInstanceId: WORKSTATION,
  categories: [BLOCK_A, BLOCK_B],
  anonymousSplits: [
    {
      splitId: 'split-1',
      attemptId: null,
      capturedAt: '2026-11-16T10:05:00.321Z',
      status: 'QUEUED',
    },
  ],
};

function queueItem(overrides: Partial<TimingQueueItem> & { id: string }): TimingQueueItem {
  return {
    attemptId: ATTEMPT_A,
    workstationInstanceId: WORKSTATION,
    deviceSequence: 1,
    operation: 'PASS',
    payload: {},
    status: 'PENDING',
    createdAt: '2026-11-16T10:00:00.000Z',
    ...overrides,
  };
}

/** A number press, as `commitNumber` stores it. */
function numberPass(
  id: string,
  deviceSequence: number,
  startNumber: number,
  pressTime: string,
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  return queueItem({
    id,
    deviceSequence,
    createdAt: pressTime,
    payload: {
      attemptId: ATTEMPT_A,
      kind: 'NUMBER',
      startNumber,
      clientCapturedAt: pressTime,
      clientElapsedMs: deviceSequence * 1_000,
      clockEpochId: 'epoch-1',
      workstationInstanceId: WORKSTATION,
      deviceSequence,
    },
    ...overrides,
  });
}

/** A tile press: the body carries the enrollment and never the number. */
function tilePass(
  id: string,
  deviceSequence: number,
  enrollmentId: string,
  pressTime: string,
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  return queueItem({
    id,
    deviceSequence,
    createdAt: pressTime,
    payload: {
      attemptId: ATTEMPT_A,
      kind: 'TILE',
      enrollmentId,
      clientCapturedAt: pressTime,
      clientElapsedMs: deviceSequence * 1_000,
      clockEpochId: 'epoch-1',
      workstationInstanceId: WORKSTATION,
      deviceSequence,
    },
    ...overrides,
  });
}

/** An unbound finish capture: no participant, so no mark of its own. */
function pendingFinishPass(
  id: string,
  deviceSequence: number,
  pressTime: string,
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  return queueItem({
    id,
    deviceSequence,
    createdAt: pressTime,
    payload: {
      attemptId: ATTEMPT_A,
      kind: 'PENDING_FINISH',
      clientCapturedAt: pressTime,
      clientElapsedMs: deviceSequence * 1_000,
      clockEpochId: 'epoch-1',
      workstationInstanceId: WORKSTATION,
      deviceSequence,
    },
    ...overrides,
  });
}

/** A block-free anonymous split: event-scoped, no attempt and no participant. */
function anonymousSplitPass(
  id: string,
  deviceSequence: number,
  pressTime: string,
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  return queueItem({
    id,
    attemptId: EVENT_SCOPE,
    deviceSequence,
    createdAt: pressTime,
    payload: {
      kind: 'ANONYMOUS_SPLIT',
      clientCapturedAt: pressTime,
      clientElapsedMs: deviceSequence * 1_000,
      clockEpochId: 'epoch-1',
      workstationInstanceId: WORKSTATION,
      deviceSequence,
    },
    ...overrides,
  });
}

function bindItem(
  id: string,
  deviceSequence: number,
  startNumber: number,
  createdAt: string,
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  return queueItem({
    id,
    deviceSequence,
    createdAt,
    operation: 'BIND',
    payload: {
      pendingFinishId: 'pending-finish-1',
      startNumber,
      workstationInstanceId: WORKSTATION,
      deviceSequence,
    },
    ...overrides,
  });
}

function undoItem(
  id: string,
  deviceSequence: number,
  createdAt: string,
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  return queueItem({
    id,
    deviceSequence,
    createdAt,
    operation: 'UNDO',
    payload: { workstationInstanceId: WORKSTATION, deviceSequence },
    ...overrides,
  });
}

function assignItem(
  id: string,
  deviceSequence: number,
  startNumber: number,
  createdAt: string,
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  return queueItem({
    id,
    attemptId: EVENT_SCOPE,
    deviceSequence,
    createdAt,
    operation: 'ANONYMOUS_ASSIGN',
    payload: {
      splitId: 'split-1',
      request: {
        startNumber,
        workstationInstanceId: WORKSTATION,
        deviceSequence,
      },
    },
    ...overrides,
  });
}

function derive(items: TimingQueueItem[]): TimingOfflineView {
  return deriveTimingOfflineView(items, SURFACE);
}

describe('deriveTimingOfflineView: one number press', () => {
  it('lists the entry and adds one pending mark to its tile and its block', () => {
    const view = derive([numberPass('key-number-14', 1, 14, '2026-11-16T10:00:01.123Z')]);

    expect(view.entries).toEqual([
      {
        id: 'key-number-14',
        kind: 'NUMBER',
        kindLabel: 'Отметка по номеру',
        operation: 'PASS',
        status: 'PENDING',
        unsent: true,
        rejected: false,
        isSending: false,
        pressTime: '2026-11-16T10:00:01.123Z',
        attemptId: ATTEMPT_A,
        blockKey: 'block-a',
        enrollmentId: 'enr-14',
        startNumber: 14,
        fullName: 'Иванов Иван',
        sectionId: 'section-1',
        pendingMarks: 1,
        confirmedLapsRetired: 0,
        withdraws: null,
        pairId: null,
        pairRole: null,
        reason: null,
      },
    ]);
    expect(view.unsentEntries).toEqual(view.entries);
    expect(view.rejectedEntries).toEqual([]);

    expect(view.participantMarks).toEqual([
      {
        blockKey: 'block-a',
        attemptId: ATTEMPT_A,
        enrollmentId: 'enr-14',
        startNumber: 14,
        fullName: 'Иванов Иван',
        confirmedPassCount: 1,
        pendingMarks: 1,
        confirmedLapsRetiring: 0,
      },
    ]);
    expect(view.blockMarks).toEqual([
      {
        blockKey: 'block-a',
        attemptId: ATTEMPT_A,
        pendingMarks: 1,
        confirmedLapsRetiring: 0,
      },
    ]);
    expect(view.totals).toEqual({
      unsentEntries: 1,
      sendingEntries: 0,
      waitingEntries: 1,
      unsentByKind: {
        NUMBER: 1,
        TILE: 0,
        PENDING_FINISH: 0,
        ANONYMOUS_SPLIT: 0,
        PASS: 0,
        BIND: 0,
        UNDO: 0,
        ANONYMOUS_ASSIGN: 0,
      },
      pendingMarks: 1,
      unattributedPendingMarks: 0,
      confirmedLapsRetiring: 0,
      rejectedEntries: 0,
      hasUnsent: true,
      hasRejected: false,
    });
  });

  it('names the participant of a tile press from the surface, not from the payload', () => {
    const view = derive([tilePass('key-tile-14', 1, 'enr-14', '2026-11-16T10:00:02.000Z')]);

    expect(view.entries[0]).toMatchObject({
      kind: 'TILE',
      kindLabel: 'Отметка по плитке',
      startNumber: 14,
      fullName: 'Иванов Иван',
      sectionId: 'section-1',
      blockKey: 'block-a',
      pendingMarks: 1,
    });
    expect(view.totals.pendingMarks).toBe(1);
  });
});

describe('deriveTimingOfflineView: two presses are two captures', () => {
  it('never merges two passes of one participant and never double counts', () => {
    const view = derive([
      numberPass('key-n14-1', 1, 14, '2026-11-16T10:00:01.000Z'),
      numberPass('key-n14-2', 2, 14, '2026-11-16T10:00:02.000Z'),
      numberPass('key-n17-1', 3, 17, '2026-11-16T10:00:03.000Z'),
    ]);

    expect(view.entries.map((entry) => entry.id)).toEqual([
      'key-n14-1',
      'key-n14-2',
      'key-n17-1',
    ]);
    expect(view.participantMarks.find((marks) => marks.enrollmentId === 'enr-14')?.pendingMarks).toBe(2);
    expect(view.participantMarks.find((marks) => marks.enrollmentId === 'enr-17')?.pendingMarks).toBe(1);
    expect(view.totals.unsentEntries).toBe(3);
    expect(view.totals.unsentByKind.NUMBER).toBe(3);
    expect(view.totals.pendingMarks).toBe(3);
    expect(
      view.participantMarks.reduce((sum, marks) => sum + marks.pendingMarks, 0),
    ).toBe(view.totals.pendingMarks);
    expect(
      view.blockMarks.reduce((sum, marks) => sum + marks.pendingMarks, 0),
    ).toBe(view.totals.pendingMarks);
  });
});

describe('deriveTimingOfflineView: entries without a participant', () => {
  it('lists an anonymous split with no tile and no block marker', () => {
    const view = derive([anonymousSplitPass('key-split', 1, '2026-11-16T10:05:00.900Z')]);

    expect(view.entries).toEqual([
      {
        id: 'key-split',
        kind: 'ANONYMOUS_SPLIT',
        kindLabel: 'Отсечка без номера',
        operation: 'PASS',
        status: 'PENDING',
        unsent: true,
        rejected: false,
        isSending: false,
        pressTime: '2026-11-16T10:05:00.900Z',
        attemptId: null,
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
      },
    ]);
    expect(view.participantMarks).toEqual([]);
    expect(view.blockMarks).toEqual([]);
    expect(view.totals).toMatchObject({
      unsentEntries: 1,
      sendingEntries: 0,
      waitingEntries: 1,
      unsentByKind: { ANONYMOUS_SPLIT: 1 },
      pendingMarks: 0,
      unattributedPendingMarks: 0,
      hasUnsent: true,
    });
  });

  it('adds no mark for an unbound finish capture, only for its bind', () => {
    const view = derive([
      pendingFinishPass('key-finish', 1, '2026-11-16T10:00:01.000Z'),
      bindItem('key-bind-17', 2, 17, '2026-11-16T10:00:04.000Z'),
    ]);

    expect(view.entries[0]).toMatchObject({
      kind: 'PENDING_FINISH',
      kindLabel: 'Непривязанный финиш',
      blockKey: 'block-a',
      startNumber: null,
      fullName: null,
      pendingMarks: 0,
    });
    expect(view.totals.unsentEntries).toBe(2);
    expect(view.totals.unsentByKind.PENDING_FINISH).toBe(1);
    expect(view.totals.pendingMarks).toBe(1);
    expect(view.participantMarks).toHaveLength(1);
    expect(view.participantMarks[0]).toMatchObject({
      enrollmentId: 'enr-17',
      pendingMarks: 1,
    });
  });
});

describe('deriveTimingOfflineView: entries that add a mark elsewhere', () => {
  it('marks the target participant and block of an unsent split assignment', () => {
    const view = derive([assignItem('key-assign', 1, 21, '2026-11-16T10:05:01.000Z')]);

    expect(view.entries[0]).toMatchObject({
      kind: 'ANONYMOUS_ASSIGN',
      kindLabel: 'Присвоение отсечки',
      operation: 'ANONYMOUS_ASSIGN',
      startNumber: 21,
      fullName: 'Сидорова Анна',
      blockKey: 'block-b',
      attemptId: null,
      // The assignment has no press of its own; the split's capture instant is
      // the clock the queue row shows.
      pressTime: '2026-11-16T10:05:00.321Z',
      pendingMarks: 1,
    });
    expect(view.participantMarks).toEqual([
      {
        blockKey: 'block-b',
        attemptId: ATTEMPT_B,
        enrollmentId: 'enr-21',
        startNumber: 21,
        fullName: 'Сидорова Анна',
        confirmedPassCount: 0,
        pendingMarks: 1,
        confirmedLapsRetiring: 0,
      },
    ]);
    expect(view.blockMarks).toEqual([
      {
        blockKey: 'block-b',
        attemptId: ATTEMPT_B,
        pendingMarks: 1,
        confirmedLapsRetiring: 0,
      },
    ]);
    expect(view.totals.unsentByKind.ANONYMOUS_ASSIGN).toBe(1);
    expect(view.totals.pendingMarks).toBe(1);
  });

  it('marks the target participant and block of an unsent pending-finish bind', () => {
    const view = derive([bindItem('key-bind', 1, 17, '2026-11-16T10:02:00.000Z')]);

    expect(view.entries[0]).toMatchObject({
      kind: 'BIND',
      kindLabel: 'Привязка финиша',
      operation: 'BIND',
      startNumber: 17,
      fullName: 'Петров Пётр',
      blockKey: 'block-a',
      pressTime: '2026-11-16T10:02:00.000Z',
      pendingMarks: 1,
    });
    expect(view.participantMarks).toHaveLength(1);
    expect(view.participantMarks[0]).toMatchObject({
      enrollmentId: 'enr-17',
      pendingMarks: 1,
    });
    expect(view.totals.pendingMarks).toBe(1);
  });
});

describe('deriveTimingOfflineView: refusals', () => {
  it('lists a rejected entry with its server reason and never as unsent', () => {
    const view = derive([
      numberPass('key-rejected', 1, 14, '2026-11-16T10:00:01.000Z', {
        status: 'REJECTED',
        error: 'Попытка уже закрыта другим рабочим местом',
      }),
    ]);

    expect(view.entries).toEqual([
      {
        id: 'key-rejected',
        kind: 'NUMBER',
        kindLabel: 'Отметка по номеру',
        operation: 'PASS',
        status: 'REJECTED',
        unsent: false,
        rejected: true,
        isSending: false,
        pressTime: '2026-11-16T10:00:01.000Z',
        attemptId: ATTEMPT_A,
        blockKey: 'block-a',
        enrollmentId: 'enr-14',
        startNumber: 14,
        fullName: 'Иванов Иван',
        sectionId: 'section-1',
        pendingMarks: 0,
        confirmedLapsRetired: 0,
        withdraws: null,
        pairId: null,
        pairRole: null,
        reason: 'Попытка уже закрыта другим рабочим местом',
      },
    ]);
    expect(view.unsentEntries).toEqual([]);
    expect(view.rejectedEntries).toHaveLength(1);
    expect(view.participantMarks).toEqual([]);
    expect(view.blockMarks).toEqual([]);
    expect(view.totals).toMatchObject({
      unsentEntries: 0,
      sendingEntries: 0,
      waitingEntries: 0,
      pendingMarks: 0,
      rejectedEntries: 1,
      hasUnsent: false,
      hasRejected: true,
    });
    expect(view.totals.unsentByKind.NUMBER).toBe(0);
  });

  it('leaves a confirmed entry out of the queue and out of the marks', () => {
    const view = derive([
      numberPass('key-applied', 1, 14, '2026-11-16T10:00:01.000Z', {
        status: 'APPLIED',
      }),
    ]);

    expect(view.entries).toEqual([]);
    expect(view.participantMarks).toEqual([]);
    expect(view.blockMarks).toEqual([]);
    expect(view.totals).toMatchObject({
      unsentEntries: 0,
      sendingEntries: 0,
      waitingEntries: 0,
      pendingMarks: 0,
      rejectedEntries: 0,
      hasUnsent: false,
      hasRejected: false,
    });
  });
});

describe('deriveTimingOfflineView: capture and withdrawal', () => {
  it('keeps an unsent pair adjacent, out of the marks and in the entry total', () => {
    const view = derive([
      numberPass('key-pair-capture', 1, 14, '2026-11-16T10:00:01.000Z'),
      undoItem('key-pair-undo', 2, '2026-11-16T10:00:03.000Z'),
      numberPass('key-later-17', 3, 17, '2026-11-16T10:00:05.000Z'),
    ]);

    expect(view.entries.map((entry) => entry.id)).toEqual([
      'key-pair-capture',
      'key-pair-undo',
      'key-later-17',
    ]);

    const [capture, withdrawal] = view.entries;
    expect(capture).toMatchObject({
      pairRole: 'CAPTURE',
      pairId: 'key-pair-capture',
      pendingMarks: 0,
    });
    expect(withdrawal).toMatchObject({
      kind: 'UNDO',
      kindLabel: 'Отмена отметки',
      pairRole: 'WITHDRAWAL',
      pairId: 'key-pair-capture',
      pendingMarks: 0,
      confirmedLapsRetired: 0,
      reason: null,
    });
    expect(withdrawal.withdraws).toEqual({
      entryId: 'key-pair-capture',
      startNumber: 14,
      fullName: 'Иванов Иван',
      blockKey: 'block-a',
      confirmed: false,
    });

    // The pair leaves no tile and no block marker; the later press keeps one.
    expect(view.participantMarks).toEqual([
      {
        blockKey: 'block-a',
        attemptId: ATTEMPT_A,
        enrollmentId: 'enr-17',
        startNumber: 17,
        fullName: 'Петров Пётр',
        confirmedPassCount: 1,
        pendingMarks: 1,
        confirmedLapsRetiring: 0,
      },
    ]);
    expect(view.blockMarks).toEqual([
      {
        blockKey: 'block-a',
        attemptId: ATTEMPT_A,
        pendingMarks: 1,
        confirmedLapsRetiring: 0,
      },
    ]);
    expect(view.totals.unsentEntries).toBe(3);
    expect(view.totals.sendingEntries).toBe(0);
    expect(view.totals.waitingEntries).toBe(3);
    expect(view.totals.unsentByKind).toMatchObject({ NUMBER: 2, UNDO: 1 });
    expect(view.totals.pendingMarks).toBe(1);
  });

  it('keeps the pair adjacent in capture-then-withdrawal order whatever the input order', () => {
    const capture = numberPass('key-order-capture', 1, 14, '2026-11-16T10:00:01.000Z');
    const withdrawal = undoItem('key-order-undo', 2, '2026-11-16T10:00:02.000Z');
    const later = numberPass('key-order-17', 3, 17, '2026-11-16T10:00:03.000Z');

    const shuffled = derive([withdrawal, later, capture]);

    expect(shuffled.entries.map((entry) => entry.id)).toEqual([
      'key-order-capture',
      'key-order-undo',
      'key-order-17',
    ]);
    expect(shuffled.totals.pendingMarks).toBe(1);
  });

  it('retires one confirmed lap for an unsent withdrawal of a confirmed capture', () => {
    const view = derive([
      numberPass('key-confirmed', 1, 14, '2026-11-16T10:00:01.000Z', {
        status: 'APPLIED',
      }),
      undoItem('key-retire', 2, '2026-11-16T10:00:04.000Z'),
    ]);

    expect(view.entries.map((entry) => entry.id)).toEqual(['key-retire']);
    expect(view.entries[0]).toMatchObject({
      kind: 'UNDO',
      pendingMarks: 0,
      confirmedLapsRetired: 1,
      pairRole: 'WITHDRAWAL',
      pairId: 'key-confirmed',
      reason: null,
    });
    expect(view.entries[0].withdraws).toEqual({
      entryId: 'key-confirmed',
      startNumber: 14,
      fullName: 'Иванов Иван',
      blockKey: 'block-a',
      confirmed: true,
    });

    // The confirmed count is the server's and is reported unchanged; the
    // retirement is a separate derived fact (FR-41).
    expect(IVANOV.passCount).toBe(1);
    expect(view.participantMarks).toEqual([
      {
        blockKey: 'block-a',
        attemptId: ATTEMPT_A,
        enrollmentId: 'enr-14',
        startNumber: 14,
        fullName: 'Иванов Иван',
        confirmedPassCount: 1,
        pendingMarks: 0,
        confirmedLapsRetiring: 1,
      },
    ]);
    expect(view.blockMarks).toEqual([
      {
        blockKey: 'block-a',
        attemptId: ATTEMPT_A,
        pendingMarks: 0,
        confirmedLapsRetiring: 1,
      },
    ]);
    expect(view.totals).toMatchObject({
      unsentEntries: 1,
      sendingEntries: 0,
      waitingEntries: 1,
      pendingMarks: 0,
      confirmedLapsRetiring: 1,
      rejectedEntries: 0,
      hasUnsent: true,
    });
  });

  it('keeps a rejected capture and its withdrawal out of the markers', () => {
    const view = derive([
      numberPass('key-refused-capture', 1, 14, '2026-11-16T10:00:01.000Z', {
        status: 'REJECTED',
        error: 'Участник уже финишировал',
      }),
      undoItem('key-unneeded-undo', 2, '2026-11-16T10:00:02.000Z'),
    ]);

    expect(view.entries.map((entry) => entry.id)).toEqual([
      'key-refused-capture',
      'key-unneeded-undo',
    ]);
    expect(view.entries[0]).toMatchObject({
      status: 'REJECTED',
      unsent: false,
      rejected: true,
      pendingMarks: 0,
      pairRole: 'CAPTURE',
    });
    expect(view.entries[1]).toMatchObject({
      status: 'PENDING',
      unsent: true,
      pendingMarks: 0,
      confirmedLapsRetired: 0,
      pairRole: 'WITHDRAWAL',
    });
    expect(view.participantMarks).toEqual([]);
    expect(view.blockMarks).toEqual([]);
    expect(view.totals).toMatchObject({
      unsentEntries: 1,
      sendingEntries: 0,
      waitingEntries: 1,
      rejectedEntries: 1,
      pendingMarks: 0,
      confirmedLapsRetiring: 0,
    });
  });
});

describe('deriveTimingOfflineView: sending and waiting figures', () => {
  it('splits five unsent entries into two sending and three waiting', () => {
    const view = derive([
      numberPass('key-sending-1', 1, 14, '2026-11-16T10:00:01.000Z', {
        status: 'SENT',
      }),
      numberPass('key-sending-2', 2, 17, '2026-11-16T10:00:02.000Z', {
        status: 'SENT',
      }),
      numberPass('key-waiting-3', 3, 14, '2026-11-16T10:00:03.000Z'),
      tilePass('key-waiting-4', 4, 'enr-17', '2026-11-16T10:00:04.000Z'),
      anonymousSplitPass('key-waiting-5', 5, '2026-11-16T10:00:05.000Z'),
    ]);

    expect(view.totals.sendingEntries).toBe(2);
    expect(view.totals.waitingEntries).toBe(3);
    expect(view.totals.unsentEntries).toBe(5);
    expect(view.totals.unsentEntries).toBe(
      view.totals.sendingEntries + view.totals.waitingEntries,
    );
    expect(view.entries).toHaveLength(5);
    expect(
      view.entries
        .filter((entry) => entry.isSending)
        .map((entry) => entry.id),
    ).toEqual(['key-sending-1', 'key-sending-2']);
    expect(
      view.entries.filter((entry) => entry.unsent && !entry.isSending),
    ).toHaveLength(3);
    expect(view.unsentEntries).toHaveLength(5);
  });

  it('reports a lone sending entry with no waiting row', () => {
    const view = derive([
      numberPass('key-lone-sending', 1, 14, '2026-11-16T10:00:01.000Z', {
        status: 'SENT',
      }),
    ]);

    expect(view.totals.sendingEntries).toBe(1);
    expect(view.totals.waitingEntries).toBe(0);
    expect(view.totals.unsentEntries).toBe(1);
    expect(view.entries[0]).toMatchObject({
      status: 'SENT',
      unsent: true,
      rejected: false,
      isSending: true,
    });
  });

  it('keeps a pair adjacent when its capture sends and its withdrawal waits', () => {
    const view = derive([
      numberPass('key-split-capture', 1, 14, '2026-11-16T10:00:01.000Z', {
        status: 'SENT',
      }),
      undoItem('key-split-undo', 2, '2026-11-16T10:00:03.000Z'),
    ]);

    expect(view.entries.map((entry) => entry.id)).toEqual([
      'key-split-capture',
      'key-split-undo',
    ]);
    expect(view.entries[0]).toMatchObject({
      status: 'SENT',
      unsent: true,
      isSending: true,
      pendingMarks: 0,
      pairRole: 'CAPTURE',
      pairId: 'key-split-capture',
    });
    expect(view.entries[1]).toMatchObject({
      status: 'PENDING',
      unsent: true,
      isSending: false,
      pendingMarks: 0,
      pairRole: 'WITHDRAWAL',
      pairId: 'key-split-capture',
    });
    expect(view.totals).toMatchObject({
      unsentEntries: 2,
      sendingEntries: 1,
      waitingEntries: 1,
      pendingMarks: 0,
      confirmedLapsRetiring: 0,
    });
    expect(view.totals.unsentEntries).toBe(
      view.totals.sendingEntries + view.totals.waitingEntries,
    );
    expect(view.participantMarks).toEqual([]);
  });

  it('counts an applied or a rejected entry in none of the three figures', () => {
    const view = derive([
      numberPass('key-figure-applied', 1, 14, '2026-11-16T10:00:01.000Z', {
        status: 'APPLIED',
      }),
      numberPass('key-figure-rejected', 2, 17, '2026-11-16T10:00:02.000Z', {
        status: 'REJECTED',
        error: 'Участник уже финишировал',
      }),
      numberPass('key-figure-waiting', 3, 14, '2026-11-16T10:00:03.000Z'),
    ]);

    expect(view.entries.map((entry) => entry.id)).toEqual([
      'key-figure-rejected',
      'key-figure-waiting',
    ]);
    expect(view.entries[0]).toMatchObject({
      status: 'REJECTED',
      unsent: false,
      rejected: true,
      isSending: false,
    });
    expect(view.totals).toMatchObject({
      unsentEntries: 1,
      sendingEntries: 0,
      waitingEntries: 1,
      rejectedEntries: 1,
    });
    expect(view.unsentEntries.map((entry) => entry.id)).toEqual([
      'key-figure-waiting',
    ]);
    expect(view.rejectedEntries.map((entry) => entry.id)).toEqual([
      'key-figure-rejected',
    ]);
  });

  it('counts a withdrawal-only unsent entry once, in exactly one figure', () => {
    const view = derive([
      numberPass('key-retired-capture', 1, 14, '2026-11-16T10:00:01.000Z', {
        status: 'APPLIED',
      }),
      undoItem('key-lone-withdrawal', 2, '2026-11-16T10:00:04.000Z', {
        status: 'SENT',
      }),
    ]);

    expect(view.entries.map((entry) => entry.id)).toEqual([
      'key-lone-withdrawal',
    ]);
    expect(view.entries[0]).toMatchObject({
      kind: 'UNDO',
      status: 'SENT',
      unsent: true,
      isSending: true,
      confirmedLapsRetired: 1,
    });
    expect(view.totals.unsentEntries).toBe(1);
    expect(view.totals.sendingEntries).toBe(1);
    expect(view.totals.waitingEntries).toBe(0);
    expect(view.totals.unsentEntries).toBe(
      view.totals.sendingEntries + view.totals.waitingEntries,
    );
    expect(view.totals.unsentByKind.UNDO).toBe(1);
  });

  it('leaves the mark totals unchanged by the two figures', () => {
    const view = derive([
      numberPass('key-marks-sending', 1, 14, '2026-11-16T10:00:01.000Z', {
        status: 'SENT',
      }),
      numberPass('key-marks-waiting', 2, 17, '2026-11-16T10:00:02.000Z'),
      pendingFinishPass('key-marks-finish', 3, '2026-11-16T10:00:03.000Z', {
        status: 'SENT',
      }),
      anonymousSplitPass('key-marks-split', 4, '2026-11-16T10:00:04.000Z'),
      numberPass('key-marks-unknown', 5, 99, '2026-11-16T10:00:05.000Z', {
        status: 'SENT',
      }),
    ]);

    expect(view.totals).toMatchObject({
      unsentEntries: 5,
      sendingEntries: 3,
      waitingEntries: 2,
      pendingMarks: 2,
      unattributedPendingMarks: 1,
    });
    expect(view.totals.unsentEntries).toBe(
      view.totals.sendingEntries + view.totals.waitingEntries,
    );
    expect(
      view.participantMarks.reduce(
        (sum, marks) => sum + marks.pendingMarks,
        0,
      ),
    ).toBe(view.totals.pendingMarks);
  });
});

describe('timingOfflineBlockKey', () => {
  it('keeps the identity the timing page already renders by', () => {
    const category: TimingCategoryBlockView = { ...BLOCK_A, blockKey: undefined };
    expect(timingOfflineBlockKey(category)).toBe('start-a:1:M');

    const heat: TimingCategoryBlockView = {
      ...BLOCK_A,
      blockKey: undefined,
      kind: 'HEAT',
      classCompetitionId: 'race-1',
      stageId: 'stage-1',
      heatNumber: 2,
    };
    expect(timingOfflineBlockKey(heat)).toBe('heat:race-1:stage-1:2');
  });
});
