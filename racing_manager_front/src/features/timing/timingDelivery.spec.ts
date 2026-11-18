import { describe, expect, it } from 'vitest';
import type {
  TimingMutationOperation,
  TimingMutationStatus,
  TimingQueueItem,
} from './timingQueue';
import {
  CAPTURE_RETRY_BACKOFF_MS,
  MAX_CONCURRENT_CAPTURE_DELIVERIES,
  decideDeliveries,
  timingDeliveryKey,
  type TimingDeliveryBlockReason,
  type TimingDeliveryDecision,
} from './timingDelivery';

/**
 * MANUAL-TIMING-5 runs several capture deliveries at once under a bound, and
 * keeps the order of one participant and of each pair. These tests pin the only
 * place that states those rules.
 *
 * The payloads below are the bodies `useTimingCapture` stores, field for field:
 * `commitNumber` keeps the number and never the resolved enrollment,
 * `commitTile` keeps the enrollment and never the number, `captureAnonymous`
 * keeps neither, and a `BIND` carries its `pendingFinishId` next to the number.
 * A rule that only works on a hand-picked shape fails here.
 */

const WORKSTATION = 'ws-1';
const ATTEMPT_A = 'attempt-a';
const ATTEMPT_B = 'attempt-b';
const EVENT_SCOPE = 'event:event-1';

function pressTime(deviceSequence: number): string {
  return new Date(Date.parse('2026-11-18T10:00:00.000Z') + deviceSequence).toISOString();
}

function queueItem(
  id: string,
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  return {
    id,
    attemptId: ATTEMPT_A,
    workstationInstanceId: WORKSTATION,
    deviceSequence: 1,
    operation: 'PASS',
    payload: {},
    status: 'PENDING',
    createdAt: pressTime(1),
    ...overrides,
  };
}

/** A number press, as `commitNumber` stores it: the number, not the enrollment. */
function numberPass(
  id: string,
  deviceSequence: number,
  startNumber: number,
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  return queueItem(id, {
    deviceSequence,
    createdAt: pressTime(deviceSequence),
    payload: {
      attemptId: ATTEMPT_A,
      kind: 'NUMBER',
      startNumber,
      clientCapturedAt: pressTime(deviceSequence),
      clientElapsedMs: deviceSequence * 1_000,
      clockEpochId: 'epoch-1',
      workstationInstanceId: WORKSTATION,
      deviceSequence,
    },
    ...overrides,
  });
}

/** A tile press, as `commitTile` stores it: the enrollment, never the number. */
function tilePass(
  id: string,
  deviceSequence: number,
  enrollmentId: string,
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  return queueItem(id, {
    deviceSequence,
    createdAt: pressTime(deviceSequence),
    payload: {
      attemptId: ATTEMPT_A,
      kind: 'TILE',
      enrollmentId,
      clientCapturedAt: pressTime(deviceSequence),
      clientElapsedMs: deviceSequence * 1_000,
      clockEpochId: 'epoch-1',
      workstationInstanceId: WORKSTATION,
      deviceSequence,
    },
    ...overrides,
  });
}

/** An unbound-finish capture: it names the finish, not a participant. */
function pendingFinishPass(
  id: string,
  deviceSequence: number,
  pendingFinishId: string,
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  return queueItem(id, {
    deviceSequence,
    createdAt: pressTime(deviceSequence),
    payload: {
      attemptId: ATTEMPT_A,
      kind: 'PENDING_FINISH',
      pendingFinishId,
      clientCapturedAt: pressTime(deviceSequence),
      clientElapsedMs: deviceSequence * 1_000,
      clockEpochId: 'epoch-1',
      workstationInstanceId: WORKSTATION,
      deviceSequence,
    },
    ...overrides,
  });
}

/** An anonymous split of the event scope; it carries no participant at all. */
function anonymousSplitPass(
  id: string,
  deviceSequence: number,
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  return queueItem(id, {
    attemptId: EVENT_SCOPE,
    deviceSequence,
    createdAt: pressTime(deviceSequence),
    payload: {
      kind: 'ANONYMOUS_SPLIT',
      clientCapturedAt: pressTime(deviceSequence),
      clientElapsedMs: deviceSequence * 1_000,
      clockEpochId: 'epoch-1',
      workstationInstanceId: WORKSTATION,
      deviceSequence,
    },
    ...overrides,
  });
}

