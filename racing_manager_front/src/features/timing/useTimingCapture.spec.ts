import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import type { AxiosResponse } from 'axios';
import { createElement, type ReactNode } from 'react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  CAPTURE_RETRY_BACKOFF_MS,
  MAX_CONCURRENT_CAPTURE_DELIVERIES,
} from './timingDelivery';
import { openTimingQueue } from './timingQueue';
import type { TimingQueueItem } from './timingQueue';
import { timingService } from './timingService';
import type {
  CaptureTimingPassRequest,
  StartOfflineTimingAttemptRequest,
  TimingAnonymousSplitView,
  TimingAttemptRecordView,
  TimingCaptureView,
  TimingCategoryBlockView,
  TimingClockEpochView,
  TimingParticipantTileView,
  TimingPassView,
  TimingSurfaceView,
} from './types';
import { useTimingCapture } from './useTimingCapture';
import type { TimingCaptureOutcome } from './useTimingCapture';

vi.mock('./timingService', () => ({
  timingService: {
    startAttempt: vi.fn(),
    startHeatAttempt: vi.fn(),
    startOfflineAttempt: vi.fn(),
    openClockEpoch: vi.fn(),
    capturePass: vi.fn(),
    captureAnonymousSplit: vi.fn(),
    assignAnonymousSplit: vi.fn(),
    assignAnonymousSplitByCapture: vi.fn(),
    cancelAnonymousSplit: vi.fn(),
    undoAnonymousSplit: vi.fn(),
    bindPendingFinish: vi.fn(),
    quickUndo: vi.fn(),
    completeAttempt: vi.fn(),
    forceCompleteAttempt: vi.fn(),
    cancelAttempt: vi.fn(),
    takeCapture: vi.fn(),
    transferCapture: vi.fn(),
    forceReleaseCapture: vi.fn(),
  },
}));

/**
 * The monotonic clock of every scenario. `performance.now()` is pinned so an
 * elapsed value is derived from a known anchor instead of wall-clock jitter.
 */
let monotonicNow = 1000;

interface HookProps {
  surface?: TimingSurfaceView;
  onError?: (message: string) => void;
}

function epochView(attemptId: string): TimingClockEpochView {
  return {
    epochId: `epoch-${attemptId}`,
    attemptId,
    officialElapsedAnchorMs: 1000,
    serverNow: '2026-11-13T09:00:00.000Z',
  };
}

function participant(
  overrides: Partial<TimingParticipantTileView> = {},
): TimingParticipantTileView {
  return {
    enrollmentId: 'enrollment-1',
    registrationId: 'registration-1',
    startNumber: 17,
    fullName: 'Иван Петров',
    sectionId: 'Мужчины 24–40',
    passCount: 0,
    requiredLaps: 3,
    lastPassAt: null,
    state: 'WAITING',
    excludedReason: null,
    ...overrides,
  };
}

function pendingFinish(overrides: Partial<TimingPassView> = {}): TimingPassView {
  return {
    passId: 'pending-1',
    attemptId: 'attempt-a',
    enrollmentId: null,
    lapNumber: null,
    rawCapturedAt: '2026-11-13T09:00:05.000Z',
    officialAt: '2026-11-13T09:00:05.000Z',
    officialElapsedMs: 5000,
    status: 'PENDING',
    ...overrides,
  };
}

function passView(overrides: Partial<TimingPassView> = {}): TimingPassView {
  return {
    passId: 'pass-1',
    attemptId: 'attempt-a',
    enrollmentId: 'enrollment-1',
    lapNumber: 1,
    rawCapturedAt: '2026-11-13T09:00:01.000Z',
    officialAt: '2026-11-13T09:00:01.000Z',
    officialElapsedMs: 1000,
    status: 'BOUND',
    ...overrides,
  };
}

function runningBlock(
  overrides: Partial<TimingCategoryBlockView> = {},
): TimingCategoryBlockView {
  return {
    startId: 'start-a',
    formatId: 1,
    gender: 'M',
    state: 'RUNNING',
    lapCount: 3,
    attemptId: 'attempt-a',
    officialStartedAt: '2026-11-13T09:00:00.000Z',
    elapsedMs: 0,
    startControlEnabled: false,
    blockReason: null,
    participants: [participant()],
    pendingFinishes: [],
    lastAttempts: [],
    ...overrides,
  };
}

function surfaceOf(categories: TimingCategoryBlockView[]): TimingSurfaceView {
  return { eventId: 'event-1', captureWorkstationInstanceId: 'ws-1', categories };
}

function anonymousSplit(
  overrides: Partial<TimingAnonymousSplitView> = {},
): TimingAnonymousSplitView {
  return {
    splitId: 'split-1',
    attemptId: 'attempt-a',
    blockKey: 'CATEGORY_1:start-a',
    attemptLabel: 'Заезд 1',
    capturedAt: '2026-11-13T09:00:03.000Z',
    officialElapsedMs: 3000,
    status: 'QUEUED',
    bound: false,
    candidates: [
      {
        attemptId: 'attempt-a',
        blockKey: 'CATEGORY_1:start-a',
        attemptLabel: 'Заезд 1',
        officialElapsedMs: 3000,
      },
    ],
    captureDeviceSequence: 2,
    ...overrides,
  };
}

/** A surface whose queue holds the given splits beside one running block. */
function surfaceWithQueue(
  attemptId: string,
  splits: TimingAnonymousSplitView[],
): TimingSurfaceView {
  return {
    ...surfaceOf([runningBlock({ attemptId })]),
    anonymousSplits: splits,
  };
}

function attemptRecord(): TimingAttemptRecordView {
  return {
    attemptId: 'attempt-a',
    state: 'COMPLETED',
    officialStartedAt: '2026-11-13T09:00:00.000Z',
    passes: [passView()],
    pendingFinishes: [],
    closureReport: {
      publishedEnrollmentIds: ['enrollment-1'],
      unpublishedEnrollmentIds: [],
      conflictEnrollmentIds: [],
    },
    publishedResults: [],
    audit: [],
  };
}

function captureView(): TimingCaptureView {
  return {
    eventId: 'event-1',
    workstationInstanceId: 'ws-1',
    heldByUserId: 'user-1',
    heldAt: '2026-11-13T09:00:00.000Z',
  };
}

/** A refusal the API answered with, the only failure it signs. */
function apiRefusal(message: string): AxiosError {
  return new AxiosError(message, 'ERR_BAD_REQUEST', undefined, undefined, {
    data: { message },
    status: 409,
    statusText: 'Conflict',
    headers: {},
  } as unknown as AxiosResponse);
}

/** The coded 409 of an open idempotency claim: unresolved, not a refusal. */
function inProgressRefusal(): AxiosError {
  return new AxiosError(
    'A request with this Idempotency-Key is still in progress.',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      data: {
        statusCode: 409,
        code: 'IDEMPOTENCY_IN_PROGRESS',
        message: 'A request with this Idempotency-Key is still in progress.',
      },
      status: 409,
      statusText: 'Conflict',
      headers: {},
    } as unknown as AxiosResponse,
  );
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, resolve, reject };
}

/** Lets every pending promise chain run without advancing a fake clock. */
async function drainMicrotasks(rounds = 300): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve();
  }
}

function queuedPass(
  id: string,
  deviceSequence: number,
  attemptId = 'attempt-a',
  startNumber = 17,
): TimingQueueItem {
  const payload: CaptureTimingPassRequest = {
    attemptId,
    kind: 'NUMBER',
    startNumber,
    clientCapturedAt: '2026-11-13T09:00:03.000Z',
    clientElapsedMs: 3000,
    clockEpochId: 'epoch-attempt-a',
    workstationInstanceId: 'ws-1',
    deviceSequence,
  };
  return {
    id,
    attemptId,
    workstationInstanceId: 'ws-1',
    deviceSequence,
    operation: 'PASS',
    payload,
    status: 'PENDING',
    createdAt: `2026-11-13T09:00:0${deviceSequence}.000Z`,
  };
}

