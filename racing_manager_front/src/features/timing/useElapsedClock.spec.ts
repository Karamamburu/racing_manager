import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TimingCategoryState } from './types';
import { TIMING_ELAPSED_TICK_MS, useElapsedClock } from './useElapsedClock';

/**
 * The local monotonic clock every scenario reads. `performance.now()` is pinned
 * so a displayed value is derived from a known anchor instead of wall-clock
 * jitter, and fake interval timers decide when a tick happens.
 */
let monotonicNow = 0;

const RUNNING_START = '2026-11-13T09:00:00.000Z';

interface ClockProps {
  state: TimingCategoryState;
  officialStartedAt: string | null;
  elapsedMs: number | null;
}

function runningProps(overrides: Partial<ClockProps> = {}): ClockProps {
  return {
    state: 'RUNNING',
    officialStartedAt: RUNNING_START,
    elapsedMs: 1000,
    ...overrides,
  };
}

function renderClock(initial: ClockProps) {
  return renderHook((props: ClockProps) => useElapsedClock(props), {
    initialProps: initial,
  });
}

/** Lets `ms` of local monotonic time pass, delivering every interval tick. */
function advance(ms: number) {
  act(() => {
    monotonicNow += ms;
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  monotonicNow = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => monotonicNow);
  // Only the display interval is faked: React, Testing Library and the rest of
  // the page keep their real timers.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useElapsedClock', () => {
  it('redraws the surface elapsed value every 100 ms while the attempt runs', () => {
    expect(TIMING_ELAPSED_TICK_MS).toBe(100);
    const { result } = renderClock(runningProps({ elapsedMs: 1000 }));

    // The surface value is the first paint: the clock never restarts at zero.
    expect(result.current).toBe(1000);
    expect(vi.getTimerCount()).toBe(1);

    advance(TIMING_ELAPSED_TICK_MS);
    expect(result.current).toBe(1100);

    advance(TIMING_ELAPSED_TICK_MS);
    expect(result.current).toBe(1200);

    advance(TIMING_ELAPSED_TICK_MS * 3);
    expect(result.current).toBe(1500);
  });

  it('opens no request and writes nothing while it ticks', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const openSpy = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const sendSpy = vi.spyOn(XMLHttpRequest.prototype, 'send');
    const { result } = renderClock(runningProps({ elapsedMs: 1000 }));

    advance(2000);

    expect(result.current).toBe(3000);
    // A tick is a display rerender only (F-21, FR-39): no read and no write.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('stops the interval and keeps the surface value once the attempt is closed', () => {
    const view = renderClock(runningProps({ elapsedMs: 5000 }));
    advance(200);
    expect(view.result.current).toBe(5200);

    view.rerender(runningProps({ state: 'COMPLETED', elapsedMs: 5200 }));
    expect(view.result.current).toBe(5200);
    expect(vi.getTimerCount()).toBe(0);

    advance(5000);
    expect(view.result.current).toBe(5200);
  });

  it('starts no interval for a block that never ran', () => {
    const { result } = renderClock(
      runningProps({ state: 'NOT_STARTED', elapsedMs: null }),
    );

    expect(result.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('re-anchors on a new surface elapsed value instead of drifting locally', () => {
    const view = renderClock(runningProps({ elapsedMs: 1000 }));
    advance(300);
    expect(view.result.current).toBe(1300);

    // A refetch answered with an official value: it becomes the new base.
    view.rerender(runningProps({ elapsedMs: 2000 }));
    expect(view.result.current).toBe(2000);

    advance(TIMING_ELAPSED_TICK_MS);
    expect(view.result.current).toBe(2100);
  });

  it('re-anchors when the official start of the attempt changes', () => {
    const view = renderClock(runningProps({ elapsedMs: 1000 }));
    advance(500);
    expect(view.result.current).toBe(1500);

    // A correction of the official start re-anchors the display.
    view.rerender(
      runningProps({
        officialStartedAt: '2026-11-13T08:59:00.000Z',
        elapsedMs: 61_000,
      }),
    );
    expect(view.result.current).toBe(61_000);
  });

  it('continues from the official elapsed value after a reload', () => {
    const first = renderClock(runningProps({ elapsedMs: 1000 }));
    advance(500);
    expect(first.result.current).toBe(1500);
    first.unmount();

    // The reload reads the same attempt at a later official elapsed value.
    const second = renderClock(runningProps({ elapsedMs: 6000 }));
    expect(second.result.current).toBe(6000);

    advance(TIMING_ELAPSED_TICK_MS);
    expect(second.result.current).toBe(6100);
  });

  it('catches up after a skipped tick without moving backwards', () => {
    const { result } = renderClock(runningProps({ elapsedMs: 1000 }));
    advance(TIMING_ELAPSED_TICK_MS);
    expect(result.current).toBe(1100);

    // A hidden tab skipped ticks: the next one derives a later value, not a
    // frozen one and not a rewind (O-01, FR-41).
    act(() => {
      monotonicNow += 30_000;
      vi.advanceTimersByTime(TIMING_ELAPSED_TICK_MS);
    });
    expect(result.current).toBe(31_100);

    // A clamped local clock must not rewind the display.
    act(() => {
      monotonicNow -= 29_000;
      vi.advanceTimersByTime(TIMING_ELAPSED_TICK_MS);
    });
    expect(result.current).toBe(31_100);
  });
});
