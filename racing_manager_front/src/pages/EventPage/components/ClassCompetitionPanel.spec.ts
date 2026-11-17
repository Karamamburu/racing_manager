import { describe, expect, it } from 'vitest';
import { slotFilled } from './ClassCompetitionPanel';
import type { ClassHeatSlot } from '../../../features/class-competitions/types';
import type { EventLap } from '../../../shared/types/event';

function slot(overrides: Partial<ClassHeatSlot> = {}): ClassHeatSlot {
  return {
    position: 1,
    registrationId: 'registration-1',
    firstName: 'Иван',
    lastName: 'Петров',
    startNumber: 1,
    registrationStatus: 'REGISTERED',
    timeMilliseconds: null,
    resultStatus: null,
    laps: [],
    ...overrides,
  };
}

const twoLaps: EventLap[] = [
  { id: 'lap-1', lapNumber: 1, distanceKm: 1 },
  { id: 'lap-2', lapNumber: 2, distanceKm: 1 },
];

describe('slotFilled for a timing-produced heat', () => {
  it('accepts one authoritative total without per-lap rows', () => {
    expect(
      slotFilled(slot({ resultStatus: 'OK', timeMilliseconds: 83_475 }), twoLaps),
    ).toBe(true);
  });

  it('still refuses an OK slot without any time', () => {
    expect(slotFilled(slot({ resultStatus: 'OK' }), twoLaps)).toBe(false);
  });

  it('accepts a terminal status without a time', () => {
    expect(slotFilled(slot({ resultStatus: 'DNS' }), twoLaps)).toBe(true);
  });

  it('accepts a multi-lap slot with every lap recorded', () => {
    expect(
      slotFilled(
        slot({
          resultStatus: 'OK',
          timeMilliseconds: 83_475,
          laps: [
            { lapNumber: 1, timeMilliseconds: 40_000 },
            { lapNumber: 2, timeMilliseconds: 43_475 },
          ],
        }),
        twoLaps,
      ),
    ).toBe(true);
  });
});
