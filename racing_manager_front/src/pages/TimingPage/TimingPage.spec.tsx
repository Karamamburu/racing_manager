import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import { useEventDetailsQuery } from '../../features/events/useEventDetailsQuery';
import { timingService } from '../../features/timing/timingService';
import type {
  TimingCategoryBlockView,
  TimingPassView,
  TimingSurfaceView,
} from '../../features/timing/types';
import type { UseTimingCaptureResult } from '../../features/timing/useTimingCapture';
import { useTimingCapture } from '../../features/timing/useTimingCapture';
import { formatDateTime } from '../../shared/formatDateTime';
import type { EventDetails, StartResponse } from '../../shared/types/event';
import { TimingPage } from './index';

vi.mock('../../features/timing/timingService', () => ({
  timingService: {
    getSurface: vi.fn(),
  },
}));

vi.mock('../../features/timing/useTimingCapture', () => ({
  useTimingCapture: vi.fn(),
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

function captureResult(
  overrides: Partial<UseTimingCaptureResult> = {},
): UseTimingCaptureResult {
  return {
    resolveCandidates: vi.fn(() => []),
    commitNumber: vi.fn(() => Promise.resolve()),
    commitTile: vi.fn(() => Promise.resolve()),
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
});
