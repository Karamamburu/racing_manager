import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../shared/api/ApiClient';
import type {
  AssignAnonymousSplitRequest,
  CancelAnonymousSplitRequest,
  CaptureTimingPassRequest,
  CompleteTimingAttemptRequest,
  CorrectOfficialTimeRequest,
  ForceReleaseCaptureRequest,
  StartHeatAttemptRequest,
  StartTimingAttemptRequest,
  TimingAnonymousSplitView,
  TimingAttemptRecordView,
  TimingCaptureView,
  TimingCategoryBlockView,
  TimingPassView,
} from './types';
import { timingService } from './timingService';

vi.mock('../../shared/api/ApiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patchResult: vi.fn(),
  },
}));

function blockView(): TimingCategoryBlockView {
  return {
    startId: 'start-1',
    formatId: 2,
    gender: 'F',
    state: 'RUNNING',
    lapCount: 3,
    attemptId: 'attempt-1',
    officialStartedAt: '2026-11-13T09:00:00.000Z',
    elapsedMs: 1500,
    startControlEnabled: false,
    blockReason: null,
    participants: [],
    pendingFinishes: [],
    lastAttempts: [],
  };
}

function passView(): TimingPassView {
  return {
    passId: 'pass-1',
    attemptId: 'attempt-1',
    enrollmentId: 'enrollment-1',
    lapNumber: 1,
    rawCapturedAt: '2026-11-13T09:00:01.500Z',
    officialAt: '2026-11-13T09:00:01.500Z',
    officialElapsedMs: 1500,
    status: 'BOUND',
  };
}

function attemptRecordView(): TimingAttemptRecordView {
  return {
    attemptId: 'attempt-1',
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
    workstationInstanceId: null,
    heldByUserId: null,
    heldAt: null,
  };
}

const START_REQUEST: StartTimingAttemptRequest = {
  startId: 'start-1',
  formatId: 2,
  gender: 'F',
  workstationInstanceId: 'ws-1',
  clientStartedAt: '2026-11-13T09:00:00.000Z',
};

const HEAT_START_REQUEST: StartHeatAttemptRequest = {
  classCompetitionId: 'race-1',
  stageId: 'stage-1',
  heatNumber: 2,
  workstationInstanceId: 'ws-1',
  clientStartedAt: '2026-11-13T09:10:00.000Z',
};

const PASS_REQUEST: CaptureTimingPassRequest = {
  attemptId: 'attempt-1',
  kind: 'NUMBER',
  startNumber: 17,
  clientCapturedAt: '2026-11-13T09:00:01.500Z',
  clientElapsedMs: 1500,
  clockEpochId: 'epoch-1',
  workstationInstanceId: 'ws-1',
  deviceSequence: 1,
};

const ANONYMOUS_PASS_REQUEST: CaptureTimingPassRequest = {
  attemptId: 'attempt-heat-1',
  kind: 'ANONYMOUS_SPLIT',
  clientCapturedAt: '2026-11-13T09:10:07.500Z',
  clientElapsedMs: 7500,
  clockEpochId: 'epoch-heat-1',
  workstationInstanceId: 'ws-1',
  deviceSequence: 4,
};

const ASSIGN_REQUEST: AssignAnonymousSplitRequest = {
  startNumber: 17,
  workstationInstanceId: 'ws-1',
  deviceSequence: 5,
};

const CANCEL_REQUEST: CancelAnonymousSplitRequest = {
  reason: 'Сплит не относится к заезду',
};

function splitView(): TimingAnonymousSplitView {
  return {
    splitId: 'split-1',
    attemptId: 'attempt-1',
    blockKey: 'CATEGORY_1:start-1',
    attemptLabel: 'Заезд 1',
    capturedAt: '2026-11-13T09:00:07.500Z',
    officialElapsedMs: 7500,
    status: 'QUEUED',
  };
}

const COMPLETE_REQUEST: CompleteTimingAttemptRequest = {
  workstationInstanceId: 'ws-1',
  lastIssuedSequence: 1,
};

const FORCE_RELEASE_REQUEST: ForceReleaseCaptureRequest = {
  workstationInstanceId: 'ws-1',
  reason: 'Ноутбук унесли',
};