/** A pending-finish bind, as `bindPending` stores it. */
function pendingFinishBind(
  id: string,
  deviceSequence: number,
  pendingFinishId: string,
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  return queueItem(id, {
    deviceSequence,
    createdAt: pressTime(deviceSequence),
    operation: 'BIND',
    payload: {
      pendingFinishId,
      startNumber: 14,
      workstationInstanceId: WORKSTATION,
      deviceSequence,
    },
    ...overrides,
  });
}

/** A quick undo, as `quickUndo` stores it: its own sequence, no participant. */
function quickUndo(
  id: string,
  deviceSequence: number,
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  return queueItem(id, {
    deviceSequence,
    createdAt: pressTime(deviceSequence),
    operation: 'UNDO',
    payload: { workstationInstanceId: WORKSTATION, deviceSequence },
    ...overrides,
  });
}

/** A split assignment: the split leaves the queue and its request binds it. */
function anonymousAssign(
  id: string,
  deviceSequence: number,
  splitId: string,
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  return queueItem(id, {
    attemptId: EVENT_SCOPE,
    deviceSequence,
    createdAt: pressTime(deviceSequence),
    operation: 'ANONYMOUS_ASSIGN',
    payload: {
      splitId,
      request: {
        startNumber: 21,
        workstationInstanceId: WORKSTATION,
        deviceSequence,
      },
    },
    ...overrides,
  });
}

function decide(
  items: readonly TimingQueueItem[],
  overrides: {
    sendingIds?: readonly string[];
    retryNotBefore?: ReadonlyMap<string, number>;
    now?: number;
    online?: boolean;
  } = {},
): TimingDeliveryDecision {
  return decideDeliveries({
    items,
    sendingIds: new Set(overrides.sendingIds ?? []),
    retryNotBefore: overrides.retryNotBefore ?? new Map<string, number>(),
    now: overrides.now ?? 0,
    online: overrides.online ?? true,
  });
}

function startedIds(decision: TimingDeliveryDecision): string[] {
  return decision.start.map((item) => item.id);
}

function blockedReasons(
  decision: TimingDeliveryDecision,
): Record<string, TimingDeliveryBlockReason> {
  return Object.fromEntries(
    decision.blocked.map((entry) => [entry.item.id, entry.reason]),
  );
}

function withStatus(
  item: TimingQueueItem,
  status: TimingMutationStatus,
): TimingQueueItem {
  return { ...item, status };
}

function twentyNumberPresses(): TimingQueueItem[] {
  const items: TimingQueueItem[] = [];
  for (let sequence = 1; sequence <= 20; sequence += 1) {
    items.push(numberPass(`press-${sequence}`, sequence, sequence));
  }
  return items;
}

describe('timingDelivery constants', () => {
  it('names the bound and the backoff of the accepted decisions', () => {
    expect(MAX_CONCURRENT_CAPTURE_DELIVERIES).toBe(8);
    expect(CAPTURE_RETRY_BACKOFF_MS).toBe(1_000);
  });
});

describe('timingDeliveryKey', () => {
  it('keys a number press by its number and a tile press by its enrollment', () => {
    expect(timingDeliveryKey(numberPass('a', 1, 14))).toBe('number:14');
    expect(timingDeliveryKey(tilePass('b', 2, 'enr-14'))).toBe('enrollment:enr-14');
  });

  it('keys an unbound finish and a bind by the same finish id', () => {
    expect(timingDeliveryKey(pendingFinishPass('a', 1, 'pf-1'))).toBe('finish:pf-1');
    expect(timingDeliveryKey(pendingFinishBind('b', 2, 'pf-1'))).toBe('finish:pf-1');
  });

  it('leaves the pair-ordered operations without a participant key', () => {
    expect(timingDeliveryKey(anonymousSplitPass('a', 1))).toBeNull();
    expect(timingDeliveryKey(quickUndo('b', 2))).toBeNull();
    expect(timingDeliveryKey(anonymousAssign('c', 3, 'split-1'))).toBeNull();
  });

  it('reads a payload the product did not write without inventing a key', () => {
    expect(timingDeliveryKey(queueItem('a'))).toBeNull();
    expect(timingDeliveryKey(numberPass('b', 1, 14, { payload: 'nope' }))).toBeNull();
    expect(
      timingDeliveryKey(numberPass('c', 1, 14, { payload: { kind: 'NUMBER' } })),
    ).toBeNull();
  });
});

