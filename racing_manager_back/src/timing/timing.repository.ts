import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  Prisma,
  type AgeSplitSectionKind,
  type EnrollmentStatus,
  type EventStatus,
  type GenderType,
  type RegistrationStatus,
  type ResultOutcome,
  type StartPurposeType,
  type TimingMarkKind,
  type TimingMarkStatus,
  type TimingReceiptStatus,
  type TimingSessionStatus,
} from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import type { TimingLapSplit } from './timing.domain';

/**
 * MANUAL-TIMING data access: the only Prisma and SQL caller of the module.
 *
 * Every method returns raw rows or writes one row set. No business rule lives
 * here: no N, no routing, no bounds, no state guard, no idempotency decision.
 * The service opens the transaction through `withTransaction`, passes the
 * opaque `TimingTx` down to the writes it wants to commit together, and makes
 * every refusal itself.
 *
 * The capture-lock methods are the one exception to "one statement per call":
 * each is a single conditional SQL statement whose predicate and its write are
 * atomic in PostgreSQL, so two workstations cannot both win a claim, and a
 * stale token cannot transfer or release a lock it no longer owns.
 */

/** The transaction scope only `withTransaction` may open. */
export type TimingTx = Prisma.TransactionClient;

/** A Prisma client that is either the root service or one transaction. */
type TimingDb = TimingTx | PrismaService;

/** The closure report frozen on a closed attempt (`closure_report`). */
export type TimingClosureReportRecord = {
  publishedEnrollmentIds: string[];
  unpublishedEnrollmentIds: string[];
  conflictEnrollmentIds: string[];
};

/** What a start press needs to know about the event. */
export type TimingEventRow = {
  id: string;
  status: EventStatus;
  eventDate: Date;
};

/** One protocol start; `formatIds` are the formats it runs. */
export type TimingStartRow = {
  id: string;
  purposeType: StartPurposeType;
  lapCount: number;
  lapLengthMeters: number;
  displayName: string | null;
  sortOrder: number;
  formatIds: number[];
};

/** One active enrollment with the facts a roster or exclusion rule reads. */
export type TimingEnrollmentRow = {
  enrollmentId: string;
  eventId: string;
  startId: string;
  formatId: number;
  enrollmentStatus: EnrollmentStatus;
  registrationId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  gender: GenderType;
  birthYear: number;
  startNumber: number | null;
  registrationStatus: RegistrationStatus;
  note: string | null;
  registeredAt: Date;
  result: {
    id: string;
    outcome: ResultOutcome | null;
    timeMilliseconds: number | null;
    timingSessionId: string | null;
  } | null;
};

/** One stored age-category member row, as `age-groups.ts` consumes it. */
export type TimingAgeCategoryRow = {
  startId: string;
  formatId: number;
  gender: GenderType;
  categoryNumber: number;
  groupId: string;
};

/** One stored legacy age-section row, as `age-groups.ts` consumes it. */
export type TimingAgeSectionRow = {
  startId: string;
  formatId: number;
  gender: GenderType;
  sectionId: string;
  sectionKind: AgeSplitSectionKind;
  sortOrder: number;
};

/** One race row, structurally a `RaceScopeRow` of `race-scope.ts`. */
export type TimingClassCompetitionRow = {
  id: string;
  startId: string | null;
  formatId: number | null;
  gender: GenderType;
  sectionId: string | null;
  sectionKind: string | null;
  targetKey: string;
  targetGroupIds: string[];
  targetWholeCategory: boolean;
  frozenTitle: string | null;
  frozenSubtitle: string | null;
  frozenYoungestBound: number | null;
  frozenMemberBounds: number[];
  frozenSectionNumber: number | null;
  capturedEnrollmentIds: string[];
  capturedRegistrationIds: string[];
};

/** One attempt of a category, with its frozen roster size. */
export type TimingAttemptRow = {
  id: string;
  eventId: string;
  startId: string;
  formatId: number;
  gender: GenderType;
  attemptNumber: number;
  status: TimingSessionStatus;
  officialStartedAt: Date;
  clientStartedAt: Date;
  startedByUserId: string | null;
  closedAt: Date | null;
  closedByUserId: string | null;
  closureReport: TimingClosureReportRecord | null;
  participantCount: number;
  createdAt: Date;
  updatedAt: Date;
};

/** One frozen roster row of an attempt. */
export type TimingParticipantRow = {
  enrollmentId: string;
  registrationId: string;
  startNumber: number | null;
  sectionId: string | null;
  requiredLaps: number;
  initialOutcome: ResultOutcome | null;
  excludedReason: string | null;
};

/**
 * One frozen roster row plus the person the tile shows. A name is never frozen
 * by the schema, so the surface reads the registration's current one.
 */
export type TimingParticipantRosterRow = TimingParticipantRow & {
  firstName: string | null;
  lastName: string | null;
};

/**
 * One enrollment a committed number can route to: the frozen participant, its
 * attempt state and the bound passes the enrollment already holds in it.
 */
export type TimingRoutingCandidateRow = {
  attemptId: string;
  attemptStatus: TimingSessionStatus;
  enrollmentId: string;
  registrationId: string;
  startNumber: number | null;
  sectionId: string | null;
  excludedReason: string | null;
  requiredLaps: number;
  passCount: number;
};

/** One participation format of the catalog; the surface orders blocks by it. */
export type TimingFormatRow = {
  id: number;
  sortOrder: number;
};

/** One raw capture: a bound pass, an unbound finish or a cancelled mark. */
export type TimingMarkRow = {
  id: string;
  attemptId: string;
  clockEpochId: string;
  enrollmentId: string | null;
  registrationId: string | null;
  startNumber: number | null;
  kind: TimingMarkKind;
  rawCapturedAt: Date;
  rawElapsedMs: number;
  officialAt: Date;
  officialElapsedMs: number;
  lapNumber: number | null;
  status: TimingMarkStatus;
  workstationInstanceId: string;
  deviceSequence: number | null;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
};

/** One monotonic clock anchor of an attempt and workstation. */
export type TimingClockEpochRow = {
  id: string;
  attemptId: string;
  workstationInstanceId: string;
  officialElapsedAnchorMs: number;
  openedAt: Date;
  closedAt: Date | null;
  openedByUserId: string | null;
};

/** The event-wide capture holder, if any. */
export type TimingCaptureLockRow = {
  eventId: string;
  workstationInstanceId: string;
  lockToken: string;
  heldByUserId: string;
  acquiredAt: Date;
  lastSeenAt: Date;
};

/** One per-workstation capture sequence receipt. */
export type TimingReceiptRow = {
  attemptId: string;
  workstationInstanceId: string;
  deviceSequence: number;
  status: TimingReceiptStatus;
  reason: string | null;
  createdAt: Date;
};

