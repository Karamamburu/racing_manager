import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttemptRecordDrawer } from './AttemptRecordDrawer';
import type { AttemptRecordDrawerProps } from './AttemptRecordDrawer';
import { formatTimingClock } from './ParticipantTile';
import { timingService } from './timingService';
import type {
  TimingAttemptRecordView,
  TimingAuditView,
  TimingPassView,
  TimingPublishedResultView,
} from './types';

vi.mock('./timingService', () => ({
  timingService: {
    getAttemptRecord: vi.fn(),
    completeAttempt: vi.fn(),
    quickUndo: vi.fn(),
    correctOfficialTime: vi.fn(),
    cancelPass: vi.fn(),
    rebindPass: vi.fn(),
    cancelPendingFinish: vi.fn(),
    forceCompleteAttempt: vi.fn(),
    cancelAttempt: vi.fn(),
  },
}));

const PARTICIPANT_NAMES: Record<string, string> = {
  'enrollment-1': 'Иван Петров',
  'enrollment-2': 'Борис Орлов',
  'enrollment-3': 'Вера Смирнова',
};

function pass(overrides: Partial<TimingPassView> = {}): TimingPassView {
  return {
    passId: 'pass-1',
    attemptId: 'attempt-1',
    enrollmentId: 'enrollment-1',
    lapNumber: 1,
    rawCapturedAt: '2026-11-13T09:01:00.000Z',
    officialAt: '2026-11-13T09:01:00.000Z',
    officialElapsedMs: 60_000,
    status: 'BOUND',
    ...overrides,
  };
}

function pendingFinish(overrides: Partial<TimingPassView> = {}): TimingPassView {
  return pass({
    passId: 'pending-1',
    enrollmentId: null,
    lapNumber: null,
    rawCapturedAt: '2026-11-13T09:05:00.000Z',
    officialAt: '2026-11-13T09:05:00.000Z',
    officialElapsedMs: 300_000,
    status: 'PENDING',
    ...overrides,
  });
}

function auditRow(overrides: Partial<TimingAuditView> = {}): TimingAuditView {
  return {
    auditId: 'audit-1',
    actorUserId: 'user-admin',
    action: 'OFFICIAL_TIME_CORRECTED',
    targetType: 'PASS',
    targetId: 'pass-1',
    oldValues: { officialAt: '2026-11-13T09:01:00.000Z' },
    newValues: { officialAt: '2026-11-13T09:01:05.000Z' },
    reason: 'Секундомер отстал',
    createdAt: '2026-11-13T09:10:00.000Z',
    ...overrides,
  };
}

function publishedResult(): TimingPublishedResultView {
  return {
    id: 'result-1',
    enrollmentId: 'enrollment-3',
    registrationId: 'registration-3',
    outcome: 'FINISHED',
    timeMilliseconds: 300_000,
    recordedAt: '2026-11-13T09:20:00.000Z',
    updatedAt: '2026-11-13T09:20:00.000Z',
    laps: [
      { lapNumber: 1, lapTimeMs: 30_000, cumulativeMs: 30_000 },
      { lapNumber: 2, lapTimeMs: 90_000, cumulativeMs: 120_000 },
    ],
  };
}

function record(
  overrides: Partial<TimingAttemptRecordView> = {},
): TimingAttemptRecordView {
  return {
    attemptId: 'attempt-1',
    state: 'RUNNING',
    officialStartedAt: '2026-11-13T09:00:00.000Z',
    passes: [pass()],
    pendingFinishes: [],
    closureReport: null,
    publishedResults: [],
    audit: [],
    ...overrides,
  };
}

function drawerProps(
  overrides: Partial<AttemptRecordDrawerProps> = {},
): AttemptRecordDrawerProps {
  return {
    open: true,
    eventId: 'event-1',
    attemptId: 'attempt-1',
    participantNames: PARTICIPANT_NAMES,
    canAdminister: false,
    canOperate: true,
    workstationInstanceId: 'ws-1',
    onClose: vi.fn(),
    onChanged: vi.fn(),
    ...overrides,
  };
}

function renderDrawer(overrides: Partial<AttemptRecordDrawerProps> = {}) {
  const props = drawerProps(overrides);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <AttemptRecordDrawer {...props} />
    </QueryClientProvider>,
  );
  return { props, ...view };
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(timingService.getAttemptRecord).mockResolvedValue(record());
  vi.mocked(timingService.completeAttempt).mockResolvedValue(record());
  vi.mocked(timingService.quickUndo).mockResolvedValue(
    pass({ status: 'CANCELLED', lapNumber: null }),
  );
});

