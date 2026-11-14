import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import { useEventDetailsQuery } from '../../features/events/useEventDetailsQuery';
import { openTimingQueue } from '../../features/timing/timingQueue';
import { timingService } from '../../features/timing/timingService';
import type {
  CaptureTimingPassRequest,
  TimingAnonymousSplitView,
  TimingCategoryBlockView,
  TimingClockEpochView,
  TimingPassView,
  TimingStageGroupView,
  TimingSurfaceView,
} from '../../features/timing/types';
import type { EventDetails, StartResponse } from '../../shared/types/event';
import { TimingPage } from './index';

/**
 * The page against the real capture workflow.
 *
 * `TimingPage.spec.tsx` proves the wiring with a mocked `useTimingCapture`. This
 * suite keeps the real hook, the real memory outbox and the real rendering
 * components, and mocks only the HTTP service: it proves the surface still does
 * what the product promises when the page, the hook and the queue run together
 * (AD-2, AD-3, AD-17, AD-19).
 *
 * The suite is a separate file on purpose: the two mock setups must not see each
 * other, so neither suite can weaken the other.
 */

vi.mock('../../features/timing/timingService', () => ({
  timingService: {
    getSurface: vi.fn(),
    getAttemptRecord: vi.fn(),
    startAttempt: vi.fn(),
    startHeatAttempt: vi.fn(),
    openClockEpoch: vi.fn(),
    capturePass: vi.fn(),
    captureAnonymousSplit: vi.fn(),
    assignAnonymousSplit: vi.fn(),
    cancelAnonymousSplit: vi.fn(),
    undoAnonymousSplit: vi.fn(),
    bindPendingFinish: vi.fn(),
    cancelPendingFinish: vi.fn(),
    correctOfficialTime: vi.fn(),
    cancelPass: vi.fn(),
    rebindPass: vi.fn(),
    quickUndo: vi.fn(),
    completeAttempt: vi.fn(),
    forceCompleteAttempt: vi.fn(),
    cancelAttempt: vi.fn(),
    takeCapture: vi.fn(),
    transferCapture: vi.fn(),
    forceReleaseCapture: vi.fn(),
  },
}));

vi.mock('../../features/auth/useSessionQuery', () => ({
  useSessionQuery: vi.fn(),
}));

vi.mock('../../features/events/useEventDetailsQuery', () => ({
  useEventDetailsQuery: vi.fn(),
  eventDetailsQueryKey: vi.fn(),
}));

const getSurface = vi.mocked(timingService.getSurface);

/**
 * The pinned local clock of every scenario: a running block advances only when
 * the scenario says it does, so no elapsed assertion depends on wall time.
 */
let monotonicNow = 1000;

const RUNNING_START = '2026-11-13T09:00:00.000Z';

function start(overrides: Partial<StartResponse> = {}): StartResponse {
  return {
    id: 'start-a',
    purposeType: 'CUP_RACE',
    formatIds: [1],
    lapCount: 5,
    lapLengthMeters: 2000,
    displayName: null,
    sortOrder: 0,
    resolvedLabel: 'Кубковая гонка — 10 км',
    legacyEffectiveDistanceM: null,
    displayedDistanceMeters: 10000,
    ...overrides,
  };
}

function eventDetails(): EventDetails {
  return {
    id: 'event-1',
    name: 'Кубок города',
    eventType: 'RACE',
    sport: 'RUN',
    eventDate: '2026-11-13T09:00:00.000Z',
    distanceKm: null,
    description: null,
    mapLink: null,
    registrationOpen: null,
    registrationClose: null,
    status: 'IN_PROGRESS',
    createdAt: '2026-11-01T09:00:00.000Z',
    updatedAt: '2026-11-01T09:00:00.000Z',
    track: { id: 'track-1', name: 'Трасса', locationCity: null, mapLink: null },
    createdBy: null,
    formats: [{ id: 1, code: '5K', name: '5 км', sortOrder: 1 }],
    laps: [],
    starts: [start()],
    registrations: null,
    registeredCount: 1,
    finishedCategories: [],
  };
}

