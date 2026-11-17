import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CorrectionDialog } from './CorrectionDialogs';
import type { CorrectionDialogProps, CorrectionMode } from './CorrectionDialogs';
import { timingService } from './timingService';
import type {
  TimingAttemptRecordView,
  TimingPassView,
} from './types';

vi.mock('./timingService', () => ({
  timingService: {
    correctOfficialTime: vi.fn(),
    cancelPass: vi.fn(),
    rebindPass: vi.fn(),
    cancelPendingFinish: vi.fn(),
    forceCompleteAttempt: vi.fn(),
    cancelAttempt: vi.fn(),
  },
}));

const PARTICIPANTS = [
  { enrollmentId: 'enrollment-2', label: 'Анна Соколова · № 21' },
  { enrollmentId: 'enrollment-3', label: 'Борис Орлов · № 22' },
];

function passView(): TimingPassView {
  return {
    passId: 'pass-1',
    attemptId: 'attempt-1',
    enrollmentId: 'enrollment-2',
    lapNumber: 1,
    rawCapturedAt: '2026-11-13T09:01:00.000Z',
    officialAt: '2026-11-13T09:01:00.000Z',
    officialElapsedMs: 60_000,
    status: 'BOUND',
  };
}

function attemptRecord(): TimingAttemptRecordView {
  return {
    attemptId: 'attempt-1',
    state: 'CANCELLED',
    officialStartedAt: '2026-11-13T09:00:00.000Z',
    passes: [passView()],
    pendingFinishes: [],
    closureReport: null,
    publishedResults: [],
    audit: [],
  };
}

function dialogProps(
  overrides: Partial<CorrectionDialogProps> = {},
): CorrectionDialogProps {
  return {
    mode: 'FORCE_COMPLETE',
    open: true,
    eventId: 'event-1',
    attemptId: 'attempt-1',
    participants: PARTICIPANTS,
    onClose: vi.fn(),
    onChanged: vi.fn(),
    ...overrides,
  };
}

function renderDialog(overrides: Partial<CorrectionDialogProps> = {}) {
  const props = dialogProps(overrides);
  return { props, ...render(<CorrectionDialog {...props} />) };
}

function typeReason(value: string) {
  fireEvent.change(screen.getByLabelText('Причина'), {
    target: { value },
  });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Применить' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(timingService.correctOfficialTime).mockResolvedValue(passView());
  vi.mocked(timingService.cancelPass).mockResolvedValue(passView());
  vi.mocked(timingService.rebindPass).mockResolvedValue(passView());
  vi.mocked(timingService.cancelPendingFinish).mockResolvedValue(passView());
  vi.mocked(timingService.forceCompleteAttempt).mockResolvedValue(
    attemptRecord(),
  );
  vi.mocked(timingService.cancelAttempt).mockResolvedValue(attemptRecord());
});

afterEach(cleanup);

