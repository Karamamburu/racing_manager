import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { GenderType, TimingAttemptKind } from '../../generated/prisma';
import { TIMING_OPERATE_ROLE_CODES } from '../auth/role-codes';
import { RolesService } from '../auth/roles.service';
import {
  assertCanAddPass,
  assignLapNumbers,
  normalizeReason,
} from './timing.domain';
import type {
  AssignAnonymousSplitDto,
  CancelAnonymousSplitDto,
} from './timing.dto';
import {
  TimingDomainError,
  TimingErrorCode,
  timingError,
} from './timing.errors';
import {
  TimingRepository,
  type TimingAnonymousSplitRow,
  type TimingAttemptRow,
  type TimingEventSplitRow,
  type TimingClassCompetitionRow,
  type TimingMarkRow,
  type TimingParticipantRow,
  type TimingStartRow,
  type TimingTx,
} from './timing.repository';
import type { TimingAnonymousSplitView, TimingPassView } from './timing.views';

/**
 * The anonymous split queue of one event: capture is a `PENDING`
 * `ANONYMOUS_SPLIT` timing mark of an attempt (AD-17), assignment turns it into
 * that participant's bound pass, and cancellation retires it as a
 * non-authoritative record.
 *
 * The queue is a read model over the event's marks, not a second table: an
 * assigned or cancelled split can never appear in it again. Capture itself
 * belongs to `TimingService`, because it shares the capture lock, epoch,
 * sequence and receipt rules of every other capture kind; this service owns
 * only the queue, the assignment and the cancellation.
 *
 * Assignment is a capture-side mutation of one attempt: it needs the
 * event-wide capture hold, one unused `deviceSequence` and a final receipt.
 * Cancellation is a record correction (AS-8): it needs a reason and a timing
 * role, and no capture hold, epoch or sequence.
 */

/** The attempt facts both a queue row and an attempt row carry. */
export type AttemptIdentity = {
  attemptKind: TimingAttemptKind;
  startId: string;
  formatId: number;
  gender: GenderType;
  classCompetitionId: string | null;
  stageId: string | null;
  heatNumber: number | null;
};

/** The display facts the queue label needs, read once per request. */
type AttemptLabels = {
  starts: ReadonlyMap<string, TimingStartRow>;
  races: ReadonlyMap<string, TimingClassCompetitionRow>;
};

/** One queued split with the attempt it was captured in. */
type SplitContext = {
  mark: TimingMarkRow;
  attempt: TimingAttemptRow;
};

/** The receipt an assignment's issued sequence owes after a refusal. */
type RejectedAssignmentInput = {
  attemptId: string;
  workstationInstanceId: string;
  deviceSequence: number;
  reason: string;
};

@Injectable()
export class AnonymousSplitService {
  constructor(
    private readonly repository: TimingRepository,
    private readonly rolesService: RolesService,
  ) {}

  /**
   * E-03: the fixed queue of the event, oldest capture first. Read-only: it
   * opens no transaction, asserts no capture hold and returns only pending
   * anonymous splits, so an assigned or cancelled entry is already gone.
   */
  async listQueue(
    eventId: string,
    tx?: TimingTx,
  ): Promise<TimingAnonymousSplitView[]> {
    const [rows, labels] = await Promise.all([
      this.repository.listQueuedEventSplits(eventId, tx),
      this.loadLabels(eventId, tx),
    ]);
    if (rows.length > 0) {
      return rows.map((row) => toEventQueueEntry(row, labels));
    }
    // Transitional read for a database that has not run the MANUAL-TIMING-3
    // backfill yet. The migration copies every pending mark into the new
    // table, so this branch disappears with the old queue.
    const legacy = await this.repository.listAnonymousSplits(eventId, tx);
    return legacy
      .filter((row) => row.status === 'PENDING')
      .map((row) => toQueueEntry(row, labels));
  }