describe('decideDeliveries: the bound', () => {
  it('starts nothing when the outbox is empty', () => {
    const decision = decide([]);

    expect(decision.start).toEqual([]);
    expect(decision.blocked).toEqual([]);
  });

  it('starts a single candidate and blocks nothing', () => {
    const decision = decide([numberPass('press-1', 1, 14)]);

    expect(startedIds(decision)).toEqual(['press-1']);
    expect(decision.blocked).toEqual([]);
  });

  it('starts the first eight of twenty captures and holds the rest as bound', () => {
    const items = twentyNumberPresses();
    const decision = decide(items);

    expect(startedIds(decision)).toEqual([
      'press-1',
      'press-2',
      'press-3',
      'press-4',
      'press-5',
      'press-6',
      'press-7',
      'press-8',
    ]);
    expect(decision.blocked).toHaveLength(12);
    expect(
      decision.blocked.every((entry) => entry.reason === 'bound'),
    ).toBe(true);
  });

  it('leaves no capacity for a waiting capture when the outstanding ones fill the bound', () => {
    const items = twentyNumberPresses();
    const sendingIds = items.slice(0, 8).map((item) => item.id);
    const decision = decide(
      items.map((item) =>
        sendingIds.includes(item.id) ? withStatus(item, 'SENT') : item,
      ),
      { sendingIds },
    );

    expect(startedIds(decision)).toEqual([]);
    expect(decision.blocked).toHaveLength(12);
    expect(
      decision.blocked.every((entry) => entry.reason === 'bound'),
    ).toBe(true);
    // An outstanding capture is neither started nor reported.
    expect(blockedReasons(decision)['press-1']).toBeUndefined();
  });

  it('counts only the free capacity and never reorders the queue', () => {
    const items = twentyNumberPresses();
    const sendingIds = ['press-1', 'press-2', 'press-3'];
    const decision = decide(
      items.map((item) =>
        sendingIds.includes(item.id) ? withStatus(item, 'SENT') : item,
      ),
      { sendingIds },
    );

    expect(startedIds(decision)).toEqual([
      'press-4',
      'press-5',
      'press-6',
      'press-7',
      'press-8',
    ]);
    expect(blockedReasons(decision)['press-9']).toBe('bound');
  });
});

