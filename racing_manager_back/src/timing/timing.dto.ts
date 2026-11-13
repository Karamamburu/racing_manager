/*
 * Request bodies of the MANUAL-TIMING routes, mirroring `ARCHITECTURE.md` §6.
 *
 * Dates enter as ISO-8601 strings and durations as integer milliseconds; the
 * service converts and trims. Identifiers that are guaranteed UUIDs at the
 * boundary use `@IsUUID`, opaque identifiers stay `@IsString` so a future id
 * shape does not break a live client.
 */

import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsInt,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import {
  TIMING_CAPTURE_KINDS,
  TIMING_GENDERS,
  type TimingCaptureKind,
  type TimingGender,
} from './timing.views';

/** The official instant a correction moves: the attempt start or one pass. */
const OFFICIAL_TIME_TARGET_TYPES = ['START', 'PASS'] as const;

type OfficialTimeTargetType = (typeof OFFICIAL_TIME_TARGET_TYPES)[number];

/** A present optional field; an empty string still counts as a delivered value. */
function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/**
 * Rejects an identity field that the selected `kind` must leave absent.
 *
 * class-validator ANDs every `@ValidateIf` of one property and skips all of
 * that property's validators when any gate is false, so the "absent" half of
 * the cross-field rule sits on `kind`, next to the value it depends on, while
 * `@ValidateIf` on `startNumber` and `enrollmentId` keeps the "required" half.
 */
function ConsistentCaptureIdentity(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'consistentCaptureIdentity',
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(_value: unknown, arguments_: ValidationArguments): boolean {
          const body = arguments_.object as CaptureTimingPassDto;
          if (body.kind === 'NUMBER') {
            return !hasValue(body.enrollmentId);
          }
          if (body.kind === 'TILE') {
            return !hasValue(body.startNumber);
          }
          if (body.kind === 'PENDING_FINISH') {
            return !hasValue(body.startNumber) && !hasValue(body.enrollmentId);
          }
          // An unknown kind is already reported by @IsIn.
          return true;
        },
        defaultMessage(): string {
          return 'startNumber and enrollmentId must match kind: number for NUMBER, enrollment for TILE, neither for PENDING_FINISH.';
        },
      },
    });
  };
}

/**
 * Rejects a bind that names both a number and an enrollment, or neither.
 *
 * The constraint sits on the always-required `pendingFinishId` because a
 * property can carry only one `@ValidateIf` gate; the gates on `startNumber`
 * and `enrollmentId` then only have to express "required when the sibling is
 * missing".
 */
function SelectsExactlyOneIdentity(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'selectsExactlyOneIdentity',
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(_value: unknown, arguments_: ValidationArguments): boolean {
          const body = arguments_.object as BindPendingFinishDto;
          return hasValue(body.startNumber) !== hasValue(body.enrollmentId);
        },
        defaultMessage(): string {
          return 'Exactly one of startNumber and enrollmentId is required.';
        },
      },
    });
  };
}

/** `POST /events/:eventId/timing/attempts` — the Start press. */
export class StartTimingAttemptDto {
  /** Protocol category the attempt belongs to. */
  @IsString()
  @MinLength(1)
  startId!: string;

  @IsInt()
  @Min(1)
  formatId!: number;

  @IsIn(TIMING_GENDERS)
  gender!: TimingGender;

  /** The workstation that pressed Start and must hold the capture lock. */
  @IsString()
  @MinLength(1)
  workstationInstanceId!: string;

  /** Client wall clock of the press, ISO-8601. */
  @IsISO8601()
  clientStartedAt!: string;
}

/** `POST /events/:eventId/timing/attempts/:attemptId/clock-epochs`. */
export class OpenClockEpochDto {
  @IsString()
  @MinLength(1)
  workstationInstanceId!: string;
}

/** `POST /events/:eventId/timing/passes` — one number, tile or unbound finish. */
export class CaptureTimingPassDto {
  @IsUUID()
  attemptId!: string;

  @IsIn(TIMING_CAPTURE_KINDS)
  @ConsistentCaptureIdentity()
  kind!: TimingCaptureKind;

  /** Required for `NUMBER`; absent for `TILE` and `PENDING_FINISH`. */
  @ValidateIf((body: CaptureTimingPassDto) => body.kind === 'NUMBER')
  @IsInt()
  @Min(1)
  startNumber?: number;

