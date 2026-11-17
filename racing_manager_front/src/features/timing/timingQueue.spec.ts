import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  newTimingMutationKey,
  openTimingQueue,
  type TimingQueueItem,
} from './timingQueue';

/**
 * jsdom has no IndexedDB, so every scenario here exercises the memory fallback
 * that AD-3 requires to keep the capture surface working without storage.
 */
function queueItem(
  id: string,
  attemptId: string,
  overrides: Partial<TimingQueueItem> = {},
): TimingQueueItem {
  return {
    id,
    attemptId,
    workstationInstanceId: 'ws-1',
    deviceSequence: 1,
    operation: 'PASS',
    payload: { kind: 'NUMBER', startNumber: 17 },
    status: 'PENDING',
    createdAt: '2026-11-13T09:00:00.000Z',
    ...overrides,
  };
}

describe('timingQueue sequences', () => {
  it('falls back to memory without IndexedDB and starts at 1 per pair', async () => {
    expect(typeof indexedDB).toBe('undefined');
    const queue = await openTimingQueue();

    await expect(queue.nextSequence('attempt-seq-a', 'ws-1')).resolves.toBe(1);
    await expect(queue.nextSequence('attempt-seq-a', 'ws-1')).resolves.toBe(2);
    await expect(queue.nextSequence('attempt-seq-a', 'ws-2')).resolves.toBe(1);
    await expect(queue.nextSequence('attempt-seq-b', 'ws-1')).resolves.toBe(1);
  });

  it('keeps the sequence across a second open, like a reload', async () => {
    const first = await openTimingQueue();
    const issued = await first.nextSequence('attempt-seq-reload', 'ws-1');

    const second = await openTimingQueue();

    await expect(
      second.nextSequence('attempt-seq-reload', 'ws-1'),
    ).resolves.toBe(issued + 1);
  });

  it('reports zero before any sequence and the issued cursor after', async () => {
    const queue = await openTimingQueue();
    const attemptId = 'attempt-seq-last';

    await expect(queue.lastSequence(attemptId, 'ws-1')).resolves.toBe(0);

    await queue.nextSequence(attemptId, 'ws-1');
    await queue.nextSequence(attemptId, 'ws-1');

    await expect(queue.lastSequence(attemptId, 'ws-1')).resolves.toBe(2);
    await expect(queue.lastSequence(attemptId, 'ws-2')).resolves.toBe(0);
    await expect(queue.lastSequence('attempt-seq-other', 'ws-1')).resolves.toBe(
      0,
    );
  });

  it('keeps the cursor when the outbox is cleared', async () => {
    const queue = await openTimingQueue();
    const attemptId = 'attempt-seq-clear';
    await queue.enqueue(queueItem('key-seq-clear', attemptId));
    await queue.nextSequence(attemptId, 'ws-1');

    await queue.clear();

    await expect(queue.lastSequence(attemptId, 'ws-1')).resolves.toBe(1);
    await expect(queue.nextSequence(attemptId, 'ws-1')).resolves.toBe(2);
    await expect(queue.list()).resolves.toEqual([]);
  });
});