describe('decideDeliveries: the participant gate', () => {
  it('serializes two captures of one number behind the earlier one', () => {
    const decision = decide([
      numberPass('press-1', 1, 14),
      numberPass('press-2', 2, 14),
    ]);

    expect(startedIds(decision)).toEqual(['press-1']);
    expect(blockedReasons(decision)).toEqual({ 'press-2': 'participant' });
  });

  it('serializes the second capture of a number even when the first is sending', () => {
    const items = [
      withStatus(numberPass('press-1', 1, 14), 'SENT'),
      numberPass('press-2', 2, 14),
    ];
    const decision = decide(items, { sendingIds: ['press-1'] });

    expect(startedIds(decision)).toEqual([]);
    expect(blockedReasons(decision)).toEqual({ 'press-2': 'participant' });
  });

  it('serializes a later capture behind an earlier one held by its backoff', () => {
    const decision = decide(
      [numberPass('press-1', 1, 14), numberPass('press-2', 2, 14)],
      { retryNotBefore: new Map([['press-1', 5_000]]), now: 4_999 },
    );

    expect(startedIds(decision)).toEqual([]);
    expect(blockedReasons(decision)).toEqual({
      'press-1': 'backoff',
      'press-2': 'participant',
    });
  });

  it('starts two captures of different numbers together', () => {
    const decision = decide([
      numberPass('press-1', 1, 14),
      numberPass('press-2', 2, 17),
    ]);

    expect(startedIds(decision)).toEqual(['press-1', 'press-2']);
    expect(decision.blocked).toEqual([]);
  });

  it('serializes two tile presses of one enrollment', () => {
    const decision = decide([
      tilePass('press-1', 1, 'enr-14'),
      tilePass('press-2', 2, 'enr-14'),
    ]);

    expect(startedIds(decision)).toEqual(['press-1']);
    expect(blockedReasons(decision)).toEqual({ 'press-2': 'participant' });
  });

  it('keys a tile press and a number press differently, because the client knows no shared identity', () => {
    // `commitNumber` stores `startNumber` and never the resolved enrollment;
    // `commitTile` stores `enrollmentId` and never the number. AD-3 accepts that
    // the two keys cannot meet, so the pair starts together and two presses that
    // share a number are the ones the gate serializes.
    const tile = tilePass('tile-1', 1, 'enr-14');
    const number = numberPass('number-1', 2, 14, { attemptId: ATTEMPT_B });

    expect(timingDeliveryKey(tile)).toBe('enrollment:enr-14');
    expect(timingDeliveryKey(number)).toBe('number:14');
    expect(startedIds(decide([tile, number]))).toEqual(['tile-1', 'number-1']);
  });

  it('serializes a bind behind the unbound finish it binds', () => {
    const decision = decide([
      pendingFinishPass('press-1', 1, 'pf-1'),
      pendingFinishBind('press-2', 2, 'pf-1'),
    ]);

    expect(startedIds(decision)).toEqual(['press-1']);
    expect(blockedReasons(decision)).toEqual({ 'press-2': 'participant' });
  });

  it('starts a bind of another unbound finish together with the first', () => {
    const decision = decide([
      pendingFinishPass('press-1', 1, 'pf-1'),
      pendingFinishBind('press-2', 2, 'pf-2'),
    ]);

    expect(startedIds(decision)).toEqual(['press-1', 'press-2']);
  });
});

describe('decideDeliveries: the pair gate', () => {
  it('holds a withdrawal behind its unsent capture', () => {
    const decision = decide([
      numberPass('press-1', 1, 14),
      quickUndo('press-2', 2),
    ]);

    expect(startedIds(decision)).toEqual(['press-1']);
    expect(blockedReasons(decision)).toEqual({ 'press-2': 'pair' });
  });

  it('holds a withdrawal behind a capture that is being sent', () => {
    const items = [
      withStatus(numberPass('press-1', 1, 14), 'SENT'),
      quickUndo('press-2', 2),
    ];
    const decision = decide(items, { sendingIds: ['press-1'] });

    expect(startedIds(decision)).toEqual([]);
    expect(blockedReasons(decision)).toEqual({ 'press-2': 'pair' });
  });

  it('starts a withdrawal once its capture is confirmed', () => {
    const decision = decide([
      withStatus(numberPass('press-1', 1, 14), 'APPLIED'),
      quickUndo('press-2', 2),
    ]);

    expect(startedIds(decision)).toEqual(['press-2']);
  });

  it('holds a split assignment behind its unsent split', () => {
    const decision = decide([
      anonymousSplitPass('press-1', 1),
      anonymousAssign('press-2', 2, 'split-1'),
    ]);

    expect(startedIds(decision)).toEqual(['press-1']);
    expect(blockedReasons(decision)).toEqual({ 'press-2': 'pair' });
  });

  it('holds a split assignment behind a split that is being sent', () => {
    const items = [
      withStatus(anonymousSplitPass('press-1', 1), 'SENT'),
      anonymousAssign('press-2', 2, 'split-1'),
    ];
    const decision = decide(items, { sendingIds: ['press-1'] });

    expect(startedIds(decision)).toEqual([]);
    expect(blockedReasons(decision)).toEqual({ 'press-2': 'pair' });
  });

  it('starts a split assignment once its split is confirmed', () => {
    const decision = decide([
      withStatus(anonymousSplitPass('press-1', 1), 'APPLIED'),
      anonymousAssign('press-2', 2, 'split-1'),
    ]);

    expect(startedIds(decision)).toEqual(['press-2']);
  });

  it('keeps the withdrawal behind the capture when the bound would allow both', () => {
    // Capacity is free for both, so the pair gate alone decides.
    const decision = decide([
      numberPass('press-1', 1, 14),
      quickUndo('press-2', 2),
      numberPass('press-3', 3, 17),
    ]);

    expect(startedIds(decision)).toEqual(['press-1', 'press-3']);
    expect(blockedReasons(decision)).toEqual({ 'press-2': 'pair' });
  });
});