function queuedAnonymousCapture(
  id: string,
  attemptId: string,
  deviceSequence: number,
): TimingQueueItem {
  const payload: CaptureTimingPassRequest = {
    attemptId,
    kind: 'ANONYMOUS_SPLIT',
    clientCapturedAt: '2026-11-13T09:00:03.000Z',
    clientElapsedMs: 3000,
    clockEpochId: `epoch-${attemptId}`,
    workstationInstanceId: 'ws-1',
    deviceSequence,
  };
  return {
    id,
    attemptId,
    workstationInstanceId: 'ws-1',
    deviceSequence,
    operation: 'PASS',
    payload,
    status: 'PENDING',
    createdAt: `2026-11-13T09:00:0${deviceSequence}.000Z`,
  };
}

function queuedAssignment(
  id: string,
  attemptId: string,
  splitId: string,
  deviceSequence: number,
): TimingQueueItem {
  return {
    id,
    attemptId,
    workstationInstanceId: 'ws-1',
    deviceSequence,
    operation: 'ANONYMOUS_ASSIGN',
    payload: {
      splitId,
      request: {
        startNumber: 17,
        workstationInstanceId: 'ws-1',
        deviceSequence,
      },
    },
    status: 'PENDING',
    createdAt: `2026-11-13T09:00:0${deviceSequence}.000Z`,
  };
}

function renderCapture(initial: HookProps) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const rendered = renderHook(
    (props: HookProps) =>
      useTimingCapture('event-1', props.surface, 'ws-1', props.onError),
    { initialProps: initial, wrapper },
  );
  return { ...rendered, client };
}

/** The browser network flag the hook reads on mount and on `online` (AS-4). */
let navigatorOnline = true;

beforeAll(() => {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => navigatorOnline,
  });
});

beforeEach(async () => {
  vi.clearAllMocks();
  const queue = await openTimingQueue();
  await queue.clear();

  monotonicNow = 1000;
  navigatorOnline = true;
  vi.spyOn(performance, 'now').mockImplementation(() => monotonicNow);

  vi.mocked(timingService.openClockEpoch).mockImplementation(
    async (_eventId: string, attemptId: string) => epochView(attemptId),
  );
  vi.mocked(timingService.capturePass).mockResolvedValue(passView());
  vi.mocked(timingService.captureAnonymousSplit).mockResolvedValue(
    anonymousSplit(),
  );
  vi.mocked(timingService.assignAnonymousSplit).mockResolvedValue(passView());
  vi.mocked(timingService.assignAnonymousSplitByCapture).mockResolvedValue(
    passView(),
  );
  vi.mocked(timingService.cancelAnonymousSplit).mockResolvedValue(
    anonymousSplit(),
  );
  vi.mocked(timingService.bindPendingFinish).mockResolvedValue(passView());
  vi.mocked(timingService.quickUndo).mockResolvedValue(
    passView({ status: 'CANCELLED' }),
  );
  vi.mocked(timingService.startAttempt).mockResolvedValue({
    attempt: runningBlock(),
    epoch: epochView('attempt-a'),
  });
  vi.mocked(timingService.startHeatAttempt).mockResolvedValue({
    attempt: runningBlock({ attemptId: 'attempt-heat', kind: 'HEAT' }),
    epoch: epochView('attempt-heat'),
  });
  vi.mocked(timingService.completeAttempt).mockResolvedValue(attemptRecord());
  vi.mocked(timingService.forceCompleteAttempt).mockResolvedValue(
    attemptRecord(),
  );
  vi.mocked(timingService.cancelAttempt).mockResolvedValue(attemptRecord());
  vi.mocked(timingService.takeCapture).mockResolvedValue(captureView());
  vi.mocked(timingService.transferCapture).mockResolvedValue(captureView());
  vi.mocked(timingService.forceReleaseCapture).mockResolvedValue(captureView());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useTimingCapture clock epochs', () => {
  it('opens one epoch per running block and never reopens a known anchor', async () => {
    const { rerender } = renderCapture({
      surface: surfaceOf([
        runningBlock(),
        runningBlock({ attemptId: 'attempt-b', gender: 'F' }),
        runningBlock({ attemptId: null, state: 'NOT_STARTED' }),
      ]),
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(2);
    });
    expect(
      vi
        .mocked(timingService.openClockEpoch)
        .mock.calls.map((call) => call[1]),
    ).toEqual(['attempt-a', 'attempt-b']);
    expect(timingService.openClockEpoch).toHaveBeenCalledWith(
      'event-1',
      'attempt-a',
      { workstationInstanceId: 'ws-1' },
      expect.any(String),
    );

    await act(async () => {
      rerender({
        surface: surfaceOf([
          runningBlock(),
          runningBlock({ attemptId: 'attempt-b', gender: 'F' }),
        ]),
      });
    });

    expect(timingService.openClockEpoch).toHaveBeenCalledTimes(2);
  });

  it('calls no mutation when the epoch cannot be opened', async () => {
    const onError = vi.fn();
    vi.mocked(timingService.openClockEpoch).mockRejectedValue(
      new Error('Захват удерживает другое устройство'),
    );

    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-closed' })]),
      onError,
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Захват удерживает другое устройство');
    });

    await act(async () => {
      await expect(
        result.current.commitNumber({
          startNumber: 17,
          capturedAt: '2026-11-13T09:00:01.000Z',
          monotonicMs: 1500,
        }),
      ).rejects.toThrow('Захват удерживает другое устройство');
    });

    expect(timingService.capturePass).not.toHaveBeenCalled();
    const queue = await openTimingQueue();
    await expect(queue.list('attempt-closed')).resolves.toEqual([]);
    await expect(queue.lastSequence('attempt-closed', 'ws-1')).resolves.toBe(0);
  });
});

