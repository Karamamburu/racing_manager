import { TimingErrorCode, timingError } from './timing.errors';

/**
 * The bound the enrollment result contract already applies to a published
 * total: 24 hours in milliseconds.
 */
export const TIMING_MAX_TOTAL_MS = 24 * 60 * 60 * 1000;

/** Attempt lifecycle states; only `RUNNING` accepts capture. */
export type TimingAttemptStatus =
  | 'RUNNING'
  | 'COMPLETED'
  | 'INCOMPLETE'
  | 'CANCELLED';

/** Participant states inside a running or closed attempt. */
export type TimingParticipantState =
  | 'EXCLUDED'
  | 'RECORDED'
  | 'INCOMPLETE'
  | 'RACING'
  | 'WAITING';

/** Why a committed number found no enrollment eligible for capture. */
export type TimingRoutingNoneReason =
  | 'UNKNOWN_NUMBER'
  | 'NOT_RUNNING'
  | 'EXCLUDED'
  | 'ALREADY_N';

/** The single routing decision one commit resolves to. */
export type TimingRoutingResult =
  | { kind: 'SINGLE'; enrollmentId: string }
  | { kind: 'AMBIGUOUS'; enrollmentIds: string[] }
  | { kind: 'NONE'; reason: TimingRoutingNoneReason };

/** One official instant, keyed by the pass it belongs to. */
export type TimingPassInstant = {
  passId: string;
  officialAt: string | Date;
};

/** One published lap split: the lap time and the cumulative elapsed value. */
export type TimingLapSplit = {
  lapNumber: number;
  lapTimeMs: number;
  cumulativeMs: number;
};

/** The frozen facts one participant contributes to routing and state. */
export type TimingParticipantFacts = {
  attemptStatus: TimingAttemptStatus;
  passCount: number;
  requiredLaps: number;
  excludedReason: string | null;
};

/** One numbered candidate enrollment of the committed number. */
export type TimingRoutingCandidate = TimingParticipantFacts & {
  enrollmentId: string;
};

/** Everything that can refuse a Start press; see EARS F-06..F-08, F-22, F-25. */
export type TimingStartAttemptCheck = {
  eventRecordable: boolean;
  categoryFinished: boolean;
  participantCount: number;
  participantsWithoutNumber: number;
  previousAttemptStatus: TimingAttemptStatus | null;
  captureHeldByThisWorkstation: boolean;
};

/** The three ordinary completion gates; see EARS F-18. */
export type TimingCompletionCheck = {
  pendingFinishCount: number;
  unconfirmedMutationCount: number;
  participantsBelowRequiredLaps: number;
};

/** An attempt state plus the protocol category state, as every guard sees it. */
export type TimingStateContext = {
  attemptStatus: TimingAttemptStatus;
  categoryFinished: boolean;
};

function toInstantMs(value: string | Date): number {
  const instantMs = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(instantMs)) {
    throw timingError(
      TimingErrorCode.INVALID_STATE,
      'Некорректное официальное время.',
      { value: value instanceof Date ? value.toISOString() : value },
    );
  }
  return instantMs;
}

function isClosed(attemptStatus: TimingAttemptStatus): boolean {
  return attemptStatus !== 'RUNNING';
}

/**
 * Official elapsed time: the official pass instant minus the official start
 * instant of the same attempt, in whole milliseconds.
 */
export function resolveElapsedMs(
  officialAt: string | Date,
  officialStartedAt: string | Date,
): number {
  return toInstantMs(officialAt) - toInstantMs(officialStartedAt);
}

/**
 * Refuses an official instant that is not strictly later than the attempt's
 * official start, and a published total above the 24-hour bound.
 */
export function assertWithinBounds(
  officialStartedAt: string | Date,
  officialAt: string | Date,
  maxTotalMs: number = TIMING_MAX_TOTAL_MS,
): void {
  const elapsedMs = resolveElapsedMs(officialAt, officialStartedAt);
  if (elapsedMs <= 0 || elapsedMs > maxTotalMs) {
    throw timingError(
      TimingErrorCode.OUT_OF_BOUNDS,
      'Официальное время отметки должно быть позже старта и не больше 24 часов.',
      { elapsedMs, maxTotalMs },
    );
  }
}

/**
 * Ascending official instant with a deterministic tie-break by pass id, so two
 * passes at the same instant never swap between calls. The input is not
 * mutated: the surface and the published record may re-read it.
 */