describe('decideDeliveries: offline and retry eligibility', () => {
  it('blocks every waiting capture while the browser reports offline', () => {
    const items = [
      withStatus(numberPass('press-1', 1, 14), 'SENT'),
      numberPass('press-2', 2, 17),
      quickUndo('press-3', 3),
    ];
    const decision = decide(items, {
      sendingIds: ['press-1'],
      online: false,
    });

    expect(startedIds(decision)).toEqual([]);
    expect(blockedReasons(decision)).toEqual({
      'press-2': 'offline',
      'press-3': 'offline',
    });
  });

  it('holds a capture until its backoff elapses', () => {
    const decision = decide([numberPass('press-1', 1, 14)], {
      retryNotBefore: new Map([['press-1', 5_000]]),
      now: 4_999,
    });

    expect(startedIds(decision)).toEqual([]);
    expect(blockedReasons(decision)).toEqual({ 'press-1': 'backoff' });
  });

  it('starts a capture at the exact moment its backoff elapses', () => {
    const decision = decide([numberPass('press-1', 1, 14)], {
      retryNotBefore: new Map([['press-1', 5_000]]),
      now: 5_000,
    });

    expect(startedIds(decision)).toEqual(['press-1']);
  });

  it('starts a capture that has no recorded failure', () => {
    const decision = decide([numberPass('press-1', 1, 14)], {
      retryNotBefore: new Map([['press-2', 9_000]]),
      now: 5_000,
    });

    expect(startedIds(decision)).toEqual(['press-1']);
  });
});

describe('decideDeliveries: settled captures and untouched input', () => {
  it('ignores an applied or refused capture', () => {
    const items = [
      withStatus(numberPass('press-1', 1, 14), 'APPLIED'),
      withStatus(numberPass('press-2', 2, 17), 'REJECTED'),
      numberPass('press-3', 3, 21),
    ];
    const decision = decide(items);

    expect(startedIds(decision)).toEqual(['press-3']);
    expect(decision.blocked).toEqual([]);
  });

  it('does not let a refused capture hold a later one of the same number', () => {
    const decision = decide([
      withStatus(numberPass('press-1', 1, 14), 'REJECTED'),
      numberPass('press-2', 2, 14),
    ]);

    expect(startedIds(decision)).toEqual(['press-2']);
  });

  it('follows capture order across operations and never mutates the outbox', () => {
    const items = [
      anonymousSplitPass('press-1', 1),
      numberPass('press-2', 2, 14),
      quickUndo('press-3', 3),
      pendingFinishBind('press-4', 4, 'pf-1'),
    ];
    const snapshot = structuredClone(items);
    const sendingIds = new Set(['press-9']);
    const retryNotBefore = new Map([['press-8', 1_000]]);

    const decision = decide(items, { sendingIds: [...sendingIds], retryNotBefore });

    expect(startedIds(decision)).toEqual(['press-1', 'press-2', 'press-4']);
    expect(blockedReasons(decision)).toEqual({ 'press-3': 'pair' });
    expect(items).toEqual(snapshot);
    expect(sendingIds.size).toBe(1);
    expect(retryNotBefore.size).toBe(1);
  });

  it('reports the plan for a mixed burst without dropping a capture', () => {
    const items = twentyNumberPresses();
    const decision = decide(items, {
      sendingIds: ['press-20'],
    });

    const reported = new Set([
      ...startedIds(decision),
      ...decision.blocked.map((entry) => entry.item.id),
    ]);
    expect(reported.size + 1).toBe(items.length);
    expect(decision.start.length + decision.blocked.length).toBe(
      items.length - 1,
    );
    expect(reported.has('press-20')).toBe(false);
  });
});

