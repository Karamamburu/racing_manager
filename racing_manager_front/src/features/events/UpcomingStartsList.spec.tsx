import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { StartResponse } from '../../shared/types/event';
import { UpcomingStartsList, upcomingStarts } from './UpcomingStartsList';

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

describe('UpcomingStartsList', () => {
  it('lists every start in sortOrder with purpose and distance', () => {
    render(
      <UpcomingStartsList
        starts={[
          start({
            id: 'start-b',
            sortOrder: 1,
            resolvedLabel: 'Разминка',
            purposeType: 'CONTROL_TRAINING',
            displayedDistanceMeters: 1000,
          }),
          start(),
        ]}
      />,
    );

    expect(screen.queryByText('Кубковая гонка — 10 км')).not.toBeNull();
    expect(screen.queryByText('Разминка')).not.toBeNull();
    expect(screen.queryByText('10 км')).not.toBeNull();
    expect(screen.queryByText('1 км')).not.toBeNull();
  });

  it('returns nothing for an event without starts', () => {
    const { container } = render(<UpcomingStartsList starts={[]} />);
    expect(container.textContent).toBe('');
  });

  it('sorts a copy without mutating the input', () => {
    const input = [start({ id: 'b', sortOrder: 1 }), start({ id: 'a' })];
    expect(upcomingStarts(input).map((row) => row.id)).toEqual(['a', 'b']);
    expect(input.map((row) => row.id)).toEqual(['b', 'a']);
  });
});