  /** One queued event split as the surface renders it. */
  async getQueuedEntry(
    eventId: string,
    splitId: string,
    tx?: TimingTx,
  ): Promise<TimingAnonymousSplitView> {
    const [rows, labels] = await Promise.all([
      this.repository.listQueuedEventSplits(eventId, tx),
      this.loadLabels(eventId, tx),
    ]);
    const row = rows.find((entry) => entry.splitId === splitId);
    if (row === undefined) {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'Anonymous split not found in the queue.',
        { splitId },
      );
    }
    return toEventQueueEntry(row, labels);
  }

  /**
   * E-05, F-03: assign one queued split to a participant of its own attempt.
   *
   * The split must be pending on a running attempt of this event, and the
   * requesting workstation must hold capture. Inside one transaction the
   * assignment checks that its `deviceSequence` has no receipt yet, resolves
   * exactly one target identity inside the attempt, refuses an excluded or
   * at-N target, binds the split as `PASS`/`BOUND` with its original raw and
   * official instant, writes the `APPLIED` receipt and the audit row, and
   * renumbers the target participant's laps by official instant. A refused
   * assignment changes no mark; its issued sequence is closed with a
   * `REJECTED` receipt in a separate transaction so the closure gate of the
   * attempt is not left with a gap (AD-18, FR-54).
   *
   * A refusal raised before the transaction — a missing split, another
   * event, a closed attempt or a lost capture hold — writes no receipt: the
   * sequence is not attributable to a running attempt this workstation may
   * mutate.
   */
  async assign(
    authentikId: string | undefined,
    eventId: string,
    splitId: string,
    dto: AssignAnonymousSplitDto,
    idempotencyKey?: string,
  ): Promise<TimingPassView> {
    await this.rolesService.assertHasAnyRole(
      authentikId,
      TIMING_OPERATE_ROLE_CODES,
    );
    const split = await this.loadSplit(splitId, eventId);
    if (split.attempt.status !== 'RUNNING') {
      throw timingError(
        TimingErrorCode.ATTEMPT_CLOSED,
        'An anonymous split is assigned only while its attempt runs.',
        { attemptId: split.attempt.id, status: split.attempt.status },
      );
    }
    const lock = await this.repository.getCaptureLock(eventId);
    if (lock?.workstationInstanceId !== dto.workstationInstanceId) {
      throw timingError(
        TimingErrorCode.CAPTURE_NOT_HELD,
        'This workstation does not hold capture.',
        {
          workstationInstanceId: dto.workstationInstanceId,
          holderWorkstationInstanceId: lock?.workstationInstanceId ?? null,
        },
      );
    }
    if (split.mark.status !== 'PENDING') {
      const resolved = splitResolvedError(split.mark.status);
      await this.recordRejectedReceipt({
        attemptId: split.attempt.id,
        workstationInstanceId: dto.workstationInstanceId,
        deviceSequence: dto.deviceSequence,
        reason: resolved.code,
      });
      throw resolved;
    }

    const actorUserId = await this.requireUserId(authentikId);
    const key = normalizeIdempotencyKey(idempotencyKey);
    try {
      return await this.repository.withTransaction(async (tx) => {
        // AD-3: an assignment is a capture mutation, so its sequence has one
        // final receipt and a second request on it conflicts.
        const receipt = await this.repository.findReceipt(
          tx,
          split.attempt.id,
          dto.workstationInstanceId,
          dto.deviceSequence,
        );
        if (receipt !== null) {
          throw timingError(
            TimingErrorCode.CONFLICT,
            'This device sequence already has a receipt on the attempt.',
            {
              attemptId: split.attempt.id,
              workstationInstanceId: dto.workstationInstanceId,
              deviceSequence: dto.deviceSequence,
              receiptStatus: receipt.status,
              receiptReason: receipt.reason,
            },
          );
        }
        // Re-read under the transaction: another actor may have assigned,
        // undone or cancelled the entry since the surface read.
        const current = await this.loadSplit(splitId, eventId, tx);
        if (current.attempt.status !== 'RUNNING') {
          throw timingError(
            TimingErrorCode.ATTEMPT_CLOSED,
            'An anonymous split is assigned only while its attempt runs.',
            { attemptId: current.attempt.id, status: current.attempt.status },
          );
        }
        if (current.mark.status !== 'PENDING') {
          throw splitResolvedError(current.mark.status);
        }
        const participant = await this.resolveAssignmentTarget(
          current.attempt.id,
          eventId,
          dto,
          tx,
        );
        if (participant.excludedReason !== null) {
          throw timingError(
            TimingErrorCode.EXCLUDED_PARTICIPANT,
            'The participant is excluded from this attempt.',
            {
              attemptId: current.attempt.id,
              enrollmentId: participant.enrollmentId,
              excludedReason: participant.excludedReason,
            },
          );
        }
        const marks = await this.repository.listMarks(current.attempt.id, tx);
        assertCanAddPass(
          boundPassCount(marks, participant.enrollmentId),
          participant.requiredLaps,
        );

        const bound = await this.repository.assignAnonymousSplit(
          tx,
          current.mark.id,
          {
            enrollmentId: participant.enrollmentId,
            registrationId: participant.registrationId,
            startNumber: participant.startNumber,
            deviceSequence: dto.deviceSequence,
          },
        );
        const applied = await this.reindexLaps(
          tx,
          current.attempt.id,
          participant.enrollmentId,
          marks,
          bound,
        );
        await this.repository.createReceipt(tx, {
          attemptId: current.attempt.id,
          workstationInstanceId: dto.workstationInstanceId,
          deviceSequence: dto.deviceSequence,
          status: 'APPLIED',
          reason: null,
        });
        await this.repository.insertAudit(tx, {
          attemptId: current.attempt.id,
          actorUserId,
          action: 'ANONYMOUS_SPLIT_ASSIGN',
          targetType: 'PASS',
          targetId: current.mark.id,
          oldValues: {
            kind: current.mark.kind,
            status: current.mark.status,
            enrollmentId: current.mark.enrollmentId,
            registrationId: current.mark.registrationId,
            startNumber: current.mark.startNumber,
            lapNumber: current.mark.lapNumber,
            officialAt: current.mark.officialAt.toISOString(),
            officialElapsedMs: current.mark.officialElapsedMs,
            clockEpochId: current.mark.clockEpochId,
          },
          newValues: {
            kind: 'PASS',
            status: 'BOUND',
            enrollmentId: participant.enrollmentId,
            registrationId: participant.registrationId,
            startNumber: participant.startNumber,
            lapNumber: applied.lapNumber,
            officialAt: applied.officialAt.toISOString(),
            officialElapsedMs: applied.officialElapsedMs,
            clockEpochId: applied.clockEpochId,
            workstationInstanceId: dto.workstationInstanceId,
            deviceSequence: dto.deviceSequence,
            idempotencyKey: key,
          },
          reason: null,
        });
        return toPassView(applied);
      });
    } catch (error) {
      if (isRefusedAssignment(error)) {
        await this.recordRejectedReceipt({
          attemptId: split.attempt.id,
          workstationInstanceId: dto.workstationInstanceId,
          deviceSequence: dto.deviceSequence,
          reason: error.code,
        });
      }
      throw error;
    }
  }

  /**
   * E-08, F-07: retire an unassigned split with a reason. A `REFEREE` cancels
   * a split of an attempt they operate and an `ADMINISTRATOR` cancels any
   * entry; both hold the timing role, so the route has no second capability.
   * Cancellation is a record correction (AS-8): it keeps the mark in history
   * with actor, moment and reason, and takes no capture hold, no epoch and no
   * receipt.
   */
  async cancel(
    authentikId: string | undefined,
    eventId: string,
    splitId: string,
    dto: CancelAnonymousSplitDto,
  ): Promise<TimingAnonymousSplitView> {
    await this.rolesService.assertHasAnyRole(
      authentikId,
      TIMING_OPERATE_ROLE_CODES,
    );
    const reason = normalizeReason(dto.reason);
    const actorUserId = await this.requireUserId(authentikId);
    const cancelledAt = new Date();
    // Read the queue label before the write: a committed cancellation must not
    // depend on a later read to build the response it returns.
    const labels = await this.loadLabels(eventId);
    const { mark, attempt } = await this.repository.withTransaction(
      async (tx) => {
        const current = await this.loadSplit(splitId, eventId, tx);
        if (current.mark.status !== 'PENDING') {
          throw splitResolvedError(current.mark.status);
        }
        const cancelled = await this.repository.cancelAnonymousSplit(
          tx,
          current.mark.id,
        );
        await this.repository.insertAudit(tx, {
          attemptId: current.attempt.id,
          actorUserId,
          action: 'ANONYMOUS_SPLIT_CANCEL',
          targetType: 'ANONYMOUS_SPLIT',
          targetId: current.mark.id,
          oldValues: {
            kind: current.mark.kind,
            status: current.mark.status,
            officialAt: current.mark.officialAt.toISOString(),
            officialElapsedMs: current.mark.officialElapsedMs,
            clockEpochId: current.mark.clockEpochId,
            workstationInstanceId: current.mark.workstationInstanceId,
            deviceSequence: current.mark.deviceSequence,
          },
          newValues: {
            status: 'CANCELLED',
            cancelledAt: cancelledAt.toISOString(),
          },
          reason,
        });
        return { mark: cancelled, attempt: current.attempt };
      },
    );
    // The response is the retired queue entry the client drops immediately
    // (E-08); the durable state is `CANCELLED` on the mark and the audit row,
    // because the frozen split view describes a queue entry only.
    return toRetiredQueueEntry(mark, attempt, labels);
  }

  /** The split and the attempt it was captured in; the mark may be resolved. */
  private async loadSplit(
    splitId: string,
    eventId: string,
    tx?: TimingTx,
  ): Promise<SplitContext> {
    const mark = await this.repository.findMark(splitId, tx);
    if (mark === null) {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'Anonymous split not found.',
        { splitId },
      );
    }
    const attempt = await this.repository.findAttempt(mark.attemptId, tx);
    if (attempt === null || attempt.eventId !== eventId) {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'The anonymous split belongs to another event.',
        { splitId, attemptId: mark.attemptId },
      );
    }
    if (mark.kind !== 'ANONYMOUS_SPLIT') {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'The addressed mark is not an anonymous split.',
        { splitId, kind: mark.kind },
      );
    }
    return { mark, attempt };
  }

  /**
   * The one participant an assignment names. The DTO delivers exactly one of
   * the two identities; the target must be frozen in the split's own attempt,
   * so a number or enrollment of another attempt is refused here and never
   * moved into this one. A number the event does not know at all is told apart
   * from one that belongs to another attempt.
   */
  private async resolveAssignmentTarget(
    attemptId: string,
    eventId: string,
    dto: AssignAnonymousSplitDto,
    tx: TimingTx,
  ): Promise<TimingParticipantRow> {
    if (dto.enrollmentId !== undefined) {
      const participant = await this.repository.findParticipant(
        attemptId,
        dto.enrollmentId,
        tx,
      );
      if (participant === null) {
        throw timingError(
          TimingErrorCode.NOT_FOUND,
          'The enrollment is not a frozen participant of this attempt.',
          { attemptId, enrollmentId: dto.enrollmentId },
        );
      }
      return participant;
    }
    if (dto.startNumber === undefined) {
      throw timingError(
        TimingErrorCode.NUMBER_REQUIRED,
        'An assignment requires a start number or an enrollment.',
        { attemptId },
      );
    }
    const participant = await this.repository.findParticipantByStartNumber(
      attemptId,
      dto.startNumber,
      tx,
    );
    if (participant !== null) {
      return participant;
    }
    const known = await this.repository.existsStartNumber(
      eventId,
      dto.startNumber,
      tx,
    );
    if (!known) {
      throw timingError(
        TimingErrorCode.NUMBER_UNKNOWN,
        'No enrollment of this event carries the committed number.',
        { startNumber: dto.startNumber },
      );
    }
    throw timingError(
      TimingErrorCode.NOT_FOUND,
      'No frozen participant of this attempt carries the number.',
      { attemptId, startNumber: dto.startNumber },
    );
  }

  /**
   * U-07: renumbers the target participant's bound passes 1..k in
   * official-instant order, including the split just bound at its original
   * capture instant, and writes only the rows whose number changed.
   */
  private async reindexLaps(
    tx: TimingTx,
    attemptId: string,
    enrollmentId: string,
    marks: readonly TimingMarkRow[],
    bound: TimingMarkRow,
  ): Promise<TimingMarkRow> {
    const passes = new Map<string, TimingMarkRow>();
    for (const mark of marks) {
      if (mark.status === 'BOUND' && mark.enrollmentId === enrollmentId) {
        passes.set(mark.id, mark);
      }
    }
    passes.set(bound.id, bound);
    const laps = assignLapNumbers(
      [...passes.values()].map((mark) => ({
        passId: mark.id,
        officialAt: mark.officialAt,
      })),
    );
    let applied = bound;
    for (const lap of laps) {
      const mark = passes.get(lap.passId);
      if (mark === undefined || mark.lapNumber === lap.lapNumber) {
        continue;
      }
      const updated = await this.repository.updateMark(tx, lap.passId, {
        lapNumber: lap.lapNumber,
      });
      passes.set(lap.passId, updated);
      if (lap.passId === bound.id) {
        applied = updated;
      }
    }
    return applied;
  }

  /**
   * Closes an issued assignment sequence that was definitively refused. The
   * refusal already rolled the assignment transaction back, so this runs in its
   * own short transaction and never touches the split itself (AD-18).
   */
  private async recordRejectedReceipt(
    input: RejectedAssignmentInput,
  ): Promise<void> {
    await this.repository.withTransaction(async (tx) => {
      const existing = await this.repository.findReceipt(
        tx,
        input.attemptId,
        input.workstationInstanceId,
        input.deviceSequence,
      );
      if (existing !== null) {
        return;
      }
      await this.repository.createRejectedReceipt(tx, input);
    });
  }

  /** The attempt facts the queue label reads, loaded once per request. */
  private async loadLabels(
    eventId: string,
    tx?: TimingTx,
  ): Promise<AttemptLabels> {
    const [starts, races] = await Promise.all([
      this.repository.listStarts(eventId, tx),
      this.repository.listClassCompetitions(eventId, tx),
    ]);
    return {
      starts: new Map(starts.map((start) => [start.id, start])),
      races: new Map(races.map((race) => [race.id, race])),
    };
  }

  private async requireUserId(
    authentikId: string | undefined,
  ): Promise<string> {
    const userId =
      authentikId === undefined
        ? null
        : await this.repository.findUserIdByAuthentikId(authentikId);
    if (userId === null) {
      throw timingError(
        TimingErrorCode.ROLE_REQUIRED,
        'The timing actor has no user record.',
      );
    }
    return userId;
  }
}

