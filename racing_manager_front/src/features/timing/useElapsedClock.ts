import { useEffect, useRef, useState } from 'react';
import type { TimingCategoryState } from './types';

/**
 * How often a running block redraws its elapsed value (S-08, FR-38).
 *
 * This is a display cadence only: it bounds how often a local rerender happens,
 * never how often the surface is read or written (F-21).
 */
export const TIMING_ELAPSED_TICK_MS = 100;

/** The surface facts the display reads. None of them is ever written back. */
export interface UseElapsedClockInput {
  /** The lifecycle of the attempt the block shows. */
  state: TimingCategoryState;
  /** The attempt's official start, ISO-8601; `null` before a start. */
  officialStartedAt: string | null;
  /** The official elapsed value of the latest surface read, integer ms. */
  elapsedMs: number | null;
}

/**
 * One open display anchor: the surface elapsed value and the local read that
 * adopted it. A new surface value, a new official start or a new attempt opens a
 * new anchor, so a reload, a transfer or a correction continues the clock from
 * the official start instead of from the last local rerender (U-22, E-18).
 */
interface ElapsedAnchor {
  /** Surface elapsed milliseconds every tick is measured from. */
  baseElapsedMs: number;
  /** `performance.now()` read when the surface value was adopted. */
  anchorMonotonicMs: number;
}

/** The elapsed value one anchor renders at a local instant, never below its base. */
function elapsedAt(anchor: ElapsedAnchor, monotonicMs: number): number {
  const delta = Math.max(0, monotonicMs - anchor.anchorMonotonicMs);
  return Math.max(anchor.baseElapsedMs, Math.round(anchor.baseElapsedMs + delta));
}

/**
 * The displayed elapsed value of one timing block (AD-19, FR-38..FR-41).
 *
 * The surface stays the only source of an official time: the hook adopts its
 * `elapsedMs` as the base of an anchor and adds the local `performance.now()`
 * delta every `TIMING_ELAPSED_TICK_MS` while the attempt runs. It opens no
 * request, performs no write and changes no official or published value (U-22,
 * F-21). The interval exists only while the attempt runs and is cleared on
 * unmount, so a closed block keeps its static server value (O-04).
 *
 * A hidden or throttled tab may skip ticks; the next tick derives the value from
 * the same anchor, so it catches up and never moves backwards inside one anchor
 * (O-01). Several running blocks each own their anchor and interval, so they
 * advance independently and at most once per tick (O-05).
 *
 * @returns The displayed elapsed milliseconds, or the surface value unchanged
 *   when the attempt is not running or has no elapsed value yet.
 */
export function useElapsedClock({
  state,
  officialStartedAt,
  elapsedMs,
}: UseElapsedClockInput): number | null {
  const running = state === 'RUNNING' && elapsedMs !== null;
  // The key names the anchor: any change of the surface value or of the
  // official start re-anchors the display to what the API just answered.
  const anchorKey = running ? `${officialStartedAt ?? ''}:${elapsedMs}` : null;
  const anchorRef = useRef<ElapsedAnchor | null>(null);
  const [displayedMs, setDisplayedMs] = useState<number | null>(elapsedMs);

  useEffect(() => {
    if (anchorKey === null || elapsedMs === null) {
      anchorRef.current = null;
      setDisplayedMs(elapsedMs);
      return;
    }

    const anchor: ElapsedAnchor = {
      baseElapsedMs: elapsedMs,
      anchorMonotonicMs: performance.now(),
    };
    anchorRef.current = anchor;
    // The surface value is authoritative: adopt it instead of holding a local
    // value the API has just corrected or a reload has just restated.
    setDisplayedMs(elapsedMs);

    const timer = setInterval(() => {
      const current = anchorRef.current;
      if (current === null) return;
      const next = elapsedAt(current, performance.now());
      // A skipped tick or a clamped local clock must never rewind the display.
      setDisplayedMs((previous) =>
        previous === null ? next : Math.max(previous, next),
      );
    }, TIMING_ELAPSED_TICK_MS);

    return () => {
      clearInterval(timer);
      anchorRef.current = null;
    };
  }, [anchorKey, elapsedMs]);

  return running ? displayedMs ?? elapsedMs : elapsedMs;
}