describe('timingQueue outbox', () => {
  it('stores before send, lists in capture order and counts only unsynced items', async () => {
    const queue = await openTimingQueue();
    const attemptId = 'attempt-outbox';
    await queue.enqueue(
      queueItem('key-a', attemptId, {
        deviceSequence: 1,
        createdAt: '2026-11-13T09:00:00.100Z',
      }),
    );
    await queue.enqueue(
      queueItem('key-b', attemptId, {
        deviceSequence: 2,
        operation: 'BIND',
        createdAt: '2026-11-13T09:00:00.200Z',
      }),
    );

    const items = await queue.list(attemptId);

    expect(items.map((item) => item.id)).toEqual(['key-a', 'key-b']);
    expect(items.map((item) => item.status)).toEqual(['PENDING', 'PENDING']);
    await expect(queue.pendingCount(attemptId)).resolves.toBe(2);
    await expect(queue.pendingCount('attempt-other')).resolves.toBe(0);
  });

  it('moves an item to SENT, APPLIED and out of the queue', async () => {
    const queue = await openTimingQueue();
    const attemptId = 'attempt-transitions';
    await queue.enqueue(queueItem('key-sent', attemptId, { deviceSequence: 1 }));
    await queue.enqueue(queueItem('key-applied', attemptId, { deviceSequence: 2 }));

    await queue.mark('key-sent', 'SENT');
    await queue.mark('key-applied', 'APPLIED');

    await expect(queue.pendingCount(attemptId)).resolves.toBe(1);
    await queue.remove('key-sent');
    const remaining = await queue.list(attemptId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ id: 'key-applied', status: 'APPLIED' });
  });

  it('keeps a rejected item and its error until it is removed', async () => {
    const queue = await openTimingQueue();
    const attemptId = 'attempt-rejected';
    await queue.enqueue(queueItem('key-rejected', attemptId));

    await queue.mark(
      'key-rejected',
      'REJECTED',
      'Последний круг уже записан',
    );

    const [rejected] = await queue.list(attemptId);
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.error).toBe('Последний круг уже записан');
    await expect(queue.pendingCount(attemptId)).resolves.toBe(0);

    await queue.mark('key-rejected', 'PENDING');
    const [retried] = await queue.list(attemptId);
    expect(retried.error).toBeUndefined();

    await queue.remove('key-rejected');
    await expect(queue.list(attemptId)).resolves.toEqual([]);
  });

  it('persists an anonymous capture and an anonymous assignment in capture order', async () => {
    const queue = await openTimingQueue();
    const attemptId = 'attempt-anonymous-ops';
    const captureSequence = await queue.nextSequence(attemptId, 'ws-1');
    await queue.enqueue(
      queueItem('key-anonymous-capture', attemptId, {
        operation: 'PASS',
        deviceSequence: captureSequence,
        payload: {
          attemptId,
          kind: 'ANONYMOUS_SPLIT',
          clockEpochId: 'epoch-anonymous',
          workstationInstanceId: 'ws-1',
          deviceSequence: captureSequence,
        },
        createdAt: '2026-11-13T09:00:00.100Z',
      }),
    );
    const assignSequence = await queue.nextSequence(attemptId, 'ws-1');
    await queue.enqueue(
      queueItem('key-anonymous-assign', attemptId, {
        operation: 'ANONYMOUS_ASSIGN',
        deviceSequence: assignSequence,
        payload: {
          splitId: 'split-1',
          request: {
            startNumber: 17,
            workstationInstanceId: 'ws-1',
            deviceSequence: assignSequence,
          },
        },
        createdAt: '2026-11-13T09:00:00.200Z',
      }),
    );

    const items = await queue.list(attemptId);

    expect(items.map((item) => [item.operation, item.deviceSequence])).toEqual([
      ['PASS', 1],
      ['ANONYMOUS_ASSIGN', 2],
    ]);
    await expect(queue.pendingCount(attemptId)).resolves.toBe(2);
    await expect(queue.lastSequence(attemptId, 'ws-1')).resolves.toBe(2);

    await queue.mark('key-anonymous-assign', 'REJECTED', 'Отсечка уже назначена');
    const [, rejected] = await queue.list(attemptId);
    expect(rejected).toMatchObject({
      operation: 'ANONYMOUS_ASSIGN',
      status: 'REJECTED',
      error: 'Отсечка уже назначена',
    });
    await expect(queue.lastSequence(attemptId, 'ws-1')).resolves.toBe(2);
  });

  it('empties the queue with clear', async () => {
    const queue = await openTimingQueue();
    await queue.enqueue(queueItem('key-clear-a', 'attempt-clear-a'));
    await queue.enqueue(queueItem('key-clear-b', 'attempt-clear-b'));

    await queue.clear();

    await expect(queue.list()).resolves.toEqual([]);
    await expect(queue.pendingCount()).resolves.toBe(0);
  });

  it('refuses to mark an item that is not queued', async () => {
    const queue = await openTimingQueue();

    await expect(queue.mark('key-missing', 'SENT')).rejects.toThrow(
      /is not queued/,
    );
  });

  it('issues distinct idempotency keys', () => {
    const first = newTimingMutationKey();
    const second = newTimingMutationKey();

    expect(first.length).toBeGreaterThan(0);
    expect(first).not.toBe(second);
  });
});

/**
 * The smallest IndexedDB surface `openTimingQueue` touches on open: one
 * `open()` whose success callback carries a database handle. The queue only
 * reports durability here; no store is read or written.
 */
class FakeIndexedDbOpenRequest {
  public result: unknown = {};
  public onsuccess: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public onblocked: (() => void) | null = null;
  public onupgradeneeded: (() => void) | null = null;
}

describe('timingQueue durability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('reports a volatile queue when IndexedDB is unavailable', async () => {
    expect(typeof indexedDB).toBe('undefined');

    const queue = await openTimingQueue();

    expect(queue.isDurable).toBe(false);
  });

  it('reports a durable queue when the resolved storage is IndexedDB', async () => {
    const request = new FakeIndexedDbOpenRequest();
    vi.stubGlobal('indexedDB', {
      open: () => {
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    });
    vi.resetModules();

    const { openTimingQueue: openWithIndexedDb } = await import(
      './timingQueue'
    );
    const queue = await openWithIndexedDb();

    expect(queue.isDurable).toBe(true);
  });
});