describe('decideDeliveries: the participant gate reads stored payloads', () => {
  it('does not crash on an item whose operation is not a capture', () => {
    const operations: TimingMutationOperation[] = [
      'PASS',
      'BIND',
      'UNDO',
      'ANONYMOUS_ASSIGN',
    ];
    const items = operations.map((operation, index) =>
      queueItem(`press-${index + 1}`, {
        operation,
        deviceSequence: (index + 1) * 10,
      }),
    );

    const decision = decide(items);

    expect(startedIds(decision)).toEqual([
      'press-1',
      'press-2',
      'press-3',
      'press-4',
    ]);
  });
});

describe('offline Start ordering', () => {
  const LOCAL = 'local-attempt';
  const EVENT = 'event-1';

  function startItem(overrides: Partial<TimingQueueItem> = {}): TimingQueueItem {
    return queueItem('start-1', {
      id: 'start-1',
      attemptId: LOCAL,
      operation: 'START',
      deviceSequence: 1,
      createdAt: pressTime(1),
      eventId: EVENT,
      payload: {
        localAttemptId: LOCAL,
        localClockEpochId: 'local-epoch',
        officialStartedAt: pressTime(1),
      },
      ...overrides,
    });
  }

  function localPass(id = 'pass-1', sequence = 2): TimingQueueItem {
    return queueItem(id, {
      attemptId: LOCAL,
      deviceSequence: sequence,
      createdAt: pressTime(sequence),
      eventId: EVENT,
      payload: {
        attemptId: LOCAL,
        kind: 'NUMBER',
        startNumber: 10,
        clientCapturedAt: pressTime(sequence),
        clientElapsedMs: sequence * 1_000,
        clockEpochId: 'local-epoch',
        workstationInstanceId: WORKSTATION,
        deviceSequence: sequence,
      },
    });
  }

  function splitItem(
    id: string,
    createdAt: string,
    overrides: Partial<TimingQueueItem> = {},
  ): TimingQueueItem {
    return queueItem(id, {
      attemptId: EVENT_SCOPE,
      deviceSequence: 1,
      createdAt,
      eventId: EVENT,
      payload: {
        kind: 'ANONYMOUS_SPLIT',
        clientCapturedAt: createdAt,
        clientElapsedMs: 1_000,
        clockEpochId: 'local-epoch',
        workstationInstanceId: WORKSTATION,
        deviceSequence: 1,
      },
      ...overrides,
    });
  }

  it('starts the Start alone and holds its pass and a later event split', () => {
    const decision = decide([
      startItem(),
      localPass(),
      splitItem('split-after', pressTime(3), {
        localAnchorAttemptId: LOCAL,
      }),
    ]);

    expect(startedIds(decision)).toEqual(['start-1']);
    expect(blockedReasons(decision)).toMatchObject({
      'pass-1': 'start',
      'split-after': 'start',
    });
  });

  it('releases the pass and the split once the Start has a final answer', () => {
    const decision = decide([
      withStatus(startItem(), 'APPLIED'),
      localPass(),
      splitItem('split-after', pressTime(3), {
        localAnchorAttemptId: LOCAL,
      }),
    ]);

    expect(startedIds(decision)).toEqual(['pass-1', 'split-after']);
  });

  it('lets a split captured before the Start go ahead', () => {
    const decision = decide([
      startItem(),
      splitItem('split-before', pressTime(0)),
    ]);

    expect(startedIds(decision)).toEqual(['start-1', 'split-before']);
  });

  it('holds a later split by its event even without an anchor, and not another event', () => {
    const decision = decide([
      startItem(),
      splitItem('split-after', pressTime(3)),
      splitItem('split-other-event', pressTime(3), { eventId: 'event-2' }),
    ]);

    expect(blockedReasons(decision)).toMatchObject({
      'split-after': 'start',
    });
    expect(startedIds(decision)).toEqual(['start-1', 'split-other-event']);
  });
});