function block(
  overrides: Partial<TimingCategoryBlockView> = {},
): TimingCategoryBlockView {
  return {
    startId: 'start-a',
    formatId: 1,
    gender: 'M',
    state: 'NOT_STARTED',
    lapCount: 5,
    attemptId: null,
    officialStartedAt: null,
    elapsedMs: null,
    startControlEnabled: true,
    blockReason: null,
    participants: [
      {
        enrollmentId: 'enrollment-1',
        registrationId: 'registration-1',
        startNumber: 17,
        fullName: 'Иван Петров',
        sectionId: '3 - Мужчины (24–40)',
        passCount: 0,
        requiredLaps: 5,
        lastPassAt: null,
        state: 'WAITING',
        excludedReason: null,
      },
    ],
    pendingFinishes: [],
    lastAttempts: [],
    ...overrides,
  };
}

/** One heat block of a seeded stage (FR-17, AD-14). */
function heatBlock(
  overrides: Partial<TimingCategoryBlockView> = {},
): TimingCategoryBlockView {
  return block({
    kind: 'HEAT',
    blockKey: 'heat:race-1:stage-1:1',
    classCompetitionId: 'race-1',
    stageId: 'stage-1',
    stageLabel: 'Квалификация',
    stageState: 'SEEDED',
    heatNumber: 1,
    heatLabel: 'Заезд 1',
    ...overrides,
  });
}

/** The stage header that groups the heat blocks of a race (U-12). */
function stageGroup(
  overrides: Partial<TimingStageGroupView> = {},
): TimingStageGroupView {
  return {
    blockKey: 'stage:race-1:stage-1',
    raceId: 'race-1',
    raceTitle: 'Кубковая гонка',
    stageId: 'stage-1',
    stageLabel: 'Квалификация',
    stageState: 'SEEDED',
    heatBlockKeys: ['heat:race-1:stage-1:1'],
    blockReason: null,
    ...overrides,
  };
}

function anonymousSplit(
  overrides: Partial<TimingAnonymousSplitView> = {},
): TimingAnonymousSplitView {
  return {
    splitId: 'split-1',
    attemptId: 'attempt-heat-assign',
    blockKey: 'heat:race-1:stage-1:1',
    attemptLabel: 'Кубковая гонка · Квалификация · Заезд 1',
    capturedAt: '2026-11-13T09:00:01.000Z',
    officialElapsedMs: 1000,
    status: 'QUEUED',
    bound: false,
    candidates: [
      {
        attemptId: 'attempt-1',
        blockKey: 'start-a:1:M',
        attemptLabel: '5 км · Мужчины · Кубковая гонка — 10 км',
        officialElapsedMs: 1000,
      },
    ],
    captureDeviceSequence: 4,
    ...overrides,
  };
}

function passView(overrides: Partial<TimingPassView> = {}): TimingPassView {
  return {
    passId: 'pass-1',
    attemptId: 'attempt-heat-anon',
    enrollmentId: null,
    lapNumber: null,
    rawCapturedAt: '2026-11-13T09:00:03.000Z',
    officialAt: '2026-11-13T09:00:03.000Z',
    officialElapsedMs: 3000,
    status: 'PENDING',
    ...overrides,
  };
}

function epochView(attemptId: string): TimingClockEpochView {
  return {
    epochId: `epoch-${attemptId}`,
    attemptId,
    officialElapsedAnchorMs: 1000,
    serverNow: RUNNING_START,
  };
}

