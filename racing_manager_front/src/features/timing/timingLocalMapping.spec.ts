import { describe, expect, it, vi } from 'vitest';
import { mapLocalAttempt } from './timingLocalMapping';
import type { TimingQueueItem } from './timingQueue';
import type {
  CaptureTimingPassRequest,
  QuickUndoTimingPassRequest,
  StartOfflineTimingAttemptRequest,
} from './types';

const WORKSTATION = 'ws-1';
const LOCAL_ATTEMPT = 'local-attempt';
const LOCAL_EPOCH = 'local-epoch';
const SERVER_ATTEMPT = 'server-attempt';
const SERVER_EPOCH = 'server-epoch';

function startItem(
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  const payload: StartOfflineTimingAttemptRequest = {
    startId: 'start-a',
    formatId: 1,
    gender: 'M',
    workstationInstanceId: WORKSTATION,
    officialStartedAt: '2026-11-18T09:00:00.000Z',
    roster: [
      {
        enrollmentId: 'enrollment-1',
        registrationId: 'registration-1',
        startNumber: 10,
        sectionId: 'CATEGORY',
        requiredLaps: 3,
      },
    ],
    localAttemptId: LOCAL_ATTEMPT,
    localClockEpochId: LOCAL_EPOCH,
    deviceSequence: 1,
  };
  return {
    id: 'start',
    attemptId: LOCAL_ATTEMPT,
    workstationInstanceId: WORKSTATION,
    deviceSequence: 1,
    operation: 'START',
    payload,
    status: 'PENDING',
    createdAt: '2026-11-18T09:00:00.000Z',
    ...overrides,
  };
}

function passItem(
  id: string,
  sequence: number,
  createdAt: string,
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  const payload: CaptureTimingPassRequest = {
    attemptId: LOCAL_ATTEMPT,
    kind: 'NUMBER',
    startNumber: 10,
    clientCapturedAt: createdAt,
    clientElapsedMs: sequence * 1000,
    clockEpochId: LOCAL_EPOCH,
    workstationInstanceId: WORKSTATION,
    deviceSequence: sequence,
  };
  return {
    id,
    attemptId: LOCAL_ATTEMPT,
    workstationInstanceId: WORKSTATION,
    deviceSequence: sequence,
    operation: 'PASS',
    payload,
    status: 'PENDING',
    createdAt,
    ...overrides,
  };
}

function undoItem(
  id: string,
  sequence: number,
  createdAt: string,
): TimingQueueItem {
  const payload: QuickUndoTimingPassRequest = {
    workstationInstanceId: WORKSTATION,
    deviceSequence: sequence,
  };
  return {
    id,
    attemptId: LOCAL_ATTEMPT,
    workstationInstanceId: WORKSTATION,
    deviceSequence: sequence,
    operation: 'UNDO',
    payload,
    status: 'PENDING',
    createdAt,
  };
}

function splitItem(): TimingQueueItem {
  const payload: CaptureTimingPassRequest = {
    kind: 'ANONYMOUS_SPLIT',
    clientCapturedAt: '2026-11-18T09:00:05.000Z',
    clientElapsedMs: 5000,
    clockEpochId: LOCAL_EPOCH,
    workstationInstanceId: WORKSTATION,
    deviceSequence: 1,
  };
  return {
    id: 'split',
    attemptId: 'event:event-1',
    workstationInstanceId: WORKSTATION,
    deviceSequence: 1,
    operation: 'PASS',
    payload,
    status: 'PENDING',
    createdAt: '2026-11-18T09:00:05.000Z',
    localAnchorAttemptId: LOCAL_ATTEMPT,
  };
}

function assignmentItem(): TimingQueueItem {
  return {
    id: 'assign',
    attemptId: 'event:event-1',
    workstationInstanceId: WORKSTATION,
    deviceSequence: 2,
    operation: 'ANONYMOUS_ASSIGN',
    payload: {
      captureDeviceSequence: 1,
      request: {
        startNumber: 10,
        workstationInstanceId: WORKSTATION,
        chosenAttemptId: LOCAL_ATTEMPT,
        deviceSequence: 2,
      },
    },
    status: 'PENDING',
    createdAt: '2026-11-18T09:00:06.000Z',
  };
}

function byId(items: readonly TimingQueueItem[]): Map<string, TimingQueueItem> {
  return new Map(items.map((item) => [item.id, item]));
}