/** One append-only timing audit row. */
export type TimingAuditRow = {
  auditId: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  reason: string | null;
  createdAt: Date;
};

/** One authoritative enrollment result row. */
export type TimingResultRow = {
  id: string;
  enrollmentId: string | null;
  registrationId: string;
  outcome: ResultOutcome | null;
  timeMilliseconds: number | null;
  place: number | null;
  recordedAt: Date;
  updatedAt: Date;
  timingSessionId: string | null;
};

/** One result an attempt published, with the exact split set it wrote. */
export type TimingPublishedResultRow = TimingResultRow & {
  laps: TimingLapSplit[];
};

/** A Start press roster member frozen into the attempt. */
export type TimingParticipantInput = {
  enrollmentId: string;
  registrationId: string;
  startNumber: number | null;
  sectionId: string | null;
  requiredLaps: number;
  initialOutcome: ResultOutcome | null;
  excludedReason?: string | null;
};

/** The one write that creates a running attempt and its frozen roster. */
export type CreateAttemptInput = {
  eventId: string;
  startId: string;
  formatId: number;
  gender: GenderType;
  attemptNumber: number;
  officialStartedAt: Date;
  clientStartedAt: Date;
  startedByUserId: string | null;
  participants: TimingParticipantInput[];
};

/** The one write that closes an attempt. */
export type UpdateAttemptStatusInput = {
  status: TimingSessionStatus;
  closedAt: Date | null;
  closedByUserId: string | null;
  closureReport: TimingClosureReportRecord | null;
};

/** The generic mark write: a new pass or a new unbound finish. */
export type CreateMarkInput = {
  attemptId: string;
  clockEpochId: string;
  enrollmentId: string | null;
  registrationId: string | null;
  startNumber: number | null;
  kind: TimingMarkKind;
  rawCapturedAt: Date;
  rawElapsedMs: number;
  officialAt: Date;
  officialElapsedMs: number;
  lapNumber: number | null;
  status: TimingMarkStatus;
  workstationInstanceId: string;
  deviceSequence: number | null;
  idempotencyKey: string;
};

/**
 * The generic mark correction: `undefined` keeps a column as it is, `null`
 * clears a nullable one. It covers a bind, an official-time correction, a
 * cancellation and a lap renumber without a method per case.
 */
export type UpdateMarkInput = {
  enrollmentId?: string | null;
  registrationId?: string | null;
  startNumber?: number | null;
  /** A bind turns a `PENDING_FINISH` mark into a `PASS`; nothing else moves it. */
  kind?: TimingMarkKind;
  lapNumber?: number | null;
  status?: TimingMarkStatus;
  officialAt?: Date;
  officialElapsedMs?: number;
  deviceSequence?: number | null;
};

export type CreateClockEpochInput = {
  attemptId: string;
  workstationInstanceId: string;
  officialElapsedAnchorMs: number;
  openedByUserId: string | null;
  openedAt?: Date;
};

export type ClaimCaptureLockInput = {
  eventId: string;
  workstationInstanceId: string;
  heldByUserId: string;
  now?: Date;
};

export type TransferCaptureLockInput = {
  eventId: string;
  expectedLockToken: string;
  workstationInstanceId: string;
  heldByUserId: string;
  now?: Date;
};

export type ReleaseCaptureLockInput = {
  eventId: string;
  lockToken: string;
};

export type CreateReceiptInput = {
  attemptId: string;
  workstationInstanceId: string;
  deviceSequence: number;
  status: TimingReceiptStatus;
  reason: string | null;
};

export type InsertAuditInput = {
  attemptId: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  oldValues: Prisma.InputJsonValue | null;
  newValues: Prisma.InputJsonValue | null;
  reason: string | null;
};

/** The authoritative result one closure or correction publishes. */
export type PublishResultInput = {
  enrollmentId: string;
  registrationId: string;
  outcome: ResultOutcome;
  timeMilliseconds: number | null;
  timingSessionId: string;
};

const ATTEMPT_SELECT = {
  id: true,
  eventId: true,
  startId: true,
  formatId: true,
  gender: true,
  attemptNumber: true,
  status: true,
  officialStartedAt: true,
  clientStartedAt: true,
  startedByUserId: true,
  closedAt: true,
  closedByUserId: true,
  closureReport: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { participants: true } },
} satisfies Prisma.TimingSessionSelect;

type AttemptQueryRow = Prisma.TimingSessionGetPayload<{
  select: typeof ATTEMPT_SELECT;
}>;

const PARTICIPANT_SELECT = {
  enrollmentId: true,
  registrationId: true,
  startNumber: true,
  sectionId: true,
  requiredLaps: true,
  initialOutcome: true,
  excludedReason: true,
} satisfies Prisma.TimingSessionParticipantSelect;