describe('useTimingCapture commits', () => {
  it('sends a number with the anchor-derived elapsed, the next sequence and a key', async () => {
    const onError = vi.fn();
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-number' })]),
      onError,
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    monotonicNow = 3500;
    await act(async () => {
      await result.current.commitNumber({
        startNumber: 17,
        capturedAt: '2026-11-13T09:00:03.500Z',
        monotonicMs: 3500,
      });
    });

    expect(timingService.capturePass).toHaveBeenCalledTimes(1);
    const [eventId, payload, key] = vi.mocked(timingService.capturePass).mock
      .calls[0];
    expect(eventId).toBe('event-1');
    expect(payload).toEqual({
      attemptId: 'attempt-number',
      kind: 'NUMBER',
      startNumber: 17,
      clientCapturedAt: '2026-11-13T09:00:03.500Z',
      clientElapsedMs: 3500,
      clockEpochId: 'epoch-attempt-number',
      workstationInstanceId: 'ws-1',
      deviceSequence: 1,
    });
    expect(typeof key).toBe('string');

    const queue = await openTimingQueue();
    const items = await queue.list('attempt-number');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: key,
      operation: 'PASS',
      status: 'APPLIED',
      deviceSequence: 1,
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('sends a tile at the click instant with its enrollment and no number', async () => {
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-tile' })]),
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    monotonicNow = 4200;
    await act(async () => {
      await result.current.commitTile(participant(), 'attempt-tile');
    });

    const [, payload] = vi.mocked(timingService.capturePass).mock.calls[0];
    expect(payload).toEqual({
      attemptId: 'attempt-tile',
      kind: 'TILE',
      enrollmentId: 'enrollment-1',
      clientCapturedAt: expect.any(String),
      clientElapsedMs: 4200,
      clockEpochId: 'epoch-attempt-tile',
      workstationInstanceId: 'ws-1',
      deviceSequence: 1,
    });
    expect(payload).not.toHaveProperty('startNumber');
  });

  it('shows a refused commit once and removes it from the queue', async () => {
    const onError = vi.fn();
    vi.mocked(timingService.capturePass).mockRejectedValue(
      apiRefusal('Последний круг уже записан'),
    );

    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-refused' })]),
      onError,
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    let outcome: TimingCaptureOutcome | undefined;
    await act(async () => {
      outcome = await result.current.commitNumber({
        startNumber: 17,
        capturedAt: '2026-11-13T09:00:01.000Z',
        monotonicMs: 1500,
      });
    });

    // The referee is released on acceptance; the refusal arrives later.
    expect(outcome).toEqual({ status: 'ACCEPTED' });
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Последний круг уже записан');
    });
    const queue = await openTimingQueue();
    await expect(queue.list('attempt-refused')).resolves.toEqual([]);
    expect(result.current.queueItems).toEqual([]);
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.captureOutcomes).toEqual([
      expect.objectContaining({
        subject: '№ 17',
        tone: 'refused',
        reason: 'Последний круг уже записан',
      }),
    ]);
  });

  it('keeps an entry in flight until the server answers', async () => {
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-in-flight' })]),
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    let resolveCapture: (value: TimingPassView) => void = () => {};
    vi.mocked(timingService.capturePass).mockImplementationOnce(
      () =>
        new Promise<TimingPassView>((resolve) => {
          resolveCapture = resolve;
        }),
    );
    let pending: Promise<TimingCaptureOutcome> | undefined;
    act(() => {
      pending = result.current.commitNumber({
        startNumber: 17,
        capturedAt: '2026-11-13T09:00:01.000Z',
        monotonicMs: 1500,
      });
    });

    await waitFor(() => expect(result.current.inFlightIds.size).toBe(1));
    await act(async () => {
      resolveCapture(passView());
      await pending;
    });
    expect(result.current.inFlightIds.size).toBe(0);
  });

  it('accepts an unanswered commit, keeps it unsent and confirms it after the backoff', async () => {
    const onError = vi.fn();
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-offline' })]),
      onError,
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    vi.mocked(timingService.capturePass).mockRejectedValueOnce(
      new Error('Network Error'),
    );
    let outcome: TimingCaptureOutcome | undefined;
    await act(async () => {
      outcome = await result.current.commitNumber({
        startNumber: 17,
        capturedAt: '2026-11-13T09:00:01.000Z',
        monotonicMs: 1500,
      });
    });

    // The press was recorded, so the field may clear and no failure is shown.
    expect(outcome).toEqual({ status: 'ACCEPTED' });
    expect(onError).not.toHaveBeenCalled();
    const queue = await openTimingQueue();
    await waitFor(async () => {
      const [queued] = await queue.list('attempt-offline');
      expect(queued.status).toBe('PENDING');
    });
    let [queued] = await queue.list('attempt-offline');

    // The retry waits out the backoff; the scheduled wake confirms it.
    await new Promise((resolve) =>
      setTimeout(resolve, CAPTURE_RETRY_BACKOFF_MS + 20),
    );
    await act(async () => {
      await result.current.flush();
    });

    [queued] = await queue.list('attempt-offline');
    expect(queued.status).toBe('APPLIED');
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('useTimingCapture concurrent pump', () => {
  function numberedSurfaces(numbers: number[]): TimingCategoryBlockView {
    return runningBlock({
      attemptId: 'attempt-burst',
      participants: numbers.map((startNumber) =>
        participant({
          enrollmentId: `enrollment-${startNumber}`,
          registrationId: `registration-${startNumber}`,
          startNumber,
          fullName: `Участник ${startNumber}`,
        }),
      ),
    });
  }

  it('accepts 15 presses in one tick with distinct sequences and starts at most the bound', async () => {
    const numbers = Array.from({ length: 15 }, (_, index) => index + 1);
    const { result } = renderCapture({
      surface: surfaceOf([numberedSurfaces(numbers)]),
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    const answers = numbers.map(() => deferred<TimingPassView>());
    let callIndex = 0;
    vi.mocked(timingService.capturePass).mockImplementation(
      () => answers[callIndex++].promise,
    );

    let outcomes: TimingCaptureOutcome[] = [];
    await act(async () => {
      const presses = numbers.map((startNumber, index) =>
        result.current.commitNumber({
          startNumber,
          capturedAt: `2026-11-13T09:00:0${index}.000Z`,
          monotonicMs: 1000 + index,
        }),
      );
      outcomes = await Promise.all(presses);
    });

    expect(outcomes).toEqual(
      Array.from({ length: 15 }, () => ({ status: 'ACCEPTED' })),
    );
    await waitFor(() => {
      expect(timingService.capturePass).toHaveBeenCalledTimes(
        MAX_CONCURRENT_CAPTURE_DELIVERIES,
      );
    });
    expect(result.current.inFlightIds.size).toBe(
      MAX_CONCURRENT_CAPTURE_DELIVERIES,
    );

    await act(async () => {
      answers
        .slice(0, MAX_CONCURRENT_CAPTURE_DELIVERIES)
        .forEach((answer) => answer.resolve(passView()));
      await drainMicrotasks();
    });
    await waitFor(() => {
      expect(timingService.capturePass).toHaveBeenCalledTimes(15);
    });
    await act(async () => {
      answers
        .slice(MAX_CONCURRENT_CAPTURE_DELIVERIES)
        .forEach((answer) => answer.resolve(passView()));
      await drainMicrotasks();
    });

    const queue = await openTimingQueue();
    await waitFor(async () => {
      const items = await queue.list('attempt-burst');
      expect(items).toHaveLength(15);
      expect(items.every((item) => item.status === 'APPLIED')).toBe(true);
    });

    const sequenceByNumber = new Map<number, number>();
    for (const [, payload] of vi.mocked(timingService.capturePass).mock.calls) {
      if (payload.kind === 'NUMBER' && payload.startNumber !== undefined) {
        sequenceByNumber.set(payload.startNumber, payload.deviceSequence);
      }
    }
    const sequences = numbers.map((number) => sequenceByNumber.get(number));
    expect(new Set(sequences).size).toBe(15);
    expect(sequences).toEqual(
      [...sequences].sort((first, second) => (first ?? 0) - (second ?? 0)),
    );
    const items = await queue.list('attempt-burst');
    expect(items.map((item) => item.deviceSequence)).toEqual(sequences);
    expect(
      result.current.captureOutcomes?.filter(
        (event) => event.tone === 'confirmed',
      ),
    ).toHaveLength(15);
  });

  it('does not start a second press of one number before the first answers', async () => {
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-gate' })]),
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    const answers = [deferred<TimingPassView>(), deferred<TimingPassView>()];
    let callIndex = 0;
    vi.mocked(timingService.capturePass).mockImplementation(
      () => answers[callIndex++].promise,
    );

    await act(async () => {
      await Promise.all([
        result.current.commitNumber({
          startNumber: 17,
          capturedAt: '2026-11-13T09:00:01.000Z',
          monotonicMs: 1100,
        }),
        result.current.commitNumber({
          startNumber: 17,
          capturedAt: '2026-11-13T09:00:02.000Z',
          monotonicMs: 2100,
        }),
      ]);
    });

    await waitFor(() => {
      expect(timingService.capturePass).toHaveBeenCalledTimes(1);
    });
    const firstKey = vi.mocked(timingService.capturePass).mock.calls[0][2];

    await act(async () => {
      answers[0].resolve(passView());
      await drainMicrotasks();
    });
    await waitFor(() => {
      expect(timingService.capturePass).toHaveBeenCalledTimes(2);
    });
    const secondKey = vi.mocked(timingService.capturePass).mock.calls[1][2];
    expect(secondKey).not.toBe(firstKey);

    await act(async () => {
      answers[1].resolve(passView());
      await drainMicrotasks();
    });
  });

  it('starts presses of different numbers together', async () => {
    const { result } = renderCapture({
      surface: surfaceOf([numberedSurfaces([17, 18])]),
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    const answers = [deferred<TimingPassView>(), deferred<TimingPassView>()];
    let callIndex = 0;
    vi.mocked(timingService.capturePass).mockImplementation(
      () => answers[callIndex++].promise,
    );

    await act(async () => {
      await Promise.all([
        result.current.commitNumber({
          startNumber: 17,
          capturedAt: '2026-11-13T09:00:01.000Z',
          monotonicMs: 1100,
        }),
        result.current.commitNumber({
          startNumber: 18,
          capturedAt: '2026-11-13T09:00:02.000Z',
          monotonicMs: 2100,
        }),
      ]);
    });

    await waitFor(() => {
      expect(timingService.capturePass).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      answers.forEach((answer) => answer.resolve(passView()));
      await drainMicrotasks();
    });
  });

  it('does not let a slow answer of one number hold another number', async () => {
    const { result } = renderCapture({
      surface: surfaceOf([numberedSurfaces([17, 18])]),
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    const slow = deferred<TimingPassView>();
    const fast = deferred<TimingPassView>();
    vi.mocked(timingService.capturePass)
      .mockImplementationOnce(() => slow.promise)
      .mockImplementationOnce(() => fast.promise);

    await act(async () => {
      await Promise.all([
        result.current.commitNumber({
          startNumber: 17,
          capturedAt: '2026-11-13T09:00:01.000Z',
          monotonicMs: 1100,
        }),
        result.current.commitNumber({
          startNumber: 18,
          capturedAt: '2026-11-13T09:00:02.000Z',
          monotonicMs: 2100,
        }),
      ]);
    });

    await waitFor(() => {
      expect(timingService.capturePass).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      fast.resolve(passView());
      await drainMicrotasks();
    });

    const queue = await openTimingQueue();
    const startNumberOf = (item: TimingQueueItem): number | undefined => {
      const payload = item.payload as CaptureTimingPassRequest;
      return payload.startNumber;
    };
    await waitFor(async () => {
      const items = await queue.list('attempt-burst');
      expect(
        items.find((item) => startNumberOf(item) === 18)?.status,
      ).toBe('APPLIED');
      expect(items.find((item) => startNumberOf(item) === 17)?.status).toBe(
        'SENT',
      );
    });

    await act(async () => {
      slow.resolve(passView());
      await drainMicrotasks();
    });
  });

  it('retries a lost answer only after the backoff and never as a refusal', async () => {
    vi.useFakeTimers();
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-retry' })]),
    });
    await act(async () => {
      await drainMicrotasks();
    });

    vi.mocked(timingService.capturePass)
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValue(passView());

    await act(async () => {
      void result.current.commitNumber({
        startNumber: 17,
        capturedAt: '2026-11-13T09:00:01.000Z',
        monotonicMs: 1500,
      });
      await drainMicrotasks();
    });

    const queue = await openTimingQueue();
    const items = await queue.list('attempt-retry');
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('PENDING');
    expect(timingService.capturePass).toHaveBeenCalledTimes(1);
    expect(
      result.current.captureOutcomes?.some((event) => event.tone === 'refused'),
    ).toBe(false);
    expect(
      result.current.captureOutcomes?.filter((event) => event.tone === 'unsent'),
    ).toHaveLength(1);

    await act(async () => {
      await result.current.flush();
      await drainMicrotasks();
    });
    expect(timingService.capturePass).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CAPTURE_RETRY_BACKOFF_MS - 1);
      await drainMicrotasks();
    });
    expect(timingService.capturePass).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await drainMicrotasks();
    });
    expect(timingService.capturePass).toHaveBeenCalledTimes(2);
    await act(async () => {
      await drainMicrotasks();
    });
    const [confirmed] = await queue.list('attempt-retry');
    expect(confirmed.status).toBe('APPLIED');
  });

  it('keeps the coded in-progress 409 pending, unreported and retryable', async () => {
    vi.useFakeTimers();
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-in-progress' })]),
    });
    await act(async () => {
      await drainMicrotasks();
    });

    vi.mocked(timingService.capturePass)
      .mockRejectedValueOnce(inProgressRefusal())
      .mockResolvedValue(passView());

    await act(async () => {
      void result.current.commitNumber({
        startNumber: 17,
        capturedAt: '2026-11-13T09:00:01.000Z',
        monotonicMs: 1500,
      });
      await drainMicrotasks();
    });

    const queue = await openTimingQueue();
    const items = await queue.list('attempt-in-progress');
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('PENDING');
    expect(timingService.capturePass).toHaveBeenCalledTimes(1);
    expect(
      result.current.captureOutcomes?.some((event) => event.tone === 'refused'),
    ).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(CAPTURE_RETRY_BACKOFF_MS);
      await drainMicrotasks();
    });
    expect(timingService.capturePass).toHaveBeenCalledTimes(2);
    await act(async () => {
      await drainMicrotasks();
    });
    const [confirmed] = await queue.list('attempt-in-progress');
    expect(confirmed.status).toBe('APPLIED');
  });

  it('keeps the answer of a press whose caller already resolved ACCEPTED', async () => {
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-feed' })]),
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    const answer = deferred<TimingPassView>();
    vi.mocked(timingService.capturePass).mockImplementation(
      () => answer.promise,
    );

    let outcome: TimingCaptureOutcome | undefined;
    await act(async () => {
      outcome = await result.current.commitNumber({
        startNumber: 17,
        capturedAt: '2026-11-13T09:00:01.000Z',
        monotonicMs: 1500,
      });
    });
    expect(outcome).toEqual({ status: 'ACCEPTED' });
    expect(result.current.captureOutcomes).toEqual([]);

    await act(async () => {
      answer.resolve(passView());
      await drainMicrotasks();
    });
    await waitFor(() => {
      expect(result.current.captureOutcomes).toEqual([
        expect.objectContaining({ subject: '№ 17', tone: 'confirmed' }),
      ]);
    });
  });

  it('runs one surface invalidation at a time and exactly one trailing refresh', async () => {
    const { result, client } = renderCapture({
      surface: surfaceOf([numberedSurfaces([17, 18])]),
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    const firstInvalidation = deferred<void>();
    let invalidations = 0;
    const spy = vi
      .spyOn(client, 'invalidateQueries')
      .mockImplementation(() => {
        invalidations += 1;
        return invalidations === 1
          ? firstInvalidation.promise
          : Promise.resolve();
      });

    const answers = deferred<void>();
    vi.mocked(timingService.capturePass).mockImplementation(() =>
      answers.promise.then(() => passView()),
    );

    await act(async () => {
      await Promise.all([
        result.current.commitNumber({
          startNumber: 17,
          capturedAt: '2026-11-13T09:00:01.000Z',
          monotonicMs: 1100,
        }),
        result.current.commitNumber({
          startNumber: 18,
          capturedAt: '2026-11-13T09:00:02.000Z',
          monotonicMs: 2100,
        }),
      ]);
    });
    await waitFor(() => {
      expect(timingService.capturePass).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      answers.resolve();
      await drainMicrotasks();
    });
    await waitFor(() => {
      expect(invalidations).toBe(1);
    });

    await act(async () => {
      firstInvalidation.resolve();
      await drainMicrotasks();
    });
    await waitFor(() => {
      expect(invalidations).toBe(2);
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('counts queued records and in-chain acceptances per attempt only', async () => {
    const epoch = deferred<TimingClockEpochView>();
    vi.mocked(timingService.openClockEpoch).mockImplementation(
      () => epoch.promise,
    );
    const { result } = renderCapture({
      surface: surfaceOf([numberedSurfaces([17])]),
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    const queue = await openTimingQueue();
    await queue.enqueue(queuedPass('key-other-attempt', 1, 'attempt-b', 18));
    await act(async () => {
      await result.current.refreshQueue();
    });

    const answers = deferred<void>();
    vi.mocked(timingService.capturePass).mockImplementation(() =>
      answers.promise.then(() => passView()),
    );

    let presses: Promise<TimingCaptureOutcome>[] = [];
    await act(async () => {
      presses = [
        result.current.commitNumber({
          startNumber: 17,
          capturedAt: '2026-11-13T09:00:01.000Z',
          monotonicMs: 1100,
        }),
        result.current.commitNumber({
          startNumber: 17,
          capturedAt: '2026-11-13T09:00:02.000Z',
          monotonicMs: 2100,
        }),
      ];
      await drainMicrotasks();
    });

    await waitFor(() => {
      expect(result.current.unresolvedByAttempt?.['attempt-burst']).toBe(2);
      expect(result.current.unresolvedByAttempt?.['attempt-b']).toBe(1);
    });

    await act(async () => {
      epoch.resolve(epochView('attempt-burst'));
      await Promise.all(presses);
    });

    await waitFor(() => {
      expect(result.current.unresolvedByAttempt?.['attempt-burst']).toBe(2);
      expect(result.current.unresolvedByAttempt?.['attempt-b']).toBe(1);
    });

    await act(async () => {
      answers.resolve();
      await drainMicrotasks();
    });
    await waitFor(() => {
      expect(result.current.unresolvedByAttempt?.['attempt-burst']).toBe(
        undefined,
      );
      expect(result.current.unresolvedByAttempt?.['attempt-b']).toBe(undefined);
    });
  });
});

describe('useTimingCapture pending finishes and completion', () => {
  it('takes the next sequence for a bind and an undo', async () => {
    const { result } = renderCapture({
      surface: surfaceOf([
        runningBlock({
          attemptId: 'attempt-pending',
          pendingFinishes: [pendingFinish({ attemptId: 'attempt-pending' })],
        }),
      ]),
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.commitNumber({
        startNumber: 17,
        capturedAt: '2026-11-13T09:00:01.000Z',
        monotonicMs: 1400,
      });
      await result.current.bindPending('pending-1', 17);
      await result.current.quickUndo('attempt-pending');
    });

    const bindCall = vi.mocked(timingService.bindPendingFinish).mock.calls[0];
    expect(bindCall[0]).toBe('event-1');
    expect(bindCall[1]).toBe('pending-1');
    expect(bindCall[2]).toEqual({
      pendingFinishId: 'pending-1',
      startNumber: 17,
      workstationInstanceId: 'ws-1',
      deviceSequence: 2,
    });
    expect(typeof bindCall[3]).toBe('string');

    const undoCall = vi.mocked(timingService.quickUndo).mock.calls[0];
    expect(undoCall[0]).toBe('event-1');
    expect(undoCall[1]).toBe('attempt-pending');
    expect(undoCall[2]).toEqual({
      workstationInstanceId: 'ws-1',
      deviceSequence: 3,
    });
    expect(typeof undoCall[3]).toBe('string');

    const queue = await openTimingQueue();
    const items = await queue.list('attempt-pending');
    expect(items.map((item) => [item.operation, item.status])).toEqual([
      ['PASS', 'APPLIED'],
      ['BIND', 'APPLIED'],
      ['UNDO', 'APPLIED'],
    ]);
  });

  it('completes with the highest sequence the queue issued', async () => {
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-complete' })]),
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.commitNumber({
        startNumber: 17,
        capturedAt: '2026-11-13T09:00:01.000Z',
        monotonicMs: 1200,
      });
      await result.current.commitNumber({
        startNumber: 17,
        capturedAt: '2026-11-13T09:00:02.000Z',
        monotonicMs: 2200,
      });
      await result.current.complete('attempt-complete');
    });

    expect(timingService.completeAttempt).toHaveBeenCalledWith(
      'event-1',
      'attempt-complete',
      { workstationInstanceId: 'ws-1', lastIssuedSequence: 2 },
      expect.any(String),
    );
  });

  it('starts an attempt and anchors its returned epoch', async () => {
    const onError = vi.fn();
    const { result } = renderCapture({
      surface: surfaceOf([
        runningBlock({ attemptId: null, state: 'NOT_STARTED', startControlEnabled: true }),
      ]),
      onError,
    });

    monotonicNow = 2500;
    await act(async () => {
      await result.current.startAttempt(
        runningBlock({ attemptId: null, state: 'NOT_STARTED', startControlEnabled: true }),
      );
    });

    expect(timingService.startAttempt).toHaveBeenCalledWith(
      'event-1',
      {
        startId: 'start-a',
        formatId: 1,
        gender: 'M',
        workstationInstanceId: 'ws-1',
        clientStartedAt: expect.any(String),
      },
      expect.any(String),
    );
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('useTimingCapture anonymous splits', () => {
  it('captures a split with the attempt epoch and the next sequence, and no participant', async () => {
    const onError = vi.fn();
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-anon-capture' })]),
      onError,
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    monotonicNow = 2500;
    await act(async () => {
      await result.current.captureAnonymous();
    });

    expect(timingService.captureAnonymousSplit).toHaveBeenCalledTimes(1);
    expect(timingService.capturePass).not.toHaveBeenCalled();
    const [eventId, payload, key] = vi.mocked(
      timingService.captureAnonymousSplit,
    ).mock.calls[0];
    expect(eventId).toBe('event-1');
    expect(payload).toEqual({
      kind: 'ANONYMOUS_SPLIT',
      clientCapturedAt: expect.any(String),
      clientElapsedMs: 2500,
      clockEpochId: 'epoch-attempt-anon-capture',
      workstationInstanceId: 'ws-1',
      deviceSequence: 1,
    });
    expect(payload).not.toHaveProperty('startNumber');
    expect(payload).not.toHaveProperty('enrollmentId');
    expect(typeof key).toBe('string');

    const queue = await openTimingQueue();
    const items = await queue.list('event:event-1');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: key,
      operation: 'PASS',
      status: 'APPLIED',
      deviceSequence: 1,
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('assigns a queued split with the sequence of its own attempt', async () => {
    const onError = vi.fn();
    const { result } = renderCapture({
      surface: surfaceWithQueue('attempt-anon-assign', [
        anonymousSplit({
          splitId: 'split-assign',
          attemptId: 'attempt-anon-assign',
        }),
      ]),
      onError,
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.assignAnonymousSplit('split-assign', 17);
    });

    const call = vi.mocked(timingService.assignAnonymousSplit).mock.calls[0];
    expect(call[0]).toBe('event-1');
    expect(call[1]).toBe('split-assign');
    expect(call[2]).toMatchObject({
      startNumber: 17,
      workstationInstanceId: 'ws-1',
    });
    expect(call[2].deviceSequence).toBeGreaterThan(0);
    expect(typeof call[3]).toBe('string');

    const queue = await openTimingQueue();
    const items = await queue.list('event:event-1');
    expect(items.map((item) => [item.operation, item.status])).toEqual([
      ['ANONYMOUS_ASSIGN', 'APPLIED'],
    ]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps a refused assignment in the queue with the API message', async () => {
    const onError = vi.fn();
    vi.mocked(timingService.assignAnonymousSplit).mockRejectedValue(
      apiRefusal('Отсечка уже назначена'),
    );
    const { result } = renderCapture({
      surface: surfaceWithQueue('attempt-anon-refused', [
        anonymousSplit({
          splitId: 'split-refused',
          attemptId: 'attempt-anon-refused',
        }),
      ]),
      onError,
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    let outcome: TimingCaptureOutcome | undefined;
    await act(async () => {
      outcome = await result.current.assignAnonymousSplit('split-refused', 17);
    });

    expect(outcome).toEqual({ status: 'ACCEPTED' });
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Отсечка уже назначена');
    });
    const queue = await openTimingQueue();
    await expect(queue.list('event:event-1')).resolves.toEqual([]);
    expect(result.current.queueItems).toEqual([]);
    expect(result.current.captureOutcomes).toEqual([
      expect.objectContaining({
        tone: 'refused',
        reason: 'Отсечка уже назначена',
      }),
    ]);
  });

  it('cancels a queued split with a reason and takes no sequence', async () => {
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-anon-cancel' })]),
    });

    await act(async () => {
      await result.current.cancelAnonymousSplit(
        'split-cancel',
        'Отсечка не относится к заезду',
      );
    });

    expect(timingService.cancelAnonymousSplit).toHaveBeenCalledWith(
      'event-1',
      'split-cancel',
      { reason: 'Отсечка не относится к заезду' },
    );
    const queue = await openTimingQueue();
    await expect(
      queue.lastSequence('attempt-anon-cancel', 'ws-1'),
    ).resolves.toBe(0);
  });

  it('keeps an unanswered anonymous capture queued after acceptance', async () => {
    const onError = vi.fn();
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-anon-offline' })]),
      onError,
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    vi.mocked(timingService.captureAnonymousSplit).mockRejectedValueOnce(
      new Error('Network Error'),
    );
    let outcome: TimingCaptureOutcome | undefined;
    await act(async () => {
      outcome = await result.current.captureAnonymous();
    });

    expect(outcome).toEqual({ status: 'ACCEPTED' });
    expect(onError).not.toHaveBeenCalled();
    const queue = await openTimingQueue();
    await waitFor(async () => {
      const [queued] = await queue.list('event:event-1');
      expect(queued).toMatchObject({ operation: 'PASS', status: 'PENDING' });
    });
  });

  it('replays an anonymous capture and an assignment with their stored payloads', async () => {
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-anon-flush' })]),
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    const queue = await openTimingQueue();
    await queue.enqueue(
      queuedAnonymousCapture('key-flush-anon', 'attempt-anon-flush', 1),
    );
    await queue.enqueue(
      queuedAssignment('key-flush-assign', 'attempt-anon-flush', 'split-flush', 2),
    );

    await act(async () => {
      await result.current.flush();
    });

    expect(timingService.captureAnonymousSplit).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({ kind: 'ANONYMOUS_SPLIT', deviceSequence: 1 }),
      'key-flush-anon',
    );
    expect(timingService.assignAnonymousSplit).toHaveBeenCalledWith(
      'event-1',
      'split-flush',
      { startNumber: 17, workstationInstanceId: 'ws-1', deviceSequence: 2 },
      'key-flush-assign',
    );
    const items = await queue.list('attempt-anon-flush');
    expect(items.map((item) => item.status)).toEqual(['APPLIED', 'APPLIED']);
  });
});

describe('useTimingCapture heat start', () => {
  it('starts a heat block on the heat route and anchors its epoch', async () => {
    const onError = vi.fn();
    const heatBlock = runningBlock({
      attemptId: null,
      state: 'NOT_STARTED',
      startControlEnabled: true,
      kind: 'HEAT',
      blockKey: 'M:race-1:stage-1:heat-1',
      classCompetitionId: 'race-1',
      stageId: 'stage-1',
      stageLabel: 'Круг 1',
      stageState: 'SEEDED',
      heatNumber: 1,
      heatLabel: 'Заезд 1',
    });
    const { result } = renderCapture({
      surface: surfaceOf([heatBlock]),
      onError,
    });

    await act(async () => {
      await result.current.startAttempt(heatBlock);
    });

    expect(timingService.startHeatAttempt).toHaveBeenCalledWith(
      'event-1',
      {
        classCompetitionId: 'race-1',
        stageId: 'stage-1',
        heatNumber: 1,
        workstationInstanceId: 'ws-1',
        clientStartedAt: expect.any(String),
      },
      expect.any(String),
    );
    expect(timingService.startAttempt).not.toHaveBeenCalled();

    expect(onError).not.toHaveBeenCalled();
  });
});

describe('useTimingCapture flush', () => {
  it('delivers unsynced items in order and keeps a lost answer recorded', async () => {
    const onError = vi.fn();
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock()]),
      onError,
    });

    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });

    const queue = await openTimingQueue();
    await queue.enqueue(queuedPass('key-replay-a', 1));
    await queue.enqueue(queuedPass('key-replay-b', 2));
    vi.mocked(timingService.capturePass)
      .mockResolvedValueOnce(passView())
      .mockRejectedValueOnce(new Error('Network Error'));

    await act(async () => {
      await result.current.flush();
    });

    expect(timingService.capturePass).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(timingService.capturePass).mock.calls;
    expect(calls[0][0]).toBe('event-1');
    expect(calls[0][1]).toEqual(queuedPass('key-replay-a', 1).payload);
    expect(calls[0][2]).toBe('key-replay-a');
    expect(calls[1][2]).toBe('key-replay-b');

    const items = await queue.list('attempt-a');
    expect(items.map((item) => item.status)).toEqual(['APPLIED', 'PENDING']);
    // A lost answer is not a refusal: it stays recorded for a later delivery.
    expect(onError).not.toHaveBeenCalled();
    expect(
      result.current.captureOutcomes?.some((event) => event.tone === 'refused'),
    ).toBe(false);
    expect(result.current.pendingCount).toBe(1);
  });
});

describe('useTimingCapture offline outcomes', () => {
  it('accepts an unanswered number, turns the connection state off and confirms it after the backoff', async () => {
    const onError = vi.fn();
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-unsent' })]),
      onError,
    });

    await waitFor(() => {
      expect(result.current.isFlushing).toBe(false);
    });
    expect(result.current.isOnline).toBe(true);

    vi.mocked(timingService.capturePass).mockRejectedValueOnce(
      new Error('Network Error'),
    );

    let outcome: TimingCaptureOutcome | undefined;
    await act(async () => {
      // The promise resolves, so the field may clear on the press itself.
      outcome = await result.current.commitNumber({
        startNumber: 17,
        capturedAt: '2026-11-13T09:00:01.000Z',
        monotonicMs: 1500,
      });
    });

    expect(outcome).toEqual({ status: 'ACCEPTED' });
    expect(onError).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.isOnline).toBe(false);
      expect(result.current.queueItems).toHaveLength(1);
      expect(result.current.queueItems[0].status).toBe('PENDING');
    });
    expect(result.current.pendingCount).toBe(1);
    expect(
      result.current.captureOutcomes?.filter((event) => event.tone === 'unsent'),
    ).toHaveLength(1);

    // A later send after the backoff that does get an answer turns the state on.
    await new Promise((resolve) =>
      setTimeout(resolve, CAPTURE_RETRY_BACKOFF_MS + 20),
    );
    await act(async () => {
      await result.current.sendNow();
    });

    await waitFor(() => {
      expect(result.current.isOnline).toBe(true);
      expect(result.current.pendingCount).toBe(0);
    });
    const queue = await openTimingQueue();
    const [confirmed] = await queue.list('attempt-unsent');
    expect(confirmed.status).toBe('APPLIED');
  });

  it('accepts a confirmed number and exposes the answer in the outcome feed', async () => {
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-confirmed' })]),
    });

    await waitFor(() => {
      expect(result.current.isFlushing).toBe(false);
    });

    let outcome: TimingCaptureOutcome | undefined;
    await act(async () => {
      outcome = await result.current.commitNumber({
        startNumber: 17,
        capturedAt: '2026-11-13T09:00:01.000Z',
        monotonicMs: 1500,
      });
    });

    expect(outcome).toEqual({ status: 'ACCEPTED' });
    await waitFor(() => {
      expect(result.current.queueItems.map((entry) => entry.status)).toEqual([
        'APPLIED',
      ]);
    });
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.captureOutcomes).toEqual([
      expect.objectContaining({ id: expect.any(String), subject: '№ 17', tone: 'confirmed' }),
    ]);
  });
});