afterEach(cleanup);

describe('AttemptRecordDrawer states', () => {
  it('reads the record when open and shows it after loading', async () => {
    let resolveRecord!: (value: TimingAttemptRecordView) => void;
    vi.mocked(timingService.getAttemptRecord).mockReturnValue(
      new Promise<TimingAttemptRecordView>((resolve) => {
        resolveRecord = resolve;
      }),
    );

    renderDrawer();

    expect(timingService.getAttemptRecord).toHaveBeenCalledWith(
      'event-1',
      'attempt-1',
    );
    expect(screen.queryByText('Отсечки')).toBeNull();

    resolveRecord(record());

    expect(await screen.findByText('Иван Петров')).not.toBeNull();
    expect(screen.getByText('Отсечки')).not.toBeNull();
  });

  it('reads nothing without an attempt id', () => {
    renderDrawer({ attemptId: null, open: true });

    expect(timingService.getAttemptRecord).not.toHaveBeenCalled();
    expect(screen.getByText('Запись попытки пуста')).not.toBeNull();
  });

  it('shows the API message when the record cannot be read', async () => {
    vi.mocked(timingService.getAttemptRecord).mockRejectedValue(
      new Error('Запись попытки недоступна'),
    );

    renderDrawer();

    expect(await screen.findByText('Запись попытки недоступна')).not.toBeNull();
    expect(
      screen.getByText('Не удалось загрузить запись попытки'),
    ).not.toBeNull();
  });
});

describe('AttemptRecordDrawer record content', () => {
  it('shows the state, the official start and the passes in official-instant order', async () => {
    const later = pass({
      passId: 'pass-2',
      enrollmentId: 'enrollment-2',
      lapNumber: 2,
      officialAt: '2026-11-13T09:02:00.000Z',
      officialElapsedMs: 120_000,
    });
    vi.mocked(timingService.getAttemptRecord).mockResolvedValue(
      record({ passes: [later, pass()] }),
    );

    renderDrawer();

    expect(await screen.findByText('Идёт')).not.toBeNull();
    expect(
      screen.getByText(
        `Официальный старт: ${formatTimingClock('2026-11-13T09:00:00.000Z')}`,
      ),
    ).not.toBeNull();
    expect(screen.getAllByText('Официальная')).toHaveLength(2);
    expect(screen.getByText('01:00.000')).not.toBeNull();
    expect(screen.getByText('02:00.000')).not.toBeNull();

    const text = document.body.textContent ?? '';
    expect(text.indexOf('Иван Петров')).toBeLessThan(
      text.indexOf('Борис Орлов'),
    );
  });

  it('shows pending finishes, the closure report and the audit rows', async () => {
    vi.mocked(timingService.getAttemptRecord).mockResolvedValue(
      record({
        state: 'COMPLETED',
        pendingFinishes: [pendingFinish()],
        closureReport: {
          publishedEnrollmentIds: ['enrollment-1'],
          unpublishedEnrollmentIds: ['enrollment-2'],
          conflictEnrollmentIds: [],
        },
        audit: [auditRow()],
      }),
    );

    renderDrawer({ canOperate: false });

    expect(await screen.findByText('Непривязанные финиши')).not.toBeNull();
    expect(
      screen.getAllByText(formatTimingClock('2026-11-13T09:05:00.000Z')),
    ).toHaveLength(2);
    expect(screen.getByText('Опубликовано: 1')).not.toBeNull();
    expect(screen.getByText('Не опубликовано: 1')).not.toBeNull();
    expect(screen.getByText('Конфликты: 0')).not.toBeNull();
    expect(screen.getByText('user-admin')).not.toBeNull();
    expect(screen.getByText('OFFICIAL_TIME_CORRECTED')).not.toBeNull();
    expect(screen.getByText('PASS · pass-1')).not.toBeNull();
    expect(screen.getByText('Секундомер отстал')).not.toBeNull();
    expect(
      screen.getByText('{"officialAt":"2026-11-13T09:01:00.000Z"}'),
    ).not.toBeNull();
  });

  it('shows the published total with its lap splits', async () => {
    vi.mocked(timingService.getAttemptRecord).mockResolvedValue(
      record({
        state: 'COMPLETED',
        closureReport: {
          publishedEnrollmentIds: ['enrollment-3'],
          unpublishedEnrollmentIds: [],
          conflictEnrollmentIds: [],
        },
        publishedResults: [publishedResult()],
      }),
    );

    renderDrawer({ canOperate: false });

    expect(await screen.findByText('Вера Смирнова')).not.toBeNull();
    expect(screen.getByText('FINISHED')).not.toBeNull();
    expect(screen.getByText('Итог: 05:00.000')).not.toBeNull();
    expect(screen.getAllByText('00:30.000')).toHaveLength(2);
    expect(screen.getByText('02:00.000')).not.toBeNull();
  });

  it('shows the cancelled banner and the read-only notice', async () => {
    vi.mocked(timingService.getAttemptRecord).mockResolvedValue(
      record({ state: 'CANCELLED' }),
    );

    renderDrawer({ canAdminister: true, canOperate: true });

    expect(await screen.findByText('Попытка отменена')).not.toBeNull();
    expect(screen.getByText('Попытка закрыта')).not.toBeNull();
    expect(screen.getByText(/не являются официальными/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Отменить попытку' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Скорректировать старт' }),
    ).toBeNull();
  });
});

