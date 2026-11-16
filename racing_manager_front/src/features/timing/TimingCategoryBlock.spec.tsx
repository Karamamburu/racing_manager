import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TimingCategoryBlock, formatElapsed } from './TimingCategoryBlock';
import { TimingHeatBlock } from './TimingHeatBlock';
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

/**
 * A pinned local monotonic clock with fake interval timers, so a running block's
 * display advances only when the scenario says it does and no real 100 ms wait
 * is needed. Only the interval is faked: React and antd keep their real timers.
 */
function withLocalClock() {
  let monotonicNow = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => monotonicNow);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  return (ms: number) => {
    act(() => {
      monotonicNow += ms;
      vi.advanceTimersByTime(ms);
    });
  };
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
  vi.useRealTimers();
});

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

  it('tints the card by gender for quick identification', () => {
    const { container, rerender } = render(
      <TimingCategoryBlock
        block={block({ gender: 'M' })}
        title="5 км · Мужчины"
        isCaptureHolder={false}
        onStart={vi.fn()}
      />,
    );

    expect(container.querySelector('.ant-card')?.className).toContain(
      'timing-gender-m',
    );

    rerender(
      <TimingCategoryBlock
        block={block({ gender: 'F' })}
        title="5 км · Женщины"
        isCaptureHolder={false}
        onStart={vi.fn()}
      />,
    );

    expect(container.querySelector('.ant-card')?.className).toContain(
      'timing-gender-f',
    );
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

  it('advances the elapsed display of a running block on the local tick', () => {
    const advanceLocal = withLocalClock();
    render(
      <TimingCategoryBlock
        block={block({
          state: 'RUNNING',
          attemptId: 'attempt-1',
          officialStartedAt: RUNNING_START,
          elapsedMs: 83_456,
          startControlEnabled: false,
        })}
        title="5 км · Мужчины"
        isCaptureHolder
        onStart={vi.fn()}
      />,
    );

    // The first paint is the surface value; every 100 ms adds the local delta
    // without asking the API for it (FR-38, FR-39).
    expect(screen.getByText('Время: 01:23.456')).not.toBeNull();

    advanceLocal(300);
    expect(screen.getByText('Время: 01:23.756')).not.toBeNull();
  });

  it('isolates the elapsed block so changing digits never shift the row', () => {
    render(
      <TimingCategoryBlock
        block={block({
          state: 'RUNNING',
          attemptId: 'attempt-1',
          officialStartedAt: RUNNING_START,
          elapsedMs: 83_456,
          startControlEnabled: false,
        })}
        title="5 км · Мужчины"
        isCaptureHolder
        onStart={vi.fn()}
      />,
    );

    const elapsed = screen.getByText('Время: 01:23.456');
    expect(elapsed.style.display).toBe('inline-block');
    expect(elapsed.style.minWidth).toBe('118px');
    expect(elapsed.style.fontVariantNumeric).toBe('tabular-nums');
  });

  it('keeps a closed block on the surface elapsed value', () => {
    const advanceLocal = withLocalClock();
    render(
      <TimingCategoryBlock
        block={block({
          state: 'COMPLETED',
          attemptId: 'attempt-1',
          officialStartedAt: RUNNING_START,
          elapsedMs: 90_000,
          startControlEnabled: false,
        })}
        title="5 км · Мужчины"
        isCaptureHolder
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText('Время: 01:30.000')).not.toBeNull();
    // A closed attempt runs no interval and its value stays static (O-04).
    expect(vi.getTimerCount()).toBe(0);

    advanceLocal(5000);
    expect(screen.getByText('Время: 01:30.000')).not.toBeNull();
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

  it('prompts to complete a running category once every capture is collected', () => {
    render(
      <TimingCategoryBlock
        block={block({
          state: 'RUNNING',
          attemptId: 'attempt-1',
          officialStartedAt: RUNNING_START,
          elapsedMs: 1000,
          startControlEnabled: false,
          capturesComplete: true,
        })}
        title="5 км · Мужчины"
        isCaptureHolder={false}
        onStart={vi.fn()}
      />,
    );

    const message = screen.getByText(
      'Все отсечки в гонке данной категории получены, её можно завершить',
    );
    const alert = message.closest('.ant-alert');
    expect(alert).not.toBeNull();
    expect(alert?.className).toContain('ant-alert-info');
  });

  it('paints the finished-category plate green', () => {
    render(
      <TimingCategoryBlock
        block={block({
          finished: true,
          blockReason:
            'Гонка в этой категории завершена. Результаты менять нельзя.',
        })}
        title="5 км · Мужчины"
        isCaptureHolder={false}
        onStart={vi.fn()}
      />,
    );

    const alert = screen
      .getByText(
        'Гонка в этой категории завершена. Результаты менять нельзя.',
      )
      .closest('.ant-alert');
    expect(alert).not.toBeNull();
    expect(alert?.className).toContain('ant-alert-success');
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

describe('race-captured participants in a category block', () => {
  const raceTile = (index: number): TimingParticipantTileView =>
    participant({
      enrollmentId: `race-${index}`,
      registrationId: `race-reg-${index}`,
      startNumber: index,
      fullName: `Гонщик ${index}`,
      state: 'EXCLUDED',
      excludedReason: 'RACE_SECTION',
    });

  it('renders only simple participants and a compact race count', () => {
    const visible = [
      participant({
        enrollmentId: 'simple-1',
        registrationId: 'simple-reg-1',
        startNumber: 101,
        fullName: 'Простой Первый',
      }),
      participant({
        enrollmentId: 'simple-2',
        registrationId: 'simple-reg-2',
        startNumber: 102,
        fullName: 'Простой Второй',
      }),
    ];
    render(
      <TimingCategoryBlock
        block={block({ participants: [...Array(8)].map((_, i) => raceTile(i + 1)).concat(visible) })}
        title="5 км · Мужчины"
        isCaptureHolder
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText(/Участники: 2/)).not.toBeNull();
    expect(screen.getByText(/В заездах гонки: 8/)).not.toBeNull();
    expect(screen.queryByText('Гонщик 1')).toBeNull();
    expect(screen.getByText('Простой Первый')).not.toBeNull();
    expect(screen.getByText('Простой Второй')).not.toBeNull();
  });

  it('shows the race note instead of a wall of exclusions when nobody is simple', () => {
    render(
      <TimingCategoryBlock
        block={block({
          participants: [...Array(9)].map((_, i) => raceTile(i + 1)),
          startControlEnabled: false,
          blockReason: 'В категории нет участников, доступных для хронометража.',
        })}
        title="5 км · Мужчины"
        isCaptureHolder
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText(/Участники: 0/)).not.toBeNull();
    expect(screen.getByText(/В заездах гонки: 9/)).not.toBeNull();
    expect(
      screen.getByText('Все участники категории проводятся по заездам.'),
    ).not.toBeNull();
    expect(screen.queryByText('Гонщик 1')).toBeNull();
    expect(
      screen.queryByText('В категории нет участников, доступных для хронометража.'),
    ).toBeNull();
  });
});

describe('independent block collapse', () => {
  it('folds the body while the header, state and actions stay visible', () => {
    render(
      <TimingCategoryBlock
        block={block()}
        title="5 км · Мужчины"
        isCaptureHolder
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText('Иван Петров')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Свернуть блок' }));

    expect(screen.queryByText('Иван Петров')).toBeNull();
    expect(screen.getByText('5 км · Мужчины')).not.toBeNull();
    expect(screen.getByText('Старт')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Развернуть блок' }));
    expect(screen.getByText('Иван Петров')).not.toBeNull();
  });

  it('keeps the collapse of one block independent from another', () => {
    render(
      <>
        <TimingCategoryBlock
          block={block()}
          title="5 км · Мужчины"
          isCaptureHolder
          onStart={vi.fn()}
        />
        <TimingCategoryBlock
          block={block({
            participants: [
              participant({
                enrollmentId: 'enrollment-2',
                fullName: 'Анна Вторая',
              }),
            ],
          })}
          title="10 км · Женщины"
          isCaptureHolder
          onStart={vi.fn()}
        />
      </>,
    );

    const toggles = screen.getAllByRole('button', { name: 'Свернуть блок' });
    fireEvent.click(toggles[0]);

    expect(screen.queryByText('Иван Петров')).toBeNull();
    expect(screen.getByText('Анна Вторая')).not.toBeNull();
    expect(
      screen.getAllByRole('button', { name: 'Развернуть блок' }),
    ).toHaveLength(1);
  });
});

/** The exclusion red, which the unsent cue must never borrow (U-04, FR-09). */
const EXCLUSION_RED = '#cf1322';

/** The five participant state fills, also never a cue colour (U-04). */
const STATE_FILLS = ['#f0f0f0', '#1677ff', '#389e0d', '#d46b08', '#cf1322'];

/** The violet accent the tiles already use for their unsent badge (S-02). */
const UNSENT_BADGE_BACKGROUND = '#f9f0ff';
const UNSENT_BADGE_TEXT = '#391085';

const READY_CATEGORY =
  'Все отсечки в гонке данной категории получены, её можно завершить';
const READY_HEAT = 'Все отсечки в заезде получены, его можно завершить';

/** The body sentences that stand in for the ready prompt, one per plural form. */
const UNSENT_NOTICE_1 =
  '1 отметка записана на устройстве и ещё не отправлена. Завершить можно после отправки.';
const UNSENT_NOTICE_2 =
  '2 отметки записаны на устройстве и ещё не отправлены. Завершить можно после отправки.';
const UNSENT_NOTICE_5 =
  '5 отметок записаны на устройстве и ещё не отправлены. Завершить можно после отправки.';

/**
 * One colour in the notation jsdom reports, so a comparison never depends on
 * whether a value came back as `#rrggbb` or as `rgb(r, g, b)`.
 */
function colour(value: string): string {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (!hex) return value;
  return `rgb(${parseInt(hex[1], 16)}, ${parseInt(hex[2], 16)}, ${parseInt(
    hex[3],
    16,
  )})`;
}

/** A running block whose attempt exists, so the ready prompt can appear. */
const RUNNING: Partial<TimingCategoryBlockView> = {
  state: 'RUNNING',
  attemptId: 'attempt-1',
  officialStartedAt: RUNNING_START,
  elapsedMs: 1000,
  startControlEnabled: false,
};

describe('block unsent marks', () => {
  it('shows each tile its own unsent count and the block total in the header tag', () => {
    const first = participant({
      enrollmentId: 'e-1',
      passCount: 1,
      requiredLaps: 2,
      state: 'RACING',
    });
    const second = participant({
      enrollmentId: 'e-2',
      startNumber: 3,
      fullName: 'Борис Сидоров',
      passCount: 2,
      requiredLaps: 5,
    });

    render(
      <TimingCategoryBlock
        block={block({ ...RUNNING, participants: [first, second] })}
        title="5 км · Мужчины"
        isCaptureHolder
        onStart={vi.fn()}
        pendingMarksByParticipant={
          new Map([
            ['e-1', 1],
            ['e-2', 1],
          ])
        }
        pendingMarkCount={2}
      />,
    );

    // Each tile states its own unsent mark, never the block total (S-01, FR-10).
    expect(screen.getByText('1+1/2')).not.toBeNull();
    expect(screen.getByText('2+1/5')).not.toBeNull();
    expect(screen.queryByText('1+2/2')).toBeNull();
    expect(screen.queryByText('2+2/5')).toBeNull();
    expect(screen.getAllByText('не отправлено: 1')).toHaveLength(2);

    const tag = screen.getByText('Отметок не отправлено: 2');
    expect(tag.closest('.ant-card-head')).not.toBeNull();
    expect(tag.textContent).toBe('Отметок не отправлено: 2');
    // The header tag carries the same violet accent as the tiles (S-02, U-04).
    expect(colour(tag.style.backgroundColor)).toBe(
      colour(UNSENT_BADGE_BACKGROUND),
    );
    expect(colour(tag.style.color)).toBe(colour(UNSENT_BADGE_TEXT));
    expect(tag.style.borderStyle).toBe('dashed');
  });

  it('replaces the ready prompt with a violet notice while marks are unsent', () => {
    render(
      <TimingCategoryBlock
        block={block({
          ...RUNNING,
          capturesComplete: true,
          participants: [
            participant({ passCount: 1, requiredLaps: 2, state: 'RACING' }),
          ],
        })}
        title="5 км · Мужчины"
        isCaptureHolder
        onStart={vi.fn()}
        pendingMarksByParticipant={new Map([['enrollment-1', 2]])}
        pendingMarkCount={2}
      />,
    );

    expect(screen.getByText('1+2/2')).not.toBeNull();
    expect(screen.getByText('Отметок не отправлено: 2')).not.toBeNull();

    // The ready-to-finish prompt is gone and the unsent sentence takes its
    // place, so a block never claims it can be closed (S-03, FR-10).
    expect(screen.queryByText(READY_CATEGORY)).toBeNull();
    const notice = screen.getByText(UNSENT_NOTICE_2);
    expect(notice.textContent).toBe(UNSENT_NOTICE_2);

    // The cue is the violet accent already used by the tiles, never the
    // exclusion red or a participant state colour (U-04, FR-09).
    expect(colour(notice.style.backgroundColor)).toBe(
      colour(UNSENT_BADGE_BACKGROUND),
    );
    expect(colour(notice.style.color)).toBe(colour(UNSENT_BADGE_TEXT));
    expect(notice.style.borderStyle).toBe('dashed');
    expect(colour(notice.style.borderColor)).not.toBe(colour(EXCLUSION_RED));
    expect(STATE_FILLS.map(colour)).not.toContain(
      colour(notice.style.backgroundColor),
    );
    expect(STATE_FILLS.map(colour)).not.toContain(colour(notice.style.color));
  });

  it('keeps the ready prompt and no unsent cue while nothing is pending', () => {
    render(
      <TimingCategoryBlock
        block={block({ ...RUNNING, capturesComplete: true })}
        title="5 км · Мужчины"
        isCaptureHolder
        onStart={vi.fn()}
      />,
    );

    const message = screen.getByText(READY_CATEGORY);
    expect(message.closest('.ant-alert')?.className).toContain(
      'ant-alert-info',
    );
    expect(screen.queryByText(/Отметок не отправлено/)).toBeNull();
    expect(screen.queryByText(/записаны на устройстве/)).toBeNull();
    expect(screen.queryByText(/не отправлено:/)).toBeNull();
  });

  it('does not invent a pending count for an excluded participant', () => {
    render(
      <TimingCategoryBlock
        block={block({
          ...RUNNING,
          participants: [
            participant({
              state: 'EXCLUDED',
              excludedReason: 'Показан в гонке',
              passCount: 0,
              requiredLaps: 5,
            }),
          ],
        })}
        title="5 км · Мужчины"
        isCaptureHolder
        onStart={vi.fn()}
        pendingMarksByParticipant={new Map()}
        pendingMarkCount={0}
      />,
    );

    expect(screen.getByText('Исключён')).not.toBeNull();
    expect(screen.getByText('0/5')).not.toBeNull();
    expect(screen.queryByText(/не отправлено:/)).toBeNull();
    expect(screen.queryByText(/Отметок не отправлено/)).toBeNull();
  });

  it('passes the block marks through a heat block', () => {
    render(
      <TimingHeatBlock
        block={block({
          ...RUNNING,
          capturesComplete: true,
          participants: [
            participant({ passCount: 1, requiredLaps: 2, state: 'RACING' }),
          ],
          kind: 'HEAT',
          blockKey: 'heat:race-1:stage-1:1',
          classCompetitionId: 'race-1',
          stageId: 'stage-1',
          stageLabel: 'Квалификация',
          stageState: 'SEEDED',
          heatNumber: 1,
          heatLabel: 'Заезд 1',
        })}
        raceTitle="Кубковая гонка"
        isCaptureHolder
        onStart={vi.fn()}
        pendingMarksByParticipant={new Map([['enrollment-1', 1]])}
        pendingMarkCount={1}
      />,
    );

    expect(screen.getByText('1+1/2')).not.toBeNull();
    expect(screen.getByText('Отметок не отправлено: 1')).not.toBeNull();
    expect(screen.getByText(UNSENT_NOTICE_1)).not.toBeNull();
    expect(screen.queryByText(READY_HEAT)).toBeNull();
  });

  it('agrees the unsent sentence with the mark count', () => {
    const cases: ReadonlyArray<readonly [number, string, string]> = [
      [1, '0+1/5', UNSENT_NOTICE_1],
      [2, '0+2/5', UNSENT_NOTICE_2],
      [5, '0+5/5', UNSENT_NOTICE_5],
    ];

    cases.forEach(([count, lapLine, sentence]) => {
      const rendered = render(
        <TimingCategoryBlock
          block={block({
            ...RUNNING,
            capturesComplete: true,
            participants: [participant({ passCount: 0, requiredLaps: 5 })],
          })}
          title="5 км · Мужчины"
          isCaptureHolder
          onStart={vi.fn()}
          pendingMarksByParticipant={new Map([['enrollment-1', count]])}
          pendingMarkCount={count}
        />,
      );

      expect(screen.getByText(lapLine)).not.toBeNull();
      expect(screen.getByText(`Отметок не отправлено: ${count}`)).not.toBeNull();
      expect(screen.getByText(sentence).textContent).toBe(sentence);
      rendered.unmount();
    });
  });
});