describe('useTimingCapture outbox exposure', () => {
  it('exposes every outbox item and reads it again on refresh', async () => {
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-queue' })]),
    });

    await waitFor(() => {
      expect(result.current.isFlushing).toBe(false);
    });
    expect(result.current.queueItems).toEqual([]);
    expect(result.current.pendingCount).toBe(0);

    const queue = await openTimingQueue();
    await queue.enqueue(queuedPass('key-exposed', 1, 'attempt-queue'));

    await act(async () => {
      await result.current.refreshQueue();
    });

    expect(result.current.queueItems).toHaveLength(1);
    expect(result.current.queueItems[0]).toMatchObject({
      id: 'key-exposed',
      operation: 'PASS',
      status: 'PENDING',
      deviceSequence: 1,
    });
    expect(result.current.pendingCount).toBe(1);
  });
});

describe('useTimingCapture send now', () => {
  it('sends every unsent entry in press order and stops at the first lost answer', async () => {
    const onError = vi.fn();
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock()]),
      onError,
    });

    await waitFor(() => {
      expect(result.current.isFlushing).toBe(false);
    });

    const queue = await openTimingQueue();
    await queue.enqueue(queuedPass('key-order-a', 1));
    await queue.enqueue(queuedPass('key-order-b', 2));
    await queue.enqueue(queuedPass('key-order-c', 3));
    await act(async () => {
      await result.current.refreshQueue();
    });
    expect(result.current.pendingCount).toBe(3);

    vi.mocked(timingService.capturePass)
      .mockResolvedValueOnce(passView())
      .mockResolvedValueOnce(passView())
      .mockRejectedValueOnce(new Error('Network Error'));

    await act(async () => {
      await result.current.sendNow();
    });

    expect(
      vi.mocked(timingService.capturePass).mock.calls.map((call) => call[2]),
    ).toEqual(['key-order-a', 'key-order-b', 'key-order-c']);

    const items = await queue.list('attempt-a');
    expect(items.map((entry) => entry.status)).toEqual([
      'APPLIED',
      'APPLIED',
      'PENDING',
    ]);
    expect(result.current.queueItems.map((entry) => entry.status)).toEqual([
      'APPLIED',
      'APPLIED',
      'PENDING',
    ]);
    expect(result.current.pendingCount).toBe(1);
    expect(result.current.isOnline).toBe(false);
    expect(result.current.isFlushing).toBe(false);
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('useTimingCapture refused entries', () => {
  it('purges a refused entry on refresh and keeps only the unsent one', async () => {
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock()]),
    });

    await waitFor(() => {
      expect(result.current.isFlushing).toBe(false);
    });

    const queue = await openTimingQueue();
    await queue.enqueue(queuedPass('key-rejected', 1));
    await queue.enqueue(queuedPass('key-pending', 2));
    await queue.mark('key-rejected', 'REJECTED', 'Заезд уже закрыт');
    await act(async () => {
      await result.current.refreshQueue();
    });

    await expect(queue.list('attempt-a')).resolves.toEqual([
      expect.objectContaining({ id: 'key-pending', status: 'PENDING' }),
    ]);
    expect(result.current.queueItems.map((entry) => entry.id)).toEqual([
      'key-pending',
    ]);
    expect(result.current.pendingCount).toBe(1);
    expect(timingService.capturePass).not.toHaveBeenCalled();
    expect(timingService.quickUndo).not.toHaveBeenCalled();
    expect(timingService.completeAttempt).not.toHaveBeenCalled();
  });
});

