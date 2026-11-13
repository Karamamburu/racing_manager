import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import { useEventDetailsQuery } from '../../features/events/useEventDetailsQuery';
import { timingService } from '../../features/timing/timingService';
import type {
  TimingCategoryBlockView,
  TimingSurfaceView,
} from '../../features/timing/types';
import { formatDateTime } from '../../shared/formatDateTime';
import type { EventDetails, StartResponse } from '../../shared/types/event';
import { TimingPage } from './index';

vi.mock('../../features/timing/timingService', () => ({
  timingService: {
    getSurface: vi.fn(),
    startAttempt: vi.fn(),
    takeCapture: vi.fn(),
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
const startAttempt = vi.mocked(timingService.startAttempt);
const takeCapture = vi.mocked(timingService.takeCapture);

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

function surface(overrides: Partial<TimingSurfaceView> = {}): TimingSurfaceView {
  return {
    eventId: 'event-1',
    captureWorkstationInstanceId: null,
    categories: [block()],
    ...overrides,
  };
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
    mockSession(['ORGANIZER']);
    mockEvent();
    renderPage();

    expect(screen.getByText('Хронометраж недоступен')).not.toBeNull();
    expect(screen.getByText(/Роль ORGANIZER без роли REFEREE/)).not.toBeNull();
    expect(getSurface).not.toHaveBeenCalled();
    expect(screen.queryByText('5 км · Мужчины')).toBeNull();
  });

  it('shows the access message to a user with no role', () => {
    mockSession([]);
    mockEvent();
    renderPage();

    expect(screen.getByText('Хронометраж недоступен')).not.toBeNull();
    expect(getSurface).not.toHaveBeenCalled();
  });

  it('renders one block per category in the backend order for a referee', async () => {
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

  it('takes capture for this workstation and refreshes the surface', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(surface({ captureWorkstationInstanceId: null }));
    takeCapture.mockResolvedValue({
      eventId: 'event-1',
      workstationInstanceId: 'ws-1',
      heldByUserId: 'user-1',
      heldAt: '2026-11-13T09:00:00.000Z',
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Взять захват/ }));

    await waitFor(() => {
      expect(takeCapture).toHaveBeenCalledWith('event-1', {
        workstationInstanceId: 'ws-1',
      });
    });
    await waitFor(() => {
      expect(getSurface).toHaveBeenCalledTimes(2);
    });
  });

  it('starts a category from the capture workstation and refreshes the surface', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['ADMINISTRATOR']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({ captureWorkstationInstanceId: 'ws-1' }),
    );
    startAttempt.mockResolvedValue({
      attempt: block({
        state: 'RUNNING',
        attemptId: 'attempt-1',
        officialStartedAt: '2026-11-13T09:00:00.000Z',
        elapsedMs: 0,
        startControlEnabled: false,
      }),
      epoch: {
        epochId: 'epoch-1',
        attemptId: 'attempt-1',
        officialElapsedAnchorMs: 0,
        serverNow: '2026-11-13T09:00:00.000Z',
      },
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Старт/ }));

    await waitFor(() => {
      expect(startAttempt).toHaveBeenCalledWith('event-1', {
        startId: 'start-a',
        formatId: 1,
        gender: 'M',
        workstationInstanceId: 'ws-1',
        clientStartedAt: expect.any(String),
      });
    });
    await waitFor(() => {
      expect(getSurface).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps a workstation read-only while another one holds capture', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({ captureWorkstationInstanceId: 'ws-other' }),
    );

    renderPage();

    expect(await screen.findByText(/только для чтения/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Взять захват/ })).toBeNull();
    expect(
      (screen.getByRole('button', { name: /Старт/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('shows an empty surface message for an event without categories', async () => {
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(surface({ categories: [] }));

    renderPage();

    expect(
      await screen.findByText('У мероприятия нет стартов и категорий для хронометража'),
    ).not.toBeNull();
  });
});
