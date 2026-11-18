import type {
  CaptureTimingPassRequest,
  QuickUndoTimingPassRequest,
} from './types';
import type {
  TimingAnonymousAssignPayload,
  TimingQueueItem,
} from './timingQueue';
import type { StartOfflineTimingAttemptRequest } from './types';

/**
 * The persisted local→server mapping of one offline Start (AD-5, AD-6).
 *
 * A local attempt lives in the outbox under a device identity: the Start item,
 * the passes and quick undos of the attempt, and event-scoped splits whose
 * clock was anchored to it. When the Start is applied, this pure function
 * receives the server attempt and epoch and returns the dependent items
 * rewritten, without changing any press instant, elapsed value, target or
 * capture order:
 *
 * - the Start item keeps the local identities and gains the server attempt and
 *   epoch, so a reload can finish a partial mapping;
 * - a pass or quick undo of the local attempt moves to the server attempt, gets
 *   the server epoch and is numbered 1..n through the caller's allocator (the
 *   server attempt cursor), so a later online capture never reuses a number;
 * - a quick undo's payload names its own new sequence, which is above the last
 *   mapped pass; the accepted server rule withdraws the newest pass below it;
 * - an event-scoped split whose clock epoch was the local one gets the server
 *   epoch and, when its anchor was the local attempt, the server anchor;
 * - a queued split assignment whose chosen attempt was the local one names the
 *   server attempt; its split capture sequence is already the event sequence
 *   and never changes.
 *
 * The function is pure and framework-free. `nextSequence` is the caller's
 * allocator for the server attempt; it is called once per mapped capture in
 * press order. A Start item that already carries the same server attempt is a
 * completed mapping: the function allocates nothing and returns no changes.
 */

export interface TimingLocalMappingInput {
  /** The outbox snapshot; the Start item may also be present in it. */
  items: readonly TimingQueueItem[];
  startItem: TimingQueueItem;
  serverAttemptId: string;
  serverClockEpochId: string;
  /**
   * Allocates the next capture sequence of the server attempt. The caller
   * supplies the accepted queue cursor so the cursor and the rewritten
   * sequences cannot disagree.
   */
  nextSequence: () => number;
}

export interface TimingLocalMappingResult {
  /** The Start item with its server attempt and epoch. */
  startItem: TimingQueueItem;
  /** Only the items whose attempt/epoch/sequence fields changed. */
  changed: TimingQueueItem[];
  /** The highest sequence allocated for the server attempt, or the existing one. */
  lastIssuedSequence: number;
}

function compareItems(first: TimingQueueItem, second: TimingQueueItem): number {
  if (first.createdAt !== second.createdAt) {
    return first.createdAt < second.createdAt ? -1 : 1;
  }
  return first.deviceSequence - second.deviceSequence;
}

function mappedLastSequence(
  items: readonly TimingQueueItem[],
  serverAttemptId: string,
): number {
  let last = 0;
  for (const item of items) {
    if (item.attemptId === serverAttemptId && item.deviceSequence > last) {
      last = item.deviceSequence;
    }
  }
  return last;
}

export function mapLocalAttempt(
  input: TimingLocalMappingInput,
): TimingLocalMappingResult {
  const { startItem, serverAttemptId, serverClockEpochId } = input;
  const startPayload = startItem.payload as StartOfflineTimingAttemptRequest;
  const localAttemptId = startPayload.localAttemptId;
  const localClockEpochId = startPayload.localClockEpochId;

  const mappedStart: TimingQueueItem = {
    ...startItem,
    serverAttemptId,
    serverClockEpochId,
  };

  if (startItem.serverAttemptId === serverAttemptId) {
    return {
      startItem: mappedStart,
      changed: [],
      lastIssuedSequence: mappedLastSequence(input.items, serverAttemptId),
    };
  }

  const changed: TimingQueueItem[] = [];
  let lastIssuedSequence = 0;

  for (const item of [...input.items]
    .filter((candidate) => candidate.id !== startItem.id)
    .sort(compareItems)) {
    if (
      item.operation === 'PASS' &&
      item.attemptId === localAttemptId &&
      item.serverAttemptId !== serverAttemptId
    ) {
      const payload = item.payload as CaptureTimingPassRequest;
      const sequence = input.nextSequence();
      lastIssuedSequence = Math.max(lastIssuedSequence, sequence);
      changed.push({
        ...item,
        attemptId: serverAttemptId,
        deviceSequence: sequence,
        serverAttemptId,
        serverClockEpochId,
        payload: {
          ...payload,
          attemptId: serverAttemptId,
          clockEpochId: serverClockEpochId,
          deviceSequence: sequence,
        },
      });
      continue;
    }

    if (
      item.operation === 'UNDO' &&
      item.attemptId === localAttemptId &&
      item.serverAttemptId !== serverAttemptId
    ) {
      const payload = item.payload as QuickUndoTimingPassRequest;
      const sequence = input.nextSequence();
      lastIssuedSequence = Math.max(lastIssuedSequence, sequence);
      changed.push({
        ...item,
        attemptId: serverAttemptId,
        deviceSequence: sequence,
        serverAttemptId,
        serverClockEpochId,
        payload: {
          ...payload,
          deviceSequence: sequence,
        },
      });
      continue;
    }

    if (item.operation === 'ANONYMOUS_ASSIGN') {
      const payload = item.payload as TimingAnonymousAssignPayload;
      if (payload.request.chosenAttemptId === localAttemptId) {
        changed.push({
          ...item,
          payload: {
            ...payload,
            request: {
              ...payload.request,
              chosenAttemptId: serverAttemptId,
            },
          },
        });
      }
      continue;
    }

    if (item.operation === 'PASS') {
      const payload = item.payload as CaptureTimingPassRequest;
      const epochChanged =
        payload.kind === 'ANONYMOUS_SPLIT' &&
        payload.clockEpochId === localClockEpochId;
      const anchorChanged = item.localAnchorAttemptId === localAttemptId;
      if (epochChanged || anchorChanged) {
        changed.push({
          ...item,
          ...(anchorChanged
            ? { localAnchorAttemptId: serverAttemptId }
            : {}),
          ...(epochChanged
            ? {
                payload: {
                  ...payload,
                  clockEpochId: serverClockEpochId,
                },
              }
            : {}),
        });
      }
    }
  }

  changed.push(mappedStart);
  return { startItem: mappedStart, changed, lastIssuedSequence };
}
