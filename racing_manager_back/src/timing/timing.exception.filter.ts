import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  TimingDomainError,
  TimingErrorCode,
  type TimingErrorDetails,
} from './timing.errors';

/**
 * The one HTTP status of every MANUAL-TIMING domain code.
 *
 * Two families, decided by what refuses the request:
 *
 * - `400` — the request cannot be served as sent: the event offers no surface,
 *   the roster or the committed number cannot resolve to one eligible
 *   participant, or a value leaves the published bounds. Retrying the same
 *   request unchanged fails the same way.
 * - `409` — the request is well formed but conflicts with the persisted state
 *   of the attempt, category or capture lock. Another action (a cancellation, a
 *   bind, a force-complete, a capture transfer) must happen first.
 *
 * `403` is reserved for a missing role and `404` for a named resource that does
 * not exist, so a client can tell "wrong actor" and "gone" from "bad input" and
 * "wrong moment".
 */
export const TIMING_ERROR_STATUS: Readonly<
  Record<TimingErrorCode, HttpStatus>
> = {
  // The addressed event, attempt, pass, pending finish or user is absent.
  [TimingErrorCode.NOT_FOUND]: HttpStatus.NOT_FOUND,
  // The actor holds neither REFEREE nor ADMINISTRATOR.
  [TimingErrorCode.ROLE_REQUIRED]: HttpStatus.FORBIDDEN,
  // No timing surface: the event has no starts, or is cancelled or past-completed.
  [TimingErrorCode.NOT_AVAILABLE]: HttpStatus.BAD_REQUEST,
  // The frozen roster leaves nothing to time, or a row cannot be addressed.
  [TimingErrorCode.NO_TIMEABLE_PARTICIPANT]: HttpStatus.BAD_REQUEST,
  [TimingErrorCode.MISSING_START_NUMBER]: HttpStatus.BAD_REQUEST,
  [TimingErrorCode.NUMBER_REQUIRED]: HttpStatus.BAD_REQUEST,
  [TimingErrorCode.NUMBER_UNKNOWN]: HttpStatus.BAD_REQUEST,
  [TimingErrorCode.NUMBER_AMBIGUOUS]: HttpStatus.BAD_REQUEST,
  [TimingErrorCode.EXCLUDED_PARTICIPANT]: HttpStatus.BAD_REQUEST,
  [TimingErrorCode.OUT_OF_BOUNDS]: HttpStatus.BAD_REQUEST,
  [TimingErrorCode.REASON_REQUIRED]: HttpStatus.BAD_REQUEST,
  // The running attempt, its passes or the category state refuse the request.
  [TimingErrorCode.CAPTURE_HELD]: HttpStatus.CONFLICT,
  [TimingErrorCode.CAPTURE_NOT_HELD]: HttpStatus.CONFLICT,
  [TimingErrorCode.ATTEMPT_RUNNING]: HttpStatus.CONFLICT,
  [TimingErrorCode.ATTEMPT_CLOSED]: HttpStatus.CONFLICT,
  [TimingErrorCode.CATEGORY_FINISHED]: HttpStatus.CONFLICT,
  [TimingErrorCode.ALREADY_N_PASSES]: HttpStatus.CONFLICT,
  [TimingErrorCode.PENDING_REMAINS]: HttpStatus.CONFLICT,
  [TimingErrorCode.UNCONFIRMED_MUTATIONS]: HttpStatus.CONFLICT,
  [TimingErrorCode.PARTICIPANTS_BELOW_LAPS]: HttpStatus.CONFLICT,
  [TimingErrorCode.CONFLICT]: HttpStatus.CONFLICT,
  [TimingErrorCode.RACE_CREATION_BLOCKED]: HttpStatus.CONFLICT,
  [TimingErrorCode.INVALID_STATE]: HttpStatus.CONFLICT,
};

/** The error body of a `TimingDomainError`; `details` names the blocker. */
export interface TimingErrorBody {
  statusCode: number;
  code: TimingErrorCode;
  message: string;
  details?: TimingErrorDetails;
}

/**
 * Maps a `TimingDomainError` to its status and `{ statusCode, code, message,
 * details? }` body, so the wire carries the domain code the client switches on
 * rather than a prose message.
 *
 * It catches only `TimingDomainError`: a validation, guard, Prisma or unknown
 * error keeps its own Nest handling and is never reshaped here.
 */
@Catch(TimingDomainError)
export class TimingExceptionFilter implements ExceptionFilter<TimingDomainError> {
  catch(exception: TimingDomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const statusCode = TIMING_ERROR_STATUS[exception.code];
    const body: TimingErrorBody = {
      statusCode,
      code: exception.code,
      message: exception.message,
      ...(exception.details === undefined
        ? {}
        : { details: exception.details }),
    };
    response.status(statusCode).json(body);
  }
}
