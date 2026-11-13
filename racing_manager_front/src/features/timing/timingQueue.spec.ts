import { describe, expect, it } from 'vitest';
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
