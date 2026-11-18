import { useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CAPTURE_RETRY_BACKOFF_MS,
  decideDeliveries,
} from './timingDelivery';
import {
  newTimingMutationKey,
  openTimingQueue,
  type TimingAnonymousAssignPayload,
  type TimingLocalRosterRow,
  type TimingMutationOperation,
  type TimingQueue,
  type TimingQueueItem,
} from './timingQueue';
import { deriveLocalAttempts } from './timingLocalAttempt';
import { deriveLocalSplits, type TimingLocalSplitsResult } from './timingLocalSplits';
import { mapLocalAttempt } from './timingLocalMapping';
import { deriveTimingOfflineView } from './timingOffline';
import { timingService } from './timingService';
import type {
  AssignAnonymousSplitRequest,
  BindPendingFinishRequest,
  CaptureTimingPassRequest,
  QuickUndoTimingPassRequest,
  StartOfflineTimingAttemptRequest,
  StartTimingAttemptResult,
  TimingCaptureOutcome,
  TimingCaptureOutcomeEvent,
  TimingCategoryBlockView,
  TimingLocalAttemptView,
  TimingParticipantTileView,
  TimingSurfaceView,
} from './types';

export { TIMING_CAPTURE_OUTCOME_STATUSES } from './types';
export type {
  TimingCaptureOutcome,
  TimingCaptureOutcomeEvent,
  TimingCaptureOutcomeStatus,
  TimingCaptureOutcomeTone,
  TimingRefusalNotice,
} from './types';

/**
 * The capture workflow of the event-wide timing surface.
 *
 * The page renders; this hook decides. It owns the client clock anchor (AD-2),
 * the write-before-send outbox (AD-3) and the query invalidation of every
 * mutation, so the components never compute an elapsed value, choose a
 * sequence or talk to the API themselves.
 *
 * Nothing here duplicates a server rule. `resolveCandidates` only repeats the
 * routing predicate for feedback — the API remains the source of truth — and a
 * refusal keeps the API message verbatim.
 */

/** The client monotonic anchor of one open clock epoch (AD-2). */
export interface TimingEpochAnchor {
  /** Server epoch the anchor belongs to; every pass names it. */
  epochId: string;
  /** Official elapsed milliseconds the epoch started at. */
  anchorElapsedMs: number;
  /** `performance.now()` read when the epoch response arrived. */
  anchorMonotonicMs: number;
}

/** One enrollment a typed start number resolved to (UI convenience only). */
export interface TimingCaptureCandidate {
  enrollmentId: string;
  attemptId: string;
  /** Name and number, so an ambiguity picker is readable. */
  label: string;
}

/** One number commit, with the press instant already captured. */
export interface TimingNumberCommit {
  startNumber: number;
  /** Set only when the referee picked one of several eligible enrollments. */
  enrollmentId?: string;
  /** Client wall clock of the press, ISO-8601, captured once. */
  capturedAt: string;
  /** `performance.now()` of the press, captured once. */
  monotonicMs: number;
}

/**
 * What the surface consumes from the hook.
 *
 * Local validation failures reject with the reason and keep the typed value; a
 * recorded press always resolves with a `TimingCaptureOutcome`, because a
 * request without an answer is `UNSENT`, not a lost capture (FR-16).
 */
export interface UseTimingCaptureResult {
  resolveCandidates: (startNumber: number) => TimingCaptureCandidate[];
  commitNumber: (input: TimingNumberCommit) => Promise<TimingCaptureOutcome>;
  commitTile: (
    participant: TimingParticipantTileView,
    attemptId: string,
  ) => Promise<TimingCaptureOutcome>;
  /** Queues one anonymous split of the attempt; it needs no number and no N. */
  captureAnonymous: () => Promise<TimingCaptureOutcome>;
  /** Binds one queued split to a start number of its own attempt. */
  assignAnonymousSplit: (
    splitId: string,
    startNumber: number,
    chosenAttemptId?: string,
  ) => Promise<TimingCaptureOutcome>;
  /** Retires one queued split with a reason; a referee or an administrator. */
  cancelAnonymousSplit: (splitId: string, reason: string) => Promise<void>;
  undoAnonymousSplit: (splitId: string, deviceSequence: number) => Promise<void>;
  bindPending: (
    pendingId: string,
    startNumber: number,
  ) => Promise<TimingCaptureOutcome>;
  quickUndo: (attemptId: string) => Promise<TimingCaptureOutcome>;
  /** Starts a category block or a heat block on its own route. */
  startAttempt: (block: TimingCategoryBlockView) => Promise<void>;
  complete: (attemptId: string) => Promise<void>;
  forceComplete: (attemptId: string, reason: string) => Promise<void>;
  cancelAttempt: (attemptId: string, reason: string) => Promise<void>;
  takeCapture: () => Promise<void>;
  transferCapture: (toWorkstationInstanceId: string) => Promise<void>;
  forceRelease: (reason: string) => Promise<void>;
  /**
   * Starts the delivery pump and resolves when the current unsent set is
   * settled or paused (offline, or waiting out a retry backoff).
   */
  flush: () => Promise<void>;
  /** The same pump start, offered to the referee as «Отправить сейчас» (FR-13). */
  sendNow: () => Promise<void>;
  /**
   * Every item of this device's outbox in capture order, raw and un-derived.
   * The page feeds them to `deriveTimingOfflineView` (FR-11, FR-12).
   */
  queueItems: TimingQueueItem[];
  /** The server surface merged with the device-local attempt(s) and splits. */
  mergedSurface?: TimingSurfaceView;
  /** The device-local attempts created by offline Starts, before the mapping. */
  localAttempts?: TimingLocalAttemptView[];
  /** The anonymous-split queue as the page should render it. */
  localSplits?: TimingLocalSplitsResult;
  /** Removes an unapplied local split and its dependent assignment. */
  deleteLocalSplit?: (localSplitId: string) => Promise<void>;
  /**
   * The outbox ids of capture-side entries whose request is still in flight.
   * The page keeps the send-queue card off while the only unsent rows are
   * these, so an ordinary online press does not flash an empty-looking block.
   */
  inFlightIds: ReadonlySet<string>;
  /** Reads the outbox again; the hook also does this after every write. */
  refreshQueue: () => Promise<void>;
  /**
   * Whether the outbox outlives a reload, as the storage itself reported it.
   * `true` until the first queue read, so an online surface is unchanged; a
   * resolved memory fallback turns it false (FR-30).
   */
  isDurable: boolean;
  /**
   * The connection as the page shows it: `navigator.onLine` plus the outcome of
   * the last send. A send that got no answer turns it false; an answered send
   * turns it true (AS-4).
   */
  isOnline: boolean;
  /** Queue items the server has not answered yet, across attempts. */
  pendingCount: number;
  isFlushing: boolean;
  /**
   * Every answer about a recorded capture, in arrival order. It contains the
   * answers of presses whose caller already resolved `ACCEPTED`, so the field
   * never loses a refusal it no longer awaits (AD-7).
   */
  captureOutcomes?: TimingCaptureOutcomeEvent[];
  /**
   * The unresolved captures of each attempt: outbox items still `PENDING` or
   * `SENT` plus the acceptances this device has taken but not yet recorded.
   * Closure reads this number (FR-27); the API gate stays authoritative.
   */
  unresolvedByAttempt?: Readonly<Record<string, number>>;
}