/**
 * The stable identity of the block one attempt renders in (AD-20). A category
 * block is its start, format and gender; a heat block is its race, stage and
 * heat, so two heats of different stages never share a key.
 */
export function attemptBlockKey(attempt: AttemptIdentity): string {
  if (
    attempt.attemptKind === 'HEAT' &&
    attempt.classCompetitionId !== null &&
    attempt.stageId !== null &&
    attempt.heatNumber !== null
  ) {
    return `heat:${attempt.classCompetitionId}:${attempt.stageId}:${attempt.heatNumber}`;
  }
  return `category:${attempt.startId}:${attempt.formatId}:${attempt.gender}`;
}

/** The queue entry of one pending anonymous split. */
function toQueueEntry(
  row: TimingAnonymousSplitRow,
  labels: AttemptLabels,
): TimingAnonymousSplitView {
  return {
    splitId: row.splitId,
    attemptId: row.attemptId,
    blockKey: attemptBlockKey(row),
    attemptLabel: attemptLabel(row, labels),
    capturedAt: row.capturedAt.toISOString(),
    officialElapsedMs: row.officialElapsedMs,
    status: 'QUEUED',
    bound: true,
    candidates: [
      {
        attemptId: row.attemptId,
        blockKey: attemptBlockKey(row),
        attemptLabel: attemptLabel(row, labels),
        officialElapsedMs: row.officialElapsedMs,
      },
    ],
    captureDeviceSequence: null,
  };
}

