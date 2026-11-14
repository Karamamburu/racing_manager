import { useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  newTimingMutationKey,
  openTimingQueue,
  type TimingAnonymousAssignPayload,
  type TimingMutationOperation,
  type TimingQueueItem,
} from './timingQueue';
import { timingService } from './timingService';
import type {
  AssignAnonymousSplitRequest,
  BindPendingFinishRequest,
  CaptureTimingPassRequest,
  QuickUndoTimingPassRequest,
  TimingCategoryBlockView,
  TimingParticipantTileView,
  TimingSurfaceView,
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

/** What the surface consumes from the hook. */
export interface UseTimingCaptureResult {
  resolveCandidates: (startNumber: number) => TimingCaptureCandidate[];
  commitNumber: (input: TimingNumberCommit) => Promise<void>;
  commitTile: (
    participant: TimingParticipantTileView,
    attemptId: string,
  ) => Promise<void>;
  /** Queues one anonymous split of the attempt; it needs no number and no N. */
  captureAnonymous: () => Promise<void>;
  /** Binds one queued split to a start number of its own attempt. */
  assignAnonymousSplit: (
    splitId: string,
    startNumber: number,
    chosenAttemptId?: string,
  ) => Promise<void>;
  /** Retires one queued split with a reason; a referee or an administrator. */
  cancelAnonymousSplit: (splitId: string, reason: string) => Promise<void>;
  bindPending: (pendingId: string, startNumber: number) => Promise<void>;
  quickUndo: (attemptId: string) => Promise<void>;
  /** Starts a category block or a heat block on its own route. */
  startAttempt: (block: TimingCategoryBlockView) => Promise<void>;
  complete: (attemptId: string) => Promise<void>;
  forceComplete: (attemptId: string, reason: string) => Promise<void>;
  cancelAttempt: (attemptId: string, reason: string) => Promise<void>;
  takeCapture: () => Promise<void>;
  transferCapture: (toWorkstationInstanceId: string) => Promise<void>;
  forceRelease: (reason: string) => Promise<void>;
  /** Replays every unsynced item, oldest first, and stops at a lost network. */
  flush: () => Promise<void>;
  /** Queue items the server has not answered yet, across attempts. */
  pendingCount: number;
  isFlushing: boolean;
}

const FALLBACK_ERROR_MESSAGE = 'Не удалось выполнить запрос хронометража';
const EPOCH_FALLBACK_MESSAGE = 'Не удалось открыть отсчёт попытки';
const EVENT_REQUIRED_MESSAGE = 'Хронометраж недоступен: мероприятие не выбрано';
const CANDIDATE_MISSING_MESSAGE = 'Участник не найден среди идущих заездов';
const PENDING_MISSING_MESSAGE = 'Непривязанный финиш не найден на поверхности';
const SPLIT_MISSING_MESSAGE = 'Неразмеченный сплит не найден в очереди';
const NO_RUNNING_ATTEMPT_MESSAGE =
  'Нет идущей попытки: неразмеченный сплит некуда записать';
const HEAT_INCOMPLETE_MESSAGE = 'Блок заезда не готов к старту';

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

/**
 * A refusal the server signed: it answered with a status, so retrying the same
 * idempotency key would only replay the same answer. A request that never got
 * an answer stays replayable instead (E-27).
 */
function isDefinitiveRefusal(error: unknown): boolean {
  return error instanceof AxiosError && error.response !== undefined;
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
): UseTimingCaptureResult {
  const queryClient = useQueryClient();
  /** One anchor per running attempt of this workstation (AD-2). */
  const anchors = useRef<Map<string, TimingEpochAnchor>>(new Map());
  /** The open in flight per attempt, so a burst never opens two epochs. */
  const opening = useRef<Map<string, Promise<TimingEpochAnchor>>>(new Map());
  const mounted = useRef(true);
  const onErrorRef = useRef(onError);
  const [pendingCount, setPendingCount] = useState(0);
  const [isFlushing, setIsFlushing] = useState(false);

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

  const refreshPendingCount = useCallback(async () => {
    const queue = await openTimingQueue();
    const next = await queue.pendingCount();
    if (mounted.current) setPendingCount(next);
  }, []);

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
   * Stores the item, sends it, and records what the API answered. The queue
   * item exists before the request leaves (AD-3).
   */
  const deliver = useCallback(
    async (
      item: TimingQueueItem,
      run: () => Promise<unknown>,
    ): Promise<void> => {
      const queue = await openTimingQueue();
      await queue.enqueue(item);
      await refreshPendingCount();
      try {
        await run();
        await queue.mark(item.id, 'APPLIED');
        await refreshPendingCount();
        await invalidate();
      } catch (error) {
        const message = describeTimingError(error);
        if (isDefinitiveRefusal(error)) {
          await queue.mark(item.id, 'REJECTED', message);
        } else {
          // No answer: keep it unsynced so `flush` can confirm it later (E-27).
          await queue.mark(item.id, 'PENDING');
        }
        await refreshPendingCount();
        await invalidate();
        report(message);
        throw error;
      }
    },
    [refreshPendingCount, invalidate, report],
  );

  /** One pass of one attempt, routed to that attempt's own epoch. */
  const sendPass = useCallback(
    async (input: {
      attemptId: string;
      kind: 'NUMBER' | 'TILE';
      startNumber: number;
      enrollmentId: string;
      capturedAt: string;
      monotonicMs: number;
    }): Promise<void> => {
      const id = requireEvent();
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

      await deliver(
        queueItem(
          key,
          input.attemptId,
          workstationInstanceId,
          deviceSequence,
          'PASS',
          payload,
        ),
        () => timingService.capturePass(id, payload, key),
      );
    },
    [requireEvent, openEpoch, workstationInstanceId, deliver],
  );

  /**
   * One anonymous split of one attempt. The press instant is read before the
   * epoch is awaited, so the elapsed value is the press and not the response.
   * The split carries no participant and no lap bound, so nothing here reads a
   * number, N or the roster (AD-17).
   */
  const captureAnonymous = useCallback(
    async (): Promise<void> => {
      const id = requireEvent();
      const anchorAttempt = surface?.categories.find(
        (block) => block.state === 'RUNNING' && block.attemptId !== null,
      )?.attemptId;
      if (anchorAttempt === undefined || anchorAttempt === null) {
        report(NO_RUNNING_ATTEMPT_MESSAGE);
        throw new Error(NO_RUNNING_ATTEMPT_MESSAGE);
      }
      const capturedAt = new Date().toISOString();
      const monotonicMs = performance.now();
      const anchor = await openEpoch(anchorAttempt);
      const queue = await openTimingQueue();
      const eventScope = `event:${id}`;
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

      await deliver(
        queueItem(
          key,
          eventScope,
          workstationInstanceId,
          deviceSequence,
          'PASS',
          payload,
        ),
        () => timingService.captureAnonymousSplit(id, payload, key),
      );
    },
    [requireEvent, surface, openEpoch, workstationInstanceId, deliver, report],
  );

  /**
   * Every eligible running enrollment of one number, across categories. This
   * mirrors the server routing for the UI; the API still decides the pass.
   */
  const resolveCandidates = useCallback(
    (startNumber: number): TimingCaptureCandidate[] => {
      if (!surface) return [];
      const candidates: TimingCaptureCandidate[] = [];
      for (const block of surface.categories) {
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
    [surface],
  );

  const commitNumber = useCallback(
    async (input: TimingNumberCommit): Promise<void> => {
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
      await sendPass({
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
    ): Promise<void> => {
      // The click instant is read once, before anything else runs.
      const capturedAt = new Date().toISOString();
      const monotonicMs = performance.now();
      await sendPass({
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
    async (pendingId: string, startNumber: number): Promise<void> => {
      const id = requireEvent();
      const pending = surface?.categories
        .flatMap((block) => block.pendingFinishes)
        .find((finish) => finish.passId === pendingId);
      if (pending === undefined) {
        report(PENDING_MISSING_MESSAGE);
        throw new Error(PENDING_MISSING_MESSAGE);
      }
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
      await deliver(
        queueItem(
          key,
          pending.attemptId,
          workstationInstanceId,
          deviceSequence,
          'BIND',
          payload,
        ),
        () => timingService.bindPendingFinish(id, pendingId, payload, key),
      );
    },
    [requireEvent, surface, workstationInstanceId, deliver, report],
  );

  const quickUndo = useCallback(
    async (attemptId: string): Promise<void> => {
      const id = requireEvent();
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
      await deliver(
        queueItem(
          key,
          attemptId,
          workstationInstanceId,
          deviceSequence,
          'UNDO',
          payload,
        ),
        () => timingService.quickUndo(id, attemptId, payload, key),
      );
    },
    [requireEvent, workstationInstanceId, deliver],
  );

  /**
   * Binds one queued split to a start number of its own attempt. The split names
   * the attempt, so the sequence it takes is the sequence of that attempt; an
   * accepted assignment leaves the queue with the surface refetch (AD-17).
   */
  const assignAnonymousSplit = useCallback(
    async (
      splitId: string,
      startNumber: number,
      chosenAttemptId?: string,
    ): Promise<void> => {
      const id = requireEvent();
      const split = surface?.anonymousSplits?.find(
        (entry) => entry.splitId === splitId,
      );
      if (split === undefined) {
        report(SPLIT_MISSING_MESSAGE);
        throw new Error(SPLIT_MISSING_MESSAGE);
      }
      const eventScope = `event:${id}`;
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
      const payload: TimingAnonymousAssignPayload = { splitId, request };
      await deliver(
        queueItem(
          key,
          eventScope,
          workstationInstanceId,
          deviceSequence,
          'ANONYMOUS_ASSIGN',
          payload,
        ),
        () => timingService.assignAnonymousSplit(id, splitId, request, key),
      );
    },
    [requireEvent, surface, workstationInstanceId, deliver, report],
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
  const startAttempt = useCallback(
    async (block: TimingCategoryBlockView): Promise<void> => {
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
    [requireEvent, runMutation, workstationInstanceId],
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
          return timingService.assignAnonymousSplit(
            id,
            payload.splitId,
            payload.request,
            item.id,
          );
        }
      }
    },
    [requireEvent],
  );

  const flush = useCallback(async (): Promise<void> => {
    if (!eventId) return;
    if (mounted.current) setIsFlushing(true);
    let applied = false;
    try {
      const queue = await openTimingQueue();
      const unsynced = (await queue.list()).filter(isUnsynced);
      for (const item of unsynced) {
        await queue.mark(item.id, 'SENT');
        try {
          await replay(item);
          await queue.mark(item.id, 'APPLIED');
          applied = true;
        } catch (error) {
          const message = describeTimingError(error);
          if (isDefinitiveRefusal(error)) {
            // The server answered: retrying would only replay the refusal.
            await queue.mark(item.id, 'REJECTED', message);
            report(message);
            continue;
          }
          // The network is gone: keep this item and every later one for a
          // later flush, so nothing is ever dropped (E-27).
          await queue.mark(item.id, 'PENDING');
          report(message);
          break;
        }
      }
      if (applied) await invalidate();
    } finally {
      await refreshPendingCount();
      if (mounted.current) setIsFlushing(false);
    }
  }, [eventId, replay, invalidate, refreshPendingCount, report]);

  useEffect(() => {
    mounted.current = true;
    void flush();
    const handleOnline = () => {
      void flush();
    };
    window.addEventListener('online', handleOnline);
    return () => {
      mounted.current = false;
      window.removeEventListener('online', handleOnline);
    };
  }, [flush]);

  /**
   * A surface change opens the epoch of every running attempt that has no
   * anchor yet. The map is the guard: a known attempt is never reopened, and a
   * failed open is retried by the next action instead of in a loop.
   */
  useEffect(() => {
    if (!eventId || !surface) return;
    for (const block of surface.categories) {
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
  }, [eventId, surface, openEpoch]);

  return {
    resolveCandidates,
    commitNumber,
    commitTile,
    captureAnonymous,
    assignAnonymousSplit,
    cancelAnonymousSplit,
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
    pendingCount,
    isFlushing,
  };
}
