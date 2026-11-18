import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useSessionQuery } from '../../features/auth/useSessionQuery';
import { useEventDetailsQuery } from '../../features/events/useEventDetailsQuery';
import type { AttemptRecordDrawerProps } from '../../features/timing/AttemptRecordDrawer';
import type { TimingQueueItem } from '../../features/timing/timingQueue';
import { timingService } from '../../features/timing/timingService';
import type {
  TimingAnonymousSplitView,
  TimingCaptureOutcomeEvent,
  TimingCategoryBlockView,
  TimingPassView,
  TimingStageGroupView,
  TimingSurfaceView,
} from '../../features/timing/types';
import type {
  TimingCaptureOutcome,
  UseTimingCaptureResult,
} from '../../features/timing/useTimingCapture';
import {
  timingSurfaceQueryKey,
  useTimingCapture,
} from '../../features/timing/useTimingCapture';
import { formatDateTime } from '../../shared/formatDateTime';
import type { EventDetails, StartResponse } from '../../shared/types/event';
import {
  timingBlockLayout,
  timingBlockRows,
  timingRowItemFlex,
} from './blockLayout';
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
    // The drawer's own closure gate, reduced to the one fact the page feeds it:
    // this attempt's unresolved captures (S-08, E-13, F-10, FR-27).
    const unresolved = props.unresolvedEntries ?? 0;
    return (
      <div>
        <p>{props.title} {props.attemptId}</p>
        {unresolved === 0 ? null : (
          <p>{`Завершение ждёт отправки: неотправленных записей — ${unresolved}. Сначала отправьте их на сервер.`}</p>
        )}
        <button type="button" disabled={unresolved > 0}>
          Завершить хронометраж
        </button>
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

/** A roster of `count` plain participants, for the width-layout scenarios. */
function roster(count: number): TimingCategoryBlockView['participants'] {
  return Array.from({ length: count }, (_, index) => ({
    enrollmentId: `enrollment-${index + 1}`,
    registrationId: `registration-${index + 1}`,
    startNumber: index + 1,
    fullName: `Участник ${index + 1}`,
    sectionId: '3 - Мужчины (24–40)',
    passCount: 0,
    requiredLaps: 5,
    lastPassAt: null,
    state: 'WAITING',
    excludedReason: null,
  }));
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

/** One confirmed outcome: the field reads only the status of an accepted press. */
function confirmedOutcome(): Promise<TimingCaptureOutcome> {
  return Promise.resolve({ status: 'CONFIRMED' });
}

/**
 * One entry of the device outbox, in the shape `deriveTimingOfflineView` reads
 * (FR-11, FR-12). A number pass names its attempt and its number; an anonymous
 * split names neither participant nor attempt.
 */
function queueItem(overrides: Partial<TimingQueueItem> = {}): TimingQueueItem {
  return {
    id: 'queue-1',
    attemptId: 'attempt-1',
    workstationInstanceId: 'ws-1',
    deviceSequence: 1,
    operation: 'PASS',
    payload: {
      kind: 'NUMBER',
      attemptId: 'attempt-1',
      startNumber: 17,
      clientCapturedAt: '2026-11-13T09:00:01.000Z',
      clientElapsedMs: 1000,
      clockEpochId: 'epoch-1',
      workstationInstanceId: 'ws-1',
      deviceSequence: 1,
    },
    status: 'PENDING',
    createdAt: '2026-11-13T09:00:01.000Z',
    ...overrides,
  };
}

function captureResult(
  overrides: Partial<UseTimingCaptureResult> = {},
): UseTimingCaptureResult {
  return {
    resolveCandidates: vi.fn(() => []),
    commitNumber: vi.fn(confirmedOutcome),
    commitTile: vi.fn(confirmedOutcome),
    captureAnonymous: vi.fn(confirmedOutcome),
    assignAnonymousSplit: vi.fn(confirmedOutcome),
    cancelAnonymousSplit: vi.fn(() => Promise.resolve()),
    undoAnonymousSplit: vi.fn(() => Promise.resolve()),
    bindPending: vi.fn(confirmedOutcome),
    quickUndo: vi.fn(confirmedOutcome),
    startAttempt: vi.fn(() => Promise.resolve()),
    complete: vi.fn(() => Promise.resolve()),
    forceComplete: vi.fn(() => Promise.resolve()),
    cancelAttempt: vi.fn(() => Promise.resolve()),
    takeCapture: vi.fn(() => Promise.resolve()),
    transferCapture: vi.fn(() => Promise.resolve()),
    forceRelease: vi.fn(() => Promise.resolve()),
    flush: vi.fn(() => Promise.resolve()),
    sendNow: vi.fn(() => Promise.resolve()),
    queueItems: [],
    inFlightIds: new Set<string>(),
    refreshQueue: vi.fn(() => Promise.resolve()),
    isDurable: true,
    isOnline: true,
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

/** The one figures trigger of the top control card, by its accepted line (U-08). */
function figuresTrigger(
  unsent: number,
  sending: number,
  waiting: number,
  marks: number,
): HTMLElement {
  return screen.getByRole('button', {
    name: `Не отправлено: ${unsent} · Отправляется: ${sending} · Ожидают отправки: ${waiting} · из них отметок: ${marks}`,
  });
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
          <Route path="/events/:id" element={<p>Страница мероприятия</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // The client is returned so a test can read the options the page configured
  // for the surface query, not only what it rendered.
  return { ...view, client };
}

/**
 * Dispatches one cancelable `beforeunload`, the event the volatile-storage
 * guard listens to (FR-30). It reports whether the page asked the browser to
 * confirm the leave, which no other code on the page may do.
 */
function fireBeforeUnload(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  const notCancelled = window.dispatchEvent(event);
  return !notCancelled || event.defaultPrevented;
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
    const capture = mockCapture({
      queueItems: [
        queueItem(),
        queueItem({
          id: 'queue-2',
          attemptId: 'event:event-1',
          deviceSequence: 2,
          payload: {
            kind: 'ANONYMOUS_SPLIT',
            clientCapturedAt: '2026-11-13T09:00:02.000Z',
          },
          createdAt: '2026-11-13T09:00:02.000Z',
        }),
      ],
      pendingCount: 2,
    });

    renderPage();

    const numberField = (await screen.findByLabelText(
      'Номер участника',
    )) as HTMLInputElement;
    expect(numberField.disabled).toBe(false);
    expect(screen.getByText('Захват у этого устройства')).not.toBeNull();
    expect(screen.getByText(/Захват: это устройство/)).not.toBeNull();
    expect(screen.getByText(/Устройство: ws-1/)).not.toBeNull();
    // The figures are derived from the outbox: two entries are unsent, none of
    // them is on its way, and one of them is a mark (S-01, FR-11, FR-46).
    expect(
      screen.getByText(
        'Не отправлено: 2 · Отправляется: 0 · Ожидают отправки: 2 · из них отметок: 1',
      ),
    ).not.toBeNull();
    expect(screen.getByText('Связь есть')).not.toBeNull();
    expect(screen.getByText('Ход хронометража')).not.toBeNull();
    expect(screen.getByText('5 км · Мужчины')).not.toBeNull();
    expect(useTimingCapture).toHaveBeenCalledWith(
      'event-1',
      view,
      'ws-1',
      expect.any(Function),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));
    // `Обновить` reads both halves of the report again (FR-11, FR-12).
    await waitFor(() => {
      expect(getSurface).toHaveBeenCalledTimes(2);
    });
    expect(capture.refreshQueue).toHaveBeenCalledTimes(1);
  });

  it('copies this device id so it can receive a capture transfer', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({ captureWorkstationInstanceId: 'ws-1' }),
    );
    mockCapture();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderPage();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Копировать ID устройства',
      }),
    );

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('ws-1'));
    expect(await screen.findByText('ID скопирован')).not.toBeNull();
  });

  it('reports a refused clipboard write', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({ captureWorkstationInstanceId: 'ws-1' }),
    );
    mockCapture();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    renderPage();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Копировать ID устройства',
      }),
    );

    expect(
      await screen.findByText(
        'Не удалось скопировать. Выделите ID вручную.',
      ),
    ).not.toBeNull();
  });

  it('returns to the event page from the header', async () => {
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(surface());
    mockCapture();

    renderPage();

    fireEvent.click(
      await screen.findByRole('button', { name: 'К мероприятию' }),
    );

    expect(await screen.findByText('Страница мероприятия')).not.toBeNull();
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
    expect(await screen.findByText('Запись категории attempt-1')).not.toBeNull();
    expect(getSurface).toHaveBeenCalledTimes(1);

    // A correction in the record still invalidates the surface, so the read
    // stays fresh after a write even without a clock poll.
    fireEvent.click(screen.getByRole('button', { name: 'Исправить запись' }));

    await waitFor(() => {
      expect(getSurface).toHaveBeenCalledTimes(2);
    });
  });

  it('puts the active category above an untouched one', async () => {
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
    // RUNNING is the referee's current work, so it leads the list even though
    // the backend returned the untouched men's block first.
    expect(text.indexOf('5 км · Женщины')).toBeLessThan(
      text.indexOf('5 км · Мужчины'),
    );
  });

  it('sorts a finished category below an untouched one', async () => {
    mockCapture();
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        categories: [
          block({
            state: 'COMPLETED',
            attemptId: 'attempt-done',
            officialStartedAt: '2026-11-13T09:00:00.000Z',
            elapsedMs: 65_000,
            startControlEnabled: false,
          }),
          block({ gender: 'F' }),
        ],
      }),
    );

    const { container } = renderPage();

    expect(await screen.findByText('5 км · Женщины')).not.toBeNull();
    expect(screen.getByText('5 км · Мужчины')).not.toBeNull();
    const text = container.textContent ?? '';
    expect(text.indexOf('5 км · Женщины')).toBeLessThan(
      text.indexOf('5 км · Мужчины'),
    );
  });

  it('moves a running heat group above an untouched category', async () => {
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        categories: [
          block({ gender: 'F' }),
          block(),
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
    mockCapture();

    const { container } = renderPage();

    expect(await screen.findByText('Заезд 1')).not.toBeNull();
    expect(screen.getByText('5 км · Женщины')).not.toBeNull();
    const text = container.textContent ?? '';
    // The heat block carries its category group up, stage header included.
    expect(text.indexOf('Заезды сформированы')).toBeLessThan(
      text.indexOf('5 км · Женщины'),
    );
    expect(text.indexOf('Заезд 1')).toBeLessThan(
      text.indexOf('5 км · Женщины'),
    );
  });

  it('shares the row by roster size: three small, two medium, one large', async () => {
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        categories: [
          block({ participants: roster(6) }),
          block({ gender: 'F', participants: roster(10) }),
          block({ startId: 'start-b', participants: roster(13) }),
        ],
      }),
    );
    mockCapture();

    const { container } = renderPage();

    await waitFor(() =>
      expect(container.querySelectorAll('.timing-block-row__item')).toHaveLength(
        3,
      ),
    );
    const items = [
      ...container.querySelectorAll<HTMLElement>('.timing-block-row__item'),
    ];
    expect(items.map((item) => item.getAttribute('data-layout'))).toEqual([
      'third',
      'half',
      'full',
    ]);
    // A lone 7-participant category keeps half the row instead of growing.
    expect(items[1].style.flex).toBe('0 0 calc(50% - 8px)');
    expect(items[2].style.flex).toBe('0 0 100%');
  });

  it('packs same-size groups into even rows and never mixes widths', () => {
    const group = (key: string, layout: 'third' | 'half' | 'full') => ({
      key,
      layout,
    });
    const rows = timingBlockRows([
      group('t1', 'third'),
      group('t2', 'third'),
      group('t3', 'third'),
      group('t4', 'third'),
      group('h1', 'half'),
      group('h2', 'half'),
      group('f1', 'full'),
    ]);
    expect(rows.map((row) => row.map((item) => item.key))).toEqual([
      ['t1', 't2', 't3'],
      ['t4'],
      ['h1', 'h2'],
      ['f1'],
    ]);
    expect(
      timingBlockRows([
        group('t1', 'third'),
        group('h1', 'half'),
        group('t2', 'third'),
      ]).map((row) => row.map((item) => item.key)),
    ).toEqual([
      ['t1', 't2'],
      ['h1'],
    ]);
    // A full-width race between two halves does not leave one half orphaned.
    expect(
      timingBlockRows([
        group('h1', 'half'),
        group('t1', 'third'),
        group('t2', 'third'),
        group('f1', 'full'),
        group('h2', 'half'),
      ]).map((row) => row.map((item) => item.key)),
    ).toEqual([
      ['h1', 'h2'],
      ['t1', 't2'],
      ['f1'],
    ]);

    // Two items always split the row exactly; a lone half is never full width.
    expect(timingRowItemFlex('half', 2)).toBe(
      '1 1 calc((100% - 16px) / 2)',
    );
    expect(timingRowItemFlex('half', 1)).toBe(
      '0 0 calc((100% - 16px) / 2)',
    );
    expect(timingRowItemFlex('third', 2)).toBe(
      '1 1 calc((100% - 16px) / 2)',
    );
    expect(timingRowItemFlex('third', 3)).toBe(
      '1 1 calc((100% - 32px) / 3)',
    );
    expect(timingRowItemFlex('full', 1)).toBe('0 0 100%');
  });

  it('sizes a group at 6 and 12 participants and ignores race-section rows', () => {
    expect(timingBlockLayout([block({ participants: roster(6) })])).toBe(
      'third',
    );
    expect(timingBlockLayout([block({ participants: roster(7) })])).toBe('half');
    expect(
      timingBlockLayout([block({ participants: roster(12) })]),
    ).toBe('half');
    expect(
      timingBlockLayout([block({ participants: roster(13) })]),
    ).toBe('full');
    const raceSection = roster(20).map((participant) => ({
      ...participant,
      excludedReason: 'RACE_SECTION',
    }));
    expect(
      timingBlockLayout([
        block({ participants: [...roster(2), ...raceSection] }),
      ]),
    ).toBe('third');
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

    expect(await screen.findByText(/Только для чтения/)).not.toBeNull();
    expect(screen.getByText('Захват у устройства ws-other')).not.toBeNull();
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

    expect(await screen.findByText('Запись категории attempt-1')).not.toBeNull();
    const drawer = drawerProps.current.at(-1);
    expect(drawer?.open).toBe(true);
    expect(drawer?.title).toBe('Запись категории');
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
    expect(screen.queryByText('Неприсвоенные отсечки')).toBeNull();
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
    expect(await screen.findByText('Запись категории attempt-1')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть запись' }));

    await waitFor(() => {
      expect(screen.queryByText('Запись категории attempt-1')).toBeNull();
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
    expect(await screen.findByText('Запись категории attempt-1')).not.toBeNull();

    // The attempt is gone from the surface: no newest attempt and no earlier
    // one of the category. The drawer must not keep reading a dropped record.
    getSurface.mockResolvedValue(surface());
    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));

    await waitFor(() => {
      expect(screen.queryByText('Запись категории attempt-1')).toBeNull();
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

    expect(await screen.findByText('Неприсвоенные отсечки')).not.toBeNull();
    expect(screen.getByText('В очереди: 1')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: /^Отсечка 1:/ }),
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

    fireEvent.click(await screen.findByRole('button', { name: /^Отсечка 1:/ }));

    const field = screen.getByLabelText('Номер участника');
    expect(field).toBe(document.activeElement);
    expect(screen.queryByText(/^Отсечка будет назначена/)).toBeNull();
    fireEvent.change(field, { target: { value: '17' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() =>
      expect(capture.assignAnonymousSplit).toHaveBeenCalledWith('split-1', 17),
    );
    // The accepted assignment exits the mode and drops the queue selection.
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: /^Отсечка 1:/ })
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
      await screen.findByRole('button', { name: 'Отменить отсечку 1' }),
    );
    fireEvent.change(screen.getByLabelText('Причина отмены отсечки'), {
      target: { value: 'Дубль нажатия' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отменить отсечку' }));

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
      expect(screen.queryByRole('button', { name: /^Отсечка 1:/ })).toBeNull(),
    );
    expect(screen.getByText('В очереди: 0')).not.toBeNull();
    expect(screen.queryByText('Назначение отсечки')).toBeNull();
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

  it('packs the heats of one stage by their own roster size', async () => {
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({
        categories: [
          block({ participants: roster(30) }),
          heatBlock({ participants: roster(7) }),
          heatBlock({
            blockKey: 'heat:race-1:stage-1:2',
            heatNumber: 2,
            heatLabel: 'Заезд 2',
            participants: roster(7),
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

    expect(await screen.findByText('Заезд 2')).not.toBeNull();
    // The race section is full width and its two 7-participant heats share a
    // row as exact halves instead of stacking as full-width cards.
    const raceItem = container.querySelector(
      '.timing-block-row__item[data-layout="full"] .timing-race-section',
    );
    expect(raceItem).not.toBeNull();
    const stage = container.querySelector('.timing-stage-section');
    const heats = [
      ...(stage?.querySelectorAll<HTMLElement>('.timing-block-row__item') ??
        []),
    ];
    expect(heats).toHaveLength(2);
    expect(heats.map((heat) => heat.getAttribute('data-layout'))).toEqual([
      'half',
      'half',
    ]);
    expect(heats[0].style.flex).toBe('1 1 calc(50% - 8px)');
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

    fireEvent.click(await screen.findByRole('button', { name: /^Отсечка 1:/ }));

    const field = screen.getByLabelText('Номер участника');
    expect(field).toBe(document.activeElement);
    expect(screen.queryByText(/^Отсечка будет назначена/)).toBeNull();

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
    // A category whose start has been given hides the Start control; the
    // reason and the closed state stay, and nothing is started.
    expect(screen.queryByRole('button', { name: /Старт/ })).toBeNull();
    expect(capture.startAttempt).not.toHaveBeenCalled();
  });

  it('states the missing connection beside the controls and keeps capture open', async () => {
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
            elapsedMs: 1000,
            startControlEnabled: false,
          }),
        ],
      }),
    );
    mockCapture({ isOnline: false });

    renderPage();

    expect(await screen.findByText('Нет связи с сервером')).not.toBeNull();
    // Offline timing is capture-only, never capture-less: the outbox records
    // the press and the queue states that it is empty (E-01, FR-16).
    expect(
      (screen.getByLabelText('Номер участника') as HTMLInputElement).disabled,
    ).toBe(false);
    // No queue occupies page flow, and the trigger keeps its reserved place at
    // zero (S-08, U-12).
    expect(screen.queryByText('Очередь отправки')).toBeNull();
    const trigger = figuresTrigger(0, 0, 0, 0);
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Очередь отправки' });
    expect(within(dialog).getByText('Всё отправлено')).not.toBeNull();
    // Nothing is unsent, so the overlay offers no send action (E-11, F-06).
    expect(
      within(dialog).queryByRole('button', { name: /Отправить сейчас/ }),
    ).toBeNull();
  });

  it('lists only unsent send-queue rows and wires send-now', async () => {
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
            elapsedMs: 1000,
            startControlEnabled: false,
          }),
        ],
      }),
    );
    const capture = mockCapture({ queueItems: [queueItem()] });

    renderPage();

    await screen.findByText('5 км · Мужчины');
    // The queue is reachable only through the figures line: page flow holds no
    // list of unsent entries (U-07, F-10).
    expect(screen.queryByText('Очередь отправки')).toBeNull();
    fireEvent.click(figuresTrigger(1, 0, 1, 1));

    expect(await screen.findByText('Очередь отправки')).not.toBeNull();
    expect(screen.getByText('Отметка по номеру')).not.toBeNull();
    expect(screen.getByText('не отправлено')).not.toBeNull();
    expect(screen.queryByText('Отклонено')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Отправить сейчас/ }));
    await waitFor(() => expect(capture.sendNow).toHaveBeenCalledTimes(1));
  });

  it('does not flash the send queue while the only unsent capture is in flight', async () => {
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
            elapsedMs: 1000,
            startControlEnabled: false,
          }),
        ],
      }),
    );
    mockCapture({
      queueItems: [queueItem({ status: 'SENT' })],
      inFlightIds: new Set(['queue-1']),
    });

    renderPage();

    expect(await screen.findByText('5 км · Мужчины')).not.toBeNull();
    // Nothing appears in page flow while the only unsent capture is in flight.
    expect(screen.queryByText('Очередь отправки')).toBeNull();

    fireEvent.click(figuresTrigger(1, 1, 0, 1));

    const dialog = screen.getByRole('dialog', { name: 'Очередь отправки' });
    // A sending capture is a figure, never a row (E-06, F-05, S-05).
    expect(within(dialog).queryByText('не отправлено')).toBeNull();
    expect(within(dialog).getByText(/Отправляется: 1$/)).not.toBeNull();
    expect(within(dialog).queryByText('Всё отправлено')).toBeNull();
    expect(
      within(dialog).getByRole('button', { name: /Отправить сейчас/ }),
    ).not.toBeNull();
  });

  it('makes the reserved figures line the one trigger of the out-of-flow overlay', async () => {
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(surface());
    mockCapture();

    const { container } = renderPage();

    const trigger = await screen.findByRole('button', {
      name: 'Не отправлено: 0 · Отправляется: 0 · Ожидают отправки: 0 · из них отметок: 0',
    });
    // The figures line is present at zero and is the only way into the overlay
    // (U-08, S-08, U-12).
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('title')).toBe(trigger.textContent);

    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Очередь отправки' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(
      within(dialog).getByText('Не отправлено: 0 · Отправляется: 0'),
    ).not.toBeNull();
    expect(
      within(dialog).getByText('Ожидают отправки: 0 · из них отметок: 0'),
    ).not.toBeNull();
    // The overlay floats over the page and is never inside the block rows, so
    // nothing behind it is pushed or re-packed (U-07, F-10).
    const blockRows = container.querySelector('.timing-block-rows');
    expect(blockRows).not.toBeNull();
    expect(blockRows?.contains(dialog)).toBe(false);
  });

  it('records a tile press behind the open overlay and closes nothing', async () => {
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
          elapsedMs: 1000,
          startControlEnabled: false,
        }),
      ],
    });
    getSurface.mockResolvedValue(view);
    const capture = mockCapture();

    renderPage();

    await screen.findByText('5 км · Мужчины');
    fireEvent.click(figuresTrigger(0, 0, 0, 0));
    const dialog = screen.getByRole('dialog', { name: 'Очередь отправки' });

    fireEvent.click(screen.getByRole('button', { name: '17 Иван Петров' }));

    await waitFor(() => {
      expect(capture.commitTile).toHaveBeenCalledWith(
        view.categories[0].participants[0],
        'attempt-1',
      );
    });
    // A press outside the overlay performs its own action and closes nothing
    // (S-06, F-03).
    expect(screen.getByRole('dialog', { name: 'Очередь отправки' })).toBe(
      dialog,
    );
  });

  it('records a typed number behind the open overlay and closes nothing', async () => {
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
            elapsedMs: 1000,
            startControlEnabled: false,
          }),
        ],
      }),
    );
    const capture = mockCapture({
      resolveCandidates: vi.fn(() => [
        {
          enrollmentId: 'enrollment-1',
          attemptId: 'attempt-1',
          label: '17 Иван Петров',
        },
      ]),
    });

    renderPage();

    await screen.findByText('5 км · Мужчины');
    fireEvent.click(figuresTrigger(0, 0, 0, 0));
    const dialog = screen.getByRole('dialog', { name: 'Очередь отправки' });

    const field = screen.getByLabelText('Номер участника');
    fireEvent.change(field, { target: { value: '17' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() =>
      expect(capture.commitNumber).toHaveBeenCalledWith(
        expect.objectContaining({ startNumber: 17 }),
      ),
    );
    // The number field stays operable while the overlay is open (S-06).
    expect(screen.getByRole('dialog', { name: 'Очередь отправки' })).toBe(
      dialog,
    );
  });

  it('closes the overlay on Escape and returns focus to the trigger from inside', async () => {
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(surface());
    mockCapture();

    renderPage();

    const trigger = await screen.findByRole('button', {
      name: 'Не отправлено: 0 · Отправляется: 0 · Ожидают отправки: 0 · из них отметок: 0',
    });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Очередь отправки' });
    // Opening announces the title and takes keyboard focus (E-09).
    expect(
      within(dialog).getByRole('button', { name: 'Закрыть очередь отправки' }),
    ).toBe(document.activeElement);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(
      screen.queryByRole('dialog', { name: 'Очередь отправки' }),
    ).toBeNull();
    expect(trigger).toBe(document.activeElement);
  });

  it('closes the overlay on Escape without moving focus or the typed number', async () => {
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
            elapsedMs: 1000,
            startControlEnabled: false,
          }),
        ],
      }),
    );
    mockCapture();

    renderPage();

    const trigger = await screen.findByRole('button', {
      name: 'Не отправлено: 0 · Отправляется: 0 · Ожидают отправки: 0 · из них отметок: 0',
    });
    fireEvent.click(trigger);
    expect(
      screen.getByRole('dialog', { name: 'Очередь отправки' }),
    ).not.toBeNull();

    const field = screen.getByLabelText('Номер участника') as HTMLInputElement;
    fireEvent.change(field, { target: { value: '17' } });
    field.focus();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(
      screen.queryByRole('dialog', { name: 'Очередь отправки' }),
    ).toBeNull();
    // Closing never steals focus from the field or rewrites a typed value
    // (E-08, F-04), so the trigger is not focused instead.
    expect(field).toBe(document.activeElement);
    expect(field.value).toBe('17');
    expect(trigger).not.toBe(document.activeElement);
  });

  it('closes the overlay from its own control and returns focus to the trigger', async () => {
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(surface());
    mockCapture();

    renderPage();

    const trigger = await screen.findByRole('button', {
      name: 'Не отправлено: 0 · Отправляется: 0 · Ожидают отправки: 0 · из них отметок: 0',
    });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Очередь отправки' });

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Закрыть очередь отправки' }),
    );

    expect(
      screen.queryByRole('dialog', { name: 'Очередь отправки' }),
    ).toBeNull();
    expect(trigger).toBe(document.activeElement);
  });

  it('reserves one fixed rows-worth of space for the figures trigger', async () => {
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(surface());
    mockCapture();

    const { container } = renderPage();

    const trigger = await screen.findByRole('button', {
      name: 'Не отправлено: 0 · Отправляется: 0 · Ожидают отправки: 0 · из них отметок: 0',
    });
    const row = trigger.parentElement as HTMLElement;
    // jsdom has no layout, so the reserved single-line row is asserted
    // structurally (U-12, S-08).
    expect(row.style.minHeight).toBe('32px');
    expect(row.style.position).toBe('relative');
    expect(trigger.style.whiteSpace).toBe('nowrap');
    expect(trigger.style.height).toBe('28px');
    // The figures appear once: the trigger is the only element stating them.
    expect((container.textContent ?? '').match(/Не отправлено: 0/g)).toHaveLength(
      1,
    );
  });

  it('leaves no send queue in page flow while the overlay is closed', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({ captureWorkstationInstanceId: 'ws-1' }),
    );
    mockCapture({ queueItems: [queueItem()] });

    renderPage();

    expect(await screen.findByText('5 км · Мужчины')).not.toBeNull();
    expect(screen.queryByText('Очередь отправки')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Отправить сейчас/ }),
    ).toBeNull();
    // The trigger states the same figures in its reserved row instead.
    expect(
      screen.getByText(
        'Не отправлено: 1 · Отправляется: 0 · Ожидают отправки: 1 · из них отметок: 1',
      ),
    ).not.toBeNull();
  });

  it('shows the pending marks of each block from the derived outbox view', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    const heat = heatBlock({
      gender: 'F',
      state: 'RUNNING',
      attemptId: 'attempt-heat',
      officialStartedAt: '2026-11-13T09:00:00.000Z',
      elapsedMs: 1000,
      startControlEnabled: false,
      participants: [
        {
          enrollmentId: 'enrollment-2',
          registrationId: 'registration-2',
          startNumber: 21,
          fullName: 'Пётр Сидоров',
          sectionId: '4 - Женщины (24–40)',
          passCount: 0,
          requiredLaps: 3,
          lastPassAt: null,
          state: 'RACING',
          excludedReason: null,
        },
      ],
    });
    getSurface.mockResolvedValue(
      surface({
        captureWorkstationInstanceId: 'ws-1',
        categories: [
          block({
            state: 'RUNNING',
            attemptId: 'attempt-1',
            officialStartedAt: '2026-11-13T09:00:00.000Z',
            elapsedMs: 1000,
            startControlEnabled: false,
          }),
          heat,
        ],
        stageGroups: [stageGroup()],
      }),
    );
    mockCapture({
      queueItems: [
        queueItem(),
        queueItem({
          id: 'queue-heat',
          attemptId: 'attempt-heat',
          deviceSequence: 2,
          createdAt: '2026-11-13T09:00:02.000Z',
          payload: {
            kind: 'NUMBER',
            attemptId: 'attempt-heat',
            startNumber: 21,
            clientCapturedAt: '2026-11-13T09:00:02.000Z',
          },
        }),
      ],
    });

    renderPage();

    await screen.findByText('Заезд 1');
    // A category and a heat each read their own share of the same derivation
    // (FR-10, FR-37); no block invents a count of its own.
    expect(screen.getAllByText('Отметок не отправлено: 1')).toHaveLength(2);
    expect(
      screen.getByRole('button', {
        name: '17 Иван Петров, кругов подтверждено: 0, не отправлено: 1',
      }),
    ).not.toBeNull();
    expect(
      screen.getByRole('button', {
        name: '21 Пётр Сидоров, кругов подтверждено: 0, не отправлено: 1',
      }),
    ).not.toBeNull();
  });

  it('withholds capture transfer and gives the drawer no device-wide count', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({ captureWorkstationInstanceId: 'ws-1' }),
    );
    mockCapture({
      queueItems: [queueItem()],
      unresolvedByAttempt: { 'attempt-1': 1 },
      isOnline: false,
    });

    renderPage();

    expect(
      await screen.findByText(
        'Передача захвата недоступна: есть неотправленные записи.',
      ),
    ).not.toBeNull();
    expect(screen.getByText('Нужна связь с сервером.')).not.toBeNull();
    // The transfer gate stays device-wide (FR-30), so it reads the page total.
    // The drawer reads its own attempt only (FR-27, FR-43), and it has no
    // attempt open here, so the device-wide 1 never reaches it.
    const drawer = drawerProps.current.at(-1);
    expect(drawer?.isOnline).toBe(false);
    expect(drawer?.attemptId).toBeNull();
    expect(drawer?.unresolvedEntries).toBe(0);
  });

  it('names the page unsent total in the status of an unsent press', async () => {
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
            elapsedMs: 1000,
            startControlEnabled: false,
          }),
        ],
      }),
    );
    mockCapture({
      queueItems: [queueItem()],
      resolveCandidates: vi.fn(() => [
        {
          enrollmentId: 'enrollment-1',
          attemptId: 'attempt-1',
          label: '17 Иван Петров',
        },
      ]),
      commitNumber: vi.fn((): Promise<TimingCaptureOutcome> =>
        Promise.resolve({ status: 'UNSENT' }),
      ),
    });

    renderPage();

    const field = (await screen.findByLabelText(
      'Номер участника',
    )) as HTMLInputElement;
    fireEvent.change(field, { target: { value: '17' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(
      await screen.findByText(
        '№ 17 — отметка сохранена на устройстве, не отправлено: 1',
      ),
    ).not.toBeNull();
    // An unsent press is recorded, so the field is free for the next number.
    expect(field.value).toBe('');
  });

  it('leaves the assignment mode after an unsent assignment', async () => {
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
            elapsedMs: 1000,
            startControlEnabled: false,
          }),
        ],
        anonymousSplits: [anonymousSplit()],
      }),
    );
    mockCapture({
      assignAnonymousSplit: vi.fn((): Promise<TimingCaptureOutcome> =>
        Promise.resolve({ status: 'UNSENT' }),
      ),
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /^Отсечка 1:/ }));
    const field = screen.getByLabelText('Номер участника');
    fireEvent.change(field, { target: { value: '17' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    // The unsent assignment keeps its queue row but the split is not offered
    // for a second assignment from the field (E-13).
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: /^Отсечка 1:/ })
          .getAttribute('aria-pressed'),
      ).toBe('false'),
    );
  });

  it('refuses a Start without connection and writes nothing', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({ captureWorkstationInstanceId: 'ws-1' }),
    );
    const capture = mockCapture({ isOnline: false });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Старт/ }));

    await waitFor(() => {
      // The controls state their own transfer reason, and the page states its
      // refusal of the Start beside them (U-07, F-04).
      expect(screen.getAllByText('Нужна связь с сервером.')).toHaveLength(2);
    });
    expect(capture.startAttempt).not.toHaveBeenCalled();
  });

  it('states the volatile loss risk and asks before leaving while entries are unsent', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({ captureWorkstationInstanceId: 'ws-1' }),
    );
    // A device that keeps its outbox in memory loses it on a reload, so the
    // page states that before the loss and asks for confirmation (FR-30, O-01).
    mockCapture({ isDurable: false, queueItems: [queueItem()] });

    const { unmount } = renderPage();

    expect(
      await screen.findByText(
        'Записи хранятся только в этой вкладке. Перезагрузка или закрытие страницы их потеряет.',
      ),
    ).not.toBeNull();
    expect(fireBeforeUnload()).toBe(true);

    // The guard follows the condition: an unmounted page asks for nothing.
    unmount();
    expect(fireBeforeUnload()).toBe(false);
  });

  it('keeps the volatile notice and the leave guard off when nothing is unsent', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({ captureWorkstationInstanceId: 'ws-1' }),
    );
    // An empty queue has nothing to lose, so the volatile risk is not stated
    // (FR-30).
    mockCapture({ isDurable: false, queueItems: [] });

    renderPage();

    expect(await screen.findByText('5 км · Мужчины')).not.toBeNull();
    expect(
      screen.queryByText(
        'Записи хранятся только в этой вкладке. Перезагрузка или закрытие страницы их потеряет.',
      ),
    ).toBeNull();
    expect(fireBeforeUnload()).toBe(false);
  });

  it('keeps the volatile notice and the leave guard off when the outbox is durable', async () => {
    sessionStorage.setItem('timing-workstation-instance', 'ws-1');
    mockSession(['REFEREE']);
    mockEvent();
    getSurface.mockResolvedValue(
      surface({ captureWorkstationInstanceId: 'ws-1' }),
    );
    // Entries that survive the page need no warning (FR-30).
    mockCapture({ isDurable: true, queueItems: [queueItem()] });

    renderPage();

    expect(
      await screen.findByText(
        'Не отправлено: 1 · Отправляется: 0 · Ожидают отправки: 1 · из них отметок: 1',
      ),
    ).not.toBeNull();
    expect(
      screen.queryByText(
        'Записи хранятся только в этой вкладке. Перезагрузка или закрытие страницы их потеряет.',
      ),
    ).toBeNull();
    expect(fireBeforeUnload()).toBe(false);
  });

  it('states the unsent, sending and waiting figures from one outbox snapshot', async () => {
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
            participants: roster(6),
          }),
        ],
      }),
    );
    // Six captures of this device are unresolved: two have an outstanding
    // delivery and four still wait as recorded (S-01, FR-32).
    mockCapture({
      queueItems: roster(6).map((participant, index) =>
        queueItem({
          id: `queue-${index + 1}`,
          deviceSequence: index + 1,
          status: index < 2 ? 'SENT' : 'PENDING',
          payload: {
            kind: 'NUMBER',
            attemptId: 'attempt-1',
            startNumber: participant.startNumber,
            clientCapturedAt: '2026-11-13T09:00:01.000Z',
            clientElapsedMs: 1000,
            clockEpochId: 'epoch-1',
            workstationInstanceId: 'ws-1',
            deviceSequence: index + 1,
          },
        }),
      ),
    });

    renderPage();

    const figures = await screen.findByText(
      'Не отправлено: 6 · Отправляется: 2 · Ожидают отправки: 4 · из них отметок: 6',
    );
    // The three figures read one snapshot, so the unsent total is exactly the
    // sending and waiting captures together (S-01, S-04).
    const [, unsent, sending, waiting] =
      /Не отправлено: (\d+) · Отправляется: (\d+) · Ожидают отправки: (\d+)/.exec(
        figures.textContent ?? '',
      ) ?? [];
    expect(Number(unsent)).toBe(6);
    expect(Number(sending)).toBe(2);
    expect(Number(waiting)).toBe(4);
    expect(Number(unsent)).toBe(Number(sending) + Number(waiting));
    // The accepted mark figure stays where it was, so the page and the tiles
    // still agree about every pending mark (S-04).
    expect(figures.textContent ?? '').toContain('из них отметок: 6');

    fireEvent.click(figures);

    // A sending capture is a figure, not a queue row: the send queue lists the
    // four waiting captures only (S-02).
    expect(screen.getAllByText('не отправлено')).toHaveLength(4);
  });

  it('keeps a refused outcome visible through the field after a later press', async () => {
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
    // The hook's answer feed holds the refusal of an earlier press. The field
    // never awaited that answer, because the press was accepted before it
    // arrived, so the feed is the only way the referee can still see it
    // (AD-7, E-12, FR-33).
    const refused: TimingCaptureOutcomeEvent = {
      id: 'queue-earlier',
      subject: '№ 14',
      tone: 'refused',
      reason: 'Участник уже прошёл все круги',
      at: '2026-11-13T09:00:02.000Z',
    };
    mockCapture({
      captureOutcomes: [refused],
      resolveCandidates: vi.fn(() => [
        {
          enrollmentId: 'enrollment-1',
          attemptId: 'attempt-1',
          label: '17 Иван Петров',
        },
      ]),
      commitNumber: vi.fn(
        (): Promise<TimingCaptureOutcome> =>
          Promise.resolve({ status: 'ACCEPTED' }),
      ),
    });

    renderPage();

    const field = (await screen.findByLabelText(
      'Номер участника',
    )) as HTMLInputElement;
    expect(
      await screen.findByText('Отклонено: № 14 — Участник уже прошёл все круги'),
    ).not.toBeNull();

    // A later press is accepted and leaves the refusal where it was: only the
    // referee dismisses it (S-09, E-12, F-06).
    fireEvent.change(field, { target: { value: '17' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(
      await screen.findByText('№ 17 — принято, ожидает подтверждения'),
    ).not.toBeNull();
    expect(
      screen.getByText('Отклонено: № 14 — Участник уже прошёл все круги'),
    ).not.toBeNull();
  });

  it('gates each attempt closure on its own unresolved captures only', async () => {
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
    // One unresolved capture in each block: the device holds two, but neither
    // closure may count the neighbour's capture (E-24, F-15, FR-43).
    mockCapture({ unresolvedByAttempt: { 'attempt-1': 1, 'attempt-2': 1 } });

    renderPage();

    const menCard = (await screen.findByText('5 км · Мужчины')).closest(
      '.ant-card',
    ) as HTMLElement;
    fireEvent.click(within(menCard).getByRole('button', { name: /Запись/ }));

    expect(await screen.findByText('Запись категории attempt-1')).not.toBeNull();
    expect(
      screen.getByText(
        'Завершение ждёт отправки: неотправленных записей — 1. Сначала отправьте их на сервер.',
      ),
    ).not.toBeNull();
    expect(
      (
        screen.getByRole('button', {
          name: 'Завершить хронометраж',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть запись' }));
    await waitFor(() =>
      expect(screen.queryByText('Запись категории attempt-1')).toBeNull(),
    );

    const womenCard = (screen.getByText('5 км · Женщины') as HTMLElement).closest(
      '.ant-card',
    ) as HTMLElement;
    fireEvent.click(within(womenCard).getByRole('button', { name: /Запись/ }));

    expect(await screen.findByText('Запись категории attempt-2')).not.toBeNull();
    expect(
      screen.getByText(
        'Завершение ждёт отправки: неотправленных записей — 1. Сначала отправьте их на сервер.',
      ),
    ).not.toBeNull();
    expect(screen.queryByText(/неотправленных записей — 2/)).toBeNull();
  });

  it('enables the closure of an attempt with every capture settled', async () => {
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
    // Every capture of the device has its final answer, so the attempt's
    // closure has nothing to wait for (S-08, E-13, F-10).
    mockCapture({ unresolvedByAttempt: {} });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Запись/ }));

    expect(await screen.findByText('Запись категории attempt-1')).not.toBeNull();
    expect(screen.queryByText(/Завершение ждёт отправки/)).toBeNull();
    expect(
      (
        screen.getByRole('button', {
          name: 'Завершить хронометраж',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});
