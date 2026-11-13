import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TimingCategoryBlock, formatElapsed } from './TimingCategoryBlock';
import type {
  TimingCategoryBlockView,
  TimingParticipantTileView,
  TimingPassView,
} from './types';

function participant(
  overrides: Partial<TimingParticipantTileView> = {},
): TimingParticipantTileView {
  return {
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
    ...overrides,
  };
}

function pendingFinish(overrides: Partial<TimingPassView> = {}): TimingPassView {
  return {
    passId: 'pass-1',
    attemptId: 'attempt-1',
    enrollmentId: null,
    lapNumber: null,
    rawCapturedAt: '2026-11-13T09:01:00.000Z',
    officialAt: '2026-11-13T09:01:00.000Z',
    officialElapsedMs: 60000,
    status: 'PENDING',
    ...overrides,
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
    participants: [participant()],
    pendingFinishes: [],
    lastAttempts: [],
    ...overrides,
  };
}

const RUNNING_START = '2026-11-13T09:00:00.000Z';

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

afterEach(cleanup);

describe('formatElapsed', () => {
  it('formats mm:ss.mmm below one hour', () => {
    expect(formatElapsed(0)).toBe('00:00.000');
    expect(formatElapsed(83_456)).toBe('01:23.456');
    expect(formatElapsed(59_999)).toBe('00:59.999');
  });

  it('formats h:mm:ss.mmm from one hour up', () => {
    expect(formatElapsed(3_600_000)).toBe('1:00:00.000');
    expect(formatElapsed(3_723_004)).toBe('1:02:03.004');
    expect(formatElapsed(25 * 3_600_000)).toBe('25:00:00.000');
  });
});