const PARTICIPANT_ROSTER_SELECT = {
  ...PARTICIPANT_SELECT,
  enrollment: {
    select: {
      registration: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.TimingSessionParticipantSelect;

type ParticipantRosterQueryRow = Prisma.TimingSessionParticipantGetPayload<{
  select: typeof PARTICIPANT_ROSTER_SELECT;
}>;

const MARK_SELECT = {
  id: true,
  sessionId: true,
  clockEpochId: true,
  enrollmentId: true,
  registrationId: true,
  startNumber: true,
  kind: true,
  rawCapturedAt: true,
  rawElapsedMs: true,
  officialAt: true,
  officialElapsedMs: true,
  lapNumber: true,
  status: true,
  workstationInstanceId: true,
  deviceSequence: true,
  idempotencyKey: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TimingMarkSelect;

type MarkQueryRow = Prisma.TimingMarkGetPayload<{ select: typeof MARK_SELECT }>;

const CLOCK_EPOCH_SELECT = {
  id: true,
  sessionId: true,
  workstationInstanceId: true,
  officialElapsedAnchorMs: true,
  openedAt: true,
  closedAt: true,
  openedByUserId: true,
} satisfies Prisma.TimingClockEpochSelect;

type ClockEpochQueryRow = Prisma.TimingClockEpochGetPayload<{
  select: typeof CLOCK_EPOCH_SELECT;
}>;

const RECEIPT_SELECT = {
  sessionId: true,
  workstationInstanceId: true,
  deviceSequence: true,
  status: true,
  reason: true,
  createdAt: true,
} satisfies Prisma.TimingCaptureReceiptSelect;

type ReceiptQueryRow = Prisma.TimingCaptureReceiptGetPayload<{
  select: typeof RECEIPT_SELECT;
}>;

const AUDIT_SELECT = {
  id: true,
  actorUserId: true,
  action: true,
  targetType: true,
  targetId: true,
  oldValues: true,
  newValues: true,
  reason: true,
  createdAt: true,
} satisfies Prisma.TimingAuditSelect;

type AuditQueryRow = Prisma.TimingAuditGetPayload<{
  select: typeof AUDIT_SELECT;
}>;

const ENROLLMENT_SELECT = {
  id: true,
  eventId: true,
  startId: true,
  formatId: true,
  status: true,
  registration: {
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      gender: true,
      birthYear: true,
      startNumber: true,
      status: true,
      note: true,
      registeredAt: true,
    },
  },
  result: {
    select: {
      id: true,
      outcome: true,
      timeMilliseconds: true,
      timingSessionId: true,
    },
  },
} satisfies Prisma.EnrollmentSelect;

type EnrollmentQueryRow = Prisma.EnrollmentGetPayload<{
  select: typeof ENROLLMENT_SELECT;
}>;

const RESULT_SELECT = {
  id: true,
  enrollmentId: true,
  registrationId: true,
  outcome: true,
  timeMilliseconds: true,
  place: true,
  recordedAt: true,
  updatedAt: true,
  timingSessionId: true,
} satisfies Prisma.ResultSelect;

type ResultQueryRow = Prisma.ResultGetPayload<{ select: typeof RESULT_SELECT }>;

const RESULT_WITH_SPLITS_SELECT = {
  ...RESULT_SELECT,
  splits: {
    select: { lapNumber: true, lapTimeMs: true, cumulativeMs: true },
    orderBy: { lapNumber: 'asc' },
  },
} satisfies Prisma.ResultSelect;

type ResultWithSplitsQueryRow = Prisma.ResultGetPayload<{
  select: typeof RESULT_WITH_SPLITS_SELECT;
}>;

/** The column list every conditional capture-lock statement returns. */
const CAPTURE_LOCK_COLUMNS = Prisma.sql`
  event_id,
  workstation_instance_id,
  lock_token,
  held_by_user_id,
  acquired_at,
  last_seen_at
`;

type RawCaptureLockRow = {
  event_id: string;
  workstation_instance_id: string;
  lock_token: string;
  held_by_user_id: string;
  acquired_at: Date;
  last_seen_at: Date;
};

/**
 * Rebuilds the closure report from the JSON column. A missing report and a
 * malformed one both read as `null`; the attempt record then shows no report
 * instead of inventing empty lists.
 */
export function toClosureReport(
  value: Prisma.JsonValue | null,
): TimingClosureReportRecord | null {
  const record = toJsonRecord(value);
  if (record === null) return null;
  const published = toIdList(record.publishedEnrollmentIds);
  const unpublished = toIdList(record.unpublishedEnrollmentIds);
  const conflicts = toIdList(record.conflictEnrollmentIds);
  if (published === null || unpublished === null || conflicts === null) {
    return null;
  }
  return {
    publishedEnrollmentIds: published,
    unpublishedEnrollmentIds: unpublished,
    conflictEnrollmentIds: conflicts,
  };
}

/** Reads a JSON object column as a plain record; anything else is `null`. */
export function toJsonRecord(
  value: Prisma.JsonValue | null,
): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value;
}

function toIdList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const entries: unknown[] = value;
  const ids: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'string') return null;
    ids.push(entry);
  }
  return ids;
}

/**
 * Maps the generic mark correction onto a Prisma update payload, keeping
 * `undefined` (leave) apart from `null` (clear). Exported for the unit spec:
 * the service never calls it directly.
 */
export function buildMarkUpdate(
  input: UpdateMarkInput,
): Prisma.TimingMarkUncheckedUpdateInput {
  const data: Prisma.TimingMarkUncheckedUpdateInput = {};
  if (input.enrollmentId !== undefined) {
    data.enrollmentId = input.enrollmentId;
  }
  if (input.registrationId !== undefined) {
    data.registrationId = input.registrationId;
  }
  if (input.startNumber !== undefined) {
    data.startNumber = input.startNumber;
  }
  if (input.kind !== undefined) {
    data.kind = input.kind;
  }
  if (input.lapNumber !== undefined) {
    data.lapNumber = input.lapNumber;
  }
  if (input.status !== undefined) {
    data.status = input.status;
  }
  if (input.officialAt !== undefined) {
    data.officialAt = input.officialAt;
  }
  if (input.officialElapsedMs !== undefined) {
    data.officialElapsedMs = input.officialElapsedMs;
  }
  if (input.deviceSequence !== undefined) {
    data.deviceSequence = input.deviceSequence;
  }
  return data;
}

/** Maps one raw capture-lock row; exported for the unit spec. */
export function toCaptureLockRow(row: RawCaptureLockRow): TimingCaptureLockRow {
  return {
    eventId: row.event_id,
    workstationInstanceId: row.workstation_instance_id,
    lockToken: row.lock_token,
    heldByUserId: row.held_by_user_id,
    acquiredAt: row.acquired_at,
    lastSeenAt: row.last_seen_at,
  };
}

