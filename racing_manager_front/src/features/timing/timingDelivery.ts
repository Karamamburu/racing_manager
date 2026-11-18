/**
 * Which recorded captures may leave the device right now, and why the rest wait.
 *
 * MANUAL-TIMING-5 delivers one capture per request (FR-40) and allows several
 * of those deliveries to be open at once (FR-35). The pump lives in
 * `useTimingCapture` (AD-1); this module owns the rules it must not restate:
 *
 * - the concurrent-delivery bound `MAX_CONCURRENT_CAPTURE_DELIVERIES` (AD-6);
 * - the per-record retry backoff `CAPTURE_RETRY_BACKOFF_MS` (AD-5);
 * - the same-participant gate keyed by what the client knows at the press —
 *   the number, the enrollment, or the unbound finish (AD-3, FR-14);
 * - the pair order of a withdrawal behind its capture and of a split
 *   assignment behind its split (FR-42).
 *
 * Nothing here starts, ends or retries a request by itself: the decision is a
 * plan over one outbox snapshot, and the caller performs it. The module is pure
 * and framework-free. It never fetches, never reads a clock (the caller injects
 * `now`), never reads storage, never reorders, never drops and never mutates its
 * input.
 *
 * A blocked entry is never a refusal. It keeps its recorded press instant, its
 * routed target and its status, and it is offered again on the next decision.
 */

import type { TimingQueueItem } from './timingQueue';

/**
 * How many capture deliveries one workstation runs at once (AD-6). The value is
 * a little above the browser's six-connections-per-host limit on purpose: a
 * 20-press burst then needs two waves instead of four, and the requests beyond
 * the socket pool are still only a handful, so the page's sending figure stays
 * close to the truth.
 */
export const MAX_CONCURRENT_CAPTURE_DELIVERIES = 8;

/**
 * How long a capture that ended without a final answer waits before it is
 * eligible again (AD-5). A transport failure must not become a request loop.
 * The wait for an answer itself stays `API_REQUEST_TIMEOUT_MS`; this is the
 * pause after it expired.
 */
export const CAPTURE_RETRY_BACKOFF_MS = 1_000;

/** Why one recorded capture is not started by this decision. */
export type TimingDeliveryBlockReason =
  /** The browser reports no connection; nothing starts and nothing is lost. */
  | 'offline'
  /** The bound is reached; the capture waits as recorded and is offered later. */
  | 'bound'
  /** Its own last delivery ended without an answer and the backoff has not elapsed. */
  | 'backoff'
  /** An earlier capture of the same participant has no final answer yet. */
  | 'participant'
  /** Its pair predecessor is still waiting or still sending. */
  | 'pair'
  /** Its offline Start, or a local attempt it names, has no final answer yet. */
  | 'start';

/** One capture this decision does not start, with the rule that holds it. */
export interface TimingDeliveryBlocked {
  item: TimingQueueItem;
  reason: TimingDeliveryBlockReason;
}

/**
 * The plan of one pump pass: the captures to start now, in capture order, and
 * the captures to leave alone until a later pass.
 */
export interface TimingDeliveryDecision {
  start: readonly TimingQueueItem[];
  blocked: readonly TimingDeliveryBlocked[];
}