describe('TimingCategoryBlock', () => {
  it('renders the header facts of a category that has not started', () => {
    render(
      <TimingCategoryBlock
        block={block()}
        title="5 км · Мужчины"
        subtitle="Кубковая гонка — 10 км"
        isCaptureHolder={false}
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText('5 км · Мужчины')).not.toBeNull();
    expect(screen.getByText('Кубковая гонка — 10 км')).not.toBeNull();
    expect(screen.getByText('Не начат')).not.toBeNull();
    expect(screen.getByText('Круги: 5')).not.toBeNull();
    expect(screen.getByText('Старт: —')).not.toBeNull();
    expect(screen.getByText('Участники: 1')).not.toBeNull();
    expect(screen.queryByText(/Время: /)).toBeNull();
  });

  it('shows the state, its own start moment and elapsed time while running', () => {
    render(
      <TimingCategoryBlock
        block={block({
          state: 'RUNNING',
          officialStartedAt: RUNNING_START,
          elapsedMs: 83_456,
          startControlEnabled: false,
        })}
        title="5 км · Мужчины"
        isCaptureHolder
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText('Идёт')).not.toBeNull();
    expect(screen.getByText(/^Старт: \d{2}:\d{2}:\d{2}\.\d{3}$/)).not.toBeNull();
    expect(screen.getByText('Время: 01:23.456')).not.toBeNull();
  });

  it('keeps the start control disabled without capture or without an allowed start', () => {
    const onStart = vi.fn();
    const { rerender } = render(
      <TimingCategoryBlock
        block={block()}
        title="5 км · Мужчины"
        isCaptureHolder={false}
        onStart={onStart}
      />,
    );

    const withoutCapture = screen.getByRole('button', {
      name: /Старт/,
    }) as HTMLButtonElement;
    expect(withoutCapture.disabled).toBe(true);

    rerender(
      <TimingCategoryBlock
        block={block({ startControlEnabled: false })}
        title="5 км · Мужчины"
        isCaptureHolder
        onStart={onStart}
      />,
    );
    expect(
      (screen.getByRole('button', { name: /Старт/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    rerender(
      <TimingCategoryBlock
        block={block()}
        title="5 км · Мужчины"
        isCaptureHolder
        onStart={onStart}
      />,
    );
    const enabled = screen.getByRole('button', { name: /Старт/ });
    expect((enabled as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(enabled);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('offers capture to a workstation when nobody holds it', () => {
    const onTakeCapture = vi.fn();
    const { rerender } = render(
      <TimingCategoryBlock
        block={block()}
        title="5 км · Мужчины"
        isCaptureHolder={false}
        onStart={vi.fn()}
        onTakeCapture={onTakeCapture}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Взять захват/ }));
    expect(onTakeCapture).toHaveBeenCalledTimes(1);

    rerender(
      <TimingCategoryBlock
        block={block()}
        title="5 км · Мужчины"
        isCaptureHolder
        onStart={vi.fn()}
        onTakeCapture={onTakeCapture}
      />,
    );
    expect(screen.queryByRole('button', { name: /Взять захват/ })).toBeNull();
  });

  it('offers the record of a started category and forwards the press', () => {
    const onOpenRecord = vi.fn();
    render(
      <TimingCategoryBlock
        block={block({
          state: 'RUNNING',
          attemptId: 'attempt-1',
          officialStartedAt: RUNNING_START,
          elapsedMs: 1000,
          startControlEnabled: false,
        })}
        title="5 км · Мужчины"
        isCaptureHolder={false}
        onStart={vi.fn()}
        onOpenRecord={onOpenRecord}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Запись/ }));
    expect(onOpenRecord).toHaveBeenCalledTimes(1);
  });

  it('hides the record control without an attempt or without a callback', () => {
    const { rerender } = render(
      <TimingCategoryBlock
        block={block()}
        title="5 км · Мужчины"
        isCaptureHolder={false}
        onStart={vi.fn()}
        onOpenRecord={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Запись/ })).toBeNull();

    rerender(
      <TimingCategoryBlock
        block={block({
          state: 'RUNNING',
          attemptId: 'attempt-1',
          officialStartedAt: RUNNING_START,
          elapsedMs: 1000,
          startControlEnabled: false,
        })}
        title="5 км · Мужчины"
        isCaptureHolder={false}
        onStart={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Запись/ })).toBeNull();
  });

  it('renders the block reason and the pending-finish count', () => {
    render(
      <TimingCategoryBlock
        block={block({
          blockReason: 'Категория завершена в протоколе',
          pendingFinishes: [pendingFinish(), pendingFinish({ passId: 'pass-2' })],
        })}
        title="5 км · Мужчины"
        isCaptureHolder={false}
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText('Категория завершена в протоколе')).not.toBeNull();
    expect(screen.getByText('Непривязанных финишей: 2')).not.toBeNull();
  });

  it('hides the pending-finish count when no finish is unbound', () => {
    render(
      <TimingCategoryBlock
        block={block()}
        title="5 км · Мужчины"
        isCaptureHolder={false}
        onStart={vi.fn()}
      />,
    );

    expect(screen.queryByText(/Непривязанных финишей/)).toBeNull();
  });

  it('keeps the backend participant order and forwards a tile click', () => {
    const onParticipantClick = vi.fn();
    const first = participant({ enrollmentId: 'e-1', startNumber: 7, fullName: 'Анна' });
    const second = participant({ enrollmentId: 'e-2', startNumber: 3, fullName: 'Борис' });
    render(
      <TimingCategoryBlock
        block={block({ participants: [first, second] })}
        title="5 км · Мужчины"
        isCaptureHolder={false}
        onStart={vi.fn()}
        onParticipantClick={onParticipantClick}
      />,
    );

    const names = screen
      .getAllByText(/^(Анна|Борис)$/)
      .map((element) => element.textContent);
    expect(names).toEqual(['Анна', 'Борис']);

    fireEvent.click(screen.getByRole('button', { name: '3 Борис' }));
    expect(onParticipantClick).toHaveBeenCalledWith(second);
  });

  it('keeps an excluded participant out of the click targets', () => {
    render(
      <TimingCategoryBlock
        block={block({
          participants: [
            participant({ state: 'EXCLUDED', excludedReason: 'Показан в гонке' }),
          ],
        })}
        title="5 км · Мужчины"
        isCaptureHolder={false}
        onStart={vi.fn()}
        onParticipantClick={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /Иван Петров/ })).toBeNull();
    expect(screen.getByText('Исключён')).not.toBeNull();
  });

  it('marks a heat block with its kind and its stage name', () => {
    render(
      <TimingCategoryBlock
        block={block({
          kind: 'HEAT',
          blockKey: 'heat:race-1:stage-1:1',
          classCompetitionId: 'race-1',
          stageId: 'stage-1',
          stageLabel: 'Квалификация',
          stageState: 'SEEDED',
          heatNumber: 1,
          heatLabel: 'Заезд 1',
        })}
        title="Заезд 1"
        isCaptureHolder
        onStart={vi.fn()}
      />,
    );

    // The kind tag and the stage line are the heat affordance: a heat block is
    // never mistaken for the category block it is grouped with (FR-17).
    expect(screen.getByText('Заезд')).not.toBeNull();
    expect(screen.getByText('Заезд 1')).not.toBeNull();
    expect(screen.getByText('Этап: Квалификация')).not.toBeNull();
    expect(
      (screen.getByRole('button', { name: /Старт/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('keeps a category block free of the heat affordance', () => {
    render(
      <TimingCategoryBlock
        block={block()}
        title="5 км · Мужчины"
        isCaptureHolder={false}
        onStart={vi.fn()}
      />,
    );

    expect(screen.queryByText('Заезд')).toBeNull();
    expect(screen.queryByText(/^Этап:/)).toBeNull();
  });

  it('offers no Start for a heat whose stage is not seeded and states why', () => {
    const { rerender } = render(
      <TimingCategoryBlock
        block={block({
          kind: 'HEAT',
          stageLabel: 'Квалификация',
          stageState: 'PENDING',
          startControlEnabled: false,
          blockReason: 'Заезды этапа ещё не сформированы.',
        })}
        title="Заезд 1"
        isCaptureHolder
        onStart={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /Старт/ })).toBeNull();
    expect(screen.getByText('Заезды этапа ещё не сформированы.')).not.toBeNull();

    rerender(
      <TimingCategoryBlock
        block={block({
          kind: 'HEAT',
          stageLabel: 'Квалификация',
          stageState: 'COMPLETED',
          startControlEnabled: false,
          blockReason: 'Этап уже завершён.',
        })}
        title="Заезд 1"
        isCaptureHolder
        onStart={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /Старт/ })).toBeNull();
    expect(screen.getByText('Этап уже завершён.')).not.toBeNull();
  });
});