/** One event-scoped split with its frozen candidate labels. */
function toEventQueueEntry(
  row: TimingEventSplitRow,
  labels: AttemptLabels,
): TimingAnonymousSplitView {
  const candidates = row.candidates.map((candidate) => ({
    attemptId: candidate.attemptId,
    blockKey: attemptBlockKey(candidate),
    attemptLabel: attemptLabel(candidate, labels),
    officialElapsedMs: Math.max(
      0,
      row.captureInstant.getTime() - candidate.officialStartedAt.getTime(),
    ),
  }));
  const bound = row.legacyMarkId !== null;
  const first = candidates[0];
  return {
    splitId: row.splitId,
    attemptId: bound ? row.boundAttemptId : null,
    ...(bound && first !== undefined
      ? {
          blockKey: first.blockKey,
          attemptLabel: first.attemptLabel,
          officialElapsedMs: first.officialElapsedMs,
        }
      : {}),
    capturedAt: row.captureInstant.toISOString(),
    status: 'QUEUED',
    bound,
    candidates,
    captureDeviceSequence: row.captureDeviceSequence,
  };
}

/**
 * The queue entry a cancellation retires, as the client saw it: the same
 * capture instant, attempt label and elapsed value, so it can drop exactly that
 * entry without a second surface read.
 */
