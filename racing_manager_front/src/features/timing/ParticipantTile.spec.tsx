import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ParticipantTile, formatTimingClock } from './ParticipantTile';
import type { TimingParticipantTileView } from './types';

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
    lastPassAt: new Date(2026, 10, 13, 14, 3, 27, 418).toISOString(),
    state: 'RACING',
    excludedReason: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe('formatTimingClock', () => {
  it('keeps milliseconds and shows a dash without an instant', () => {
    expect(
      formatTimingClock(new Date(2026, 10, 13, 9, 5, 6, 7).toISOString()),
    ).toBe('09:05:06.007');
    expect(formatTimingClock(null)).toBe('—');
    expect(formatTimingClock('not-a-date')).toBe('—');
  });
});

describe('ParticipantTile', () => {
  it('renders the big number, the name, the lap count and the state', () => {
    render(<ParticipantTile participant={participant()} />);

    expect(screen.getByText('17')).not.toBeNull();
    expect(screen.getByText('Иван Петров')).not.toBeNull();
    expect(screen.getByText('2/5')).not.toBeNull();
    expect(screen.getByText('На дистанции')).not.toBeNull();
    expect(screen.queryByText(/Раздел:/)).toBeNull();
    expect(screen.queryByText(/Последняя отметка:/)).toBeNull();
  });

  it('renders a dash for a missing number and the bare lap count', () => {
    render(
      <ParticipantTile
        participant={participant({
          startNumber: 0,
          lastPassAt: null,
          passCount: 0,
          requiredLaps: 2,
        })}
      />,
    );

    expect(screen.getByText('0/2')).not.toBeNull();
    expect(screen.queryByText('17')).toBeNull();
    expect(screen.getAllByText('—')).toHaveLength(1);
  });

  it('names every participant state', () => {
    const labels = [
      ['WAITING', 'Ожидает'],
      ['RACING', 'На дистанции'],
      ['RECORDED', 'Отметки собраны'],
      ['INCOMPLETE', 'Не завершил'],
      ['EXCLUDED', 'Исключён'],
    ] as const;

    labels.forEach(([state, label]) => {
      const { unmount } = render(
        <ParticipantTile participant={participant({ state })} />,
      );
      expect(screen.getByText(label)).not.toBeNull();
      unmount();
    });
  });

  it('is a named button when it can be clicked', () => {
    const onClick = vi.fn();
    render(<ParticipantTile participant={participant()} onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: '17 Иван Петров' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows an excluded participant without a click target', () => {
    const onClick = vi.fn();
    render(
      <ParticipantTile
        participant={participant({
          state: 'EXCLUDED',
          excludedReason: 'Показан в гонке',
        })}
        onClick={onClick}
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Исключён')).not.toBeNull();

    fireEvent.click(screen.getByText('Иван Петров'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
