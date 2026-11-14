import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import { useEventDetailsQuery } from '../../features/events/useEventDetailsQuery';
import type { AttemptRecordDrawerProps } from '../../features/timing/AttemptRecordDrawer';
import { timingService } from '../../features/timing/timingService';
import type {
  TimingAnonymousSplitView,
  TimingCategoryBlockView,
  TimingPassView,
  TimingStageGroupView,
  TimingSurfaceView,
} from '../../features/timing/types';
import type { UseTimingCaptureResult } from '../../features/timing/useTimingCapture';
import {
  timingSurfaceQueryKey,
  useTimingCapture,
} from '../../features/timing/useTimingCapture';
import { formatDateTime } from '../../shared/formatDateTime';
import type { EventDetails, StartResponse } from '../../shared/types/event';
import { TimingPage } from './index';

/**
 * The props of every drawer render, newest last. The drawer itself has its own
 * suite; here the page is proven to hand it the attempt, the workstation and
 * the names, and to close it.
 */
const drawerProps = vi.hoisted(() => ({ current: [] as AttemptRecordDrawerProps[] }));

vi.mock('../../features/timing/timingService', () => ({
  timingService: {
    getSurface: vi.fn(),
  },
}));

vi.mock('../../features/timing/useTimingCapture', () => ({
  timingSurfaceQueryKey: (eventId: string | undefined) =>
    ['timing-surface', eventId ?? ''] as const,
  useTimingCapture: vi.fn(),
}));