const FALLBACK_ERROR_MESSAGE = 'Не удалось выполнить запрос хронометража';
const EPOCH_FALLBACK_MESSAGE = 'Не удалось открыть отсчёт попытки';
const EVENT_REQUIRED_MESSAGE = 'Хронометраж недоступен: мероприятие не выбрано';
const CANDIDATE_MISSING_MESSAGE = 'Участник не найден среди идущих заездов';
const PENDING_MISSING_MESSAGE = 'Непривязанный финиш не найден на поверхности';
const SPLIT_MISSING_MESSAGE = 'Неприсвоенная отсечка не найдена в очереди';
const NO_RUNNING_ATTEMPT_MESSAGE =
  'Нет идущей попытки: неприсвоенную отсечку некуда записать';
const OFFLINE_HEAT_START_MESSAGE =
  'Старт заезда офлайн недоступен: начните заезд при наличии связи.';
const OFFLINE_START_UNAVAILABLE_MESSAGE =
  'Эту категорию нельзя начать офлайн: проверьте захват, состав и номера.';
const HEAT_INCOMPLETE_MESSAGE = 'Блок заезда не готов к старту';

/** The empty surface a derived view uses before the server read resolves. */
const EMPTY_SURFACE: TimingSurfaceView = {
  eventId: '',
  captureWorkstationInstanceId: null,
  categories: [],
  anonymousSplits: [],
};

/** The surface query key, shared with the page that owns the read. */
export function timingSurfaceQueryKey(eventId: string | undefined) {
  return ['timing-surface', eventId ?? ''] as const;
}

/**
 * The message of an API refusal. The rules live in the API, so the surface
 * shows the text it returned and never maps a status code to a local rule.
 */
export function describeTimingError(
  error: unknown,
  fallback: string = FALLBACK_ERROR_MESSAGE,
): string {
  if (error instanceof AxiosError) {
    const payload = error.response?.data as
      | { message?: string | string[] }
      | undefined;
    const text = payload?.message;
    if (typeof text === 'string' && text.trim()) return text;
    if (Array.isArray(text) && text.length > 0) return text.join(' ');
    return fallback;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

/** The wire code of a repeat that reached an open idempotency claim (AD-4). */
const IDEMPOTENCY_IN_PROGRESS_CODE = 'IDEMPOTENCY_IN_PROGRESS';

function responseBody(error: AxiosError): Record<string, unknown> | null {
  const data: unknown = error.response?.data;
  return typeof data === 'object' && data !== null
    ? (data as Record<string, unknown>)
    : null;
}

/**
 * Whether the server answered that the first request of this key is still
 * running. That is not a refusal: the capture may already be applied, so the
 * client keeps it recorded and asks again later (AD-4, E-10, F-04).
 */
function isIdempotencyInProgress(error: unknown): boolean {
  if (!(error instanceof AxiosError) || error.response?.status !== 409) {
    return false;
  }
  return responseBody(error)?.code === IDEMPOTENCY_IN_PROGRESS_CODE;
}

/**
 * A refusal the server signed: a 4xx it answered, so retrying the same
 * idempotency key would only replay the same answer. A request without an
 * answer, a 5xx without a capture-specific refusal and the coded in-progress
 * 409 all stay replayable instead (E-21, E-27, AD-4).
 */
function isDefinitiveRefusal(error: unknown): boolean {
  if (!(error instanceof AxiosError) || error.response === undefined) {
    return false;
  }
  const status = error.response.status;
  return status >= 400 && status < 500 && !isIdempotencyInProgress(error);
}

/** The answer's subject, read from the recorded payload and the surface (AD-7). */
function captureSubject(
  item: TimingQueueItem,
  numberForEnrollment: (enrollmentId: string) => number | null,
): string {
  const payload =
    typeof item.payload === 'object' && item.payload !== null
      ? (item.payload as Record<string, unknown>)
      : {};
  const number =
    typeof payload.startNumber === 'number' ? payload.startNumber : null;
  if (number !== null) return `№ ${number}`;
  const splitRequest =
    typeof payload.request === 'object' && payload.request !== null
      ? (payload.request as Record<string, unknown>)
      : null;
  if (typeof splitRequest?.startNumber === 'number') {
    return `№ ${splitRequest.startNumber}`;
  }
  if (typeof splitRequest?.enrollmentId === 'string') {
    const resolved = numberForEnrollment(splitRequest.enrollmentId);
    return resolved === null ? 'Участник' : `№ ${resolved}`;
  }
  if (item.operation === 'PASS' && payload.kind === 'ANONYMOUS_SPLIT') {
    return 'Отсечка без номера';
  }
  if (item.operation === 'PASS' && payload.kind === 'PENDING_FINISH') {
    return 'Непривязанный финиш';
  }
  if (item.operation === 'BIND') return 'Непривязанный финиш';
  if (item.operation === 'ANONYMOUS_ASSIGN') return 'Отсечка без номера';
  if (item.operation === 'UNDO') return 'Отмена последней отметки';
  if (item.operation === 'START') return 'Старт категории';
  const enrollmentId =
    typeof payload.enrollmentId === 'string' ? payload.enrollmentId : null;
  if (enrollmentId !== null) {
    const resolved = numberForEnrollment(enrollmentId);
    return resolved === null ? 'Участник' : `№ ${resolved}`;
  }
  return 'Отметка';
}

/** Whether an answer is the Start result the mapping needs. */
function isStartResult(value: unknown): value is StartTimingAttemptResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'attempt' in value &&
    'epoch' in value
  );
}

/**
 * Drops the refused-Start tombstones that no queued entry references any more
 * (AD-11). A tombstone keeps a local epoch's splits from being delivered; once
 * the last such split is deleted, the tombstone has nothing left to hold.
 */
async function removeUnreferencedStartTombstones(
  queue: TimingQueue,
): Promise<void> {
  const items = await queue.list();
  for (const tombstone of items) {
    if (tombstone.operation !== 'START' || tombstone.status !== 'REJECTED') {
      continue;
    }
    const payload = tombstone.payload as StartOfflineTimingAttemptRequest;
    const referenced = items.some((candidate) => {
      if (candidate.id === tombstone.id) return false;
      if (candidate.attemptId === payload.localAttemptId) return true;
      if (candidate.operation !== 'PASS') return false;
      const pass = candidate.payload as CaptureTimingPassRequest;
      return (
        pass.kind === 'ANONYMOUS_SPLIT' &&
        pass.clockEpochId === payload.localClockEpochId
      );
    });
    if (!referenced) await queue.remove(tombstone.id);
  }
}

function describeAttemptLabel(participant: TimingParticipantTileView): string {
  return `${participant.fullName} · № ${participant.startNumber} · ${participant.sectionId}`;
}

function queueItem(
  id: string,
  attemptId: string,
  workstationInstanceId: string,
  deviceSequence: number,
  operation: TimingMutationOperation,
  payload: unknown,
): TimingQueueItem {
  return {
    id,
    attemptId,
    workstationInstanceId,
    deviceSequence,
    operation,
    payload,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };
}

/** The sent or unsent items only, in capture order (AD-3). */
function isUnsynced(item: TimingQueueItem): boolean {
  return item.status === 'PENDING' || item.status === 'SENT';
}

/** The browser's idea of connectivity; a runtime without it starts online. */
function browserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/** The raw elapsed of one press, derived from the attempt's own anchor (AD-2). */
function elapsedFromAnchor(
  anchor: TimingEpochAnchor,
  monotonicMs: number,
): number {
  return Math.max(
    0,
    Math.round(
      anchor.anchorElapsedMs + (monotonicMs - anchor.anchorMonotonicMs),
    ),
  );
}