describe('useTimingCapture durability', () => {
  it('reads a durable outbox until the first queue read and the volatile truth after it', async () => {
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-volatile' })]),
    });

    // Until the queue answers, the surface keeps the online behavior unchanged
    // instead of guessing from `typeof indexedDB` (FR-30).
    expect(result.current.isDurable).toBe(true);

    await waitFor(() => {
      expect(result.current.isDurable).toBe(false);
    });

    // jsdom has no IndexedDB, so the queue resolved its memory fallback: a
    // later read reports the same storage and never flips back (FR-30).
    const queue = await openTimingQueue();
    expect(queue.isDurable).toBe(false);
    await queue.enqueue(queuedPass('key-volatile', 1, 'attempt-volatile'));
    await act(async () => {
      await result.current.refreshQueue();
    });

    expect(result.current.pendingCount).toBe(1);
    expect(result.current.isDurable).toBe(false);
  });
});

describe('useTimingCapture connection restoration', () => {
  it('sends the unsent queue when the browser returns online', async () => {
    navigatorOnline = false;
    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-online' })]),
    });

    await waitFor(() => {
      expect(result.current.isFlushing).toBe(false);
    });
    expect(result.current.isOnline).toBe(false);

    const queue = await openTimingQueue();
    await queue.enqueue(queuedPass('key-online', 1, 'attempt-online'));
    await act(async () => {
      await result.current.refreshQueue();
    });
    expect(result.current.pendingCount).toBe(1);

    navigatorOnline = true;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(result.current.queueItems.map((entry) => entry.status)).toEqual([
        'APPLIED',
      ]);
    });

    expect(result.current.isOnline).toBe(true);
    expect(result.current.pendingCount).toBe(0);
    const [item] = await queue.list('attempt-online');
    expect(item.status).toBe('APPLIED');
  });
});