  /** Required for `TILE`; absent for `NUMBER` and `PENDING_FINISH`. */
  @ValidateIf((body: CaptureTimingPassDto) => body.kind === 'TILE')
  @IsString()
  @MinLength(1)
  enrollmentId?: string;

  /** Client wall clock of the capture, ISO-8601. */
  @IsISO8601()
  clientCapturedAt!: string;

  /** Raw milliseconds since the epoch anchor; may be zero at the anchor. */
  @IsInt()
  @Min(0)
  clientElapsedMs!: number;

  @IsString()
  @MinLength(1)
  clockEpochId!: string;

  @IsString()
  @MinLength(1)
  workstationInstanceId!: string;

  /** Monotonic per-workstation capture sequence, starting at 1. */
  @IsInt()
  @Min(1)
  deviceSequence!: number;
}

/** `POST /events/:eventId/timing/pending-finishes/:pendingFinishId/bind`. */
export class BindPendingFinishDto {
  @IsString()
  @MinLength(1)
  @SelectsExactlyOneIdentity()
  pendingFinishId!: string;

  /** Exactly one of `startNumber` and `enrollmentId` is required. */
  @ValidateIf((body: BindPendingFinishDto) => !hasValue(body.enrollmentId))
  @IsInt()
  @Min(1)
  startNumber?: number;

  /** Exactly one of `startNumber` and `enrollmentId` is required. */
  @ValidateIf((body: BindPendingFinishDto) => !hasValue(body.startNumber))
  @IsString()
  @MinLength(1)
  enrollmentId?: string;

  @IsString()
  @MinLength(1)
  workstationInstanceId!: string;

  @IsInt()
  @Min(1)
  deviceSequence!: number;
}

/** `POST /events/:eventId/timing/pending-finishes/:pendingFinishId/cancel`. */
export class CancelPendingFinishDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}

/** `PATCH /events/:eventId/timing/passes/:passId/official-time`; `targetType` picks the start or the pass. */
export class CorrectOfficialTimeDto {
  @IsIn(OFFICIAL_TIME_TARGET_TYPES)
  targetType!: OfficialTimeTargetType;

  @IsString()
  @MinLength(1)
  targetId!: string;

  /** The corrected official instant, ISO-8601. */
  @IsISO8601()
  officialAt!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}

/** `POST /events/:eventId/timing/passes/:passId/cancel`. */
export class CancelTimingPassDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}

/** `POST /events/:eventId/timing/passes/:passId/rebind`. */
export class RebindTimingPassDto {
  @IsString()
  @MinLength(1)
  targetEnrollmentId!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}

/** `POST /events/:eventId/timing/attempts/:attemptId/undo`. */
export class QuickUndoTimingPassDto {
  @IsString()
  @MinLength(1)
  workstationInstanceId!: string;

  /** The last sequence this workstation issued and now withdraws. */
  @IsInt()
  @Min(1)
  deviceSequence!: number;
}

/** `POST /events/:eventId/timing/attempts/:attemptId/complete`. */
export class CompleteTimingAttemptDto {
  @IsString()
  @MinLength(1)
  workstationInstanceId!: string;

  /** The highest sequence the workstation issued; zero when it issued none. */
  @IsInt()
  @Min(0)
  lastIssuedSequence!: number;
}

/** `POST /events/:eventId/timing/attempts/:attemptId/force-complete`. */
export class ForceCompleteTimingAttemptDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}

/** `POST /events/:eventId/timing/attempts/:attemptId/cancel`. */
export class CancelTimingAttemptDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}

/** `POST /events/:eventId/timing/capture/take`. */
export class TakeCaptureDto {
  @IsString()
  @MinLength(1)
  workstationInstanceId!: string;
}

/** `POST /events/:eventId/timing/capture/transfer`. */
export class TransferCaptureDto {
  @IsString()
  @MinLength(1)
  toWorkstationInstanceId!: string;
}

/** `POST /events/:eventId/timing/capture/force-release`. */
export class ForceReleaseCaptureDto {
  @IsString()
  @MinLength(1)
  workstationInstanceId!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}

/** `PATCH /admin/users/:userId/referee-role`. */
export class SetRefereeRoleDto {
  @IsBoolean()
  enabled!: boolean;
}