function toRetiredQueueEntry(
  mark: TimingMarkRow,
  attempt: TimingAttemptRow,
  labels: AttemptLabels,
): TimingAnonymousSplitView {
  return {
    splitId: mark.id,
    attemptId: attempt.id,
    blockKey: attemptBlockKey(attempt),
    attemptLabel: attemptLabel(attempt, labels),
    capturedAt: mark.officialAt.toISOString(),
    officialElapsedMs: mark.officialElapsedMs,
    status: 'QUEUED',
    bound: true,
    candidates: [
      {
        attemptId: attempt.id,
        blockKey: attemptBlockKey(attempt),
        attemptLabel: attemptLabel(attempt, labels),
        officialElapsedMs: mark.officialElapsedMs,
      },
    ],
    captureDeviceSequence: mark.deviceSequence,
  };
}

/** Names the attempt a queue entry belongs to: start/format/gender or race/stage/heat. */
function attemptLabel(attempt: AttemptIdentity, labels: AttemptLabels): string {
  if (attempt.attemptKind === 'HEAT') {
    const race =
      attempt.classCompetitionId === null
        ? undefined
        : labels.races.get(attempt.classCompetitionId);
    const parts = [
      trimmed(race?.frozenTitle) ??
        trimmed(race?.frozenSubtitle) ??
        attempt.classCompetitionId,
      attempt.stageId === null ? null : `Этап ${attempt.stageId}`,
      attempt.heatNumber === null ? null : `Заезд ${attempt.heatNumber}`,
    ].filter((part): part is string => part !== null);
    if (parts.length > 0) {
      return parts.join(' · ');
    }
  }
  const start = labels.starts.get(attempt.startId);
  return [
    trimmed(start?.displayName) ?? attempt.startId,
    `Формат ${attempt.formatId}`,
    attempt.gender,
  ].join(' · ');
}