function toAttemptRow(row: AttemptQueryRow): TimingAttemptRow {
  return {
    id: row.id,
    eventId: row.eventId,
    startId: row.startId,
    formatId: row.formatId,
    gender: row.gender,
    attemptNumber: row.attemptNumber,
    status: row.status,
    officialStartedAt: row.officialStartedAt,
    clientStartedAt: row.clientStartedAt,
    startedByUserId: row.startedByUserId,
    closedAt: row.closedAt,
    closedByUserId: row.closedByUserId,
    closureReport: toClosureReport(row.closureReport),
    participantCount: row._count.participants,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMarkRow(row: MarkQueryRow): TimingMarkRow {
  return {
    id: row.id,
    attemptId: row.sessionId,
    clockEpochId: row.clockEpochId,
    enrollmentId: row.enrollmentId,
    registrationId: row.registrationId,
    startNumber: row.startNumber,
    kind: row.kind,
    rawCapturedAt: row.rawCapturedAt,
    rawElapsedMs: row.rawElapsedMs,
    officialAt: row.officialAt,
    officialElapsedMs: row.officialElapsedMs,
    lapNumber: row.lapNumber,
    status: row.status,
    workstationInstanceId: row.workstationInstanceId,
    deviceSequence: row.deviceSequence,
    idempotencyKey: row.idempotencyKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toClockEpochRow(row: ClockEpochQueryRow): TimingClockEpochRow {
  return {
    id: row.id,
    attemptId: row.sessionId,
    workstationInstanceId: row.workstationInstanceId,
    officialElapsedAnchorMs: row.officialElapsedAnchorMs,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    openedByUserId: row.openedByUserId,
  };
}

function toReceiptRow(row: ReceiptQueryRow): TimingReceiptRow {
  return {
    attemptId: row.sessionId,
    workstationInstanceId: row.workstationInstanceId,
    deviceSequence: row.deviceSequence,
    status: row.status,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

function toAuditRow(row: AuditQueryRow): TimingAuditRow {
  return {
    auditId: row.id,
    actorUserId: row.actorUserId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    oldValues: toJsonRecord(row.oldValues),
    newValues: toJsonRecord(row.newValues),
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

function toResultRow(row: ResultQueryRow): TimingResultRow {
  return {
    id: row.id,
    enrollmentId: row.enrollmentId,
    registrationId: row.registrationId,
    outcome: row.outcome,
    timeMilliseconds: row.timeMilliseconds,
    place: row.place,
    recordedAt: row.recordedAt,
    updatedAt: row.updatedAt,
    timingSessionId: row.timingSessionId,
  };
}

function toPublishedResultRow(
  row: ResultWithSplitsQueryRow,
): TimingPublishedResultRow {
  return {
    ...toResultRow(row),
    laps: row.splits.map((split) => ({
      lapNumber: split.lapNumber,
      lapTimeMs: split.lapTimeMs,
      cumulativeMs: split.cumulativeMs,
    })),
  };
}

function toParticipantRosterRow(
  row: ParticipantRosterQueryRow,
): TimingParticipantRosterRow {
  return {
    enrollmentId: row.enrollmentId,
    registrationId: row.registrationId,
    startNumber: row.startNumber,
    sectionId: row.sectionId,
    requiredLaps: row.requiredLaps,
    initialOutcome: row.initialOutcome,
    excludedReason: row.excludedReason,
    firstName: row.enrollment.registration.firstName,
    lastName: row.enrollment.registration.lastName,
  };
}

/** The key a bound-pass count is stored under: one enrollment of one attempt. */
function passCountKey(attemptId: string, enrollmentId: string): string {
  return `${attemptId}:${enrollmentId}`;
}

function toEnrollmentRow(row: EnrollmentQueryRow): TimingEnrollmentRow {
  return {
    enrollmentId: row.id,
    eventId: row.eventId,
    startId: row.startId,
    formatId: row.formatId,
    enrollmentStatus: row.status,
    registrationId: row.registration.id,
    userId: row.registration.userId,
    firstName: row.registration.firstName,
    lastName: row.registration.lastName,
    gender: row.registration.gender,
    birthYear: row.registration.birthYear,
    startNumber: row.registration.startNumber,
    registrationStatus: row.registration.status,
    note: row.registration.note,
    registeredAt: row.registration.registeredAt,
    result:
      row.result === null
        ? null
        : {
            id: row.result.id,
            outcome: row.result.outcome,
            timeMilliseconds: row.result.timeMilliseconds,
            timingSessionId: row.result.timingSessionId,
          },
  };
}

@Injectable()
export class TimingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The only place a Prisma transaction is opened; the service calls this. */
  withTransaction<T>(run: (tx: TimingTx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(run);
  }

  /**
   * Serialises the attempt-number allocation of one protocol category for the
   * rest of the transaction, so two starts after a cancellation cannot both
   * take the same number.
   */
  async lockCategory(tx: TimingTx, key: string): Promise<void> {
    // `pg_advisory_xact_lock` returns `void`; `$executeRaw` runs the call
    // without trying to deserialize a result column (Prisma cannot read `void`).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }

  async findEvent(
    eventId: string,
    tx?: TimingTx,
  ): Promise<TimingEventRow | null> {
    return this.db(tx).event.findUnique({
      where: { id: eventId },
      select: { id: true, status: true, eventDate: true },
    });
  }

  /** The user row behind a session subject, so a start can name its actor. */
  async findUserIdByAuthentikId(
    authentikId: string,
    tx?: TimingTx,
  ): Promise<string | null> {
    const row = await this.db(tx).user.findUnique({
      where: { authentikId },
      select: { id: true },
    });
    return row === null ? null : row.id;
  }

  /**
   * The participation-format catalog. The surface orders one start's blocks by
   * the catalog order of their formats, so it reads the whole small table once.
   */
  async listFormats(tx?: TimingTx): Promise<TimingFormatRow[]> {
    return this.db(tx).participationFormat.findMany({
      select: { id: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * The start-aware category finish: the existing rule that refuses a result
   * write names this event, start, format and gender.
   */
  async isCategoryFinished(
    eventId: string,
    startId: string,
    formatId: number,
    gender: GenderType,
    tx?: TimingTx,
  ): Promise<boolean> {
    const row = await this.db(tx).categoryFinish.findFirst({
      where: { eventId, startId, formatId, gender },
      select: { id: true },
    });
    return row !== null;
  }

  async listStarts(eventId: string, tx?: TimingTx): Promise<TimingStartRow[]> {
    const rows = await this.db(tx).start.findMany({
      where: { eventId },
      select: {
        id: true,
        purposeType: true,
        lapCount: true,
        lapLengthMeters: true,
        displayName: true,
        sortOrder: true,
        formats: { select: { formatId: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      purposeType: row.purposeType,
      lapCount: row.lapCount,
      lapLengthMeters: row.lapLengthMeters,
      displayName: row.displayName,
      sortOrder: row.sortOrder,
      formatIds: row.formats
        .map((format) => format.formatId)
        .sort((left, right) => left - right),
    }));
  }

  /**
   * Every active enrollment of the event with its registration, start/format
   * references and its current result. Section and race exclusion stay in the
   * service: this only returns the raw rows those rules read.
   */
  async listEnrollmentRows(
    eventId: string,
    tx?: TimingTx,
  ): Promise<TimingEnrollmentRow[]> {
    const rows = await this.db(tx).enrollment.findMany({
      // `REGISTERED` is the active enrollment status; `WITHDRAWN` stays out.
      where: { eventId, status: 'REGISTERED' },
      select: ENROLLMENT_SELECT,
      orderBy: [
        { startId: 'asc' },
        { registration: { startNumber: { sort: 'asc', nulls: 'last' } } },
        { id: 'asc' },
      ],
    });
    return rows.map(toEnrollmentRow);
  }

  async listAgeCategories(
    eventId: string,
    tx?: TimingTx,
  ): Promise<TimingAgeCategoryRow[]> {
    return this.db(tx).ageSplitCategory.findMany({
      where: { eventId },
      select: {
        startId: true,
        formatId: true,
        gender: true,
        categoryNumber: true,
        groupId: true,
      },
      orderBy: [
        { startId: 'asc' },
        { formatId: 'asc' },
        { gender: 'asc' },
        { categoryNumber: 'asc' },
        { groupId: 'asc' },
      ],
    });
  }

  async listLegacyAgeSections(
    eventId: string,
    tx?: TimingTx,
  ): Promise<TimingAgeSectionRow[]> {
    return this.db(tx).ageSplitSection.findMany({
      where: { eventId },
      select: {
        startId: true,
        formatId: true,
        gender: true,
        sectionId: true,
        sectionKind: true,
        sortOrder: true,
      },
      orderBy: [
        { startId: 'asc' },
        { formatId: 'asc' },
        { gender: 'asc' },
        { sortOrder: 'asc' },
      ],
    });
  }

  async listClassCompetitions(
    eventId: string,
    tx?: TimingTx,
  ): Promise<TimingClassCompetitionRow[]> {
    return this.db(tx).classCompetition.findMany({
      where: { eventId },
      select: {
        id: true,
        startId: true,
        formatId: true,
        gender: true,
        sectionId: true,
        sectionKind: true,
        targetKey: true,
        targetGroupIds: true,
        targetWholeCategory: true,
        frozenTitle: true,
        frozenSubtitle: true,
        frozenYoungestBound: true,
        frozenMemberBounds: true,
        frozenSectionNumber: true,
        capturedEnrollmentIds: true,
        capturedRegistrationIds: true,
      },
      orderBy: [{ startId: 'asc' }, { formatId: 'asc' }, { gender: 'asc' }],
    });
  }

  /** Every attempt of one category, newest attempt first. */
  async findAttemptsForCategory(
    eventId: string,
    startId: string,
    formatId: number,
    gender: GenderType,
    tx?: TimingTx,
  ): Promise<TimingAttemptRow[]> {
    const rows = await this.db(tx).timingSession.findMany({
      where: { eventId, startId, formatId, gender },
      select: ATTEMPT_SELECT,
      orderBy: [{ attemptNumber: 'desc' }],
    });
    return rows.map(toAttemptRow);
  }

  async findAttempt(
    attemptId: string,
    tx?: TimingTx,
  ): Promise<TimingAttemptRow | null> {
    const row = await this.db(tx).timingSession.findUnique({
      where: { id: attemptId },
      select: ATTEMPT_SELECT,
    });
    return row === null ? null : toAttemptRow(row);
  }

  /** The highest attempt number of the category, `0` when it has none. */
  async findLatestAttemptNumber(
    tx: TimingTx,
    eventId: string,
    startId: string,
    formatId: number,
    gender: GenderType,
  ): Promise<number> {
    const row = await tx.timingSession.findFirst({
      where: { eventId, startId, formatId, gender },
      orderBy: { attemptNumber: 'desc' },
      select: { attemptNumber: true },
    });
    return row === null ? 0 : row.attemptNumber;
  }

  /** Creates the running attempt and its frozen roster in one statement set. */
  async createAttempt(
    tx: TimingTx,
    input: CreateAttemptInput,
  ): Promise<TimingAttemptRow> {
    const row = await tx.timingSession.create({
      data: {
        eventId: input.eventId,
        startId: input.startId,
        formatId: input.formatId,
        gender: input.gender,
        attemptNumber: input.attemptNumber,
        status: 'RUNNING',
        officialStartedAt: input.officialStartedAt,
        clientStartedAt: input.clientStartedAt,
        startedByUserId: input.startedByUserId,
        participants: {
          create: input.participants.map((participant) => ({
            enrollmentId: participant.enrollmentId,
            registrationId: participant.registrationId,
            startNumber: participant.startNumber,
            sectionId: participant.sectionId,
            requiredLaps: participant.requiredLaps,
            initialOutcome: participant.initialOutcome,
            excludedReason: participant.excludedReason ?? null,
          })),
        },
      },
      select: ATTEMPT_SELECT,
    });
    return toAttemptRow(row);
  }

  /** Closes an attempt with its state, closer, moment and closure report. */
  async updateAttemptStatus(
    tx: TimingTx,
    attemptId: string,
    input: UpdateAttemptStatusInput,
  ): Promise<TimingAttemptRow> {
    const data: Prisma.TimingSessionUncheckedUpdateInput = {
      status: input.status,
      closedAt: input.closedAt,
      closedByUserId: input.closedByUserId,
      closureReport:
        input.closureReport === null ? Prisma.DbNull : input.closureReport,
    };
    const row = await tx.timingSession.update({
      where: { id: attemptId },
      data,
      select: ATTEMPT_SELECT,
    });
    return toAttemptRow(row);
  }

  /**
   * Moves the attempt's official start. The raw client press stays untouched:
   * only the official side of the timeline is correctable.
   */
  async updateAttemptOfficialStart(
    tx: TimingTx,
    attemptId: string,
    officialStartedAt: Date,
  ): Promise<TimingAttemptRow> {
    const row = await tx.timingSession.update({
      where: { id: attemptId },
      data: { officialStartedAt },
      select: ATTEMPT_SELECT,
    });
    return toAttemptRow(row);
  }

  async listParticipants(
    attemptId: string,
    tx?: TimingTx,
  ): Promise<TimingParticipantRow[]> {
    return this.db(tx).timingSessionParticipant.findMany({
      where: { sessionId: attemptId },
      select: PARTICIPANT_SELECT,
      orderBy: [
        { sectionId: { sort: 'asc', nulls: 'last' } },
        { startNumber: { sort: 'asc', nulls: 'last' } },
        { enrollmentId: 'asc' },
      ],
    });
  }

  async findParticipant(
    attemptId: string,
    enrollmentId: string,
    tx?: TimingTx,
  ): Promise<TimingParticipantRow | null> {
    return this.db(tx).timingSessionParticipant.findUnique({
      where: {
        sessionId_enrollmentId: {
          sessionId: attemptId,
          enrollmentId,
        },
      },
      select: PARTICIPANT_SELECT,
    });
  }

  /**
   * The frozen participant of one attempt that carries a start number. A bind
   * by number resolves inside the addressed attempt only, so a number frozen in
   * another attempt is not a target of this one.
   */
  async findParticipantByStartNumber(
    attemptId: string,
    startNumber: number,
    tx?: TimingTx,
  ): Promise<TimingParticipantRow | null> {
    return this.db(tx).timingSessionParticipant.findFirst({
      where: { sessionId: attemptId, startNumber },
      select: PARTICIPANT_SELECT,
      orderBy: { enrollmentId: 'asc' },
    });
  }

  /** The frozen roster in tile order, with the name the tile shows. */
  async listParticipantRoster(
    attemptId: string,
    tx?: TimingTx,
  ): Promise<TimingParticipantRosterRow[]> {
    const rows = await this.db(tx).timingSessionParticipant.findMany({
      where: { sessionId: attemptId },
      select: PARTICIPANT_ROSTER_SELECT,
      orderBy: [
        { sectionId: { sort: 'asc', nulls: 'last' } },
        { startNumber: { sort: 'asc', nulls: 'last' } },
        { enrollmentId: 'asc' },
      ],
    });
    return rows.map(toParticipantRosterRow);
  }

  /** Every mark of the attempt in official-instant order, tie-broken by id. */
  async listMarks(attemptId: string, tx?: TimingTx): Promise<TimingMarkRow[]> {
    const rows = await this.db(tx).timingMark.findMany({
      where: { sessionId: attemptId },
      select: MARK_SELECT,
      orderBy: [{ officialAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toMarkRow);
  }

  /**
   * One participant's marks in official-instant order, tie-broken by id. A
   * correction rewrites lap numbers per participant, so it reads exactly the
   * rows it may renumber.
   */
  async listParticipantMarks(
    attemptId: string,
    enrollmentId: string,
    tx?: TimingTx,
  ): Promise<TimingMarkRow[]> {
    const rows = await this.db(tx).timingMark.findMany({
      where: { sessionId: attemptId, enrollmentId },
      select: MARK_SELECT,
      orderBy: [{ officialAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toMarkRow);
  }

  /**
   * The routing candidates of one committed number: every frozen participant of
   * every `RUNNING` attempt of the event, with the bound passes each enrollment
   * already holds. A closed attempt is not routable and stays out, so the
   * caller can neither capture into it nor write into its clock epoch.
   *
   * The number and enrollment filters are Prisma parameters, never interpolated
   * SQL: the caller passes the value the referee typed.
   */
  async findRoutingCandidates(
    eventId: string,
    filter: { startNumber?: number; enrollmentId?: string },
    tx?: TimingTx,
  ): Promise<TimingRoutingCandidateRow[]> {
    const rows = await this.db(tx).timingSessionParticipant.findMany({
      where: {
        session: { eventId, status: 'RUNNING' },
        ...(filter.startNumber === undefined
          ? {}
          : { startNumber: filter.startNumber }),
        ...(filter.enrollmentId === undefined
          ? {}
          : { enrollmentId: filter.enrollmentId }),
      },
      select: {
        sessionId: true,
        enrollmentId: true,
        registrationId: true,
        startNumber: true,
        sectionId: true,
        excludedReason: true,
        requiredLaps: true,
        session: { select: { status: true } },
      },
      orderBy: [
        { sessionId: 'asc' },
        { startNumber: { sort: 'asc', nulls: 'last' } },
        { enrollmentId: 'asc' },
      ],
    });
    if (rows.length === 0) {
      return [];
    }
    const passCounts = await this.countBoundPassesByEnrollment(
      rows.map((row) => row.sessionId),
      rows.map((row) => row.enrollmentId),
      tx,
    );
    return rows.map((row) => ({
      attemptId: row.sessionId,
      attemptStatus: row.session.status,
      enrollmentId: row.enrollmentId,
      registrationId: row.registrationId,
      startNumber: row.startNumber,
      sectionId: row.sectionId,
      excludedReason: row.excludedReason,
      requiredLaps: row.requiredLaps,
      passCount:
        passCounts.get(passCountKey(row.sessionId, row.enrollmentId)) ?? 0,
    }));
  }

  /**
   * The current enrollment status of the given enrollments, keyed by id. A
   * closure publishes only an enrollment that is still `REGISTERED`, so a row
   * the event no longer knows reads as absent instead of publishable.
   */
  async listEnrollmentStatuses(
    enrollmentIds: readonly string[],
    tx?: TimingTx,
  ): Promise<Map<string, EnrollmentStatus>> {
    if (enrollmentIds.length === 0) {
      return new Map();
    }
    const rows = await this.db(tx).enrollment.findMany({
      where: { id: { in: [...new Set(enrollmentIds)] } },
      select: { id: true, status: true },
    });
    return new Map(rows.map((row) => [row.id, row.status]));
  }

  /**
   * Whether an active enrollment of the event carries this start number. The
   * routing query reads only running attempts, so this tells an unknown number
   * apart from one whose categories have not started or are already closed.
   */
  async existsStartNumber(
    eventId: string,
    startNumber: number,
    tx?: TimingTx,
  ): Promise<boolean> {
    const row = await this.db(tx).enrollment.findFirst({
      where: {
        eventId,
        status: 'REGISTERED',
        registration: { startNumber },
      },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Bound passes per `(attempt, enrollment)` for the given candidates. One
   * grouped read instead of one count per candidate row.
   */
  private async countBoundPassesByEnrollment(
    attemptIds: string[],
    enrollmentIds: string[],
    tx?: TimingTx,
  ): Promise<Map<string, number>> {
    const rows = await this.db(tx).timingMark.groupBy({
      by: ['sessionId', 'enrollmentId'],
      where: {
        sessionId: { in: [...new Set(attemptIds)] },
        enrollmentId: { in: [...new Set(enrollmentIds)] },
        status: 'BOUND',
      },
      _count: { _all: true },
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.enrollmentId === null) continue;
      counts.set(
        passCountKey(row.sessionId, row.enrollmentId),
        row._count._all,
      );
    }
    return counts;
  }

  async findMark(markId: string, tx?: TimingTx): Promise<TimingMarkRow | null> {
    const row = await this.db(tx).timingMark.findUnique({
      where: { id: markId },
      select: MARK_SELECT,
    });
    return row === null ? null : toMarkRow(row);
  }

  /** The unbound finishes of the attempt, oldest instant first. */
  async listPendingFinishes(
    attemptId: string,
    tx?: TimingTx,
  ): Promise<TimingMarkRow[]> {
    const rows = await this.db(tx).timingMark.findMany({
      where: {
        sessionId: attemptId,
        kind: 'PENDING_FINISH',
        status: 'PENDING',
      },
      select: MARK_SELECT,
      orderBy: [{ officialAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toMarkRow);
  }

  async createMark(
    tx: TimingTx,
    input: CreateMarkInput,
  ): Promise<TimingMarkRow> {
    const row = await tx.timingMark.create({
      data: {
        sessionId: input.attemptId,
        clockEpochId: input.clockEpochId,
        enrollmentId: input.enrollmentId,
        registrationId: input.registrationId,
        startNumber: input.startNumber,
        kind: input.kind,
        rawCapturedAt: input.rawCapturedAt,
        rawElapsedMs: input.rawElapsedMs,
        officialAt: input.officialAt,
        officialElapsedMs: input.officialElapsedMs,
        lapNumber: input.lapNumber,
        status: input.status,
        workstationInstanceId: input.workstationInstanceId,
        deviceSequence: input.deviceSequence,
        idempotencyKey: input.idempotencyKey,
      },
      select: MARK_SELECT,
    });
    return toMarkRow(row);
  }

  /**
   * Changes only the official side of a mark (or binds it); the raw capture
   * columns are never in the payload.
   */
  async updateMark(
    tx: TimingTx,
    markId: string,
    input: UpdateMarkInput,
  ): Promise<TimingMarkRow> {
    const row = await tx.timingMark.update({
      where: { id: markId },
      data: buildMarkUpdate(input),
      select: MARK_SELECT,
    });
    return toMarkRow(row);
  }

  async createClockEpoch(
    tx: TimingTx,
    input: CreateClockEpochInput,
  ): Promise<TimingClockEpochRow> {
    const row = await tx.timingClockEpoch.create({
      data: {
        sessionId: input.attemptId,
        workstationInstanceId: input.workstationInstanceId,
        officialElapsedAnchorMs: input.officialElapsedAnchorMs,
        openedByUserId: input.openedByUserId,
        ...(input.openedAt === undefined ? {} : { openedAt: input.openedAt }),
      },
      select: CLOCK_EPOCH_SELECT,
    });
    return toClockEpochRow(row);
  }

  /**
   * Closes every open epoch of the attempt, or only those of one workstation
   * when the argument is given. Returns how many closed.
   */
  async closeOpenEpochs(
    tx: TimingTx,
    attemptId: string,
    workstationInstanceId?: string,
  ): Promise<number> {
    const result = await tx.timingClockEpoch.updateMany({
      where: {
        sessionId: attemptId,
        closedAt: null,
        ...(workstationInstanceId === undefined
          ? {}
          : { workstationInstanceId }),
      },
      data: { closedAt: new Date() },
    });
    return result.count;
  }

  async findOpenEpoch(
    attemptId: string,
    workstationInstanceId: string,
    tx?: TimingTx,
  ): Promise<TimingClockEpochRow | null> {
    const row = await this.db(tx).timingClockEpoch.findFirst({
      where: {
        sessionId: attemptId,
        workstationInstanceId,
        closedAt: null,
      },
      select: CLOCK_EPOCH_SELECT,
      orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
    });
    return row === null ? null : toClockEpochRow(row);
  }

  /**
   * The ids of every running attempt of the event, oldest start first. A
   * capture-lock change is event-wide, so the audit it writes and the transfer
   * receipt sweep both read the attempts the hold currently covers.
   */
  async listRunningAttemptIds(
    eventId: string,
    tx?: TimingTx,
  ): Promise<string[]> {
    const rows = await this.db(tx).timingSession.findMany({
      where: { eventId, status: 'RUNNING' },
      select: { id: true },
      orderBy: [{ officialStartedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => row.id);
  }

  /**
   * The role codes one user currently holds. The stale-holder rule of the
   * capture lock reads them to decide whether a hold still belongs to an
   * entitled user.
   */
  async findUserRoleCodes(userId: string, tx?: TimingTx): Promise<string[]> {
    const rows = await this.db(tx).userRole.findMany({
      where: { userId },
      select: { role: { select: { code: true } } },
    });
    return rows.map((row) => row.role.code);
  }

  async getCaptureLock(
    eventId: string,
    tx?: TimingTx,
  ): Promise<TimingCaptureLockRow | null> {
    return this.db(tx).timingCaptureLock.findUnique({
      where: { eventId },
      select: {
        eventId: true,
        workstationInstanceId: true,
        lockToken: true,
        heldByUserId: true,
        acquiredAt: true,
        lastSeenAt: true,
      },
    });
  }

  /**
   * Claims the one event-wide lock. A second claim conflicts on the primary
   * key and returns `null`, so exactly one of two simultaneous claims wins.
   */
  async claimCaptureLock(
    tx: TimingTx,
    input: ClaimCaptureLockInput,
  ): Promise<TimingCaptureLockRow | null> {
    const now = input.now ?? new Date();
    const rows = await tx.$queryRaw<RawCaptureLockRow[]>(Prisma.sql`
      INSERT INTO timing_capture_locks (
        event_id,
        workstation_instance_id,
        lock_token,
        held_by_user_id,
        acquired_at,
        last_seen_at
      )
      VALUES (
        ${input.eventId}::uuid,
        ${input.workstationInstanceId},
        ${randomUUID()},
        ${input.heldByUserId}::uuid,
        ${now},
        ${now}
      )
      ON CONFLICT (event_id) DO NOTHING
      RETURNING ${CAPTURE_LOCK_COLUMNS}
    `);
    return rows.length === 0 ? null : toCaptureLockRow(rows[0]);
  }

  /**
   * Moves the lock to another workstation only if the caller still holds the
   * token it read; a stale token updates nothing and returns `null`.
   */
  async transferCaptureLock(
    tx: TimingTx,
    input: TransferCaptureLockInput,
  ): Promise<TimingCaptureLockRow | null> {
    const now = input.now ?? new Date();
    const rows = await tx.$queryRaw<RawCaptureLockRow[]>(Prisma.sql`
      UPDATE timing_capture_locks SET
        workstation_instance_id = ${input.workstationInstanceId},
        lock_token = ${randomUUID()},
        held_by_user_id = ${input.heldByUserId}::uuid,
        acquired_at = ${now},
        last_seen_at = ${now}
      WHERE event_id = ${input.eventId}::uuid
        AND lock_token = ${input.expectedLockToken}
      RETURNING ${CAPTURE_LOCK_COLUMNS}
    `);
    return rows.length === 0 ? null : toCaptureLockRow(rows[0]);
  }

  /** Releases the lock only for the holder of that token. */
  async releaseCaptureLock(
    tx: TimingTx,
    input: ReleaseCaptureLockInput,
  ): Promise<TimingCaptureLockRow | null> {
    const rows = await tx.$queryRaw<RawCaptureLockRow[]>(Prisma.sql`
      DELETE FROM timing_capture_locks
      WHERE event_id = ${input.eventId}::uuid
        AND lock_token = ${input.lockToken}
      RETURNING ${CAPTURE_LOCK_COLUMNS}
    `);
    return rows.length === 0 ? null : toCaptureLockRow(rows[0]);
  }

  /**
   * Releases every event-wide hold one user has, in one statement. Ending a
   * hold because the user lost a timing role must never depend on a read-then-
   * write: the DELETE and its `held_by_user_id` predicate are atomic, and the
   * returned rows say which events changed hands.
   */
  async releaseCaptureLocksForUser(
    tx: TimingTx,
    userId: string,
  ): Promise<TimingCaptureLockRow[]> {
    const rows = await tx.$queryRaw<RawCaptureLockRow[]>(Prisma.sql`
      DELETE FROM timing_capture_locks
      WHERE held_by_user_id = ${userId}::uuid
      RETURNING ${CAPTURE_LOCK_COLUMNS}
    `);
    return rows.map(toCaptureLockRow);
  }

  async createReceipt(
    tx: TimingTx,
    input: CreateReceiptInput,
  ): Promise<TimingReceiptRow> {
    const row = await tx.timingCaptureReceipt.create({
      data: {
        sessionId: input.attemptId,
        workstationInstanceId: input.workstationInstanceId,
        deviceSequence: input.deviceSequence,
        status: input.status,
        reason: input.reason,
      },
      select: RECEIPT_SELECT,
    });
    return toReceiptRow(row);
  }

  async findReceipt(
    tx: TimingTx,
    attemptId: string,
    workstationInstanceId: string,
    deviceSequence: number,
  ): Promise<TimingReceiptRow | null> {
    const row = await tx.timingCaptureReceipt.findUnique({
      where: {
        sessionId_workstationInstanceId_deviceSequence: {
          sessionId: attemptId,
          workstationInstanceId,
          deviceSequence,
        },
      },
      select: RECEIPT_SELECT,
    });
    return row === null ? null : toReceiptRow(row);
  }

  /** Every receipt sequence of one workstation, so a gap is detectable. */
  async listReceiptSequences(
    attemptId: string,
    workstationInstanceId: string,
    tx?: TimingTx,
  ): Promise<
    Array<{
      deviceSequence: number;
      status: TimingReceiptStatus;
      reason: string | null;
    }>
  > {
    const rows = await this.db(tx).timingCaptureReceipt.findMany({
      where: { sessionId: attemptId, workstationInstanceId },
      select: { deviceSequence: true, status: true, reason: true },
      orderBy: { deviceSequence: 'asc' },
    });
    return rows.map((row) => ({
      deviceSequence: row.deviceSequence,
      status: row.status,
      reason: row.reason,
    }));
  }

  /**
   * Every receipt of the attempt, ordered by workstation and sequence. An
   * administrative closure checks all capturing workstations, so it reads them
   * in one query instead of one per workstation.
   */
  async listAttemptReceipts(
    attemptId: string,
    tx?: TimingTx,
  ): Promise<TimingReceiptRow[]> {
    const rows = await this.db(tx).timingCaptureReceipt.findMany({
      where: { sessionId: attemptId },
      select: RECEIPT_SELECT,
      orderBy: [{ workstationInstanceId: 'asc' }, { deviceSequence: 'asc' }],
    });
    return rows.map(toReceiptRow);
  }

  async insertAudit(
    tx: TimingTx,
    input: InsertAuditInput,
  ): Promise<TimingAuditRow> {
    const row = await tx.timingAudit.create({
      data: {
        sessionId: input.attemptId,
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        oldValues: input.oldValues === null ? Prisma.DbNull : input.oldValues,
        newValues: input.newValues === null ? Prisma.DbNull : input.newValues,
        reason: input.reason,
      },
      select: AUDIT_SELECT,
    });
    return toAuditRow(row);
  }

  /** The attempt history, oldest first. */
  async listAudit(attemptId: string, tx?: TimingTx): Promise<TimingAuditRow[]> {
    const rows = await this.db(tx).timingAudit.findMany({
      where: { sessionId: attemptId },
      select: AUDIT_SELECT,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toAuditRow);
  }

  async findResultByEnrollment(
    enrollmentId: string,
    tx?: TimingTx,
  ): Promise<TimingResultRow | null> {
    const row = await this.db(tx).result.findUnique({
      where: { enrollmentId },
      select: RESULT_SELECT,
    });
    return row === null ? null : toResultRow(row);
  }

  /**
   * The authoritative results this attempt published, each with the exact split
   * set it wrote. A row without an enrollment or an outcome is not a
   * publication and stays out of the record.
   */
  async listPublishedResults(
    attemptId: string,
    tx?: TimingTx,
  ): Promise<TimingPublishedResultRow[]> {
    const rows = await this.db(tx).result.findMany({
      where: {
        timingSessionId: attemptId,
        enrollmentId: { not: null },
        outcome: { not: null },
      },
      select: RESULT_WITH_SPLITS_SELECT,
      orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toPublishedResultRow);
  }

  /**
   * Writes the enrollment's authoritative result with the existing result-row
   * rules: an enrollment result is updated in place, a legacy registration-only
   * row of the same registration is adopted, otherwise a row is inserted. The
   * stored place is always cleared and the attempt is recorded as provenance.
   */
  async publishResult(
    tx: TimingTx,
    input: PublishResultInput,
  ): Promise<TimingResultRow> {
    const existing = await tx.result.findUnique({
      where: { enrollmentId: input.enrollmentId },
      select: { id: true },
    });
    if (existing !== null) {
      await tx.result.update({
        where: { id: existing.id },
        data: {
          outcome: input.outcome,
          timeMilliseconds: input.timeMilliseconds,
          place: null,
          timingSessionId: input.timingSessionId,
        },
      });
    } else {
      const legacy = await tx.result.findFirst({
        where: {
          registrationId: input.registrationId,
          enrollmentId: null,
        },
        select: { id: true },
      });
      if (legacy !== null) {
        await tx.result.update({
          where: { id: legacy.id },
          data: {
            enrollmentId: input.enrollmentId,
            outcome: input.outcome,
            timeMilliseconds: input.timeMilliseconds,
            place: null,
            timingSessionId: input.timingSessionId,
          },
        });
      } else {
        await tx.result.create({
          data: {
            registrationId: input.registrationId,
            enrollmentId: input.enrollmentId,
            outcome: input.outcome,
            timeMilliseconds: input.timeMilliseconds,
            timingSessionId: input.timingSessionId,
          },
        });
      }
    }
    const saved = await tx.result.findUnique({
      where: { enrollmentId: input.enrollmentId },
      select: RESULT_SELECT,
    });
    if (saved === null) {
      throw new Error('Timing result publication did not persist.');
    }
    return toResultRow(saved);
  }

  /** Replaces the exact split set of one result; an empty set clears it. */
  async replaceResultSplits(
    tx: TimingTx,
    resultId: string,
    splits: readonly TimingLapSplit[],
  ): Promise<void> {
    await tx.resultSplit.deleteMany({ where: { resultId } });
    if (splits.length === 0) return;
    await tx.resultSplit.createMany({
      data: splits.map((split) => ({
        resultId,
        lapNumber: split.lapNumber,
        lapTimeMs: split.lapTimeMs,
        cumulativeMs: split.cumulativeMs,
      })),
    });
  }

  private db(tx?: TimingTx): TimingDb {
    return tx ?? this.prisma;
  }
}
