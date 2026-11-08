import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { EventFormatRef, StartResponse } from '../../shared/types/event';
import { EventStartBlocks, formatStartKm, startTotalMeters } from './EventStartBlocks';

const formats: EventFormatRef[] = [
  { id: 1, code: '5K', name: '5 км', sortOrder: 1 },
  { id: 2, code: '10K', name: '10 км', sortOrder: 2 },
];

function start(overrides: Partial<StartResponse> = {}): StartResponse {
  return {
    id: 'start-a',
    purposeType: 'CUP_RACE',
    formatIds: [1],
    formats: [formats[0]],
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

describe('EventStartBlocks', () => {
  it('renders one block per start in sortOrder with laps and distance', () => {
    render(
      <EventStartBlocks
        stacked
        formats={formats}
        starts={[
          start({
            id: 'start-b',
            sortOrder: 1,
            resolvedLabel: 'Разминка',
            purposeType: 'CONTROL_TRAINING',
            lapCount: 1,
            lapLengthMeters: 1000,
            displayedDistanceMeters: 1000,
            formats: [formats[0]],
          }),
          start(),
        ]}
      />,
    );

    const cards = screen.getAllByText(/Кубковая гонка|Разминка/);
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Кубковая гонка — 10 км')).not.toBeNull();
    expect(screen.queryByText('Разминка')).not.toBeNull();
    expect(screen.queryByText('10 км')).not.toBeNull();
  });

  it('shows the legacy override as total distance and keeps stored laps', () => {
    render(
      <EventStartBlocks
        stacked={false}
        formats={formats}
        starts={[start({ legacyEffectiveDistanceM: 9500 })]}
      />,
    );

    expect(screen.queryByText('9.5 км')).not.toBeNull();
    expect(screen.queryByText('из протокола')).not.toBeNull();
    expect(screen.getAllByText(/5 × 2 км/).length).toBeGreaterThan(0);
  });

  it('formats distances without trailing zeros', () => {
    expect(formatStartKm(10000)).toBe('10');
    expect(formatStartKm(9500)).toBe('9.5');
    expect(startTotalMeters(start({ legacyEffectiveDistanceM: 9500 }))).toBe(9500);
    expect(startTotalMeters(start())).toBe(10000);
  });
});