vi.mock('../../features/timing/AttemptRecordDrawer', () => ({
  AttemptRecordDrawer: (props: AttemptRecordDrawerProps) => {
    drawerProps.current.push(props);
    if (!props.open) return null;
    return (
      <div>
        <p>Запись попытки {props.attemptId}</p>
        <button type="button" onClick={props.onClose}>
          Закрыть запись
        </button>
        <button type="button" onClick={props.onChanged}>
          Исправить запись
        </button>
      </div>
    );
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

function pendingFinish(overrides: Partial<TimingPassView> = {}): TimingPassView {
  return {
    passId: 'pending-1',
    attemptId: 'attempt-1',
    enrollmentId: null,
    lapNumber: null,
    rawCapturedAt: '2026-11-13T09:00:05.000Z',
    officialAt: '2026-11-13T09:00:05.000Z',
    officialElapsedMs: 5000,
    status: 'PENDING',
    ...overrides,
  };
}

function surface(overrides: Partial<TimingSurfaceView> = {}): TimingSurfaceView {
  return {
    eventId: 'event-1',
    captureWorkstationInstanceId: null,
    categories: [block()],
    ...overrides,
  };
}

/** One heat block of a seeded stage, as the surface reports it (FR-17). */
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

/** One stage header grouping the heat blocks of a multi-stage race (U-12). */
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
    attemptId: 'attempt-1',
    blockKey: 'start-a:1:M',
    attemptLabel: '5 км · Мужчины · Кубковая гонка — 10 км',
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

function captureResult(
  overrides: Partial<UseTimingCaptureResult> = {},
): UseTimingCaptureResult {
  return {
    resolveCandidates: vi.fn(() => []),
    commitNumber: vi.fn(() => Promise.resolve()),
    commitTile: vi.fn(() => Promise.resolve()),
    captureAnonymous: vi.fn(() => Promise.resolve()),
    assignAnonymousSplit: vi.fn(() => Promise.resolve()),
    cancelAnonymousSplit: vi.fn(() => Promise.resolve()),
    undoAnonymousSplit: vi.fn(() => Promise.resolve()),
    bindPending: vi.fn(() => Promise.resolve()),
    quickUndo: vi.fn(() => Promise.resolve()),
    startAttempt: vi.fn(() => Promise.resolve()),
    complete: vi.fn(() => Promise.resolve()),
    forceComplete: vi.fn(() => Promise.resolve()),
    cancelAttempt: vi.fn(() => Promise.resolve()),
    takeCapture: vi.fn(() => Promise.resolve()),
    transferCapture: vi.fn(() => Promise.resolve()),
    forceRelease: vi.fn(() => Promise.resolve()),
    flush: vi.fn(() => Promise.resolve()),
    pendingCount: 0,
    isFlushing: false,
    ...overrides,
  };
}

function mockCapture(
  overrides: Partial<UseTimingCaptureResult> = {},
): UseTimingCaptureResult {
  const result = captureResult(overrides);
  vi.mocked(useTimingCapture).mockReturnValue(result);
  return result;
}

function mockSession(roles: string[]) {
  vi.mocked(useSessionQuery).mockReturnValue({
    data: { authenticated: true, userId: 'user-1', roles },
    isLoading: false,
  } as unknown as ReturnType<typeof useSessionQuery>);
}

function mockEvent() {
  vi.mocked(useEventDetailsQuery).mockReturnValue({
    data: eventDetails(),
    isLoading: false,
  } as unknown as ReturnType<typeof useEventDetailsQuery>);
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/events/event-1/timing']}>
        <Routes>
          <Route path="/events/:id/timing" element={<TimingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // The client is returned so a test can read the options the page configured
  // for the surface query, not only what it rendered.
  return { ...view, client };
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

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  drawerProps.current = [];
});

describe('TimingPage', () => {
  it('shows the access message to an organizer without REFEREE and reads no surface', () => {
    mockCapture();
    mockSession(['ORGANIZER']);
    mockEvent();
    renderPage();

    expect(screen.getByText('Хронометраж недоступен')).not.toBeNull();
    expect(screen.getByText(/Роль ORGANIZER без роли REFEREE/)).not.toBeNull();
    expect(getSurface).not.toHaveBeenCalled();
    expect(screen.queryByText('5 км · Мужчины')).toBeNull();
    expect(screen.queryByLabelText('Номер участника')).toBeNull();
  });

  it('shows the access message to a user with no role', () => {
    mockCapture();
    mockSession([]);
    mockEvent();
    renderPage();

    expect(screen.getByText('Хронометраж недоступен')).not.toBeNull();
    expect(getSurface).not.toHaveBeenCalled();
  });

  it('wires capture controls, the number field and the blocks for a referee', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    const view = surface({
      captureWorkstationInstanceId: 'ws-1',
      categories: [
        block({
          state: 'RUNNING',
          attemptId: 'attempt-1',
          officialStartedAt: '2026-11-13T09:00:00.000Z',
          elapsedMs: 65_000,
          startControlEnabled: false,
        }),
      ],
    });
    getSurface.mockResolvedValue(view);
    mockCapture({ pendingCount: 2 });

    renderPage();

    const numberField = (await screen.findByLabelText(
      'Номер участника',
    )) as HTMLInputElement;
    expect(numberField.disabled).toBe(false);
    expect(screen.getByText('Захват у этой станции')).not.toBeNull();
    expect(screen.getByText(/Захват: эта станция/)).not.toBeNull();
    expect(screen.getByText(/Станция: ws-1/)).not.toBeNull();
    expect(screen.getByText(/Не синхронизировано: 2/)).not.toBeNull();
    expect(screen.getByText('5 км · Мужчины')).not.toBeNull();
    expect(useTimingCapture).toHaveBeenCalledWith(
      'event-1',
      view,
      'ws-1',
      expect.any(Function),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));
    await waitFor(() => {
      expect(getSurface).toHaveBeenCalledTimes(2);
    });
  });

  it('configures no periodic surface read for a running block clock', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        captureWorkstationInstanceId: 'ws-1',
        categories: [
          block({
            state: 'RUNNING',
            attemptId: 'attempt-1',
            officialStartedAt: '2026-11-13T09:00:00.000Z',
            elapsedMs: 65_000,
            startControlEnabled: false,
          }),
        ],
      }),
    );
    mockCapture();

    const { client } = renderPage();

    expect(await screen.findByText('5 км · Мужчины')).not.toBeNull();
    // One read on mount. The elapsed display ticks locally, so the surface
    // query carries no `refetchInterval` even while a block runs (AD-19, F-21).
    expect(getSurface).toHaveBeenCalledTimes(1);
    const query = client
      .getQueryCache()
      .find({ queryKey: timingSurfaceQueryKey('event-1') });
    expect(query).not.toBeUndefined();
    expect(query?.observers[0]?.options.refetchInterval).toBeUndefined();
  });

  it('refetches the surface after a mutation of the attempt record', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        captureWorkstationInstanceId: 'ws-1',
        categories: [
          block({
            state: 'RUNNING',
            attemptId: 'attempt-1',
            officialStartedAt: '2026-11-13T09:00:00.000Z',
            elapsedMs: 65_000,
            startControlEnabled: false,
            lastAttempts: [
              {
                attemptId: 'attempt-1',
                state: 'RUNNING',
                officialStartedAt: '2026-11-13T09:00:00.000Z',
              },
            ],
          }),
        ],
      }),
    );
    mockCapture();

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Запись/ }));
    expect(await screen.findByText('Запись попытки attempt-1')).not.toBeNull();
    expect(getSurface).toHaveBeenCalledTimes(1);

    // A correction in the record still invalidates the surface, so the read
    // stays fresh after a write even without a clock poll.
    fireEvent.click(screen.getByRole('button', { name: 'Исправить запись' }));

    await waitFor(() => {
      expect(getSurface).toHaveBeenCalledTimes(2);
    });
  });

  it('renders one block per category in the backend order for a referee', async () => {
    mockCapture();
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        categories: [
          block(),
          block({
            gender: 'F',
            state: 'RUNNING',
            officialStartedAt: '2026-11-13T09:00:00.000Z',
            elapsedMs: 65_000,
            startControlEnabled: false,
          }),
        ],
      }),
    );

    const { container } = renderPage();

    expect(await screen.findByText('5 км · Мужчины')).not.toBeNull();
    expect(screen.getByText('5 км · Женщины')).not.toBeNull();
    expect(screen.getAllByText('Кубковая гонка — 10 км')).toHaveLength(2);
    expect(getSurface).toHaveBeenCalledWith('event-1');
    const text = container.textContent ?? '';
    expect(text.indexOf('5 км · Мужчины')).toBeLessThan(
      text.indexOf('5 км · Женщины'),
    );
  });

  it('shows the event name and date around the surface', async () => {
    mockCapture();
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(surface());

    renderPage();

    expect(await screen.findByText('Хронометраж')).not.toBeNull();
    expect(
      screen.getByText(
        `Кубок города · ${formatDateTime('2026-11-13T09:00:00.000Z')}`,
      ),
    ).not.toBeNull();
  });

  it('takes capture through the capture hook', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(surface({ captureWorkstationInstanceId: null }));
    const capture = mockCapture();

    renderPage();

    const [takeButton] = await screen.findAllByRole('button', {
      name: /Взять захват/,
    });
    fireEvent.click(takeButton);

    await waitFor(() => {
      expect(capture.takeCapture).toHaveBeenCalledTimes(1);
    });
  });

  it('starts a category through the capture hook', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['ADMINISTRATOR']);
    mockEvent();
    const view = surface({ captureWorkstationInstanceId: 'ws-1' });
    getSurface.mockResolvedValue(view);
    const capture = mockCapture();

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Старт/ }));

    await waitFor(() => {
      expect(capture.startAttempt).toHaveBeenCalledWith(view.categories[0]);
    });
  });

  it('routes a tile click to the running attempt of its own block', async () => {
    mockSession(['REFEREE']);
    mockEvent();
    const view = surface({
      categories: [
        block(),
        block({
          gender: 'F',
          state: 'RUNNING',
          attemptId: 'attempt-1',
          officialStartedAt: '2026-11-13T09:00:00.000Z',
          elapsedMs: 1000,
          startControlEnabled: false,
        }),
      ],
    });
    getSurface.mockResolvedValue(view);
    const capture = mockCapture();

    renderPage();

    await screen.findByText('5 км · Женщины');
    const tiles = screen.getAllByRole('button', { name: '17 Иван Петров' });
    expect(tiles).toHaveLength(1);
    fireEvent.click(tiles[0]);

    await waitFor(() => {
      expect(capture.commitTile).toHaveBeenCalledWith(
        view.categories[1].participants[0],
        'attempt-1',
      );
    });
  });

  it('renders the pending-finish bar under its block and binds a number', async () => {
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        categories: [
          block({
            state: 'RUNNING',
            attemptId: 'attempt-1',
            officialStartedAt: '2026-11-13T09:00:00.000Z',
            elapsedMs: 5000,
            startControlEnabled: false,
            pendingFinishes: [pendingFinish()],
          }),
        ],
      }),
    );
    const capture = mockCapture();

    renderPage();

    expect(await screen.findByText('Непривязанные финиши')).not.toBeNull();
    const bindButton = screen.getByRole('button', { name: /Привязать финиш/ });
    expect(screen.queryByRole('button', { name: /Отменить финиш/ })).toBeNull();

    fireEvent.change(screen.getByLabelText(/Номер участника для финиша/), {
      target: { value: '42' },
    });
    fireEvent.click(bindButton);

    await waitFor(() => {
      expect(capture.bindPending).toHaveBeenCalledWith('pending-1', 42);
    });
  });

  it('keeps a workstation read-only while another one holds capture', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({ captureWorkstationInstanceId: 'ws-other' }),
    );
    mockCapture();

    renderPage();

    expect(await screen.findByText(/только для чтения/)).not.toBeNull();
    expect(screen.getByText('Захват у станции ws-other')).not.toBeNull();
    expect(
      (screen.getByRole('button', { name: /Старт/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText('Номер участника') as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it('shows an empty surface message for an event without categories', async () => {
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(surface({ categories: [] }));
    mockCapture();

    renderPage();

    expect(
      await screen.findByText('У мероприятия нет стартов и категорий для хронометража'),
    ).not.toBeNull();
    expect(
      (screen.getByLabelText('Номер участника') as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it('opens the attempt record with its attempt, workstation and participant names', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        captureWorkstationInstanceId: 'ws-1',
        categories: [
          block({
            state: 'RUNNING',
            attemptId: 'attempt-1',
            officialStartedAt: '2026-11-13T09:00:00.000Z',
            elapsedMs: 65_000,
            startControlEnabled: false,
            lastAttempts: [
              {
                attemptId: 'attempt-1',
                state: 'RUNNING',
                officialStartedAt: '2026-11-13T09:00:00.000Z',
              },
            ],
          }),
        ],
      }),
    );
    mockCapture();

    renderPage();

    // The drawer is mounted closed, so nothing of the record is readable yet.
    await screen.findByText('5 км · Мужчины');
    expect(drawerProps.current.at(-1)?.open).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Запись/ }));

    expect(await screen.findByText('Запись попытки attempt-1')).not.toBeNull();
    const drawer = drawerProps.current.at(-1);
    expect(drawer?.open).toBe(true);
    expect(drawer?.eventId).toBe('event-1');
    expect(drawer?.attemptId).toBe('attempt-1');
    expect(drawer?.workstationInstanceId).toBe('ws-1');
    expect(drawer?.participantNames).toEqual({
      'enrollment-1': 'Иван Петров',
    });
    expect(drawer?.canOperate).toBe(true);
    expect(drawer?.canAdminister).toBe(false);
  });

  it('shows no surface and no record to an organizer without REFEREE', () => {
    mockCapture();
    mockSession(['ORGANIZER']);
    mockEvent();

    renderPage();

    expect(screen.getByText('Хронометраж недоступен')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Запись/ })).toBeNull();
    expect(drawerProps.current).toHaveLength(0);
    expect(getSurface).not.toHaveBeenCalled();
    // No split queue and no current block for a user without timing access.
    expect(screen.queryByText('Неразмеченные сплиты')).toBeNull();
    expect(screen.queryByText('Текущий блок')).toBeNull();
  });

  it('closes the attempt record when the referee closes it', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        captureWorkstationInstanceId: 'ws-1',
        categories: [
          block({
            state: 'RUNNING',
            attemptId: 'attempt-1',
            officialStartedAt: '2026-11-13T09:00:00.000Z',
            elapsedMs: 65_000,
            startControlEnabled: false,
          }),
        ],
      }),
    );
    mockCapture();

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Запись/ }));
    expect(await screen.findByText('Запись попытки attempt-1')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть запись' }));

    await waitFor(() => {
      expect(screen.queryByText('Запись попытки attempt-1')).toBeNull();
    });
    expect(drawerProps.current.at(-1)?.open).toBe(false);
    expect(drawerProps.current.at(-1)?.attemptId).toBeNull();
  });

  it('closes the attempt record when a refetch no longer lists the attempt', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        captureWorkstationInstanceId: 'ws-1',
        categories: [
          block({
            state: 'RUNNING',
            attemptId: 'attempt-1',
            officialStartedAt: '2026-11-13T09:00:00.000Z',
            elapsedMs: 65_000,
            startControlEnabled: false,
          }),
        ],
      }),
    );
    mockCapture();

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Запись/ }));
    expect(await screen.findByText('Запись попытки attempt-1')).not.toBeNull();

    // The attempt is gone from the surface: no newest attempt and no earlier
    // one of the category. The drawer must not keep reading a dropped record.
    getSurface.mockResolvedValue(surface());
    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));

    await waitFor(() => {
      expect(screen.queryByText('Запись попытки attempt-1')).toBeNull();
    });
    expect(drawerProps.current.at(-1)?.open).toBe(false);
    expect(drawerProps.current.at(-1)?.attemptId).toBeNull();
  });

  it('shows the split queue above the number field for a referee', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        captureWorkstationInstanceId: 'ws-1',
        categories: [
          block({
            state: 'RUNNING',
            attemptId: 'attempt-1',
            officialStartedAt: '2026-11-13T09:00:00.000Z',
            elapsedMs: 65_000,
            startControlEnabled: false,
          }),
        ],
        anonymousSplits: [anonymousSplit()],
      }),
    );
    mockCapture();

    const { container } = renderPage();

    expect(await screen.findByText('Неразмеченные сплиты')).not.toBeNull();
    expect(screen.getByText('В очереди: 1')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: /^Сплит 1:/ }),
    ).not.toBeNull();

    // The queue shares the top block with the controls and sits in its right
    // column; the number field stays in the left column.
    expect(container.textContent ?? '').toContain('Номер участника');
  });

  it('queues an anonymous split without any block selection', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        captureWorkstationInstanceId: 'ws-1',
        categories: [
          block({
            state: 'RUNNING',
            attemptId: 'attempt-1',
            officialStartedAt: '2026-11-13T09:00:00.000Z',
            elapsedMs: 65_000,
            startControlEnabled: false,
          }),
          block({
            gender: 'F',
            state: 'RUNNING',
            attemptId: 'attempt-2',
            officialStartedAt: '2026-11-13T09:00:00.000Z',
            elapsedMs: 65_000,
            startControlEnabled: false,
          }),
        ],
      }),
    );
    const capture = mockCapture();

    renderPage();

    expect(screen.queryByLabelText('Текущий блок')).toBeNull();
    expect(await screen.findByText('Номер участника')).not.toBeNull();

    fireEvent.keyDown(screen.getByLabelText('Номер участника'), {
      key: 'Enter',
    });

    await waitFor(() => expect(capture.captureAnonymous).toHaveBeenCalled());
    expect(capture.captureAnonymous).toHaveBeenCalledWith();
  });

  it('assigns the selected queue entry through the number field and leaves the mode', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        captureWorkstationInstanceId: 'ws-1',
        categories: [
          block({
            state: 'RUNNING',
            attemptId: 'attempt-1',
            officialStartedAt: '2026-11-13T09:00:00.000Z',
            elapsedMs: 65_000,
            startControlEnabled: false,
          }),
        ],
        anonymousSplits: [
          anonymousSplit({ attemptLabel: '5 км · Мужчины' }),
        ],
      }),
    );
    const capture = mockCapture();

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /^Сплит 1:/ }));

    const field = screen.getByLabelText('Номер участника');
    expect(field).toBe(document.activeElement);
    expect(screen.queryByText(/^Сплит будет назначен/)).toBeNull();
    fireEvent.change(field, { target: { value: '17' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() =>
      expect(capture.assignAnonymousSplit).toHaveBeenCalledWith('split-1', 17),
    );
    // The accepted assignment exits the mode and drops the queue selection.
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: /^Сплит 1:/ })
          .getAttribute('aria-pressed'),
      ).toBe('false'),
    );
    expect(capture.captureAnonymous).not.toHaveBeenCalled();
  });

  it('cancels a queued split with the typed reason and drops it on the refetch', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    const runningBlock = block({
      state: 'RUNNING',
      attemptId: 'attempt-1',
      officialStartedAt: '2026-11-13T09:00:00.000Z',
      elapsedMs: 65_000,
      startControlEnabled: false,
    });
    getSurface.mockResolvedValue(
      surface({
        captureWorkstationInstanceId: 'ws-1',
        categories: [runningBlock],
        anonymousSplits: [anonymousSplit()],
      }),
    );
    const capture = mockCapture();

    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Отменить сплит 1' }),
    );
    fireEvent.change(screen.getByLabelText('Причина отмены сплита'), {
      target: { value: 'Дубль нажатия' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отменить сплит' }));

    await waitFor(() =>
      expect(capture.cancelAnonymousSplit).toHaveBeenCalledWith(
        'split-1',
        'Дубль нажатия',
      ),
    );

    // The cancelled split is no longer queued: the next surface read drops it
    // and the field is not left in assignment mode.
    getSurface.mockResolvedValue(
      surface({
        captureWorkstationInstanceId: 'ws-1',
        categories: [runningBlock],
        anonymousSplits: [],
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^Сплит 1:/ })).toBeNull(),
    );
    expect(screen.getByText('В очереди: 0')).not.toBeNull();
    expect(screen.queryByText('Назначение сплита')).toBeNull();
  });

  it('renders stage headers and their heat blocks after the category block', async () => {
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        categories: [
          block(),
          heatBlock(),
          heatBlock({
            blockKey: 'heat:race-1:stage-1:2',
            heatNumber: 2,
            heatLabel: 'Заезд 2',
          }),
        ],
        stageGroups: [
          stageGroup({
            heatBlockKeys: [
              'heat:race-1:stage-1:1',
              'heat:race-1:stage-1:2',
            ],
          }),
        ],
      }),
    );
    mockCapture();

    const { container } = renderPage();

    expect(await screen.findByText('Заезд 1')).not.toBeNull();
    expect(screen.getByText('Заезд 2')).not.toBeNull();
    // The header names the race and the stage and states the stage is seeded;
    // each heat names its race too.
    expect(screen.getAllByText('Кубковая гонка')).toHaveLength(3);
    expect(screen.getByText('Квалификация')).not.toBeNull();
    expect(screen.getByText('Заезды сформированы')).not.toBeNull();
    // Both heats carry the kind affordance and their stage name.
    expect(screen.getAllByText('Заезд')).toHaveLength(2);
    expect(screen.getAllByText('Этап: Квалификация')).toHaveLength(2);

    // The backend order stays untouched: category, stage header, heats ascending.
    const text = container.textContent ?? '';
    expect(text.indexOf('5 км · Мужчины')).toBeLessThan(
      text.indexOf('Заезды сформированы'),
    );
    expect(text.indexOf('Заезды сформированы')).toBeLessThan(
      text.indexOf('Заезд 1'),
    );
    expect(text.indexOf('Заезд 1')).toBeLessThan(text.indexOf('Заезд 2'));
  });

  it('renders the header of a pending stage without heats and offers no heat block', async () => {
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        categories: [block()],
        stageGroups: [
          stageGroup({
            stageState: 'PENDING',
            heatBlockKeys: [],
            blockReason: 'Заезды этапа ещё не сформированы.',
          }),
        ],
      }),
    );
    mockCapture();

    renderPage();

    expect(await screen.findByText('Заезды не сформированы')).not.toBeNull();
    expect(
      screen.getByText('Заезды этапа ещё не сформированы.'),
    ).not.toBeNull();
    // No heat block and no Start beyond the category's own control (F-12, S-06).
    expect(screen.queryByText('Заезд 1')).toBeNull();
    expect(screen.queryByText('Заезд')).toBeNull();
    expect(screen.getAllByRole('button', { name: /Старт/ })).toHaveLength(1);
  });

  it('starts a heat through the capture hook with the heat block', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    const heat = heatBlock({ startControlEnabled: true });
    const view = surface({
      captureWorkstationInstanceId: 'ws-1',
      categories: [block({ startControlEnabled: false }), heat],
      stageGroups: [stageGroup()],
    });
    getSurface.mockResolvedValue(view);
    const capture = mockCapture();

    renderPage();

    await screen.findByText('Заезд 1');
    const startButtons = screen.getAllByRole('button', { name: /Старт/ });
    const heatStart = startButtons.find(
      (button) => !(button as HTMLButtonElement).disabled,
    );
    expect(heatStart).toBeDefined();
    fireEvent.click(heatStart as HTMLButtonElement);

    await waitFor(() => {
      expect(capture.startAttempt).toHaveBeenCalledWith(heat);
    });
  });

  it('queues an anonymous split while a heat is running, without a block selector', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        captureWorkstationInstanceId: 'ws-1',
        categories: [
          heatBlock({
            state: 'RUNNING',
            attemptId: 'attempt-heat',
            officialStartedAt: '2026-11-13T09:00:00.000Z',
            elapsedMs: 65_000,
            startControlEnabled: false,
          }),
        ],
        stageGroups: [stageGroup()],
      }),
    );
    const capture = mockCapture();

    renderPage();

    expect(await screen.findByText('Номер участника')).not.toBeNull();
    expect(screen.queryByLabelText('Текущий блок')).toBeNull();

    fireEvent.keyDown(screen.getByLabelText('Номер участника'), {
      key: 'Enter',
    });

    await waitFor(() => expect(capture.captureAnonymous).toHaveBeenCalled());
    expect(capture.captureAnonymous).toHaveBeenCalledWith();
  });

  it('assigns a queued split of a heat attempt through the number field', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        captureWorkstationInstanceId: 'ws-1',
        categories: [
          heatBlock({
            state: 'RUNNING',
            attemptId: 'attempt-heat',
            officialStartedAt: '2026-11-13T09:00:00.000Z',
            elapsedMs: 65_000,
            startControlEnabled: false,
          }),
        ],
        stageGroups: [stageGroup()],
        anonymousSplits: [
          anonymousSplit({
            splitId: 'split-heat',
            attemptId: 'attempt-heat',
            blockKey: 'heat:race-1:stage-1:1',
            attemptLabel: 'Кубковая гонка · Квалификация · Заезд 1',
          }),
        ],
      }),
    );
    const capture = mockCapture();

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /^Сплит 1:/ }));

    const field = screen.getByLabelText('Номер участника');
    expect(field).toBe(document.activeElement);
    expect(screen.queryByText(/^Сплит будет назначен/)).toBeNull();

    fireEvent.change(field, { target: { value: '42' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() =>
      expect(capture.assignAnonymousSplit).toHaveBeenCalledWith(
        'split-heat',
        42,
      ),
    );
  });

  it('keeps a category block disabled and unchanged beside a stage header', async () => {
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        categories: [
          block({
            state: 'COMPLETED',
            attemptId: 'attempt-1',
            officialStartedAt: '2026-11-13T09:00:00.000Z',
            startControlEnabled: false,
            blockReason: 'Категория завершена в протоколе',
          }),
        ],
        stageGroups: [stageGroup({ heatBlockKeys: [] })],
      }),
    );
    const capture = mockCapture();

    renderPage();

    expect(await screen.findByText('5 км · Мужчины')).not.toBeNull();
    expect(screen.getByText('Категория завершена в протоколе')).not.toBeNull();
    expect(screen.queryByText('Заезд')).toBeNull();
    // A category keeps its disabled Start, unlike a closed-stage heat.
    expect(
      (screen.getByRole('button', { name: /Старт/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(capture.startAttempt).not.toHaveBeenCalled();
  });
});