describe('AttemptRecordDrawer gating', () => {
  it('hides every restricted action from a referee', async () => {
    renderDrawer({ canAdminister: false, canOperate: true });

    expect(
      await screen.findByRole('button', { name: 'Завершить попытку' }),
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Отменить последнюю отметку' }),
    ).not.toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Скорректировать старт' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Завершить принудительно' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Отменить попытку' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Скорректировать отсечку/ }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Отменить отсечку/ }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Перепривязать отсечку/ }),
    ).toBeNull();
  });

  it('offers corrections, force-complete and cancellation to an administrator', async () => {
    const clock = formatTimingClock('2026-11-13T09:01:00.000Z');
    renderDrawer({ canAdminister: true, canOperate: true });

    expect(
      await screen.findByRole('button', { name: 'Скорректировать старт' }),
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Завершить принудительно' }),
    ).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Отменить попытку' })).not.toBeNull();
    expect(
      screen.getByRole('button', { name: `Скорректировать отсечку ${clock}` }),
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: `Отменить отсечку ${clock}` }),
    ).not.toBeNull();
    expect(
      screen.getByRole('button', { name: `Перепривязать отсечку ${clock}` }),
    ).not.toBeNull();
  });

  it('opens the correction dialog for a pass with the administrator only', async () => {
    const clock = formatTimingClock('2026-11-13T09:01:00.000Z');
    renderDrawer({ canAdminister: true, canOperate: true });

    fireEvent.click(
      await screen.findByRole('button', {
        name: `Отменить отсечку ${clock}`,
      }),
    );

    expect(screen.getByText('Отмена отсечки')).not.toBeNull();
    expect(screen.getByLabelText('Причина')).not.toBeNull();
  });
});

describe('AttemptRecordDrawer completion and undo', () => {
  it('completes the attempt through the service and reports the change', async () => {
    const { props } = renderDrawer({ canOperate: true });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Завершить попытку' }),
    );

    await waitFor(() => {
      expect(timingService.completeAttempt).toHaveBeenCalledWith(
        'event-1',
        'attempt-1',
        { workstationInstanceId: 'ws-1', lastIssuedSequence: 0 },
        expect.any(String),
      );
    });
    await waitFor(() => expect(props.onChanged).toHaveBeenCalledTimes(1));
  });

  it('quick-undoes the last mark through the service and reports the change', async () => {
    const { props } = renderDrawer({ canOperate: true });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Отменить последнюю отметку' }),
    );

    await waitFor(() => {
      expect(timingService.quickUndo).toHaveBeenCalledWith(
        'event-1',
        'attempt-1',
        {
          workstationInstanceId: 'ws-1',
          deviceSequence: expect.any(Number),
        },
        expect.any(String),
      );
    });
    await waitFor(() => expect(props.onChanged).toHaveBeenCalledTimes(1));
  });

  it('keeps the record unchanged and shows the API message when completion is refused', async () => {
    vi.mocked(timingService.completeAttempt).mockRejectedValue(
      new Error('Не у всех участников собраны все отсечки'),
    );
    const { props } = renderDrawer({ canOperate: true });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Завершить попытку' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        'Не у всех участников собраны все отсечки',
      );
    });
    expect(props.onChanged).not.toHaveBeenCalled();
  });
});