function trimmed(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  return normalized.length === 0 ? null : normalized;
}

/** The one refusal of an assignment that names an already resolved split. */
function splitResolvedError(
  status: TimingMarkRow['status'],
): TimingDomainError {
  return timingError(
    TimingErrorCode.INVALID_STATE,
    'The anonymous split is no longer queued: it was assigned, undone or cancelled.',
    { status },
  );
}

/** Whether a failed assignment still owes its issued sequence a receipt. */
function isRefusedAssignment(error: unknown): error is TimingDomainError {
  return (
    error instanceof TimingDomainError &&
    error.code !== TimingErrorCode.CONFLICT
  );
}

/** How many bound passes one participant already holds in the attempt. */
function boundPassCount(
  marks: readonly TimingMarkRow[],
  enrollmentId: string,
): number {
  return marks.filter(
    (mark) => mark.status === 'BOUND' && mark.enrollmentId === enrollmentId,
  ).length;
}

function toPassView(mark: TimingMarkRow): TimingPassView {
  return {
    passId: mark.id,
    attemptId: mark.attemptId,
    enrollmentId: mark.enrollmentId,
    lapNumber: mark.lapNumber,
    rawCapturedAt: mark.rawCapturedAt.toISOString(),
    officialAt: mark.officialAt.toISOString(),
    officialElapsedMs: mark.officialElapsedMs,
    status: mark.status,
  };
}

/**
 * The key stored on an audit row: the client header when it sent one, otherwise
 * a fresh value. The global interceptor already replays a repeated header, so
 * the service only has to never store an empty key.
 */
function normalizeIdempotencyKey(idempotencyKey: string | undefined): string {
  const trimmedKey = idempotencyKey?.trim() ?? '';
  return trimmedKey.length === 0 ? randomUUID() : trimmedKey;
}