export function orderByOfficialInstant<T extends TimingPassInstant>(
  passes: T[],
): T[] {
  return [...passes].sort((left, right) => {
    const difference =
      toInstantMs(left.officialAt) - toInstantMs(right.officialAt);
    if (difference !== 0) {
      return difference;
    }
    if (left.passId === right.passId) {
      return 0;
    }
    return left.passId < right.passId ? -1 : 1;
  });
}

/** Lap numbers 1..k in official-instant order, never in capture order. */
export function assignLapNumbers<T extends TimingPassInstant>(
  passes: T[],
): Array<{ passId: string; lapNumber: number }> {
  return orderByOfficialInstant(passes).map((pass, index) => ({
    passId: pass.passId,
    lapNumber: index + 1,
  }));
}

/**
 * Lap splits in official-instant order: the lap time of lap 1 is measured from
 * the official start, every later lap from the previous official instant, and
 * the cumulative value of the last lap is the total. A non-positive split (a
 * pass at or before the start, or two passes at one instant) and a total above
 * 24 hours are refused.
 */
export function computeSplits(
  officialStartedAt: string | Date,
  passes: TimingPassInstant[],
): TimingLapSplit[] {
  const splits: TimingLapSplit[] = [];
  let previousCumulativeMs = 0;
  for (const [index, pass] of orderByOfficialInstant(passes).entries()) {
    const lapNumber = index + 1;
    const cumulativeMs = resolveElapsedMs(pass.officialAt, officialStartedAt);
    const lapTimeMs = cumulativeMs - previousCumulativeMs;
    if (lapTimeMs <= 0 || cumulativeMs > TIMING_MAX_TOTAL_MS) {
      throw timingError(
        TimingErrorCode.OUT_OF_BOUNDS,
        'Время круга должно быть положительным, а итог — не больше 24 часов.',
        { passId: pass.passId, lapNumber, lapTimeMs, cumulativeMs },
      );
    }
    splits.push({ lapNumber, lapTimeMs, cumulativeMs });
    previousCumulativeMs = cumulativeMs;
  }
  return splits;
}

/**
 * Participant state by PRD §2.4 priority: excluded, recorded, incomplete,
 * racing, waiting. A closed attempt below N is `INCOMPLETE`; a cancelled
 * attempt follows the same closed rule and is announced by the attempt state,
 * not by the participant state.
 */
export function classifyParticipantState(
  input: TimingParticipantFacts,
): TimingParticipantState {
  if (input.excludedReason !== null) {
    return 'EXCLUDED';
  }
  if (input.passCount >= input.requiredLaps) {
    return 'RECORDED';
  }
  if (isClosed(input.attemptStatus)) {
    return 'INCOMPLETE';
  }
  if (input.passCount > 0) {
    return 'RACING';
  }
  return 'WAITING';
}

/** A participant is capturable only while running, not excluded and below N. */
export function isEligibleForCapture(
  candidate: TimingRoutingCandidate,
): boolean {
  return (
    candidate.attemptStatus === 'RUNNING' &&
    candidate.excludedReason === null &&
    candidate.passCount < candidate.requiredLaps
  );
}

function noEligibleReason(
  candidates: TimingRoutingCandidate[],
): TimingRoutingNoneReason {
  const running = candidates.filter(
    (candidate) => candidate.attemptStatus === 'RUNNING',
  );
  if (running.some((candidate) => candidate.excludedReason !== null)) {
    return 'EXCLUDED';
  }
  if (
    running.some((candidate) => candidate.passCount >= candidate.requiredLaps)
  ) {
    return 'ALREADY_N';
  }
  return 'NOT_RUNNING';
}

/**
 * Routes one commit without asking the referee to choose a category: exactly
 * one eligible enrollment is a silent `SINGLE`, two or more need an explicit
 * choice, and zero names why (unknown, not running, excluded or already N).
 */
export function classifyRouting(
  candidates: TimingRoutingCandidate[],
): TimingRoutingResult {
  if (candidates.length === 0) {
    return { kind: 'NONE', reason: 'UNKNOWN_NUMBER' };
  }
  const eligible = candidates.filter(isEligibleForCapture);
  if (eligible.length === 1) {
    return { kind: 'SINGLE', enrollmentId: eligible[0].enrollmentId };
  }
  if (eligible.length > 1) {
    return {
      kind: 'AMBIGUOUS',
      enrollmentIds: eligible.map((candidate) => candidate.enrollmentId),
    };
  }
  return { kind: 'NONE', reason: noEligibleReason(candidates) };
}