/**
 * A heat Start needs the identity the API validates. A block missing one is a
 * surface defect, not a product rule, so the press fails loudly instead of
 * sending a half-empty body the API would refuse with a validator message.
 */
function requireHeatField<T>(value: T | undefined): T {
  if (value === undefined) throw new Error(HEAT_INCOMPLETE_MESSAGE);
  return value;
}

/**
 * @param eventId The event of the surface; absent before the route resolves.
 * @param surface The latest surface read; `undefined` before it loads.
 * @param workstationInstanceId The instance id of this browser tab.
 * @param onError Receives every API message the surface must show.
 */
export function useTimingCapture(
  eventId: string | undefined,
  surface: TimingSurfaceView | undefined,
  workstationInstanceId: string,
  onError?: (message: string) => void,
  labelFor?: (attemptId: string) => string,
): UseTimingCaptureResult {
  const queryClient = useQueryClient();
  /** One anchor per running attempt of this workstation (AD-2). */
  const anchors = useRef<Map<string, TimingEpochAnchor>>(new Map());
  /** The open in flight per attempt, so a burst never opens two epochs. */
  const opening = useRef<Map<string, Promise<TimingEpochAnchor>>>(new Map());
  const mounted = useRef(true);
  const onErrorRef = useRef(onError);
  /** The raw outbox of this device; every offline view derives from it. */
  const [queueItems, setQueueItems] = useState<TimingQueueItem[]>([]);
  /**
   * The storage the outbox resolved. Online behavior is unchanged until the
   * first read, which reports the truth from the queue itself (FR-30).
   */
  const [isDurable, setIsDurable] = useState(true);
  const [inFlightIds, setInFlightIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [isFlushing, setIsFlushing] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(browserOnline);
  /** Answers in arrival order, independent of the press promise (AD-7). */
  const [captureOutcomes, setCaptureOutcomes] = useState<
    TimingCaptureOutcomeEvent[]
  >([]);
  /** Acceptances this device took but has not recorded in the outbox yet. */
  const [chainDepth, setChainDepth] = useState<Record<string, number>>({});
  /**
   * ONE acceptance chain: anchor check, `nextSequence` and `enqueue` of every
   * press run in press order, so `deviceSequence` never reorders (AD-2).
   */
  const acceptanceChain = useRef<Promise<void>>(Promise.resolve());
  /** Captures with an outstanding delivery; one record, one delivery (U-04). */
  const sendingIds = useRef<Set<string>>(new Set());
  /** Per capture, when its own last unanswered delivery may retry (AD-5). */
  const retryNotBefore = useRef<Map<string, number>>(new Map());
  /** The live delivery runs of the pump, so `flush` can drain them. */
  const deliveryRuns = useRef<Map<string, Promise<void>>>(new Map());
  const pumpLoop = useRef<Promise<void> | null>(null);
  const pumpAgain = useRef(false);
  const pumpRef = useRef<() => Promise<void>>(() => Promise.resolve());
  /** The browser's own connection flag; a lost answer does not clear it (AD-5). */
  const networkOnline = useRef<boolean>(browserOnline());
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Single-flight surface refresh with one trailing run (AD-8). */
  const invalidationLoop = useRef<Promise<void> | null>(null);
  const invalidationDirty = useRef(false);
  /** Device-local epochs of offline Starts; they never call the server. */
  const localAnchors = useRef<Map<string, TimingEpochAnchor>>(new Map());

  const offlineView = useMemo(
    () => deriveTimingOfflineView(queueItems, surface ?? EMPTY_SURFACE),
    [queueItems, surface],
  );
  const localView = useMemo(
    () =>
      deriveLocalAttempts({
        surface: surface ?? EMPTY_SURFACE,
        offline: offlineView,
        startItems: queueItems,
        nowMs: Date.now(),
      }),
    [queueItems, offlineView, surface],
  );
  const localSplitView = useMemo(
    () =>
      deriveLocalSplits({
        surface: localView.mergedSurface,
        offline: offlineView,
        localAttempts: localView.attempts,
        labelFor,
      }),
    [localView, offlineView, labelFor],
  );
  const surfaceView = useMemo(
    () => ({
      ...localView.mergedSurface,
      anonymousSplits: localSplitView.splits,
    }),
    [localView, localSplitView],
  );

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const report = useCallback((message: string) => {
    onErrorRef.current?.(message);
  }, []);

  const invalidate = useCallback(async () => {
    if (!eventId) return;
    await queryClient.invalidateQueries({
      queryKey: timingSurfaceQueryKey(eventId),
    });
  }, [eventId, queryClient]);

  /**
   * Reads the outbox into state. Every enqueue, mark and remove of this hook
   * calls it, so the page always derives its unsent figures from what is
   * actually stored (FR-11, FR-12), and the durability flag follows the same
   * read (FR-30).
   */
  const refreshQueue = useCallback(async () => {
    const queue = await openTimingQueue();
    const items = await queue.list();
    // A refusal is a one-time answer, not a queue row: drop every refused
    // entry (including leftovers from earlier sessions) before the page
    // derives its view. The refusal is reported once through the outcome feed;
    // the server audit keeps the refusal itself.
    //
    // A refused `START` is the one exception: it is the durable tombstone of an
    // invalid local epoch. A split captured under that epoch must never be
    // delivered, and the tombstone is what still says so after a reload (AD-11).
    const rejected = items.filter(
      (item) => item.status === 'REJECTED' && item.operation !== 'START',
    );
    for (const item of rejected) {
      await queue.remove(item.id);
    }
    const visible =
      rejected.length === 0
        ? items
        : items.filter((item) => item.status !== 'REJECTED');
    if (mounted.current) {
      setQueueItems(visible);
      setIsDurable(queue.isDurable);
    }
  }, []);

  /** Applies a send outcome to the connection the page shows (AS-4). */
  const setConnectivity = useCallback((online: boolean) => {
    if (!mounted.current) return;
    setIsOnline((current) => (current === online ? current : online));
  }, []);

  /** Mirrors the internal `sendingIds` to the page's `inFlightIds`. */
  const syncInFlight = useCallback(() => {
    if (!mounted.current) return;
    setInFlightIds(new Set(sendingIds.current));
  }, []);

  /**
   * One surface invalidation at a time; answers arriving meanwhile mark the
   * surface dirty and cause exactly one trailing refresh (AD-8). A failed read
   * is logged and does not stop later answers from refreshing.
   */
  const invalidateCoalesced = useCallback(() => {
    if (!eventId) return;
    if (invalidationLoop.current !== null) {
      invalidationDirty.current = true;
      return;
    }
    let run: Promise<void> | null = null;
    run = (async () => {
      do {
        invalidationDirty.current = false;
        await queryClient.invalidateQueries({
          queryKey: timingSurfaceQueryKey(eventId),
        });
      } while (invalidationDirty.current);
    })()
      .catch((error: unknown) => {
        console.warn('timing: the surface refresh failed', error);
      })
      .finally(() => {
        if (invalidationLoop.current === run) invalidationLoop.current = null;
      });
    invalidationLoop.current = run;
  }, [eventId, queryClient]);

  /** Tracks one acceptance until it is recorded in the outbox (AD-2). */
  const adjustChainDepth = useCallback((attemptId: string, delta: number) => {
    if (!mounted.current) return;
    setChainDepth((current) => {
      const next = { ...current };
      const value = (next[attemptId] ?? 0) + delta;
      if (value > 0) next[attemptId] = value;
      else delete next[attemptId];
      return next;
    });
  }, []);

  /**
   * Appends one press's acceptance work to the single chain. `release` is called
   * as soon as the record is in the outbox, so the unresolved count never adds
   * the same capture twice; a failure releases it through the completion path.
   */
  const appendAcceptance = useCallback(
    <T,>(
      attemptId: string,
      work: (release: () => void) => Promise<T>,
    ): Promise<T> => {
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        adjustChainDepth(attemptId, -1);
      };
      adjustChainDepth(attemptId, 1);
      const run = acceptanceChain.current.then(() => work(release));
      const completion = run.then(
        (value) => {
          release();
          return value;
        },
        (error: unknown) => {
          release();
          throw error;
        },
      );
      acceptanceChain.current = completion.then(
        () => undefined,
        () => undefined,
      );
      return completion;
    },
    [adjustChainDepth],
  );

  /**
   * Records one prepared capture and resolves `ACCEPTED` as soon as it is in the
   * outbox. No answer is awaited: the pump reports it through `captureOutcomes`.
   */
  const acceptCapture = useCallback(
    (
      attemptId: string,
      prepare: () => Promise<TimingQueueItem>,
    ): Promise<TimingCaptureOutcome> => {
      return appendAcceptance(attemptId, async (release) => {
        const item = await prepare();
        const queue = await openTimingQueue();
        await queue.enqueue(item);
        release();
        return item;
      }).then(async () => {
        await refreshQueue();
        void pumpRef.current();
        return { status: 'ACCEPTED' as const };
      });
    },
    [appendAcceptance, refreshQueue],
  );

  const requireEvent = useCallback((): string => {
    if (eventId) return eventId;
    report(EVENT_REQUIRED_MESSAGE);
    throw new Error(EVENT_REQUIRED_MESSAGE);
  }, [eventId, report]);

  /**
   * The anchor of one attempt, opening the epoch on first use. A failed open is
   * reported once and not remembered, so the next action retries (AD-2, E-26).
   */
  const openEpoch = useCallback(
    async (attemptId: string): Promise<TimingEpochAnchor> => {
      const local = localAnchors.current.get(attemptId);
      if (local) return local;
      const known = anchors.current.get(attemptId);
      if (known) return known;
      const inFlight = opening.current.get(attemptId);
      if (inFlight) return inFlight;

      const id = eventId;
      if (!id) {
        report(EVENT_REQUIRED_MESSAGE);
        throw new Error(EVENT_REQUIRED_MESSAGE);
      }

      const request = (async (): Promise<TimingEpochAnchor> => {
        try {
          const epoch = await timingService.openClockEpoch(
            id,
            attemptId,
            { workstationInstanceId },
            newTimingMutationKey(),
          );
          const anchor: TimingEpochAnchor = {
            epochId: epoch.epochId,
            anchorElapsedMs: epoch.officialElapsedAnchorMs,
            anchorMonotonicMs: performance.now(),
          };
          anchors.current.set(attemptId, anchor);
          return anchor;
        } catch (error) {
          report(describeTimingError(error, EPOCH_FALLBACK_MESSAGE));
          throw error;
        }
      })();

      opening.current.set(attemptId, request);
      try {
        return await request;
      } finally {
        opening.current.delete(attemptId);
      }
    },
    [eventId, workstationInstanceId, report],
  );

  /**
   * One pass of one attempt, routed to that attempt's own epoch. The press
   * instant was read before this call; only the acceptance work is chained.
   */
  const sendPass = useCallback(
    (input: {
      attemptId: string;
      kind: 'NUMBER' | 'TILE';
      startNumber: number;
      enrollmentId: string;
      capturedAt: string;
      monotonicMs: number;
    }): Promise<TimingCaptureOutcome> => {
      requireEvent();
      return acceptCapture(input.attemptId, async () => {
        const anchor = await openEpoch(input.attemptId);
        const queue = await openTimingQueue();
        const deviceSequence = await queue.nextSequence(
          input.attemptId,
          workstationInstanceId,
        );
        const key = newTimingMutationKey();
        const clientElapsedMs = elapsedFromAnchor(anchor, input.monotonicMs);
        // The API refuses an identity field the kind must leave absent, so a
        // number sends the number and a tile sends the enrollment, never both.
        const identity: Pick<
          CaptureTimingPassRequest,
          'startNumber' | 'enrollmentId'
        > =
          input.kind === 'TILE'
            ? { enrollmentId: input.enrollmentId }
            : { startNumber: input.startNumber };
        const payload: CaptureTimingPassRequest = {
          attemptId: input.attemptId,
          kind: input.kind,
          ...identity,
          clientCapturedAt: input.capturedAt,
          clientElapsedMs,
          clockEpochId: anchor.epochId,
          workstationInstanceId,
          deviceSequence,
        };

        return queueItem(
          key,
          input.attemptId,
          workstationInstanceId,
          deviceSequence,
          'PASS',
          payload,
        );
      });
    },
    [requireEvent, openEpoch, workstationInstanceId, acceptCapture],
  );

  /**
   * One anonymous split of one attempt. The press instant is read before the
   * epoch is awaited, so the elapsed value is the press and not the response.
   * The split carries no participant and no lap bound, so nothing here reads a
   * number, N or the roster (AD-17).
   */
  const captureAnonymous = useCallback((): Promise<TimingCaptureOutcome> => {
    const id = requireEvent();
    const anchorBlock = surfaceView?.categories.find(
      (block) => block.state === 'RUNNING' && block.attemptId !== null,
    );
    const anchorAttempt = anchorBlock?.attemptId ?? null;
    if (anchorAttempt === null) {
      report(NO_RUNNING_ATTEMPT_MESSAGE);
      throw new Error(NO_RUNNING_ATTEMPT_MESSAGE);
    }
    // A split of a local attempt keeps that attempt as its anchor, so its
    // official capture time and the mapping survive a reload (AD-8).
    const localAnchorAttemptId =
      anchorBlock?.local === true ? anchorAttempt : undefined;
    // The press instant is read before anything is awaited, then chained.
    const capturedAt = new Date().toISOString();
    const monotonicMs = performance.now();
    const eventScope = `event:${id}`;
    return acceptCapture(eventScope, async () => {
      const anchor = await openEpoch(anchorAttempt);
      const queue = await openTimingQueue();
      const deviceSequence = await queue.nextSequence(
        eventScope,
        workstationInstanceId,
      );
      const key = newTimingMutationKey();
      const payload: CaptureTimingPassRequest = {
        kind: 'ANONYMOUS_SPLIT',
        clientCapturedAt: capturedAt,
        clientElapsedMs: elapsedFromAnchor(anchor, monotonicMs),
        clockEpochId: anchor.epochId,
        workstationInstanceId,
        deviceSequence,
      };

      return {
        ...queueItem(
          key,
          eventScope,
          workstationInstanceId,
          deviceSequence,
          'PASS',
          payload,
        ),
        ...(localAnchorAttemptId === undefined ? {} : { localAnchorAttemptId }),
        eventId: id,
      };
    });
  }, [
    requireEvent,
    surfaceView,
    acceptCapture,
    openEpoch,
    workstationInstanceId,
    report,
  ]);

  /**
   * Every eligible running enrollment of one number, across categories. This
   * mirrors the server routing for the UI; the API still decides the pass.
   */
  const resolveCandidates = useCallback(
    (startNumber: number): TimingCaptureCandidate[] => {
      if (!surfaceView) return [];
      const candidates: TimingCaptureCandidate[] = [];
      for (const block of surfaceView.categories) {
        if (block.state !== 'RUNNING' || block.attemptId === null) continue;
        for (const participant of block.participants) {
          if (participant.startNumber !== startNumber) continue;
          if (participant.state === 'EXCLUDED') continue;
          if (participant.passCount >= participant.requiredLaps) continue;
          candidates.push({
            enrollmentId: participant.enrollmentId,
            attemptId: block.attemptId,
            label: describeAttemptLabel(participant),
          });
        }
      }
      return candidates;
    },
    [surfaceView],
  );

  const commitNumber = useCallback(
    async (input: TimingNumberCommit): Promise<TimingCaptureOutcome> => {
      const candidates = resolveCandidates(input.startNumber);
      const chosen =
        input.enrollmentId === undefined
          ? candidates.length === 1
            ? candidates[0]
            : undefined
          : candidates.find(
              (candidate) => candidate.enrollmentId === input.enrollmentId,
            );
      if (chosen === undefined) {
        report(CANDIDATE_MISSING_MESSAGE);
        throw new Error(CANDIDATE_MISSING_MESSAGE);
      }
      return sendPass({
        attemptId: chosen.attemptId,
        kind: input.enrollmentId === undefined ? 'NUMBER' : 'TILE',
        startNumber: input.startNumber,
        enrollmentId: chosen.enrollmentId,
        capturedAt: input.capturedAt,
        monotonicMs: input.monotonicMs,
      });
    },
    [resolveCandidates, report, sendPass],
  );

  const commitTile = useCallback(
    async (
      participant: TimingParticipantTileView,
      attemptId: string,
    ): Promise<TimingCaptureOutcome> => {
      // The click instant is read once, before anything else runs.
      const capturedAt = new Date().toISOString();
      const monotonicMs = performance.now();
      return sendPass({
        attemptId,
        kind: 'TILE',
        startNumber: participant.startNumber,
        enrollmentId: participant.enrollmentId,
        capturedAt,
        monotonicMs,
      });
    },
    [sendPass],
  );

  const bindPending = useCallback(
    (
      pendingId: string,
      startNumber: number,
    ): Promise<TimingCaptureOutcome> => {
      requireEvent();
      const pending = surfaceView?.categories
        .flatMap((block) => block.pendingFinishes)
        .find((finish) => finish.passId === pendingId);
      if (pending === undefined) {
        report(PENDING_MISSING_MESSAGE);
        throw new Error(PENDING_MISSING_MESSAGE);
      }
      return acceptCapture(pending.attemptId, async () => {
        const queue = await openTimingQueue();
        const deviceSequence = await queue.nextSequence(
          pending.attemptId,
          workstationInstanceId,
        );
        const key = newTimingMutationKey();
        const payload: BindPendingFinishRequest = {
          pendingFinishId: pendingId,
          startNumber,
          workstationInstanceId,
          deviceSequence,
        };
        return queueItem(
          key,
          pending.attemptId,
          workstationInstanceId,
          deviceSequence,
          'BIND',
          payload,
        );
      });
    },
    [requireEvent, surfaceView, workstationInstanceId, acceptCapture, report],
  );

  const quickUndo = useCallback(
    (attemptId: string): Promise<TimingCaptureOutcome> => {
      requireEvent();
      return acceptCapture(attemptId, async () => {
        const queue = await openTimingQueue();
        const deviceSequence = await queue.nextSequence(
          attemptId,
          workstationInstanceId,
        );
        const key = newTimingMutationKey();
        const payload: QuickUndoTimingPassRequest = {
          workstationInstanceId,
          deviceSequence,
        };
        return queueItem(
          key,
          attemptId,
          workstationInstanceId,
          deviceSequence,
          'UNDO',
          payload,
        );
      });
    },
    [requireEvent, workstationInstanceId, acceptCapture],
  );

  /**
   * Binds one queued split to a start number of its own attempt. The split names
   * the attempt, so the sequence it takes is the sequence of that attempt; an
   * accepted assignment leaves the queue with the surface refetch (AD-17).
   */
  const assignAnonymousSplit = useCallback(
    (
      splitId: string,
      startNumber: number,
      chosenAttemptId?: string,
    ): Promise<TimingCaptureOutcome> => {
      const id = requireEvent();
      const split = surfaceView?.anonymousSplits?.find(
        (entry) => entry.splitId === splitId,
      );
      if (split === undefined) {
        report(SPLIT_MISSING_MESSAGE);
        throw new Error(SPLIT_MISSING_MESSAGE);
      }
      const eventScope = `event:${id}`;
      return acceptCapture(eventScope, async () => {
        const queue = await openTimingQueue();
        const deviceSequence = await queue.nextSequence(
          eventScope,
          workstationInstanceId,
        );
        const key = newTimingMutationKey();
        const request: AssignAnonymousSplitRequest = {
          startNumber,
          workstationInstanceId,
          deviceSequence,
          ...(chosenAttemptId === undefined ? {} : { chosenAttemptId }),
        };
        const captureDeviceSequence = split.captureDeviceSequence;
        const payload: TimingAnonymousAssignPayload =
          split.localSplitId === undefined
            ? { splitId, request }
            : captureDeviceSequence === undefined ||
                captureDeviceSequence === null
              ? (() => {
                  throw new Error(SPLIT_MISSING_MESSAGE);
                })()
              : { captureDeviceSequence, request };
        return queueItem(
          key,
          eventScope,
          workstationInstanceId,
          deviceSequence,
          'ANONYMOUS_ASSIGN',
          payload,
        );
      });
    },
    [requireEvent, surfaceView, workstationInstanceId, acceptCapture, report],
  );

  /** One thin service wrapper: invalidate on success, report and rethrow on failure. */
  const runMutation = useCallback(
    async (work: () => Promise<unknown>): Promise<void> => {
      try {
        await work();
        await invalidate();
      } catch (error) {
        report(describeTimingError(error));
        throw error;
      }
    },
    [invalidate, report],
  );

  /** Withdraws the workstation's newest block-free capture. */
  const undoAnonymousSplit = useCallback(
    async (splitId: string, deviceSequence: number): Promise<void> => {
      const id = requireEvent();
      await runMutation(() =>
        timingService.undoAnonymousSplit(id, splitId, {
          workstationInstanceId,
          deviceSequence,
        }),
      );
    },
    [requireEvent, runMutation, workstationInstanceId],
  );

  /**
   * Retires one queued split with a reason. Cancellation is a record correction,
   * so it takes no capture sequence and writes no receipt of its own (E-08).
   */
  const cancelAnonymousSplit = useCallback(
    async (splitId: string, reason: string): Promise<void> => {
      const id = requireEvent();
      await runMutation(() =>
        timingService.cancelAnonymousSplit(id, splitId, { reason }),
      );
    },
    [requireEvent, runMutation],
  );

  /**
   * A heat block starts its own attempt on the heat route; a category block
   * keeps the category route. Both answer with the block and its epoch, so the
   * anchor is stored the same way and later captures route to it (AD-15).
   */
  /**
   * The device-local Start of one category (AD-2, AD-3, AD-4). It records the
   * press instant, the frozen snapshot, the local attempt and epoch identities
   * and the local display roster, and sends nothing. A heat start stays
   * online-only; a block the surface cannot start keeps the accepted refusal.
   */
  const createLocalStart = useCallback(
    async (block: TimingCategoryBlockView): Promise<void> => {
      const id = requireEvent();
      if (block.kind === 'HEAT') {
        report(OFFLINE_HEAT_START_MESSAGE);
        throw new Error(OFFLINE_HEAT_START_MESSAGE);
      }
      if (!block.startControlEnabled) {
        const message = block.blockReason ?? OFFLINE_START_UNAVAILABLE_MESSAGE;
        report(message);
        throw new Error(message);
      }
      const officialStartedAt = new Date().toISOString();
      const monotonicMs = performance.now();
      const localAttemptId = `local-attempt-${newTimingMutationKey()}`;
      const localClockEpochId = `local-epoch-${newTimingMutationKey()}`;
      const roster = block.participants.map((participant) => ({
        enrollmentId: participant.enrollmentId,
        registrationId: participant.registrationId,
        startNumber:
          participant.startNumber > 0 ? participant.startNumber : null,
        sectionId: participant.sectionId,
        requiredLaps: participant.requiredLaps,
        excludedReason: participant.excludedReason ?? null,
      }));
      const localRoster: TimingLocalRosterRow[] = block.participants.map(
        (participant) => ({
          enrollmentId: participant.enrollmentId,
          fullName: participant.fullName,
          sectionId: participant.sectionId,
          startNumber:
            participant.startNumber > 0 ? participant.startNumber : null,
          requiredLaps: participant.requiredLaps,
          excludedReason: participant.excludedReason ?? null,
        }),
      );
      await acceptCapture(localAttemptId, async () => {
        const queue = await openTimingQueue();
        const deviceSequence = await queue.nextSequence(
          localAttemptId,
          workstationInstanceId,
        );
        const payload: StartOfflineTimingAttemptRequest = {
          startId: block.startId,
          formatId: block.formatId,
          gender: block.gender,
          workstationInstanceId,
          officialStartedAt,
          roster,
          localAttemptId,
          localClockEpochId,
          deviceSequence,
        };
        return {
          ...queueItem(
            newTimingMutationKey(),
            localAttemptId,
            workstationInstanceId,
            deviceSequence,
            'START',
            payload,
          ),
          localAttemptId,
          localClockEpochId,
          eventId: id,
          localRoster,
        };
      });
      localAnchors.current.set(localAttemptId, {
        epochId: localClockEpochId,
        anchorElapsedMs: 0,
        anchorMonotonicMs: monotonicMs,
      });
    },
    [acceptCapture, report, requireEvent, workstationInstanceId],
  );

  const startAttempt = useCallback(
    async (block: TimingCategoryBlockView): Promise<void> => {
      if (!isOnline) {
        await createLocalStart(block);
        return;
      }
      const id = requireEvent();
      await runMutation(async () => {
        const result =
          block.kind === 'HEAT'
            ? await timingService.startHeatAttempt(
                id,
                {
                  classCompetitionId: requireHeatField(
                    block.classCompetitionId,
                  ),
                  stageId: requireHeatField(block.stageId),
                  heatNumber: requireHeatField(block.heatNumber),
                  workstationInstanceId,
                  clientStartedAt: new Date().toISOString(),
                },
                newTimingMutationKey(),
              )
            : await timingService.startAttempt(
                id,
                {
                  startId: block.startId,
                  formatId: block.formatId,
                  gender: block.gender,
                  workstationInstanceId,
                  clientStartedAt: new Date().toISOString(),
                },
                newTimingMutationKey(),
              );
        anchors.current.set(result.epoch.attemptId, {
          epochId: result.epoch.epochId,
          anchorElapsedMs: result.epoch.officialElapsedAnchorMs,
          anchorMonotonicMs: performance.now(),
        });
      });
    },
    [createLocalStart, isOnline, requireEvent, runMutation, workstationInstanceId],
  );

  const complete = useCallback(
    async (attemptId: string): Promise<void> => {
      const id = requireEvent();
      await runMutation(async () => {
        const queue = await openTimingQueue();
        const lastIssuedSequence = await queue.lastSequence(
          attemptId,
          workstationInstanceId,
        );
        await timingService.completeAttempt(
          id,
          attemptId,
          { workstationInstanceId, lastIssuedSequence },
          newTimingMutationKey(),
        );
      });
    },
    [requireEvent, runMutation, workstationInstanceId],
  );

  const forceComplete = useCallback(
    async (attemptId: string, reason: string): Promise<void> => {
      const id = requireEvent();
      await runMutation(() =>
        timingService.forceCompleteAttempt(id, attemptId, { reason }),
      );
    },
    [requireEvent, runMutation],
  );

  const cancelAttempt = useCallback(
    async (attemptId: string, reason: string): Promise<void> => {
      const id = requireEvent();
      await runMutation(() =>
        timingService.cancelAttempt(id, attemptId, { reason }),
      );
    },
    [requireEvent, runMutation],
  );

  const takeCapture = useCallback(async (): Promise<void> => {
    const id = requireEvent();
    await runMutation(() =>
      timingService.takeCapture(
        id,
        { workstationInstanceId },
        newTimingMutationKey(),
      ),
    );
  }, [requireEvent, runMutation, workstationInstanceId]);

  const transferCapture = useCallback(
    async (toWorkstationInstanceId: string): Promise<void> => {
      const id = requireEvent();
      await runMutation(() =>
        timingService.transferCapture(
          id,
          { toWorkstationInstanceId },
          newTimingMutationKey(),
        ),
      );
    },
    [requireEvent, runMutation],
  );

  const forceRelease = useCallback(
    async (reason: string): Promise<void> => {
      const id = requireEvent();
      await runMutation(() =>
        timingService.forceReleaseCapture(id, { workstationInstanceId, reason }),
      );
    },
    [requireEvent, runMutation, workstationInstanceId],
  );

  /** Replays one stored item with its own payload and idempotency key. */
  const replay = useCallback(
    (item: TimingQueueItem): Promise<unknown> => {
      const id = requireEvent();
      switch (item.operation) {
        case 'PASS': {
          const payload = item.payload as CaptureTimingPassRequest;
          return payload.kind === 'ANONYMOUS_SPLIT'
            ? timingService.captureAnonymousSplit(id, payload, item.id)
            : timingService.capturePass(id, payload, item.id);
        }
        case 'BIND': {
          const payload = item.payload as BindPendingFinishRequest;
          return timingService.bindPendingFinish(
            id,
            payload.pendingFinishId,
            payload,
            item.id,
          );
        }
        case 'UNDO':
          return timingService.quickUndo(
            id,
            item.attemptId,
            item.payload as QuickUndoTimingPassRequest,
            item.id,
          );
        case 'ANONYMOUS_ASSIGN': {
          const payload = item.payload as TimingAnonymousAssignPayload;
          if (payload.captureDeviceSequence !== undefined) {
            return timingService.assignAnonymousSplitByCapture(
              id,
              {
                ...payload.request,
                captureDeviceSequence: payload.captureDeviceSequence,
              },
              item.id,
            );
          }
          if (payload.splitId === undefined) {
            throw new Error('Неприсвоенная отсечка не найдена в очереди');
          }
          return timingService.assignAnonymousSplit(
            id,
            payload.splitId,
            payload.request,
            item.id,
          );
        }
        case 'START': {
          const payload = item.payload as StartOfflineTimingAttemptRequest;
          return timingService.startOfflineAttempt(id, payload, item.id);
        }
      }
    },
    [requireEvent],
  );

  /** Resolves a tile press's number from the surface, so a status names it. */
  const numberForEnrollment = useCallback(
    (enrollmentId: string): number | null => {
      for (const block of surfaceView?.categories ?? []) {
        for (const participant of block.participants) {
          if (participant.enrollmentId === enrollmentId) {
            return participant.startNumber;
          }
        }
      }
      return null;
    },
    [surfaceView],
  );

  /** Appends one answer to the ordered feed (AD-7). */
  const pushOutcome = useCallback(
    (
      item: TimingQueueItem,
      tone: TimingCaptureOutcomeEvent['tone'],
      reason?: string,
    ) => {
      if (!mounted.current) return;
      const event: TimingCaptureOutcomeEvent = {
        id: item.id,
        subject: captureSubject(item, numberForEnrollment),
        tone,
        at: new Date().toISOString(),
        ...(reason === undefined ? {} : { reason }),
      };
      setCaptureOutcomes((current) => [...current, event]);
    },
    [numberForEnrollment],
  );

  /** Wakes the pump when a capture's own retry backoff has elapsed (AD-5). */
  const scheduleRetry = useCallback((delayMs: number) => {
    if (!mounted.current || retryTimer.current !== null) return;
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      void pumpRef.current();
    }, delayMs);
  }, []);

  /**
   * Keeps a capture recorded after its delivery ended without a final answer.
   * It is neither reported nor dropped: it becomes eligible after the backoff
   * (E-09, E-21, AD-4, AD-5).
   */
  const keepUnresolved = useCallback(
    async (
      item: TimingQueueItem,
      queue: TimingQueue,
      connected: boolean,
    ): Promise<void> => {
      retryNotBefore.current.set(
        item.id,
        Date.now() + CAPTURE_RETRY_BACKOFF_MS,
      );
      await queue.mark(item.id, 'PENDING');
      await refreshQueue();
      setConnectivity(connected);
      if (!connected) pushOutcome(item, 'unsent');
      scheduleRetry(CAPTURE_RETRY_BACKOFF_MS);
    },
    [refreshQueue, setConnectivity, pushOutcome, scheduleRetry],
  );

  /**
   * One delivery. A 4xx is a signed refusal; the coded in-progress 409, a 5xx
   * without a capture-specific refusal and a transport failure are no answer
   * and stay retryable (AD-4, E-21).
   */
  /**
   * Applies the Start answer: persist the local→server mapping, rewrite every
   * dependent item and allocate the server attempt's capture numbers 1..n
   * (AD-5, AD-6). The Start item is marked `APPLIED` by `deliverItem` only after
   * this success, so a crash replays the same key and finishes the mapping.
   */
  const applyStartMapping = useCallback(
    async (item: TimingQueueItem, result: StartTimingAttemptResult) => {
      const serverAttemptId = result.attempt.attemptId;
      if (serverAttemptId === null) return;
      const payload = item.payload as StartOfflineTimingAttemptRequest;
      const queue = await openTimingQueue();
      const items = await queue.list();
      const dependent = items
        .filter(
          (candidate) =>
            (candidate.operation === 'PASS' ||
              candidate.operation === 'UNDO') &&
            candidate.attemptId === payload.localAttemptId &&
            candidate.serverAttemptId !== serverAttemptId,
        )
        .sort((left, right) =>
          left.createdAt === right.createdAt
            ? left.deviceSequence - right.deviceSequence
            : left.createdAt < right.createdAt
              ? -1
              : 1,
        );
      const sequences: number[] = [];
      for (let index = 0; index < dependent.length; index += 1) {
        sequences.push(
          await queue.nextSequence(serverAttemptId, workstationInstanceId),
        );
      }
      let cursor = 0;
      const mapping = mapLocalAttempt({
        items,
        startItem: item,
        serverAttemptId,
        serverClockEpochId: result.epoch.epochId,
        nextSequence: () => sequences[cursor++] ?? 0,
      });
      for (const changed of mapping.changed) {
        await queue.enqueue(changed);
      }
      localAnchors.current.delete(payload.localAttemptId);
      await refreshQueue();
    },
    [refreshQueue, workstationInstanceId],
  );

  /**
   * A refused Start invalidates the local attempt: its passes and quick undos
   * are discarded without sending. Event-scoped splits captured under its clock
   * stay for local deletion; their local epoch keeps the delivery planner from
   * sending them.
   */
  const discardLocalAttempt = useCallback(
    async (item: TimingQueueItem) => {
      const payload = item.payload as StartOfflineTimingAttemptRequest;
      const queue = await openTimingQueue();
      const items = await queue.list();
      for (const candidate of items) {
        if (candidate.id === item.id) continue;
        if (candidate.attemptId === payload.localAttemptId) {
          await queue.remove(candidate.id);
          continue;
        }
        // An assignment that chose the invalid attempt can never apply either.
        if (candidate.operation !== 'ANONYMOUS_ASSIGN') continue;
        const assignment = candidate.payload as TimingAnonymousAssignPayload;
        if (assignment.request.chosenAttemptId === payload.localAttemptId) {
          await queue.remove(candidate.id);
        }
      }
      localAnchors.current.delete(payload.localAttemptId);
      await refreshQueue();
    },
    [refreshQueue],
  );

  const deliverItem = useCallback(
    async (item: TimingQueueItem): Promise<void> => {
      const queue = await openTimingQueue();
      try {
        const answer = await replay(item);
        if (item.operation === 'START' && isStartResult(answer)) {
          await applyStartMapping(item, answer);
        }
        retryNotBefore.current.delete(item.id);
        await queue.mark(item.id, 'APPLIED');
        await refreshQueue();
        setConnectivity(true);
        pushOutcome(item, 'confirmed');
        invalidateCoalesced();
      } catch (error) {
        const message = describeTimingError(error);
        const answered =
          error instanceof AxiosError && error.response !== undefined;
        if (isIdempotencyInProgress(error)) {
          // The first request of this key may still apply: no refusal, no drop.
          await keepUnresolved(item, queue, true);
          return;
        }
        if (isDefinitiveRefusal(error)) {
          // The server signed its answer: retrying would only replay it.
          retryNotBefore.current.delete(item.id);
          if (item.operation === 'START') {
            await discardLocalAttempt(item);
          }
          await queue.mark(item.id, 'REJECTED', message);
          await refreshQueue();
          setConnectivity(true);
          pushOutcome(item, 'refused', message);
          report(message);
          invalidateCoalesced();
          return;
        }
        await keepUnresolved(item, queue, answered);
      }
    },
    [
      replay,
      refreshQueue,
      setConnectivity,
      pushOutcome,
      invalidateCoalesced,
      keepUnresolved,
      report,
      applyStartMapping,
      discardLocalAttempt,
    ],
  );

  /** Starts one delivery; the record is in the outbox before it leaves. */
  const startDelivery = useCallback(
    (item: TimingQueueItem) => {
      if (sendingIds.current.has(item.id)) return;
      sendingIds.current.add(item.id);
      syncInFlight();
      if (mounted.current) setIsFlushing(true);
      const run = (async () => {
        const queue = await openTimingQueue();
        await queue.mark(item.id, 'SENT');
        await refreshQueue();
        await deliverItem(item);
      })()
        .catch((error: unknown) => {
          retryNotBefore.current.set(
            item.id,
            Date.now() + CAPTURE_RETRY_BACKOFF_MS,
          );
          scheduleRetry(CAPTURE_RETRY_BACKOFF_MS);
          console.warn('timing: the delivery could not be started', error);
        })
        .finally(() => {
          sendingIds.current.delete(item.id);
          deliveryRuns.current.delete(item.id);
          syncInFlight();
          if (mounted.current && deliveryRuns.current.size === 0) {
            setIsFlushing(false);
          }
          void pumpRef.current();
        });
      deliveryRuns.current.set(item.id, run);
    },
    [deliverItem, refreshQueue, syncInFlight, scheduleRetry],
  );

  /**
   * One pump pass: snapshot the outbox, ask the pure module which captures may
   * start, and start them. Nothing here awaits an answer (AD-1, AD-5, AD-6).
   */
  const pumpOnce = useCallback(async (): Promise<number> => {
    if (!eventId || !mounted.current) return 0;
    const queue = await openTimingQueue();
    const items = await queue.list();
    const decision = decideDeliveries({
      items,
      sendingIds: new Set(sendingIds.current),
      retryNotBefore: new Map(retryNotBefore.current),
      now: Date.now(),
      online: networkOnline.current,
    });
    for (const item of decision.start) startDelivery(item);
    if (decision.start.length === 0) {
      const due = decision.blocked
        .filter((entry) => entry.reason === 'backoff')
        .map((entry) => retryNotBefore.current.get(entry.item.id) ?? 0)
        .filter((at) => at > 0);
      if (due.length > 0) {
        scheduleRetry(Math.max(0, Math.min(...due) - Date.now()));
      }
    }
    return decision.start.length;
  }, [eventId, startDelivery, scheduleRetry]);

  /**
   * The concurrent pump. It starts every eligible capture, waits for the
   * running deliveries, and runs again after each answer and acceptance. It
   * ends only when nothing is running and nothing may start (settled or paused
   * by the browser's offline flag or a retry backoff).
   */
  const pump = useCallback(async (): Promise<void> => {
    if (!eventId) return;
    if (pumpLoop.current !== null) {
      pumpAgain.current = true;
      // The loop may be waiting on a slow delivery; plan again right away so a
      // new acceptance or an answer starts without waiting for that delivery.
      void pumpOnce().catch((error: unknown) => {
        console.warn('timing: the delivery pump could not plan again', error);
      });
      await pumpLoop.current;
      return;
    }
    const loop = (async () => {
      let active = true;
      while (active) {
        pumpAgain.current = false;
        await pumpOnce();
        const running = [...deliveryRuns.current.values()];
        if (running.length > 0) {
          await Promise.allSettled(running);
        }
        active = pumpAgain.current || deliveryRuns.current.size > 0;
      }
    })().catch((error: unknown) => {
      console.warn('timing: the delivery pump stopped unexpectedly', error);
    });
    pumpLoop.current = loop;
    try {
      await loop;
    } finally {
      if (pumpLoop.current === loop) pumpLoop.current = null;
      if (pumpAgain.current) {
        pumpAgain.current = false;
        void pumpRef.current();
      }
    }
  }, [eventId, pumpOnce]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  /**
   * Starts the pump and resolves when the current unsent set is settled or
   * paused. `sendNow` and the automatic start on mount and `online` share it.
   */
  const flush = useCallback(async (): Promise<void> => {
    if (!eventId) return;
    if (mounted.current) setIsFlushing(true);
    try {
      await pumpRef.current();
    } finally {
      await refreshQueue();
      if (mounted.current) setIsFlushing(false);
    }
  }, [eventId, refreshQueue]);

  useEffect(() => {
    mounted.current = true;
    const online = browserOnline();
    networkOnline.current = online;
    setIsOnline(online);
    void refreshQueue();
    void flush();
    const handleOnline = () => {
      networkOnline.current = true;
      setIsOnline(true);
      void flush();
    };
    const handleOffline = () => {
      networkOnline.current = false;
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      mounted.current = false;
      if (retryTimer.current !== null) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flush, refreshQueue]);

  /**
   * A surface change opens the epoch of every running attempt that has no
   * anchor yet. The map is the guard: a known attempt is never reopened, and a
   * failed open is retried by the next action instead of in a loop.
   */
  useEffect(() => {
    if (!eventId || !surfaceView) return;
    for (const block of surfaceView.categories) {
      if (block.state !== 'RUNNING' || block.attemptId === null) continue;
      const attemptId = block.attemptId;
      if (anchors.current.has(attemptId) || opening.current.has(attemptId)) {
        continue;
      }
      void openEpoch(attemptId).catch((error: unknown) => {
        // openEpoch reported the API message; the anchor stays absent.
        console.warn(
          'timing: the clock epoch of a running attempt is still closed',
          error,
        );
      });
    }
  }, [eventId, surfaceView, openEpoch]);

  /**
   * The unresolved captures per attempt: recorded outbox entries plus the
   * acceptances still in the chain. Another attempt's captures never leak into
   * the count (FR-27, FR-43).
   */
  const unresolvedByAttempt = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of queueItems) {
      if (!isUnsynced(item)) continue;
      counts[item.attemptId] = (counts[item.attemptId] ?? 0) + 1;
    }
    for (const [attemptId, depth] of Object.entries(chainDepth)) {
      if (depth <= 0) continue;
      counts[attemptId] = (counts[attemptId] ?? 0) + depth;
    }
    return counts;
  }, [queueItems, chainDepth]);

  /** Removes one unapplied local split and every assignment that names it. */
  const deleteLocalSplit = useCallback(
    async (localSplitId: string): Promise<void> => {
      const item = queueItems.find(
        (candidate) => candidate.id === localSplitId,
      );
      if (
        item === undefined ||
        item.operation !== 'PASS' ||
        (item.payload as { kind?: string }).kind !== 'ANONYMOUS_SPLIT'
      ) {
        report(SPLIT_MISSING_MESSAGE);
        throw new Error(SPLIT_MISSING_MESSAGE);
      }
      if (item.status === 'SENT') {
        const message = 'Отсечка отправляется: дождитесь ответа сервера.';
        report(message);
        throw new Error(message);
      }
      if (item.status !== 'PENDING') {
        const message = 'Отсечка уже создана на сервере: отмените её с причиной.';
        report(message);
        throw new Error(message);
      }
      const queue = await openTimingQueue();
      const items = await queue.list();
      for (const candidate of items) {
        if (candidate.operation !== 'ANONYMOUS_ASSIGN') continue;
        const payload = candidate.payload as TimingAnonymousAssignPayload;
        if (payload.captureDeviceSequence === item.deviceSequence) {
          await queue.remove(candidate.id);
        }
      }
      await queue.remove(item.id);
      // The refused Start tombstone of this split's invalid clock is no longer
      // needed once nothing references it.
      await removeUnreferencedStartTombstones(queue);
      await refreshQueue();
    },
    [queueItems, refreshQueue, report],
  );

  return {
    resolveCandidates,
    commitNumber,
    commitTile,
    captureAnonymous,
    assignAnonymousSplit,
    cancelAnonymousSplit,
    undoAnonymousSplit,
    bindPending,
    quickUndo,
    startAttempt,
    complete,
    forceComplete,
    cancelAttempt,
    takeCapture,
    transferCapture,
    forceRelease,
    flush,
    sendNow: flush,
    queueItems,
    mergedSurface: surfaceView,
    localAttempts: localView.attempts,
    localSplits: localSplitView,
    deleteLocalSplit,
    inFlightIds,
    refreshQueue,
    isDurable,
    isOnline,
    pendingCount: queueItems.filter(isUnsynced).length,
    isFlushing,
    captureOutcomes,
    unresolvedByAttempt,
  };
}