/** The capture kinds the client stores in a `PASS` payload. */
type TimingStoredCaptureKind = 'NUMBER' | 'TILE' | 'PENDING_FINISH' | 'ANONYMOUS_SPLIT';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function readString(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(
  source: Record<string, unknown>,
  key: string,
): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The stored payload as a record, or an empty one the readers all miss on. */
function payloadOf(item: TimingQueueItem): Record<string, unknown> {
  return asRecord(item.payload) ?? {};
}

/** Reads the `kind` discriminant of a `PASS` payload, or null when absent. */
function readCaptureKind(
  source: Record<string, unknown>,
): TimingStoredCaptureKind | null {
  switch (source.kind) {
    case 'NUMBER':
      return 'NUMBER';
    case 'TILE':
      return 'TILE';
    case 'PENDING_FINISH':
      return 'PENDING_FINISH';
    case 'ANONYMOUS_SPLIT':
      return 'ANONYMOUS_SPLIT';
    default:
      return null;
  }
}

/** Whether the capture still needs the server: it is neither applied nor refused. */
function isCandidate(item: TimingQueueItem): boolean {
  return item.status === 'PENDING' || item.status === 'SENT';
}

/**
 * The ordering key of one capture inside the participant gate (AD-3), or null
 * when the capture is not gated by a participant.
 *
 * The key names only what the client already knows at the press, because that
 * is all a queued capture carries: the number for a `NUMBER` press, the
 * enrollment for a `TILE` press, and the unbound finish for a `PENDING_FINISH`
 * capture or a `BIND`. An anonymous split, a withdrawal and a split assignment
 * carry no participant and are gated by pair order alone.
 *
 * A payload missing the field its kind requires yields null rather than a
 * placeholder key, so a malformed entry never blocks a real participant.
 */
export function timingDeliveryKey(item: TimingQueueItem): string | null {
  const payload = payloadOf(item);
  if (item.operation === 'BIND') {
    const pendingFinishId = readString(payload, 'pendingFinishId');
    return pendingFinishId === null ? null : `finish:${pendingFinishId}`;
  }
  if (item.operation !== 'PASS') {
    return null;
  }
  switch (readCaptureKind(payload)) {
    case 'NUMBER': {
      const startNumber = readNumber(payload, 'startNumber');
      return startNumber === null ? null : `number:${startNumber}`;
    }
    case 'TILE': {
      const enrollmentId = readString(payload, 'enrollmentId');
      return enrollmentId === null ? null : `enrollment:${enrollmentId}`;
    }
    case 'PENDING_FINISH': {
      const pendingFinishId = readString(payload, 'pendingFinishId');
      return pendingFinishId === null ? null : `finish:${pendingFinishId}`;
    }
    default:
      return null;
  }
}

/**
 * Whether the withdrawal's own capture is still waiting or still sending: the
 * capture of `deviceSequence - 1` in the same attempt scope (FR-06, FR-42). A
 * confirmed or refused capture is answered and no longer holds the withdrawal.
 */
function hasUndoPredecessor(
  item: TimingQueueItem,
  items: readonly TimingQueueItem[],
): boolean {
  if (item.operation !== 'UNDO') {
    return false;
  }
  const withdrawnSequence = item.deviceSequence - 1;
  return items.some(
    (other) =>
      other.id !== item.id &&
      other.attemptId === item.attemptId &&
      other.deviceSequence === withdrawnSequence &&
      isCandidate(other),
  );
}

/**
 * Whether an anonymous split of the same scope is still waiting or still
 * sending. The assignment binds a split the server may not know yet, so it
 * follows that split (FR-42); an applied or refused split holds nothing.
 */
function hasSplitPredecessor(
  item: TimingQueueItem,
  items: readonly TimingQueueItem[],
): boolean {
  if (item.operation !== 'ANONYMOUS_ASSIGN') {
    return false;
  }
  return items.some(
    (other) =>
      other.id !== item.id &&
      other.attemptId === item.attemptId &&
      other.operation === 'PASS' &&
      isCandidate(other) &&
      readCaptureKind(payloadOf(other)) === 'ANONYMOUS_SPLIT',
  );
}

/**
 * Whether the item belongs to a local attempt whose Start the server refused
 * (AD-10). Such an attempt does not exist on the server and its clock epoch
 * never will: a pass or undo of it is invalid, and an event-scoped split whose
 * clock it anchored cannot be delivered. The split stays recorded so the
 * device can still show and delete it.
 */
function hasRefusedStartPredecessor(
  item: TimingQueueItem,
  items: readonly TimingQueueItem[],
): boolean {
  if (item.operation === 'START') return false;
  const refused = items.filter(
    (other) => other.operation === 'START' && other.status === 'REJECTED',
  );
  if (refused.length === 0) return false;
  if (refused.some((start) => start.attemptId === item.attemptId)) {
    return true;
  }
  if (item.operation !== 'PASS') return false;
  const payload = payloadOf(item);
  if (readCaptureKind(payload) !== 'ANONYMOUS_SPLIT') return false;
  const epochId = readString(payload, 'clockEpochId');
  return refused.some(
    (start) =>
      start.attemptId === item.localAnchorAttemptId ||
      (epochId !== null &&
        readString(payloadOf(start), 'localClockEpochId') === epochId),
  );
}

/**
 * Whether the item depends on a Start that the server has not answered (AD-7).
 *
 * - A pass or quick undo of a local attempt waits for its `START` item.
 * - An event-scoped anonymous split waits for every local Start created at or
 *   before it, so the server's candidate freeze sees the created attempts; a
 *   split anchored to the local attempt waits for that Start even when the
 *   event fields are absent.
 *
 * An applied Start holds nothing: the mapping has already rewritten its
 * dependents. A refused Start holds its dependents for deletion, never for
 * delivery (AD-10).
 */
function hasStartPredecessor(
  item: TimingQueueItem,
  items: readonly TimingQueueItem[],
): boolean {
  if (item.operation === 'START') return false;
  if (hasRefusedStartPredecessor(item, items)) return true;
  const starts = items.filter(
    (other) =>
      other.id !== item.id &&
      other.operation === 'START' &&
      isCandidate(other),
  );
  if (starts.length === 0) return false;
  if (
    item.operation === 'PASS' ||
    item.operation === 'UNDO' ||
    item.operation === 'BIND'
  ) {
    if (starts.some((start) => start.attemptId === item.attemptId)) {
      return true;
    }
  }
  if (item.operation !== 'PASS') return false;
  if (readCaptureKind(payloadOf(item)) !== 'ANONYMOUS_SPLIT') {
    return item.localAnchorAttemptId !== undefined &&
      item.localAnchorAttemptId !== null &&
      starts.some((start) => start.attemptId === item.localAnchorAttemptId);
  }
  if (
    item.localAnchorAttemptId !== undefined &&
    item.localAnchorAttemptId !== null &&
    starts.some((start) => start.attemptId === item.localAnchorAttemptId)
  ) {
    return true;
  }
  if (item.eventId === undefined) return false;
  return starts.some(
    (start) =>
      start.eventId === item.eventId &&
      start.createdAt <= item.createdAt,
  );
}

/**
 * Plans one pump pass over the whole outbox.
 *
 * `items` is the outbox in capture order, as `TimingQueue.list()` returns it.
 * `sendingIds` are the captures with an outstanding delivery, `retryNotBefore`
 * maps a capture id to the moment its own last unanswered delivery may be
 * retried, and `now` is the caller's clock. Offline stops every start without
 * touching the queue (AD-5).
 *
 * Rules, applied to the candidates in capture order:
 *
 * 1. A candidate is `PENDING` or `SENT`. An outstanding capture is neither
 *    started nor reported: one record, one delivery.
 * 2. Offline blocks every waiting candidate, and no capture starts.
 * 3. The bound is `MAX_CONCURRENT_CAPTURE_DELIVERIES` minus the outstanding
 *    captures; a capture that does not fit is `bound`, never dropped.
 * 4. A capture whose retry is not due yet is `backoff`; equal to `now` is due.
 * 5. A capture with a key does not start while an earlier candidate in capture
 *    order carries the same key, whether that candidate is sending, waiting or
 *    itself held by another rule. A capture started by this decision is such a
 *    predecessor for every later capture of the same key.
 * 6. A withdrawal waits for its unsent capture and a split assignment waits for
 *    its unsent split.
 * 7. Everything else starts, in capture order, until the bound is reached.
 *
 * The decision is order-preserving and side-effect-free: `start` follows
 * capture order, `blocked` follows capture order, and no input field is
 * written.
 */
export function decideDeliveries(input: {
  /** The whole outbox, in capture order (as `TimingQueue.list()` returns it). */
  items: readonly TimingQueueItem[];
  /** Ids with an outstanding delivery right now. */
  sendingIds: ReadonlySet<string>;
  /** id -> ms epoch when its last delivery ended without a final answer. */
  retryNotBefore: ReadonlyMap<string, number>;
  now: number;
  online: boolean;
}): TimingDeliveryDecision {
  const start: TimingQueueItem[] = [];
  const blocked: TimingDeliveryBlocked[] = [];
  const candidates = input.items.filter(isCandidate);

  if (!input.online) {
    for (const item of candidates) {
      if (!input.sendingIds.has(item.id)) {
        blocked.push({ item, reason: 'offline' });
      }
    }
    return { start, blocked };
  }

  const capacity = MAX_CONCURRENT_CAPTURE_DELIVERIES - input.sendingIds.size;
  /** Keys of the candidates met so far, sending ones included (rule 5). */
  const earlierKeys = new Set<string>();

  for (const item of candidates) {
    const key = timingDeliveryKey(item);

    if (input.sendingIds.has(item.id)) {
      if (key !== null) {
        earlierKeys.add(key);
      }
      continue;
    }

    if (start.length >= capacity) {
      blocked.push({ item, reason: 'bound' });
    } else if ((input.retryNotBefore.get(item.id) ?? 0) > input.now) {
      blocked.push({ item, reason: 'backoff' });
    } else if (key !== null && earlierKeys.has(key)) {
      blocked.push({ item, reason: 'participant' });
    } else if (
      hasUndoPredecessor(item, input.items) ||
      hasSplitPredecessor(item, input.items)
    ) {
      blocked.push({ item, reason: 'pair' });
    } else if (hasStartPredecessor(item, input.items)) {
      blocked.push({ item, reason: 'start' });
    } else {
      start.push(item);
    }

    if (key !== null) {
      earlierKeys.add(key);
    }
  }

  return { start, blocked };
}
