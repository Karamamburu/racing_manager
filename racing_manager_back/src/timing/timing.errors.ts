/**
 * Stable MANUAL-TIMING domain error codes.
 *
 * The timing exception filter maps every code to one HTTP status; services and
 * the repository throw these values through `TimingDomainError` and never an
 * HTTP exception. The names are wire-stable: later waves import them.
 */
export const TimingErrorCode = {
  /** The event, attempt, pass, pending finish or user does not exist. */
  NOT_FOUND: 'NOT_FOUND',
  /** The event offers no timing surface (no starts, cancelled or locked). */
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  /** The actor does not hold the role the operation requires. */
  ROLE_REQUIRED: 'ROLE_REQUIRED',
  /** The workstation does not hold the event-wide capture lock. */
  CAPTURE_NOT_HELD: 'CAPTURE_NOT_HELD',
  /** Another workstation already holds the event-wide capture lock. */
  CAPTURE_HELD: 'CAPTURE_HELD',
  /** The category already has a running attempt. */
  ATTEMPT_RUNNING: 'ATTEMPT_RUNNING',
  /** The attempt is terminal and refuses the requested change. */
  ATTEMPT_CLOSED: 'ATTEMPT_CLOSED',
  /** The protocol category is finished, so timing accepts no change. */
  CATEGORY_FINISHED: 'CATEGORY_FINISHED',
  /** Every participant of the category is excluded, so no attempt can exist. */
  NO_TIMEABLE_PARTICIPANT: 'NO_TIMEABLE_PARTICIPANT',
  /** A timeable participant lacks an event-unique start number. */
  MISSING_START_NUMBER: 'MISSING_START_NUMBER',
  /** The request carries neither a number nor an enrollment for a capture. */
  NUMBER_REQUIRED: 'NUMBER_REQUIRED',
  /** The committed number resolves to no registration of the event. */
  NUMBER_UNKNOWN: 'NUMBER_UNKNOWN',
  /** The committed number resolves to two or more eligible enrollments. */
  NUMBER_AMBIGUOUS: 'NUMBER_AMBIGUOUS',
  /** The participant is excluded from this attempt. */
  EXCLUDED_PARTICIPANT: 'EXCLUDED_PARTICIPANT',
  /** The participant already holds N passes, so no further pass may exist. */
  ALREADY_N_PASSES: 'ALREADY_N_PASSES',
  /** The official instant is at or before the start, or the total exceeds 24h. */
  OUT_OF_BOUNDS: 'OUT_OF_BOUNDS',
  /** A correction, cancellation or closure lacks a non-empty reason. */
  REASON_REQUIRED: 'REASON_REQUIRED',
  /** An unbound pending finish still blocks completion. */
  PENDING_REMAINS: 'PENDING_REMAINS',
  /** The workstation still has capture mutations without a final receipt. */
  UNCONFIRMED_MUTATIONS: 'UNCONFIRMED_MUTATIONS',
  /** A non-excluded participant holds fewer than N passes at completion. */
  PARTICIPANTS_BELOW_LAPS: 'PARTICIPANTS_BELOW_LAPS',
  /** A participant gained an outcome during the attempt; publication would overwrite it. */
  CONFLICT: 'CONFLICT',
  /** A multi-stage race creation would take a participant of a running attempt. */
  RACE_CREATION_BLOCKED: 'RACE_CREATION_BLOCKED',
  /** The attempt or category is in a state that refuses the requested change. */
  INVALID_STATE: 'INVALID_STATE',
} as const;

export type TimingErrorCode =
  (typeof TimingErrorCode)[keyof typeof TimingErrorCode];

/** Structured context the filter and the surface may read; never a stack. */
export type TimingErrorDetails = Readonly<Record<string, unknown>>;

/**
 * The only error a timing domain rule throws. The exception filter reads
 * `code` to choose the HTTP status and `details` to name the blocker.
 */
export class TimingDomainError extends Error {
  readonly code: TimingErrorCode;
  readonly details?: TimingErrorDetails;

  constructor(
    code: TimingErrorCode,
    message: string,
    details?: TimingErrorDetails,
  ) {
    super(message);
    this.name = 'TimingDomainError';
    this.code = code;
    this.details = details;
  }
}

/** Builds a `TimingDomainError`; keeps rule bodies one line per refusal. */
export function timingError(
  code: TimingErrorCode,
  message: string,
  details?: TimingErrorDetails,
): TimingDomainError {
  return new TimingDomainError(code, message, details);
}