describe('useTimingCapture offline start', () => {
  function notStartedBlock(): TimingCategoryBlockView {
    return runningBlock({
      attemptId: null,
      state: 'NOT_STARTED',
      officialStartedAt: null,
      elapsedMs: null,
      startControlEnabled: true,
      blockKey: 'category-block',
      participants: [participant()],
    });
  }

  it('records a local Start and delivers it before its captures, splits and assignments', async () => {
    navigatorOnline = false;
    const onError = vi.fn();
    const { result } = renderCapture({
      surface: surfaceOf([notStartedBlock()]),
      onError,
    });

    await waitFor(() => {
      expect(result.current.isFlushing).toBe(false);
    });

    const block = notStartedBlock();
    await act(async () => {
      await result.current.startAttempt(block);
    });

    // The press is local: no Start request leaves the device.
    expect(timingService.startAttempt).not.toHaveBeenCalled();
    expect(timingService.startOfflineAttempt).not.toHaveBeenCalled();

    const queue = await openTimingQueue();
    const started = await queue.list();
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      operation: 'START',
      status: 'PENDING',
    });
    const startPayload = started[0].payload as StartOfflineTimingAttemptRequest;
    const localAttemptId = startPayload.localAttemptId;
    const localEpochId = startPayload.localClockEpochId;
    expect(started[0].attemptId).toBe(localAttemptId);
    expect(startPayload.roster).toEqual([
      {
        enrollmentId: 'enrollment-1',
        registrationId: 'registration-1',
        startNumber: 17,
        sectionId: 'Мужчины 24–40',
        requiredLaps: 3,
        excludedReason: null,
      },
    ]);
    expect(started[0].localRoster?.[0].fullName).toBe('Иван Петров');

    // The merged surface shows the running local block with its frozen roster.
    const localBlock = result.current.mergedSurface?.categories[0];
    expect(localBlock).toMatchObject({
      state: 'RUNNING',
      local: true,
      attemptId: localAttemptId,
      localAttemptId,
      localClockEpochId: localEpochId,
      startControlEnabled: false,
    });
    expect(localBlock?.officialStartedAt).toBe(startPayload.officialStartedAt);

    // A number press is anchored to the local press instant, not to a server
    // epoch, so its elapsed value is stable across the mapping.
    monotonicNow = 4000;
    await act(async () => {
      await result.current.commitNumber({
        startNumber: 17,
        capturedAt: new Date(Date.parse(startPayload.officialStartedAt) + 3000)
          .toISOString(),
        monotonicMs: 4000,
      });
    });
    const afterPass = (await queue.list()).filter(
      (item) => item.operation === 'PASS',
    );
    expect(afterPass).toHaveLength(1);
    expect(afterPass[0].payload).toMatchObject({
      attemptId: localAttemptId,
      clockEpochId: localEpochId,
      clientElapsedMs: 3000,
    });

    await act(async () => {
      await result.current.captureAnonymous();
    });
    const splitRow = result.current.mergedSurface?.anonymousSplits?.find(
      (split) => split.localSplitId !== undefined,
    );
    expect(splitRow).toMatchObject({
      unsent: true,
      sending: false,
      assigned: false,
    });
    expect(splitRow?.candidates?.map((candidate) => candidate.attemptId)).toEqual(
      [localAttemptId],
    );
    expect(result.current.localSplits?.localUnassignedCount).toBe(1);

    await act(async () => {
      await result.current.assignAnonymousSplit(
        splitRow?.splitId ?? '',
        17,
        localAttemptId,
      );
    });
    expect(result.current.localSplits?.localUnassignedCount).toBe(0);

    const before = await queue.list();
    const splitItem = before.find(
      (item) =>
        item.operation === 'PASS' &&
        (item.payload as CaptureTimingPassRequest).kind === 'ANONYMOUS_SPLIT',
    );
    expect(splitItem?.localAnchorAttemptId).toBe(localAttemptId);
    expect(
      (splitItem?.payload as CaptureTimingPassRequest).clockEpochId,
    ).toBe(localEpochId);

    // Reconnection: the Start is created from the snapshot and answers with the
    // server attempt and epoch; the mapping then rewrites the dependents.
    vi.mocked(timingService.startOfflineAttempt).mockResolvedValue({
      attempt: runningBlock({ attemptId: 'server-attempt' }),
      epoch: epochView('server-attempt'),
    });
    await act(async () => {
      navigatorOnline = true;
      window.dispatchEvent(new Event('online'));
    });

    await act(async () => {
      await result.current.sendNow();
    });

    expect(timingService.startOfflineAttempt).toHaveBeenCalledTimes(1);
    const [, sentPayload, startKey] = vi.mocked(
      timingService.startOfflineAttempt,
    ).mock.calls[0];
    expect(startKey).toBe(started[0].id);
    expect(sentPayload).toMatchObject({
      startId: 'start-a',
      formatId: 1,
      gender: 'M',
      officialStartedAt: startPayload.officialStartedAt,
      localAttemptId,
      localClockEpochId: localEpochId,
    });

    const order = [
      vi.mocked(timingService.startOfflineAttempt).mock.invocationCallOrder[0],
      vi.mocked(timingService.capturePass).mock.invocationCallOrder[0],
      vi.mocked(timingService.captureAnonymousSplit).mock
        .invocationCallOrder[0],
      vi.mocked(timingService.assignAnonymousSplitByCapture).mock
        .invocationCallOrder[0],
    ];
    expect(order).toEqual([...order].sort((left, right) => left - right));
    expect(order.every((value) => value !== undefined)).toBe(true);

    const passPayload = vi.mocked(timingService.capturePass).mock
      .calls[0][1] as CaptureTimingPassRequest;
    expect(passPayload).toMatchObject({
      attemptId: 'server-attempt',
      clientElapsedMs: 3000,
      clockEpochId: 'epoch-server-attempt',
      deviceSequence: 1,
    });

    const splitCall = vi.mocked(timingService.captureAnonymousSplit).mock
      .calls[0];
    expect(splitCall[1]).toMatchObject({
      kind: 'ANONYMOUS_SPLIT',
      clockEpochId: 'epoch-server-attempt',
    });

    const assignmentCall = vi.mocked(timingService.assignAnonymousSplitByCapture)
      .mock.calls[0];
    expect(assignmentCall[1]).toMatchObject({
      captureDeviceSequence: splitItem?.deviceSequence,
      startNumber: 17,
      chosenAttemptId: 'server-attempt',
    });

    const mapped = await queue.list();
    const mappedStart = mapped.find((item) => item.operation === 'START');
    expect(mappedStart).toMatchObject({
      status: 'APPLIED',
      serverAttemptId: 'server-attempt',
      serverClockEpochId: 'epoch-server-attempt',
    });
    expect(
      mapped
        .filter((item) => item.operation !== 'START')
        .every((item) => item.status === 'APPLIED'),
    ).toBe(true);
    expect(result.current.mergedSurface?.categories[0].local).toBeUndefined();
    expect(onError).not.toHaveBeenCalled();
  });

  it('discards a refused local attempt, keeps its split for deletion and sends neither', async () => {
    navigatorOnline = false;
    const onError = vi.fn();
    const { result } = renderCapture({
      surface: surfaceOf([notStartedBlock()]),
      onError,
    });

    await waitFor(() => {
      expect(result.current.isFlushing).toBe(false);
    });

    await act(async () => {
      await result.current.startAttempt(notStartedBlock());
    });
    const queue = await openTimingQueue();
    const started = await queue.list();
    const startPayload = started[0].payload as StartOfflineTimingAttemptRequest;
    const localAttemptId = startPayload.localAttemptId;

    monotonicNow = 4000;
    await act(async () => {
      await result.current.commitNumber({
        startNumber: 17,
        capturedAt: new Date(Date.parse(startPayload.officialStartedAt) + 3000)
          .toISOString(),
        monotonicMs: 4000,
      });
    });
    await act(async () => {
      await result.current.captureAnonymous();
    });
    const splitRow = result.current.mergedSurface?.anonymousSplits?.find(
      (split) => split.localSplitId !== undefined,
    );
    await act(async () => {
      await result.current.assignAnonymousSplit(
        splitRow?.splitId ?? '',
        17,
        localAttemptId,
      );
    });

    vi.mocked(timingService.startOfflineAttempt).mockRejectedValue(
      apiRefusal('Категория уже завершена.'),
    );
    await act(async () => {
      navigatorOnline = true;
      window.dispatchEvent(new Event('online'));
    });
    await act(async () => {
      await result.current.sendNow();
    });

    expect(onError).toHaveBeenCalledWith('Категория уже завершена.');
    expect(timingService.capturePass).not.toHaveBeenCalled();
    expect(timingService.captureAnonymousSplit).not.toHaveBeenCalled();
    expect(timingService.assignAnonymousSplitByCapture).not.toHaveBeenCalled();

    const afterRefusal = await queue.list();
    expect(
      afterRefusal.find((item) => item.operation === 'START'),
    ).toMatchObject({ status: 'REJECTED' });
    // The pass and undo of the refused attempt are gone; the event-scoped split
    // and its assignment stay for local deletion and are never sent.
    expect(
      afterRefusal.filter(
        (item) =>
          item.operation === 'PASS' &&
          (item.payload as CaptureTimingPassRequest).attemptId ===
            localAttemptId,
      ),
    ).toEqual([]);
    const keptSplit = afterRefusal.find(
      (item) =>
        item.operation === 'PASS' &&
        (item.payload as CaptureTimingPassRequest).kind === 'ANONYMOUS_SPLIT',
    );
    expect(keptSplit).toMatchObject({ status: 'PENDING' });
    // An assignment that chose the invalid attempt is discarded too.
    expect(
      afterRefusal.some((item) => item.operation === 'ANONYMOUS_ASSIGN'),
    ).toBe(false);

    // The local running block is gone; the split still shows on the queue.
    expect(result.current.mergedSurface?.categories[0].local).toBeUndefined();
    const keptRow = result.current.mergedSurface?.anonymousSplits?.find(
      (split) => split.localSplitId !== undefined,
    );
    expect(keptRow).toMatchObject({ unsent: true, sending: false });
    expect(result.current.localSplits?.localUnassignedCount).toBe(1);

    await act(async () => {
      await result.current.deleteLocalSplit?.(keptRow?.splitId ?? '');
    });
    const afterDelete = await queue.list();
    expect(
      afterDelete.some(
        (item) =>
          item.operation === 'PASS' &&
          (item.payload as CaptureTimingPassRequest).kind === 'ANONYMOUS_SPLIT',
      ),
    ).toBe(false);
    expect(
      afterDelete.some((item) => item.operation === 'ANONYMOUS_ASSIGN'),
    ).toBe(false);
    // With nothing left to hold, the refused-Start tombstone is dropped too.
    expect(
      afterDelete.some((item) => item.operation === 'START'),
    ).toBe(false);
    expect(result.current.mergedSurface?.anonymousSplits).toEqual([]);
  });
});
