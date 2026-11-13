import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import type { AxiosResponse } from 'axios';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openTimingQueue } from './timingQueue';
import type { TimingQueueItem } from './timingQueue';
import { timingService } from './timingService';
import type {
  CaptureTimingPassRequest,
  TimingAttemptRecordView,
  TimingCaptureView,
  TimingCategoryBlockView,
  TimingClockEpochView,
  TimingParticipantTileView,
  TimingPassView,
  TimingSurfaceView,
} from './types';
import { useTimingCapture } from './useTimingCapture';

vi.mock('./timingService', () => ({
  timingService: {
    startAttempt: vi.fn(),
    openClockEpoch: vi.fn(),
    capturePass: vi.fn(),
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

function queuedPass(
  id: string,
  deviceSequence: number,
  attemptId = 'attempt-a',
): TimingQueueItem {
  const payload: CaptureTimingPassRequest = {
    attemptId,
    kind: 'NUMBER',
    startNumber: 17,
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

function renderCapture(initial: HookProps) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return renderHook(
    (props: HookProps) =>
      useTimingCapture('event-1', props.surface, 'ws-1', props.onError),
    { initialProps: initial, wrapper },
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  const queue = await openTimingQueue();
  await queue.clear();

  monotonicNow = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => monotonicNow);

  vi.mocked(timingService.openClockEpoch).mockImplementation(
    async (_eventId: string, attemptId: string) => epochView(attemptId),
  );
  vi.mocked(timingService.capturePass).mockResolvedValue(passView());
  vi.mocked(timingService.bindPendingFinish).mockResolvedValue(passView());
  vi.mocked(timingService.quickUndo).mockResolvedValue(
    passView({ status: 'CANCELLED' }),
  );
  vi.mocked(timingService.startAttempt).mockResolvedValue({
    attempt: runningBlock(),
    epoch: epochView('attempt-a'),
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
      new Error('Захват удерживает другая станция'),
    );

    const { result } = renderCapture({
      surface: surfaceOf([runningBlock({ attemptId: 'attempt-closed' })]),
      onError,
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Захват удерживает другая станция');
    });

    await act(async () => {
      await expect(
        result.current.commitNumber({
          startNumber: 17,
          capturedAt: '2026-11-13T09:00:01.000Z',
          monotonicMs: 1500,
        }),
      ).rejects.toThrow('Захват удерживает другая станция');
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

  it('keeps a refused commit in the queue with the API message', async () => {
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

    await act(async () => {
      await expect(
        result.current.commitNumber({
          startNumber: 17,
          capturedAt: '2026-11-13T09:00:01.000Z',
          monotonicMs: 1500,
        }),
      ).rejects.toThrow('Последний круг уже записан');
    });

    const queue = await openTimingQueue();
    const [item] = await queue.list('attempt-refused');
    expect(item.status).toBe('REJECTED');
    expect(item.error).toBe('Последний круг уже записан');
    expect(onError).toHaveBeenCalledWith('Последний круг уже записан');
  });

  it('keeps an unanswered commit queued and confirms it on a later flush', async () => {
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
    await act(async () => {
      await expect(
        result.current.commitNumber({
          startNumber: 17,
          capturedAt: '2026-11-13T09:00:01.000Z',
          monotonicMs: 1500,
        }),
      ).rejects.toThrow('Network Error');
    });

    const queue = await openTimingQueue();
    const [queued] = await queue.list('attempt-offline');
    expect(queued.status).toBe('PENDING');
    expect(onError).toHaveBeenCalledWith('Network Error');

    await act(async () => {
      await result.current.flush();
    });

    const [confirmed] = await queue.list('attempt-offline');
    expect(confirmed.id).toBe(queued.id);
    expect(confirmed.status).toBe('APPLIED');
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

describe('useTimingCapture flush', () => {
  it('replays unsynced items in order and stops at the first lost answer', async () => {
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
    expect(onError).toHaveBeenCalledTimes(1);
    expect(result.current.pendingCount).toBe(1);
  });
});