describe('refused offline Start', () => {
  const LOCAL = 'local-attempt';
  const EVENT = 'event-1';

  function refusedStart(): TimingQueueItem {
    return queueItem('start-1', {
      attemptId: LOCAL,
      operation: 'START',
      deviceSequence: 1,
      createdAt: pressTime(1),
      eventId: EVENT,
      status: 'REJECTED',
      payload: {
        localAttemptId: LOCAL,
        localClockEpochId: 'local-epoch',
        officialStartedAt: pressTime(1),
      },
    });
  }

  function splitItem(epochId: string): TimingQueueItem {
    return queueItem('split-1', {
      attemptId: EVENT_SCOPE,
      deviceSequence: 1,
      createdAt: pressTime(2),
      eventId: EVENT,
      payload: {
        kind: 'ANONYMOUS_SPLIT',
        clientCapturedAt: pressTime(2),
        clientElapsedMs: 1_000,
        clockEpochId: epochId,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 1,
      },
    });
  }

  function localPass(): TimingQueueItem {
    return queueItem('pass-1', {
      attemptId: LOCAL,
      deviceSequence: 2,
      createdAt: pressTime(2),
      eventId: EVENT,
      payload: {
        attemptId: LOCAL,
        kind: 'NUMBER',
        startNumber: 10,
        clientCapturedAt: pressTime(2),
        clientElapsedMs: 1_000,
        clockEpochId: 'local-epoch',
        workstationInstanceId: WORKSTATION,
        deviceSequence: 2,
      },
    });
  }

  it('never sends the passes or splits of a refused local attempt', () => {
    const anchored = {
      ...splitItem('local-epoch'),
      localAnchorAttemptId: LOCAL,
    };
    const decision = decide([refusedStart(), localPass(), anchored]);

    expect(startedIds(decision)).toEqual([]);
    expect(blockedReasons(decision)).toMatchObject({
      'pass-1': 'start',
      'split-1': 'start',
    });
  });

  it('blocks a split by its local epoch even without the anchor field', () => {
    const decision = decide([refusedStart(), splitItem('local-epoch')]);

    expect(startedIds(decision)).toEqual([]);
    expect(blockedReasons(decision)).toMatchObject({ 'split-1': 'start' });
  });

  it('leaves a split of another clock alone once the Start is refused', () => {
    const decision = decide([refusedStart(), splitItem('other-epoch')]);

    expect(startedIds(decision)).toEqual(['split-1']);
    expect(blockedReasons(decision)['split-1']).toBeUndefined();
  });
});

describe('offline Start and assignments', () => {
  const LOCAL = 'local-attempt';
  const EVENT = 'event-1';

  function startItem(status: TimingQueueItem['status'] = 'PENDING'): TimingQueueItem {
    return queueItem('start-1', {
      attemptId: LOCAL,
      operation: 'START',
      deviceSequence: 1,
      createdAt: pressTime(1),
      eventId: EVENT,
      status,
      payload: {
        localAttemptId: LOCAL,
        localClockEpochId: 'local-epoch',
        officialStartedAt: pressTime(1),
      },
    });
  }

  function assignment(
    id: string,
    createdAt: string,
    chosenAttemptId?: string,
  ): TimingQueueItem {
    return queueItem(id, {
      attemptId: EVENT_SCOPE,
      operation: 'ANONYMOUS_ASSIGN',
      deviceSequence: 2,
      createdAt,
      eventId: EVENT,
      payload: {
        captureDeviceSequence: 5,
        request: {
          startNumber: 10,
          workstationInstanceId: WORKSTATION,
          deviceSequence: 2,
          ...(chosenAttemptId === undefined ? {} : { chosenAttemptId }),
        },
      },
    });
  }

  it('holds a later assignment behind the local Start', () => {
    const decision = decide([
      startItem(),
      assignment('assign-after', pressTime(3)),
    ]);

    expect(startedIds(decision)).toEqual(['start-1']);
    expect(blockedReasons(decision)).toMatchObject({
      'assign-after': 'start',
    });
  });

  it('holds an assignment that names the local attempt even before the Start row', () => {
    const decision = decide([
      startItem(),
      assignment('assign-chosen', pressTime(2), LOCAL),
    ]);

    expect(blockedReasons(decision)).toMatchObject({
      'assign-chosen': 'start',
    });
  });

  it('lets an assignment captured before the Start go ahead', () => {
    const decision = decide([
      startItem(),
      assignment('assign-before', pressTime(0)),
    ]);

    expect(startedIds(decision)).toEqual(['start-1', 'assign-before']);
  });
});