function surface(
  overrides: Partial<TimingSurfaceView> = {},
): TimingSurfaceView {
  return {
    eventId: 'event-1',
    captureWorkstationInstanceId: 'ws-1',
    categories: [block()],
    ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/events/event-1/timing']}>
        <Routes>
          <Route path="/events/:id/timing" element={<TimingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The enabled Start control, which is the heat's while the category is closed. */
function enabledStart(): HTMLButtonElement {
  const buttons = screen
    .getAllByRole('button', { name: /Старт/ })
    .filter((button) => !(button as HTMLButtonElement).disabled);
  expect(buttons).toHaveLength(1);
  return buttons[0] as HTMLButtonElement;
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

beforeEach(async () => {
  vi.clearAllMocks();
  // The surface read is the only mock a scenario queues per call, so it is the
  // only one reset here; every other service answer is replaced below.
  getSurface.mockReset();

  monotonicNow = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => monotonicNow);
  // Only the 100 ms display interval is faked: React, Testing Library and
  // React Query keep their real timers, so the surface settles deterministically
  // without waiting a real tick.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  sessionStorage.setItem('timing-workstation-instance', 'ws-1');

  vi.mocked(useSessionQuery).mockReturnValue({
    data: { authenticated: true, userId: 'user-1', roles: ['REFEREE'] },
    isLoading: false,
  } as unknown as ReturnType<typeof useSessionQuery>);
  vi.mocked(useEventDetailsQuery).mockReturnValue({
    data: eventDetails(),
    isLoading: false,
  } as unknown as ReturnType<typeof useEventDetailsQuery>);

  vi.mocked(timingService.openClockEpoch).mockImplementation(
    async (_eventId: string, attemptId: string) => epochView(attemptId),
  );
  vi.mocked(timingService.startAttempt).mockResolvedValue({
    attempt: block({ state: 'RUNNING', attemptId: 'attempt-cat' }),
    epoch: epochView('attempt-cat'),
  });
  vi.mocked(timingService.startHeatAttempt).mockResolvedValue({
    attempt: heatBlock({ state: 'RUNNING', attemptId: 'attempt-heat' }),
    epoch: epochView('attempt-heat'),
  });
  vi.mocked(timingService.capturePass).mockResolvedValue(passView());
  vi.mocked(timingService.captureAnonymousSplit).mockResolvedValue(
    anonymousSplit(),
  );
  vi.mocked(timingService.assignAnonymousSplit).mockResolvedValue(passView());
  vi.mocked(timingService.cancelAnonymousSplit).mockResolvedValue(
    anonymousSplit(),
  );

  // The real outbox is the module-scope memory fallback of jsdom, so every
  // scenario starts from an empty queue with its own attempt cursors.
  const queue = await openTimingQueue();
  await queue.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  sessionStorage.clear();
});

describe('TimingPage capture integration', () => {
  it('starts a heat from its Start control and anchors the epoch', async () => {
    const category = block({
      state: 'RUNNING',
      attemptId: 'attempt-cat',
      officialStartedAt: RUNNING_START,
      elapsedMs: 65_000,
      startControlEnabled: false,
    });
    const heat = heatBlock({
      state: 'RUNNING',
      attemptId: 'attempt-heat-start',
      officialStartedAt: RUNNING_START,
      elapsedMs: 0,
      startControlEnabled: false,
    });
    getSurface
      .mockResolvedValueOnce(
        // One category attempt, one heat block of a seeded stage and one queued
        // split: the whole surface the feature promises (AD-17).
        surface({
          categories: [category, heatBlock({ startControlEnabled: true })],
          stageGroups: [stageGroup()],
          anonymousSplits: [anonymousSplit()],
        }),
      )
      .mockResolvedValue(
        surface({
          categories: [category, heat],
          stageGroups: [stageGroup()],
          anonymousSplits: [anonymousSplit()],
        }),
      );
    vi.mocked(timingService.startHeatAttempt).mockResolvedValue({
      attempt: heat,
      epoch: epochView('attempt-heat-start'),
    });

    renderPage();

    await screen.findByText('Заезд 1');
    expect(screen.getByText('Время: 01:05.000')).not.toBeNull();
    fireEvent.click(enabledStart());

    await waitFor(() => {
      expect(timingService.startHeatAttempt).toHaveBeenCalledTimes(1);
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
    // A heat start is its own route; the category route stays untouched.
    expect(timingService.startAttempt).not.toHaveBeenCalled();

    // No block selector remains on the page.
    expect(screen.queryByLabelText('Текущий блок')).toBeNull();

    // The start response anchors the epoch: only the category running at mount
    // ever asked for a clock epoch, never the heat.
    const epochAttempts = vi
      .mocked(timingService.openClockEpoch)
      .mock.calls.map((call) => call[1]);
    expect(epochAttempts).toEqual(['attempt-cat']);

    // The category block is still rendered with its own state and clock.
    expect(screen.getByText('5 км · Мужчины')).not.toBeNull();
    expect(screen.getByText('Время: 01:05.000')).not.toBeNull();
  });

  it('records an empty Enter as one anonymous split with no block selection', async () => {
    const category = block({
      state: 'RUNNING',
      attemptId: 'attempt-cat',
      officialStartedAt: RUNNING_START,
      elapsedMs: 65_000,
      startControlEnabled: false,
    });
    const heat = heatBlock({
      state: 'RUNNING',
      attemptId: 'attempt-heat-anon',
      officialStartedAt: RUNNING_START,
      elapsedMs: 0,
      startControlEnabled: false,
    });
    getSurface
      .mockResolvedValueOnce(
        surface({
          categories: [category, heatBlock({ startControlEnabled: true })],
          stageGroups: [stageGroup()],
          anonymousSplits: [anonymousSplit()],
        }),
      )
      .mockResolvedValue(
        surface({
          categories: [category, heat],
          stageGroups: [stageGroup()],
          anonymousSplits: [anonymousSplit()],
        }),
      );
    vi.mocked(timingService.startHeatAttempt).mockResolvedValue({
      attempt: heat,
      epoch: epochView('attempt-heat-anon'),
    });

    renderPage();

    await screen.findByText('Заезд 1');
    fireEvent.click(enabledStart());
    const field = screen.getByLabelText('Номер участника') as HTMLInputElement;
    expect(field.disabled).toBe(false);
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => {
      expect(timingService.captureAnonymousSplit).toHaveBeenCalledTimes(1);
    });
    const [eventId, payload, key] = vi.mocked(
      timingService.captureAnonymousSplit,
    ).mock.calls[0];
    expect(eventId).toBe('event-1');
    expect(payload).toEqual({
      kind: 'ANONYMOUS_SPLIT',
      clientCapturedAt: expect.any(String),
      clientElapsedMs: expect.any(Number),
      clockEpochId: 'epoch-attempt-cat',
      workstationInstanceId: 'ws-1',
      deviceSequence: 1,
    });
    // A split carries no participant and no N: it waits for a number (AD-17).
    expect(payload).not.toHaveProperty('startNumber');
    expect(payload).not.toHaveProperty('enrollmentId');
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
    expect(timingService.capturePass).not.toHaveBeenCalled();

    const queue = await openTimingQueue();
    await waitFor(async () => {
      const items = await queue.list('event:event-1');
      expect(items).toHaveLength(1);
      expect(items[0].status).toBe('APPLIED');
    });
    const [queued] = await queue.list('event:event-1');
    // The stored item is the sent request: one idempotency key, one sequence.
    expect(queued.id).toBe(key);
    expect(queued.operation).toBe('PASS');
    expect(queued.deviceSequence).toBe(1);
    expect((queued.payload as CaptureTimingPassRequest).kind).toBe(
      'ANONYMOUS_SPLIT',
    );
  });

  it('assigns a selected split to a committed number and drops it on the refetch', async () => {
    const category = block({
      state: 'RUNNING',
      attemptId: 'attempt-cat',
      officialStartedAt: RUNNING_START,
      elapsedMs: 65_000,
      startControlEnabled: false,
    });
    const heat = heatBlock({
      state: 'RUNNING',
      attemptId: 'attempt-heat-assign',
      officialStartedAt: RUNNING_START,
      elapsedMs: 0,
      startControlEnabled: false,
    });
    getSurface
      .mockResolvedValueOnce(
        surface({
          categories: [category, heat],
          stageGroups: [stageGroup()],
          anonymousSplits: [
            anonymousSplit({
              splitId: 'split-1',
              attemptId: 'attempt-heat-assign',
            }),
          ],
        }),
      )
      .mockResolvedValue(
        // The accepted assignment leaves the queue, so the next read is empty.
        surface({
          categories: [category, heat],
          stageGroups: [stageGroup()],
          anonymousSplits: [],
        }),
      );

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /^Сплит 1:/ }));
    const field = screen.getByLabelText('Номер участника');
    // Assigning needs no caption: selecting the entry focuses the field.
    expect(field).toBe(document.activeElement);
    expect(screen.queryByText(/^Сплит будет назначен/)).toBeNull();
    fireEvent.change(field, { target: { value: '17' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => {
      expect(timingService.assignAnonymousSplit).toHaveBeenCalledTimes(1);
    });
    expect(timingService.assignAnonymousSplit).toHaveBeenCalledWith(
      'event-1',
      'split-1',
      {
        startNumber: 17,
        workstationInstanceId: 'ws-1',
        deviceSequence: expect.any(Number),
      },
      expect.any(String),
    );
    // Assignment is not a capture: no pass and no new split is created.
    expect(timingService.capturePass).not.toHaveBeenCalled();
    expect(timingService.captureAnonymousSplit).not.toHaveBeenCalled();

    // The entry leaves the queue with the surface refetch (FR-09) and the field
    // returns to normal capture (FR-52).
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^Сплит 1:/ })).toBeNull();
    });
    expect(screen.getByText('В очереди: 0')).not.toBeNull();
    expect(screen.queryByText('Назначение сплита')).toBeNull();
    expect(screen.getByLabelText('Номер участника')).not.toBeNull();
    expect(getSurface).toHaveBeenCalledTimes(2);
  });

  it('advances the elapsed display on the local tick without a network call', async () => {
    getSurface.mockResolvedValue(
      surface({
        categories: [
          block({
            state: 'RUNNING',
            attemptId: 'attempt-clock',
            officialStartedAt: RUNNING_START,
            elapsedMs: 5000,
            startControlEnabled: false,
          }),
        ],
      }),
    );

    renderPage();

    expect(await screen.findByText('Время: 00:05.000')).not.toBeNull();
    await waitFor(() => {
      expect(timingService.openClockEpoch).toHaveBeenCalledTimes(1);
    });
    // Let every mount effect settle, so the display anchor is the local clock
    // read at mount and the advance below is the only thing that moves it.
    await act(async () => {});

    const reads = getSurface.mock.calls.length;
    const epochs = vi.mocked(timingService.openClockEpoch).mock.calls.length;

    act(() => {
      monotonicNow += 1000;
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('Время: 00:06.000')).not.toBeNull();
    // A tick is a display rerender only (FR-39, F-21): no surface read, no
    // epoch request and no capture.
    expect(getSurface).toHaveBeenCalledTimes(reads);
    expect(timingService.openClockEpoch).toHaveBeenCalledTimes(epochs);
    expect(timingService.capturePass).not.toHaveBeenCalled();
    expect(timingService.captureAnonymousSplit).not.toHaveBeenCalled();
    expect(timingService.assignAnonymousSplit).not.toHaveBeenCalled();
  });

  it('still starts a category block through the category route beside the stage header', async () => {
    const heat = heatBlock({
      stageState: 'PENDING',
      startControlEnabled: false,
    });
    const runningCategory = block({
      state: 'RUNNING',
      attemptId: 'attempt-cat',
      officialStartedAt: RUNNING_START,
      elapsedMs: 0,
      startControlEnabled: false,
    });
    getSurface
      .mockResolvedValueOnce(
        surface({
          categories: [block(), heat],
          stageGroups: [stageGroup({ stageState: 'PENDING' })],
        }),
      )
      .mockResolvedValue(
        surface({
          categories: [runningCategory, heat],
          stageGroups: [stageGroup({ stageState: 'PENDING' })],
        }),
      );

    renderPage();

    await screen.findByText('Заезд 1');
    expect(screen.getByText('Заезды не сформированы')).not.toBeNull();
    fireEvent.click(enabledStart());

    await waitFor(() => {
      expect(timingService.startAttempt).toHaveBeenCalledTimes(1);
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
    expect(timingService.startHeatAttempt).not.toHaveBeenCalled();

    expect(screen.queryByLabelText('Текущий блок')).toBeNull();
    // The stage header and its heat block stay on the surface unchanged.
    expect(screen.getByText('Этап: Квалификация')).not.toBeNull();
  });
});
