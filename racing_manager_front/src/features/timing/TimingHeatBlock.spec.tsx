import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    passCount: 2,
    requiredLaps: 5,
    lastPassAt: '2026-11-13T09:02:00.000Z',
    state: 'RACING',
    excludedReason: null,
    ...overrides,
  };
}

function pendingFinish(overrides: Partial<TimingPassView> = {}): TimingPassView {
  return {
    passId: 'pass-1',
    attemptId: 'attempt-heat',
    enrollmentId: null,
    lapNumber: null,
    rawCapturedAt: '2026-11-13T09:01:00.000Z',
    officialAt: '2026-11-13T09:01:00.000Z',
    officialElapsedMs: 60000,
    status: 'PENDING',
    ...overrides,
  };
}

/** One heat block of a seeded stage: the surface fields the API supplies. */
function heatBlock(
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
    kind: 'HEAT',
    blockKey: 'heat:race-1:stage-1:1',
    classCompetitionId: 'race-1',
    stageId: 'stage-1',
    stageLabel: 'Квалификация',
    stageState: 'SEEDED',
    heatNumber: 1,
    heatLabel: 'Заезд 1',
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

describe('TimingHeatBlock', () => {
  it('renders the heat, its stage, race and full record facts', () => {
    render(
      <TimingHeatBlock
        block={heatBlock({
          state: 'RUNNING',
          attemptId: 'attempt-heat',
          officialStartedAt: RUNNING_START,
          elapsedMs: 83_456,
          startControlEnabled: false,
          pendingFinishes: [pendingFinish()],
        })}
        raceTitle="Кубковая гонка"
        isCaptureHolder={false}
        onStart={vi.fn()}
        onOpenRecord={vi.fn()}
      />,
    );

    // The heat title, its kind and its stage name, so it never reads as the
    // category block it is grouped with.
    expect(screen.getByText('Заезд 1')).not.toBeNull();
    expect(screen.getByText('Заезд')).not.toBeNull();
    expect(screen.getByText('Этап: Квалификация')).not.toBeNull();
    expect(screen.getByText('Кубковая гонка')).not.toBeNull();

    expect(screen.getByText('Идёт')).not.toBeNull();
    expect(screen.getByText('Круги: 5')).not.toBeNull();
    expect(screen.getByText(/^Старт: \d{2}:\d{2}:\d{2}\.\d{3}$/)).not.toBeNull();
    expect(screen.getByText('Время: 01:23.456')).not.toBeNull();
    expect(screen.getByText('Участники: 1')).not.toBeNull();
    expect(screen.getByText('Непривязанных финишей: 1')).not.toBeNull();
    expect(screen.getByText('17')).not.toBeNull();
    expect(screen.getByText('Иван Петров')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Запись/ })).not.toBeNull();
  });

  it('derives the heat title from the heat number without a label', () => {
    render(
      <TimingHeatBlock
        block={heatBlock({ heatNumber: 3, heatLabel: undefined })}
        isCaptureHolder={false}
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText('Заезд 3')).not.toBeNull();
    expect(screen.getByText('Заезд')).not.toBeNull();
  });

  it('starts a seeded heat with capture and forwards the press', () => {
    const onStart = vi.fn();
    render(
      <TimingHeatBlock
        block={heatBlock()}
        raceTitle="Кубковая гонка"
        isCaptureHolder
        onStart={onStart}
      />,
    );

    const start = screen.getByRole('button', { name: /Старт/ });
    expect((start as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('keeps the seeded heat Start disabled without the capture lock', () => {
    render(
      <TimingHeatBlock
        block={heatBlock()}
        isCaptureHolder={false}
        onStart={vi.fn()}
      />,
    );

    expect(
      (screen.getByRole('button', { name: /Старт/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('offers no Start for a heat of a pending stage and states why', () => {
    render(
      <TimingHeatBlock
        block={heatBlock({
          stageState: 'PENDING',
          startControlEnabled: false,
          blockReason: 'Заезды этапа ещё не сформированы.',
        })}
        isCaptureHolder
        onStart={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /Старт/ })).toBeNull();
    expect(screen.getByText('Заезды этапа ещё не сформированы.')).not.toBeNull();
  });

  it('offers no Start for a heat of a completed stage and states why', () => {
    render(
      <TimingHeatBlock
        block={heatBlock({
          state: 'COMPLETED',
          attemptId: 'attempt-heat',
          stageState: 'COMPLETED',
          startControlEnabled: false,
          blockReason: 'Этап уже завершён.',
        })}
        isCaptureHolder
        onStart={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /Старт/ })).toBeNull();
    expect(screen.getByText('Завершён')).not.toBeNull();
    expect(screen.getByText('Этап уже завершён.')).not.toBeNull();
  });

  it('forwards a tile press of its own attempt and the record press', () => {
    const onParticipantClick = vi.fn();
    const onOpenRecord = vi.fn();
    const racer = participant();
    render(
      <TimingHeatBlock
        block={heatBlock({
          state: 'RUNNING',
          attemptId: 'attempt-heat',
          officialStartedAt: RUNNING_START,
          elapsedMs: 1000,
          startControlEnabled: false,
          participants: [racer],
        })}
        isCaptureHolder
        onStart={vi.fn()}
        onParticipantClick={onParticipantClick}
        onOpenRecord={onOpenRecord}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '17 Иван Петров' }));
    expect(onParticipantClick).toHaveBeenCalledWith(racer);

    fireEvent.click(screen.getByRole('button', { name: /Запись/ }));
    expect(onOpenRecord).toHaveBeenCalledTimes(1);
  });
});