describe('TimingService requests', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(apiClient.patchResult).mockReset();
  });

  it('POSTs the Start press with its idempotency key and returns the result', async () => {
    const result = {
      attempt: blockView(),
      epoch: {
        epochId: 'epoch-1',
        attemptId: 'attempt-1',
        officialElapsedAnchorMs: 0,
        serverNow: '2026-11-13T09:00:00.000Z',
      },
    };
    vi.mocked(apiClient.post).mockResolvedValue(result as never);

    await expect(
      timingService.startAttempt('event-1', START_REQUEST, 'key-start'),
    ).resolves.toBe(result);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/events/event-1/timing/attempts',
      START_REQUEST,
      { headers: { 'Idempotency-Key': 'key-start' } },
    );
  });

  it('POSTs a capture with the body untouched and its sequence-keyed header', async () => {
    const pass = passView();
    vi.mocked(apiClient.post).mockResolvedValue(pass as never);

    await expect(
      timingService.capturePass('event-1', PASS_REQUEST, 'key-pass'),
    ).resolves.toBe(pass);
    expect(apiClient.post).toHaveBeenCalledTimes(1);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/events/event-1/timing/passes',
      {
        attemptId: 'attempt-1',
        kind: 'NUMBER',
        startNumber: 17,
        clientCapturedAt: '2026-11-13T09:00:01.500Z',
        clientElapsedMs: 1500,
        clockEpochId: 'epoch-1',
        workstationInstanceId: 'ws-1',
        deviceSequence: 1,
      },
      { headers: { 'Idempotency-Key': 'key-pass' } },
    );
  });

  it('POSTs a heat Start to the heat route with its stage, heat and key', async () => {
    const result = {
      attempt: { ...blockView(), kind: 'HEAT', stageId: 'stage-1', heatNumber: 2 },
      epoch: {
        epochId: 'epoch-heat-1',
        attemptId: 'attempt-heat-1',
        officialElapsedAnchorMs: 0,
        serverNow: '2026-11-13T09:10:00.000Z',
      },
    };
    vi.mocked(apiClient.post).mockResolvedValue(result as never);

    await expect(
      timingService.startHeatAttempt('event-1', HEAT_START_REQUEST, 'key-heat'),
    ).resolves.toBe(result);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/events/event-1/timing/heat-attempts',
      HEAT_START_REQUEST,
      { headers: { 'Idempotency-Key': 'key-heat' } },
    );
  });

  it('POSTs an anonymous split on the pass route with no participant', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(passView() as never);

    await expect(
      timingService.captureAnonymousSplit(
        'event-1',
        ANONYMOUS_PASS_REQUEST,
        'key-split',
      ),
    ).resolves.toEqual(passView());
    expect(apiClient.post).toHaveBeenCalledWith(
      '/events/event-1/timing/passes',
      ANONYMOUS_PASS_REQUEST,
      { headers: { 'Idempotency-Key': 'key-split' } },
    );
    const body = vi.mocked(apiClient.post).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(body.kind).toBe('ANONYMOUS_SPLIT');
    expect(body).not.toHaveProperty('startNumber');
    expect(body).not.toHaveProperty('enrollmentId');
  });

  it('POSTs a split assignment to its own route with the replay header', async () => {
    vi.mocked(apiClient.post).mockResolvedValue(passView() as never);

    await expect(
      timingService.assignAnonymousSplit(
        'event-1',
        'split-1',
        ASSIGN_REQUEST,
        'key-assign',
      ),
    ).resolves.toEqual(passView());
    expect(apiClient.post).toHaveBeenCalledWith(
      '/events/event-1/timing/splits/split-1/assign',
      ASSIGN_REQUEST,
      { headers: { 'Idempotency-Key': 'key-assign' } },
    );
  });

  it('POSTs a split cancellation with a reason and no replay header', async () => {
    const split = splitView();
    vi.mocked(apiClient.post).mockResolvedValue(split as never);

    await expect(
      timingService.cancelAnonymousSplit('event-1', 'split-1', CANCEL_REQUEST),
    ).resolves.toBe(split);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/events/event-1/timing/splits/split-1/cancel',
      CANCEL_REQUEST,
    );
    expect(vi.mocked(apiClient.post).mock.calls[0]).toHaveLength(2);
  });

  it('POSTs completion of one attempt with the last issued sequence', async () => {
    const record = attemptRecordView();
    vi.mocked(apiClient.post).mockResolvedValue(record as never);

    await expect(
      timingService.completeAttempt(
        'event-1',
        'attempt-1',
        COMPLETE_REQUEST,
        'key-complete',
      ),
    ).resolves.toBe(record);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/events/event-1/timing/attempts/attempt-1/complete',
      COMPLETE_REQUEST,
      { headers: { 'Idempotency-Key': 'key-complete' } },
    );
  });

  it('POSTs a force-release without a replay header when no key is given', async () => {
    const capture = captureView();
    vi.mocked(apiClient.post).mockResolvedValue(capture as never);

    await expect(
      timingService.forceReleaseCapture('event-1', FORCE_RELEASE_REQUEST),
    ).resolves.toBe(capture);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/events/event-1/timing/capture/force-release',
      FORCE_RELEASE_REQUEST,
    );
    expect(vi.mocked(apiClient.post).mock.calls[0]).toHaveLength(2);
  });

  it('PATCHes an official-time correction and unwraps the pass view', async () => {
    const pass = passView();
    vi.mocked(apiClient.patchResult).mockResolvedValue({
      status: 200,
      data: pass,
    } as never);
    const payload: CorrectOfficialTimeRequest = {
      targetType: 'PASS',
      targetId: 'pass-1',
      officialAt: '2026-11-13T09:00:01.400Z',
      reason: 'Сдвиг ручного нажатия',
    };

    await expect(
      timingService.correctOfficialTime('event-1', 'pass-1', payload),
    ).resolves.toBe(pass);
    expect(apiClient.patchResult).toHaveBeenCalledWith(
      '/events/event-1/timing/passes/pass-1/official-time',
      payload,
    );
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('GETs the surface and one attempt record by path only', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      eventId: 'event-1',
      captureWorkstationInstanceId: 'ws-1',
      categories: [blockView()],
    } as never);

    await timingService.getSurface('event-1');
    expect(apiClient.get).toHaveBeenCalledWith('/events/event-1/timing');

    vi.mocked(apiClient.get).mockResolvedValue(attemptRecordView() as never);
    await timingService.getAttemptRecord('event-1', 'attempt-1');
    expect(apiClient.get).toHaveBeenCalledWith(
      '/events/event-1/timing/attempts/attempt-1',
    );
  });
});