describe('mapLocalAttempt', () => {
  it('moves passes and undos to the server attempt and numbers them 1..n', () => {
    const start = startItem();
    const items = [
      start,
      passItem('pass-1', 2, '2026-11-18T09:00:01.000Z'),
      passItem('pass-2', 3, '2026-11-18T09:00:02.000Z'),
      undoItem('undo', 4, '2026-11-18T09:00:03.000Z'),
      splitItem(),
      assignmentItem(),
      passItem('server-pass', 1, '2026-11-18T09:00:07.000Z', {
        attemptId: 'other-attempt',
        payload: {
          ...(passItem('x', 1, '2026-11-18T09:00:00.000Z')
            .payload as CaptureTimingPassRequest),
          attemptId: 'other-attempt',
        },
      }),
    ];
    let next = 0;

    const result = mapLocalAttempt({
      items,
      startItem: start,
      serverAttemptId: SERVER_ATTEMPT,
      serverClockEpochId: SERVER_EPOCH,
      nextSequence: () => {
        next += 1;
        return next;
      },
    });

    const changed = byId(result.changed);
    expect([...changed.keys()].sort()).toEqual([
      'assign',
      'pass-1',
      'pass-2',
      'split',
      'start',
      'undo',
    ]);
    expect(changed.get('pass-1')).toMatchObject({
      attemptId: SERVER_ATTEMPT,
      deviceSequence: 1,
      serverAttemptId: SERVER_ATTEMPT,
      serverClockEpochId: SERVER_EPOCH,
    });
    expect(
      changed.get('pass-1')?.payload as CaptureTimingPassRequest,
    ).toMatchObject({
      attemptId: SERVER_ATTEMPT,
      clockEpochId: SERVER_EPOCH,
      deviceSequence: 1,
    });
    expect(changed.get('pass-2')?.deviceSequence).toBe(2);
    expect(changed.get('undo')).toMatchObject({
      attemptId: SERVER_ATTEMPT,
      deviceSequence: 3,
    });
    expect(
      changed.get('undo')?.payload as QuickUndoTimingPassRequest,
    ).toMatchObject({ deviceSequence: 3 });
    expect(changed.get('split')).toMatchObject({
      localAnchorAttemptId: SERVER_ATTEMPT,
    });
    expect(
      changed.get('split')?.payload as CaptureTimingPassRequest,
    ).toMatchObject({ clockEpochId: SERVER_EPOCH });
    expect(changed.get('assign')?.payload).toMatchObject({
      captureDeviceSequence: 1,
      request: { chosenAttemptId: SERVER_ATTEMPT },
    });
    expect(changed.get('start')).toMatchObject({
      serverAttemptId: SERVER_ATTEMPT,
      serverClockEpochId: SERVER_EPOCH,
    });
    expect(changed.has('server-pass')).toBe(false);
    expect(result.startItem.serverAttemptId).toBe(SERVER_ATTEMPT);
    expect(result.lastIssuedSequence).toBe(3);
  });

  it('does not allocate again when the Start already carries the server attempt', () => {
    const start = startItem({
      serverAttemptId: SERVER_ATTEMPT,
      serverClockEpochId: SERVER_EPOCH,
    });
    const allocator = vi.fn(() => 99);
    const items = [
      start,
      passItem('pass-1', 1, '2026-11-18T09:00:01.000Z', {
        attemptId: SERVER_ATTEMPT,
        serverAttemptId: SERVER_ATTEMPT,
      }),
      passItem('pass-2', 2, '2026-11-18T09:00:02.000Z', {
        attemptId: SERVER_ATTEMPT,
        serverAttemptId: SERVER_ATTEMPT,
      }),
    ];

    const result = mapLocalAttempt({
      items,
      startItem: start,
      serverAttemptId: SERVER_ATTEMPT,
      serverClockEpochId: SERVER_EPOCH,
      nextSequence: allocator,
    });

    expect(allocator).not.toHaveBeenCalled();
    expect(result.changed).toEqual([]);
    expect(result.lastIssuedSequence).toBe(2);
  });

  it('keeps an event-scoped split untouched when its clock was another attempt', () => {
    const start = startItem();
    const split = splitItem();
    const otherSplit = {
      ...split,
      id: 'split-other',
      localAnchorAttemptId: 'another-attempt',
      payload: {
        ...(split.payload as CaptureTimingPassRequest),
        clockEpochId: 'another-epoch',
      },
    };

    const result = mapLocalAttempt({
      items: [start, otherSplit],
      startItem: start,
      serverAttemptId: SERVER_ATTEMPT,
      serverClockEpochId: SERVER_EPOCH,
      nextSequence: () => 1,
    });

    expect(byId(result.changed).has('split-other')).toBe(false);
  });
});