/**
 * First Start-press refusal in the EARS F-07 order, then the previous attempt
 * (F-06, F-08) and the capture hold (F-25); `null` means the press is allowed.
 */
export function canStartAttempt(
  input: TimingStartAttemptCheck,
): TimingErrorCode | null {
  if (!input.eventRecordable) {
    return TimingErrorCode.NOT_AVAILABLE;
  }
  if (input.categoryFinished) {
    return TimingErrorCode.CATEGORY_FINISHED;
  }
  if (input.participantCount <= 0) {
    return TimingErrorCode.NO_TIMEABLE_PARTICIPANT;
  }
  if (input.participantsWithoutNumber > 0) {
    return TimingErrorCode.MISSING_START_NUMBER;
  }
  if (input.previousAttemptStatus === 'RUNNING') {
    return TimingErrorCode.ATTEMPT_RUNNING;
  }
  if (
    input.previousAttemptStatus === 'COMPLETED' ||
    input.previousAttemptStatus === 'INCOMPLETE'
  ) {
    return TimingErrorCode.ATTEMPT_CLOSED;
  }
  if (!input.captureHeldByThisWorkstation) {
    return TimingErrorCode.CAPTURE_NOT_HELD;
  }
  return null;
}

/**
 * Ordinary completion gates in the order the surface names them: an unbound
 * pending finish, an unconfirmed workstation mutation, then a short
 * participant. `null` means the attempt may close as `COMPLETED`.
 */
export function canComplete(
  input: TimingCompletionCheck,
): TimingErrorCode | null {
  if (input.pendingFinishCount > 0) {
    return TimingErrorCode.PENDING_REMAINS;
  }
  if (input.unconfirmedMutationCount > 0) {
    return TimingErrorCode.UNCONFIRMED_MUTATIONS;
  }
  if (input.participantsBelowRequiredLaps > 0) {
    return TimingErrorCode.PARTICIPANTS_BELOW_LAPS;
  }
  return null;
}

/**
 * Official start and pass times stay correctable while the category is
 * unfinished, including after closure; a cancelled attempt accepts nothing.
 */
export function canCorrectOfficialTime(
  input: TimingStateContext,
): TimingErrorCode | null {
  if (input.categoryFinished) {
    return TimingErrorCode.CATEGORY_FINISHED;
  }
  if (input.attemptStatus === 'CANCELLED') {
    return TimingErrorCode.INVALID_STATE;
  }
  return null;
}

/**
 * A binding or a pass cancellation is a correction only while the attempt is
 * running; the pass set is frozen once the attempt closes.
 */
export function canRebindOrCancelPass(
  input: TimingStateContext,
): TimingErrorCode | null {
  if (input.categoryFinished) {
    return TimingErrorCode.CATEGORY_FINISHED;
  }
  if (input.attemptStatus === 'CANCELLED') {
    return TimingErrorCode.INVALID_STATE;
  }
  if (isClosed(input.attemptStatus)) {
    return TimingErrorCode.ATTEMPT_CLOSED;
  }
  return null;
}

/** Trims a required reason and refuses a missing or blank one. */
export function normalizeReason(reason: string | null | undefined): string {
  const normalized = typeof reason === 'string' ? reason.trim() : '';
  if (normalized.length === 0) {
    throw timingError(
      TimingErrorCode.REASON_REQUIRED,
      'Укажите причину изменения.',
    );
  }
  return normalized;
}

/** Refuses a pass or a bind that would give a participant more than N passes. */
export function assertCanAddPass(
  passCount: number,
  requiredLaps: number,
): void {
  if (passCount >= requiredLaps) {
    throw timingError(
      TimingErrorCode.ALREADY_N_PASSES,
      'У участника уже есть все отметки.',
      { passCount, requiredLaps },
    );
  }
}

/** The next attempt number of a category: `max + 1`, starting at 1. */
export function nextAttemptNumber(previousAttemptNumbers: number[]): number {
  return (
    previousAttemptNumbers.reduce(
      (highest, attemptNumber) =>
        attemptNumber > highest ? attemptNumber : highest,
      0,
    ) + 1
  );
}