describe('CorrectionDialog official time', () => {
  it('collects the official instant and a reason for the attempt start', async () => {
    const { props } = renderDialog({ mode: 'OFFICIAL_TIME' });

    expect(screen.getByText('Коррекция официального времени')).not.toBeNull();
    expect(screen.getByLabelText('Официальное время (ISO 8601)')).not.toBeNull();
    expect(screen.getByRole('radio', { name: 'Официальный старт' })).not.toBeNull();

    fireEvent.change(screen.getByLabelText('Официальное время (ISO 8601)'), {
      target: { value: '2026-11-13T09:00:05.000Z' },
    });
    typeReason(' Секундомер отстал ');
    submit();

    await waitFor(() => {
      expect(timingService.correctOfficialTime).toHaveBeenCalledWith(
        'event-1',
        'attempt-1',
        {
          targetType: 'START',
          targetId: 'attempt-1',
          officialAt: '2026-11-13T09:00:05.000Z',
          reason: 'Секундомер отстал',
        },
      );
    });
    await waitFor(() => expect(props.onChanged).toHaveBeenCalledTimes(1));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('corrects one pass when the dialog was opened for it', async () => {
    const { props } = renderDialog({
      mode: 'OFFICIAL_TIME',
      passId: 'pass-1',
    });

    expect(
      (screen.getByRole('radio', { name: 'Отсечка участника' }) as HTMLInputElement)
        .checked,
    ).toBe(true);

    fireEvent.change(screen.getByLabelText('Официальное время (ISO 8601)'), {
      target: { value: '2026-11-13T09:01:30.000Z' },
    });
    typeReason('Неверная отсечка');
    submit();

    await waitFor(() => {
      expect(timingService.correctOfficialTime).toHaveBeenCalledWith(
        'event-1',
        'pass-1',
        {
          targetType: 'PASS',
          targetId: 'pass-1',
          officialAt: '2026-11-13T09:01:30.000Z',
          reason: 'Неверная отсечка',
        },
      );
    });
    await waitFor(() => expect(props.onChanged).toHaveBeenCalledTimes(1));
  });

  it('refuses an empty reason before calling the API', () => {
    const { props } = renderDialog({ mode: 'OFFICIAL_TIME' });

    fireEvent.change(screen.getByLabelText('Официальное время (ISO 8601)'), {
      target: { value: '2026-11-13T09:00:05.000Z' },
    });
    submit();

    expect(screen.getByRole('alert').textContent).toBe('Укажите причину');
    expect(timingService.correctOfficialTime).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('refuses a missing or unparsable official instant', () => {
    renderDialog({ mode: 'OFFICIAL_TIME' });

    typeReason('Секундомер отстал');
    submit();
    expect(screen.getByRole('alert').textContent).toBe(
      'Укажите официальное время',
    );

    fireEvent.change(screen.getByLabelText('Официальное время (ISO 8601)'), {
      target: { value: 'вчера вечером' },
    });
    submit();
    expect(screen.getByRole('alert').textContent).toMatch(/ISO 8601/);
    expect(timingService.correctOfficialTime).not.toHaveBeenCalled();
  });
});

describe('CorrectionDialog reason-only modes', () => {
  const cases: Array<{
    mode: CorrectionMode;
    extra: Partial<CorrectionDialogProps>;
    expected: () => void;
  }> = [
    {
      mode: 'CANCEL_PASS',
      extra: { passId: 'pass-1' },
      expected: () =>
        expect(timingService.cancelPass).toHaveBeenCalledWith(
          'event-1',
          'pass-1',
          { reason: 'Дубль отметки' },
        ),
    },
    {
      mode: 'CANCEL_PENDING',
      extra: { pendingFinishId: 'pending-1' },
      expected: () =>
        expect(timingService.cancelPendingFinish).toHaveBeenCalledWith(
          'event-1',
          'pending-1',
          { reason: 'Дубль отметки' },
        ),
    },
    {
      mode: 'FORCE_COMPLETE',
      extra: {},
      expected: () =>
        expect(timingService.forceCompleteAttempt).toHaveBeenCalledWith(
          'event-1',
          'attempt-1',
          { reason: 'Дубль отметки' },
        ),
    },
    {
      mode: 'CANCEL_ATTEMPT',
      extra: {},
      expected: () =>
        expect(timingService.cancelAttempt).toHaveBeenCalledWith(
          'event-1',
          'attempt-1',
          { reason: 'Дубль отметки' },
        ),
    },
  ];

  it.each(cases)(
    'opens the $mode form, requires a reason and sends it',
    async ({ mode, extra, expected }) => {
      const { props } = renderDialog({ mode, ...extra });

      submit();
      expect(screen.getByRole('alert').textContent).toBe('Укажите причину');

      typeReason(' Дубль отметки ');
      submit();

      await waitFor(expected);
      await waitFor(() => expect(props.onChanged).toHaveBeenCalledTimes(1));
      expect(props.onClose).toHaveBeenCalledTimes(1);
    },
  );

  it('shows no official-time field for a reason-only mode', () => {
    renderDialog({ mode: 'CANCEL_ATTEMPT' });

    expect(screen.queryByLabelText('Официальное время (ISO 8601)')).toBeNull();
    expect(screen.getByLabelText('Причина')).not.toBeNull();
  });
});

describe('CorrectionDialog rebind', () => {
  it('requires a target enrollment and sends it with the reason', async () => {
    const { props } = renderDialog({
      mode: 'REBIND_PASS',
      passId: 'pass-1',
    });

    expect(screen.getByText('Новый участник')).not.toBeNull();

    typeReason('Отметка чужого участника');
    submit();
    expect(screen.getByRole('alert').textContent).toBe(
      'Выберите участника для перепривязки',
    );
    expect(timingService.rebindPass).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByText('Анна Соколова · № 21'));
    submit();

    await waitFor(() => {
      expect(timingService.rebindPass).toHaveBeenCalledWith(
        'event-1',
        'pass-1',
        {
          targetEnrollmentId: 'enrollment-2',
          reason: 'Отметка чужого участника',
        },
      );
    });
    await waitFor(() => expect(props.onChanged).toHaveBeenCalledTimes(1));
  });
});

describe('CorrectionDialog failures', () => {
  it('keeps the API message inside the modal and writes nothing', async () => {
    vi.mocked(timingService.cancelAttempt).mockRejectedValue(
      new Error('Попытку уже закрыл другой администратор'),
    );
    const { props } = renderDialog({ mode: 'CANCEL_ATTEMPT' });

    typeReason('Дубль отметки');
    submit();

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        'Попытку уже закрыл другой администратор',
      );
    });
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onChanged).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText('Причина') as HTMLTextAreaElement).value,
    ).toBe('Дубль отметки');
  });
});
