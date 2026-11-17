import { ConflictException } from '@nestjs/common';

/**
 * Wire-stable code for "this Idempotency-Key is still being processed".
 *
 * A repeat of an open claim is not a refusal: the first request may still
 * apply. The client classifies exactly this code as unresolved and asks again
 * later; every other conflict stays a definitive answer.
 */
export const IDEMPOTENCY_IN_PROGRESS_CODE = 'IDEMPOTENCY_IN_PROGRESS';

/** Message that accompanies the coded in-progress conflict. */
export const IDEMPOTENCY_IN_PROGRESS_MESSAGE =
  'A request with this Idempotency-Key is still in progress.';

/** Body of the coded 409, returned verbatim by Nest. */
export type IdempotencyInProgressBody = {
  statusCode: 409;
  code: typeof IDEMPOTENCY_IN_PROGRESS_CODE;
  message: string;
};

export function idempotencyInProgressBody(): IdempotencyInProgressBody {
  return {
    statusCode: 409,
    code: IDEMPOTENCY_IN_PROGRESS_CODE,
    message: IDEMPOTENCY_IN_PROGRESS_MESSAGE,
  };
}

/**
 * The 409 for `reason: 'in_progress'`. Passing an object to `ConflictException`
 * makes Nest send exactly that body, so the client can read `code` directly.
 */
export function idempotencyInProgressConflict(): ConflictException {
  return new ConflictException(idempotencyInProgressBody());
}
