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

/** The exclusion red, which the unsent cue must never borrow (U-04, FR-09). */
const EXCLUSION_RED = '#cf1322';

/** The five participant state fills, also never a cue colour (U-04). */
const STATE_FILLS = ['#f0f0f0', '#1677ff', '#389e0d', '#d46b08', '#cf1322'];

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
    expect(screen.getByText('17').style.fontSize).toBe('44px');
    expect(screen.getByText('Иван Петров')).not.toBeNull();
    expect(screen.getByText('2/5')).not.toBeNull();
    expect(screen.getByText('На дистанции')).not.toBeNull();
    expect(screen.queryByText(/Раздел:/)).toBeNull();
    expect(screen.queryByText(/Последняя отметка:/)).toBeNull();
  });

  it('keeps a fixed 4:3 card shape for an easy click target', () => {
    const { container } = render(
      <ParticipantTile participant={participant()} />,
    );

    const tile = container.firstElementChild as HTMLElement;
    expect(tile.style.aspectRatio).toBe('4 / 3');
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

describe('ParticipantTile pending marks', () => {
  it('keeps the confirmed lap line and adds no cue when nothing is pending', () => {
    const { container } = render(
      <ParticipantTile
        participant={participant({ passCount: 1, requiredLaps: 2 })}
      />,
    );

    expect(screen.getByText('1/2')).not.toBeNull();
    expect(screen.queryByText(/не отправлено/i)).toBeNull();

    const tile = container.firstElementChild as HTMLElement;
    expect(tile.style.outlineStyle).toBe('');
    expect(tile.getAttribute('aria-label')).toBeNull();
  });

  it('treats an explicit zero as nothing pending', () => {
    const { container } = render(
      <ParticipantTile
        participant={participant({ passCount: 1, requiredLaps: 2 })}
        pendingMarks={0}
      />,
    );

    expect(screen.getByText('1/2')).not.toBeNull();
    expect(screen.queryByText(/не отправлено/i)).toBeNull();

    const tile = container.firstElementChild as HTMLElement;
    expect(tile.style.outlineStyle).toBe('');
  });

  it('shows the pending marks beside the confirmed count, never as a sum', () => {
    const first = render(
      <ParticipantTile
        participant={participant({ passCount: 1, requiredLaps: 2 })}
        pendingMarks={1}
      />,
    );

    expect(screen.getByText('1+1/2')).not.toBeNull();
    expect(screen.queryByText('2/2')).toBeNull();
    first.unmount();

    render(
      <ParticipantTile
        participant={participant({ passCount: 2, requiredLaps: 5 })}
        pendingMarks={2}
      />,
    );

    expect(screen.getByText('2+2/5')).not.toBeNull();
    expect(screen.queryByText('4/5')).toBeNull();
  });

  it('marks the unsent lap line in words and type, not by colour', () => {
    render(
      <ParticipantTile
        participant={participant({ passCount: 1, requiredLaps: 2 })}
        pendingMarks={1}
      />,
    );

    const line = screen.getByText('1+1/2');

    expect(line.textContent).toBe('1+1/2');
    expect(line.children).toHaveLength(0);
    expect(line.style.fontWeight).toBe('700');
    expect(line.style.textDecorationStyle).toBe('dotted');
    expect(line.title).toContain('не отправлено: 1');
  });

  it('adds a dashed outline and a light violet badge with dark text', () => {
    const { container } = render(
      <ParticipantTile
        participant={participant({
          state: 'RACING',
          passCount: 1,
          requiredLaps: 2,
        })}
        pendingMarks={1}
      />,
    );

    const tile = container.firstElementChild as HTMLElement;
    expect(tile.style.outlineStyle).toBe('dashed');
    expect(tile.style.outlineWidth).toBe('2px');
    expect(colour(tile.style.outlineColor)).not.toBe(colour(EXCLUSION_RED));

    const badge = screen.getByText('не отправлено: 1');
    expect(colour(badge.style.backgroundColor)).toBe(colour('#f9f0ff'));
    expect(colour(badge.style.color)).toBe(colour('#391085'));
  });

  it('never paints the unsent cue in the exclusion red or a state colour', () => {
    const { container } = render(
      <ParticipantTile
        participant={participant({
          state: 'EXCLUDED',
          passCount: 1,
          requiredLaps: 2,
        })}
        pendingMarks={1}
      />,
    );

    const tile = container.firstElementChild as HTMLElement;
    const badge = screen.getByText('не отправлено: 1');
    const cueColours = [
      colour(tile.style.outlineColor),
      colour(badge.style.backgroundColor),
      colour(badge.style.color),
    ];

    cueColours.forEach((cue) => {
      expect(cue).not.toBe(colour(EXCLUSION_RED));
      expect(STATE_FILLS.map(colour)).not.toContain(cue);
    });
  });

  it('keeps every participant state fill and label while marks are pending', () => {
    const states = [
      ['WAITING', 'Ожидает'],
      ['RACING', 'На дистанции'],
      ['RECORDED', 'Отметки собраны'],
      ['INCOMPLETE', 'Не завершил'],
      ['EXCLUDED', 'Исключён'],
    ] as const;

    states.forEach(([state, label]) => {
      const plain = render(
        <ParticipantTile participant={participant({ state })} />,
      );
      const plainTile = plain.container.firstElementChild as HTMLElement;
      const fill = plainTile.style.background;
      const border = plainTile.style.borderColor;
      plain.unmount();

      const pending = render(
        <ParticipantTile
          participant={participant({ state })}
          pendingMarks={2}
        />,
      );
      const pendingTile = pending.container.firstElementChild as HTMLElement;

      expect(pendingTile.style.background).toBe(fill);
      expect(pendingTile.style.borderColor).toBe(border);
      expect(colour(pendingTile.style.background)).not.toBe(colour('#f9f0ff'));
      expect(screen.getByText(label)).not.toBeNull();
      expect(screen.getByText('не отправлено: 2')).not.toBeNull();
      pending.unmount();
    });
  });

  it('states both counts in words in the accessible name and keeps the click', () => {
    const onClick = vi.fn();
    render(
      <ParticipantTile
        participant={participant({ passCount: 1, requiredLaps: 2 })}
        pendingMarks={1}
        onClick={onClick}
      />,
    );

    const button = screen.getByRole('button', { name: /17 Иван Петров/ });
    expect(button.getAttribute('aria-label')).toBe(
      '17 Иван Петров, кругов подтверждено: 1, не отправлено: 1',
    );

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('never invents a pending count on an excluded tile', () => {
    const { container } = render(
      <ParticipantTile
        participant={participant({
          state: 'EXCLUDED',
          excludedReason: 'Показан в гонке',
        })}
        onClick={vi.fn()}
      />,
    );

    expect(screen.queryByText(/не отправлено/i)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();

    const tile = container.firstElementChild as HTMLElement;
    expect(tile.getAttribute('aria-label')).toBeNull();
    expect(tile.style.outlineStyle).toBe('');
  });

  it('names an excluded tile that does have pending marks without a control', () => {
    render(
      <ParticipantTile
        participant={participant({ state: 'EXCLUDED' })}
        pendingMarks={2}
        onClick={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(
      screen.getByRole('group', {
        name: /17 Иван Петров.*подтверждено: 2.*не отправлено: 2/,
      }),
    ).not.toBeNull();
    expect(screen.getByText('не отправлено: 2')).not.toBeNull();
  });
});
