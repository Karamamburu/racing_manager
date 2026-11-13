import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ResultOutcome } from '../../generated/prisma';
import { RoleCode, TIMING_OPERATE_ROLE_CODES } from '../auth/role-codes';
import { RolesService } from '../auth/roles.service';
import {
  currentPlacement,
  racePlacementForRow,
} from '../class-competitions/race-scope';
import {
  categoriesFromStoredRows,
  convertLegacySections,
  resolveControlYear,
  type AgeCategory,
} from '../events/age-groups';
import { CATEGORY_FINISHED_MESSAGE } from '../events/category-finish';
import { isPastCompletedEvent } from '../events/event-status';
import type { ResultResponse } from '../results/results.service';
import {
  assertCanAddPass,
  assertWithinBounds,
  assignLapNumbers,
  canStartAttempt,
  classifyParticipantState,
  classifyRouting,
  nextAttemptNumber,
  normalizeReason,
  orderByOfficialInstant,
  resolveElapsedMs,
  TIMING_MAX_TOTAL_MS,
  type TimingRoutingCandidate,
  type TimingRoutingNoneReason,
} from './timing.domain';
import type {
  BindPendingFinishDto,
  CancelPendingFinishDto,
  CaptureTimingPassDto,
  OpenClockEpochDto,
  QuickUndoTimingPassDto,
  StartTimingAttemptDto,
} from './timing.dto';
import {
  TimingErrorCode,
  timingError,
  type TimingDomainError,
} from './timing.errors';
import {
  TimingRepository,
  type TimingAgeCategoryRow,
  type TimingAgeSectionRow,
  type TimingAttemptRow,
  type TimingAuditRow,
  type TimingClassCompetitionRow,
  type TimingClockEpochRow,
  type TimingEnrollmentRow,
  type TimingEventRow,
  type TimingMarkRow,
  type TimingParticipantInput,
  type TimingParticipantRow,
  type TimingParticipantRosterRow,
  type TimingPublishedResultRow,
  type TimingRoutingCandidateRow,
  type TimingStartRow,
  type TimingTx,
} from './timing.repository';
import type {
  ClockEpochView,
  StartTimingAttemptResult,
  TimingAttemptRecordView,
  TimingAttemptRef,
  TimingAttemptState,
  TimingAuditView,
  TimingCategoryBlockView,
  TimingCategoryState,
  TimingGender,
  TimingLapSplitDto,
  TimingParticipantTileView,
  TimingPassView,
  TimingSurfaceView,
} from './timing.views';

/**
 * MANUAL-TIMING read surface, Start press, number/tile/pending capture, bind,
 * pending cancellation, quick undo, attempt record and clock epoch.
 *
 * The service owns every refusal: it loads the event-wide facts the rules read,
 * asks the pure domain helpers, and only then writes. A refused Start press
 * creates nothing, so there is no "prepared" attempt.
 *
 * AD-3 receipt semantics (fixed by the capture wave and kept here): a receipt
 * exists only for a mutation that was applied. A refused capture, bind or undo
 * writes neither a mark, a receipt nor an audit row, so its `deviceSequence`
 * stays unconsumed and the client's outbox may retry the same sequence with a
 * corrected payload. A receipt row, once written, is final; a second request on
 * a used sequence is a `CONFLICT`, never a second mutation.
 *
 * Corrections, closure, the lock lifecycle and the role grant belong to later
 * waves and are not implemented here.
 */

/** Why a roster row is out of timing: displayed in a multi-stage race section. */
export const EXCLUDED_RACE_SECTION = 'RACE_SECTION';

/** Why a roster row is out of timing: it already carried a result outcome. */
export const EXCLUDED_EXISTING_OUTCOME = 'EXISTING_OUTCOME';

/** The one message the surface shows when an event offers no timing surface. */
export const TIMING_NOT_AVAILABLE_MESSAGE =
  'Для этого мероприятия хронометраж недоступен.';

/** The user-facing reason of a refused Start press, keyed by domain code. */
const START_REFUSAL_MESSAGES: Partial<Record<TimingErrorCode, string>> = {
  [TimingErrorCode.NOT_AVAILABLE]: TIMING_NOT_AVAILABLE_MESSAGE,
  [TimingErrorCode.CATEGORY_FINISHED]: CATEGORY_FINISHED_MESSAGE,
  [TimingErrorCode.NO_TIMEABLE_PARTICIPANT]:
    'В категории нет участников, доступных для хронометража.',
  [TimingErrorCode.MISSING_START_NUMBER]:
    'У участника категории не указан стартовый номер.',
  [TimingErrorCode.ATTEMPT_RUNNING]: 'Забег этой категории уже запущен.',
  [TimingErrorCode.ATTEMPT_CLOSED]:
    'Забег этой категории уже закрыт. Новый старт возможен только после отмены.',
  [TimingErrorCode.CAPTURE_NOT_HELD]:
    'Это рабочее место не удерживает захват хронометража.',
};

/** A block's reason when a refusal has no product message; unreachable today. */
const START_REFUSAL_FALLBACK_MESSAGE = 'Запуск этой категории недоступен.';

/** One row the block or the frozen roster shows as a tile. */
type TileSource = {
  enrollmentId: string;
  registrationId: string;
  startNumber: number | null;
  fullName: string;
  sectionId: string | null;
  requiredLaps: number;
  excludedReason: string | null;
  initialOutcome: ResultOutcome | null;
};

/** How many passes one participant holds and when the last one landed. */
type PassStatistics = {
  passCount: number;
  lastPassAt: string | null;
};

const NO_PASSES: PassStatistics = { passCount: 0, lastPassAt: null };

/**
 * The enrollment one bound capture writes to. An unbound pending finish has no
 * identity yet, so every field is `null` and a bind supplies it later.
 */
type CaptureTarget = {
  enrollmentId: string | null;
  registrationId: string | null;
  startNumber: number | null;
};

/** A pending finish: a captured instant that belongs to no participant yet. */
const UNBOUND_TARGET: CaptureTarget = {
  enrollmentId: null,
  registrationId: null,
  startNumber: null,
};

/**
 * A published result as the record returns it. `laps` is the additive field the
 * result contract gains; it is emitted only when the attempt wrote a split set.
 */
export type TimingPublishedResultView = ResultResponse & {
  laps?: TimingLapSplitDto[];
};

/** The event-wide facts every category rule of one request reads. */
type EventContext = {
  event: TimingEventRow;
  startOrder: Map<string, number>;
  startsById: Map<string, TimingStartRow>;
  formatOrder: Map<number, number>;
  enrollments: TimingEnrollmentRow[];
  ageCategories: TimingAgeCategoryRow[];
  ageSections: TimingAgeSectionRow[];
  races: TimingClassCompetitionRow[];
  eventRecordable: boolean;
  controlYear: number;
};

/** One protocol category — start × format × gender — with its roster. */
type CategoryGroup = {
  startId: string;
  formatId: number;
  gender: TimingGender;
  rows: TimingEnrollmentRow[];
};

/** A category group plus the configuration, finish and attempt history it needs. */
type CategoryContext = CategoryGroup & {
  start: TimingStartRow;
  lapCount: number;
  categories: AgeCategory[];
  races: TimingClassCompetitionRow[];
  categoryFinished: boolean;
  attempts: TimingAttemptRow[];
};

/** The additive proof the domain error carries to the filter and the surface. */
type StartRefusalContext = {
  missingNumbers: readonly TileSource[];
  holderWorkstationInstanceId: string | null;
  workstationInstanceId: string;
};

/** One unbound pending finish and the running attempt it belongs to. */
type PendingFinishContext = {
  mark: TimingMarkRow;
  attempt: TimingAttemptRow;
};

@Injectable()
export class TimingService {
  constructor(
    private readonly repository: TimingRepository,
    private readonly rolesService: RolesService,
  ) {}

  /** `GET /events/:eventId/timing`: every timeable category, read-only. */
  async getSurface(
    authentikId: string | undefined,
    eventId: string,
  ): Promise<TimingSurfaceView> {
    await this.rolesService.assertHasAnyRole(
      authentikId,
      TIMING_OPERATE_ROLE_CODES,
    );
    const now = new Date();
    const context = await this.loadEventContext(eventId, now);
    const groups = this.groupCategories(context);
    const categories: TimingCategoryBlockView[] = [];
    for (const group of groups) {
      const category = await this.loadCategory(context, group);
      categories.push(await this.buildBlock(context, category, now));
    }
    const lock = await this.repository.getCaptureLock(eventId);
    return {
      eventId,
      captureWorkstationInstanceId: lock?.workstationInstanceId ?? null,
      categories,
    };
  }

  /** `GET /events/:eventId/timing/attempts/:attemptId`: one attempt's record. */
  async getAttemptRecord(
    authentikId: string | undefined,
    eventId: string,
    attemptId: string,
  ): Promise<TimingAttemptRecordView> {
    await this.rolesService.assertHasAnyRole(
      authentikId,
      TIMING_OPERATE_ROLE_CODES,
    );
    const attempt = await this.repository.findAttempt(attemptId);
    if (attempt === null || attempt.eventId !== eventId) {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'Timing attempt not found.',
        { attemptId },
      );
    }
    const marks = await this.repository.listMarks(attemptId);
    const pendingFinishes =
      await this.repository.listPendingFinishes(attemptId);
    const published = await this.repository.listPublishedResults(attemptId);
    const audit = await this.repository.listAudit(attemptId);

    return {
      attemptId: attempt.id,
      state: attempt.status,
      officialStartedAt: attempt.officialStartedAt.toISOString(),
      passes: this.toOrderedPassViews(marks),
      pendingFinishes: pendingFinishes.map((mark) => toPassView(mark)),
      closureReport: attempt.closureReport,
      publishedResults: published.map((row) => toPublishedResultView(row)),
      audit: audit.map(toAuditView),
    };
  }

  /** `POST /events/:eventId/timing/attempts`: the Start press. */
  async startAttempt(
    authentikId: string | undefined,
    eventId: string,
    dto: StartTimingAttemptDto,
  ): Promise<StartTimingAttemptResult> {
    await this.rolesService.assertHasAnyRole(
      authentikId,
      TIMING_OPERATE_ROLE_CODES,
    );
    const now = new Date();
    const context = await this.loadEventContext(eventId, now);
    const start = context.startsById.get(dto.startId);
    if (start === undefined || !start.formatIds.includes(dto.formatId)) {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'The protocol category does not exist on this event.',
        { startId: dto.startId, formatId: dto.formatId, gender: dto.gender },
      );
    }
    const category = await this.loadCategory(context, {
      startId: dto.startId,
      formatId: dto.formatId,
      gender: dto.gender,
      rows: enrollmentsForCategory(
        context,
        dto.startId,
        dto.formatId,
        dto.gender,
      ),
    });
    const roster = this.resolveRoster(context, category);
    const timeable = roster.filter((row) => row.excludedReason === null);
    const missingNumbers = timeable.filter((row) => row.startNumber === null);
    const latestAttempt = category.attempts[0] ?? null;
    const lock = await this.repository.getCaptureLock(eventId);
    const refusal = canStartAttempt({
      eventRecordable: context.eventRecordable,
      categoryFinished: category.categoryFinished,
      participantCount: timeable.length,
      participantsWithoutNumber: missingNumbers.length,
      previousAttemptStatus: latestAttempt?.status ?? null,
      captureHeldByThisWorkstation:
        lock?.workstationInstanceId === dto.workstationInstanceId,
    });
    if (refusal !== null) {
      throw this.startRefusal(refusal, {
        missingNumbers,
        holderWorkstationInstanceId: lock?.workstationInstanceId ?? null,
        workstationInstanceId: dto.workstationInstanceId,
      });
    }

    const participants = roster.map(toParticipantInput);
    const actorUserId = await this.requireUserId(authentikId);
    const { attempt, epoch } = await this.repository.withTransaction(
      async (tx) => {
        await this.repository.lockCategory(
          tx,
          protocolCategoryKey(eventId, dto.startId, dto.formatId, dto.gender),
        );
        // AD-1: the partial unique index is the last guard; under the category
        // lock a second simultaneous press reads the winner and is refused
        // before it can reach the index.
        const current = await this.repository.findAttemptsForCategory(
          eventId,
          dto.startId,
          dto.formatId,
          dto.gender,
          tx,
        );
        if (current.some((row) => row.status === 'RUNNING')) {
          throw this.startRefusal(TimingErrorCode.ATTEMPT_RUNNING, {
            missingNumbers,
            holderWorkstationInstanceId: lock?.workstationInstanceId ?? null,
            workstationInstanceId: dto.workstationInstanceId,
          });
        }
        const latestNumber = await this.repository.findLatestAttemptNumber(
          tx,
          eventId,
          dto.startId,
          dto.formatId,
          dto.gender,
        );
        const created = await this.repository.createAttempt(tx, {
          eventId,
          startId: dto.startId,
          formatId: dto.formatId,
          gender: dto.gender,
          // `findLatestAttemptNumber` returns `0` for a fresh category.
          attemptNumber: nextAttemptNumber([latestNumber]),
          officialStartedAt: now,
          clientStartedAt: new Date(dto.clientStartedAt),
          startedByUserId: actorUserId,
          participants,
        });
        const clockEpoch = await this.repository.createClockEpoch(tx, {
          attemptId: created.id,
          workstationInstanceId: dto.workstationInstanceId,
          officialElapsedAnchorMs: 0,
          openedByUserId: actorUserId,
          openedAt: now,
        });
        await this.repository.insertAudit(tx, {
          attemptId: created.id,
          actorUserId,
          action: 'START',
          targetType: 'ATTEMPT',
          targetId: created.id,
          oldValues: null,
          newValues: {
            startId: dto.startId,
            formatId: dto.formatId,
            gender: dto.gender,
            attemptNumber: created.attemptNumber,
            officialStartedAt: created.officialStartedAt.toISOString(),
            clientStartedAt: dto.clientStartedAt,
            participantCount: participants.length,
            workstationInstanceId: dto.workstationInstanceId,
          },
          reason: null,
        });
        return { attempt: created, epoch: clockEpoch };
      },
    );

    const block = await this.buildBlock(
      context,
      { ...category, attempts: [attempt, ...category.attempts] },
      now,
    );
    return { attempt: block, epoch: toClockEpochView(epoch, now) };
  }

  /**
   * `POST /events/:eventId/timing/attempts/:attemptId/clock-epochs`: a reload or
   * a transfer re-anchors the monotonic clock at the real elapsed value.
   */
  async openClockEpoch(
    authentikId: string | undefined,
    eventId: string,
    attemptId: string,
    dto: OpenClockEpochDto,
  ): Promise<ClockEpochView> {
    await this.rolesService.assertHasAnyRole(
      authentikId,
      TIMING_OPERATE_ROLE_CODES,
    );
    const event = await this.repository.findEvent(eventId);
    if (event === null) {
      throw timingError(TimingErrorCode.NOT_FOUND, 'Event not found.', {
        eventId,
      });
    }
    const attempt = await this.repository.findAttempt(attemptId);
    if (attempt === null || attempt.eventId !== eventId) {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'Timing attempt not found.',
        { attemptId },
      );
    }
    if (attempt.status !== 'RUNNING') {
      throw timingError(
        TimingErrorCode.ATTEMPT_CLOSED,
        'Clock epochs open only on a running attempt.',
        { attemptId, status: attempt.status },
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

    const now = new Date();
    const anchorMs = Math.max(
      0,
      resolveElapsedMs(now, attempt.officialStartedAt),
    );
    const actorUserId = await this.requireUserId(authentikId);
    const epoch = await this.repository.withTransaction(async (tx) => {
      await this.repository.closeOpenEpochs(tx, attemptId);
      const created = await this.repository.createClockEpoch(tx, {
        attemptId,
        workstationInstanceId: dto.workstationInstanceId,
        officialElapsedAnchorMs: anchorMs,
        openedByUserId: actorUserId,
        openedAt: now,
      });
      await this.repository.insertAudit(tx, {
        attemptId,
        actorUserId,
        action: 'EPOCH_OPEN',
        targetType: 'CLOCK_EPOCH',
        targetId: created.id,
        oldValues: null,
        newValues: {
          workstationInstanceId: dto.workstationInstanceId,
          officialElapsedAnchorMs: created.officialElapsedAnchorMs,
        },
        reason: null,
      });
      return created;
    });
    return toClockEpochView(epoch, now);
  }

  /**
   * `POST /events/:eventId/timing/passes`: one number, tile or unbound finish.
   *
   * The commit names an attempt and a workstation sequence; the server never
   * picks a category. A `NUMBER` commit routes through the event-wide routing
   * query, a `TILE` commit names its enrollment, and `PENDING_FINISH` names no
   * participant at all. The mark, its receipt and its audit row commit together.
   */
  async capturePass(
    authentikId: string | undefined,
    eventId: string,
    dto: CaptureTimingPassDto,
    idempotencyKey?: string,
  ): Promise<TimingPassView> {
    await this.rolesService.assertHasAnyRole(
      authentikId,
      TIMING_OPERATE_ROLE_CODES,
    );
    const attempt = await this.repository.findAttempt(dto.attemptId);
    if (attempt === null || attempt.eventId !== eventId) {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'Timing attempt not found.',
        { attemptId: dto.attemptId },
      );
    }
    if (attempt.status !== 'RUNNING') {
      throw timingError(
        TimingErrorCode.ATTEMPT_CLOSED,
        'Capture accepts only a running attempt.',
        { attemptId: attempt.id, status: attempt.status },
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
    // AD-2: a mark is measured from the open epoch of the active workstation.
    // Without one the clock has no anchor, so the capture counts as not held.
    const epoch = await this.repository.findOpenEpoch(
      dto.attemptId,
      dto.workstationInstanceId,
    );
    if (epoch === null) {
      throw timingError(
        TimingErrorCode.CAPTURE_NOT_HELD,
        'This workstation has no open clock epoch on the attempt.',
        {
          attemptId: dto.attemptId,
          workstationInstanceId: dto.workstationInstanceId,
        },
      );
    }
    if (epoch.id !== dto.clockEpochId) {
      throw timingError(
        TimingErrorCode.INVALID_STATE,
        'The clock epoch is not the open epoch of this workstation.',
        { clockEpochId: dto.clockEpochId, openEpochId: epoch.id },
      );
    }

    const actorUserId = await this.requireUserId(authentikId);
    const rawCapturedAt = new Date(dto.clientCapturedAt);
    const key = normalizeIdempotencyKey(idempotencyKey);

    return this.repository.withTransaction(async (tx) => {
      // AD-3: the receipt table is the authority. A retry with the same
      // `Idempotency-Key` never reaches the service; a new key on a used
      // sequence is a client bug, so refuse instead of writing a second mark.
      const receipt = await this.repository.findReceipt(
        tx,
        dto.attemptId,
        dto.workstationInstanceId,
        dto.deviceSequence,
      );
      if (receipt !== null) {
        throw timingError(
          TimingErrorCode.CONFLICT,
          'This device sequence already has a receipt on the attempt.',
          {
            attemptId: dto.attemptId,
            workstationInstanceId: dto.workstationInstanceId,
            deviceSequence: dto.deviceSequence,
            receiptStatus: receipt.status,
            receiptReason: receipt.reason,
          },
        );
      }

      const marks = await this.repository.listMarks(dto.attemptId, tx);
      const target = await this.resolveCaptureTarget(eventId, dto, marks, tx);
      const rawElapsedMs = epoch.officialElapsedAnchorMs + dto.clientElapsedMs;
      const officialAt = new Date(
        attempt.officialStartedAt.getTime() + rawElapsedMs,
      );
      assertWithinBounds(attempt.officialStartedAt, officialAt);
      const officialElapsedMs = resolveElapsedMs(
        officialAt,
        attempt.officialStartedAt,
      );

      const created = await this.repository.createMark(tx, {
        attemptId: dto.attemptId,
        clockEpochId: epoch.id,
        enrollmentId: target.enrollmentId,
        registrationId: target.registrationId,
        startNumber: target.startNumber,
        kind: dto.kind === 'PENDING_FINISH' ? 'PENDING_FINISH' : 'PASS',
        rawCapturedAt,
        rawElapsedMs,
        officialAt,
        officialElapsedMs,
        lapNumber: null,
        status: dto.kind === 'PENDING_FINISH' ? 'PENDING' : 'BOUND',
        workstationInstanceId: dto.workstationInstanceId,
        deviceSequence: dto.deviceSequence,
        idempotencyKey: key,
      });
      await this.repository.createReceipt(tx, {
        attemptId: dto.attemptId,
        workstationInstanceId: dto.workstationInstanceId,
        deviceSequence: dto.deviceSequence,
        status: 'APPLIED',
        reason: null,
      });
      // U-14: laps follow official instant, never capture order, so a capture
      // whose instant lands before an existing pass renumbers both.
      const applied =
        target.enrollmentId === null
          ? created
          : await this.reindexLaps(
              tx,
              dto.attemptId,
              target.enrollmentId,
              marks,
              created,
            );
      await this.repository.insertAudit(tx, {
        attemptId: dto.attemptId,
        actorUserId,
        action:
          dto.kind === 'PENDING_FINISH'
            ? 'PENDING_FINISH_CAPTURE'
            : 'PASS_CAPTURE',
        targetType: 'PASS',
        targetId: applied.id,
        oldValues: null,
        newValues: {
          kind: dto.kind,
          enrollmentId: target.enrollmentId,
          startNumber: target.startNumber,
          lapNumber: applied.lapNumber,
          rawCapturedAt: rawCapturedAt.toISOString(),
          rawElapsedMs,
          officialAt: officialAt.toISOString(),
          officialElapsedMs,
          clockEpochId: epoch.id,
          workstationInstanceId: dto.workstationInstanceId,
          deviceSequence: dto.deviceSequence,
          idempotencyKey: key,
        },
        reason: null,
      });
      return toPassView(applied);
    });
  }

  /**
   * `POST /events/:eventId/timing/pending-finishes/:pendingFinishId/bind`:
   * give one captured instant a participant of its own attempt.
   *
   * The instant was captured when the pending mark was created, so the bind
   * needs no clock epoch: it keeps `rawCapturedAt`, `rawElapsedMs`, `officialAt`,
   * `officialElapsedMs`, `clockEpochId` and the creation `deviceSequence`, and
   * only its identity and state change. Lap order follows the official instant
   * (U-14), so a bind may renumber passes captured after it.
   *
   * A refused bind changes nothing: the mark stays `PENDING` and its bind
   * sequence stays unconsumed, exactly like a refused capture.
   */
  async bindPendingFinish(
    authentikId: string | undefined,
    eventId: string,
    pendingFinishId: string,
    dto: BindPendingFinishDto,
    idempotencyKey?: string,
  ): Promise<TimingPassView> {
    await this.rolesService.assertHasAnyRole(
      authentikId,
      TIMING_OPERATE_ROLE_CODES,
    );
    if (dto.pendingFinishId !== pendingFinishId) {
      throw timingError(
        TimingErrorCode.INVALID_STATE,
        'The body addresses another pending finish than the route.',
        { pendingFinishId, bodyPendingFinishId: dto.pendingFinishId },
      );
    }
    const pending = await this.loadPendingFinish(pendingFinishId, eventId);
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

    const actorUserId = await this.requireUserId(authentikId);
    const key = normalizeIdempotencyKey(idempotencyKey);
    return this.repository.withTransaction(async (tx) => {
      // AD-3: a bind is a capture mutation, so its sequence is receipted once.
      const receipt = await this.repository.findReceipt(
        tx,
        pending.attempt.id,
        dto.workstationInstanceId,
        dto.deviceSequence,
      );
      if (receipt !== null) {
        throw timingError(
          TimingErrorCode.CONFLICT,
          'This device sequence already has a receipt on the attempt.',
          {
            attemptId: pending.attempt.id,
            workstationInstanceId: dto.workstationInstanceId,
            deviceSequence: dto.deviceSequence,
            receiptStatus: receipt.status,
            receiptReason: receipt.reason,
          },
        );
      }
      // Re-read under the transaction: another bind of the same mark, or a
      // cancellation, must not be overwritten by this one.
      const current = await this.loadPendingFinish(
        pendingFinishId,
        eventId,
        tx,
      );
      const marks = await this.repository.listMarks(current.attempt.id, tx);
      const participant = await this.resolveBindTarget(
        current.attempt.id,
        dto,
        tx,
      );
      assertCaptureEligible(
        participant,
        boundPassCount(marks, participant.enrollmentId),
      );

      const bound = await this.repository.updateMark(tx, current.mark.id, {
        enrollmentId: participant.enrollmentId,
        registrationId: participant.registrationId,
        startNumber: participant.startNumber,
        kind: 'PASS',
        status: 'BOUND',
      });
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
        action: 'PENDING_BIND',
        targetType: 'PASS',
        targetId: applied.id,
        oldValues: {
          kind: current.mark.kind,
          status: current.mark.status,
          enrollmentId: current.mark.enrollmentId,
          registrationId: current.mark.registrationId,
          startNumber: current.mark.startNumber,
          lapNumber: current.mark.lapNumber,
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
          workstationInstanceId: dto.workstationInstanceId,
          deviceSequence: dto.deviceSequence,
          bindOfSequence: current.mark.deviceSequence,
          idempotencyKey: key,
        },
        reason: null,
      });
      return toPassView(applied);
    });
  }

  /**
   * `POST /events/:eventId/timing/pending-finishes/:pendingFinishId/cancel`:
   * retire an unbound finish with a reason so completion is no longer blocked.
   *
   * Administrator only (E-10, U-30). It touches no clock, holds no capture lock
   * and writes no receipt: the mark is a correction of the record, not a
   * capture mutation of a workstation. The cancelled mark stays in history.
   */
  async cancelPendingFinish(
    authentikId: string | undefined,
    eventId: string,
    pendingFinishId: string,
    dto: CancelPendingFinishDto,
  ): Promise<TimingPassView> {
    await this.rolesService.assertHasAnyRole(authentikId, [
      RoleCode.ADMINISTRATOR,
    ]);
    const reason = normalizeReason(dto.reason);
    // Refuse before opening the transaction; the mark is re-read under it.
    await this.loadPendingFinish(pendingFinishId, eventId);
    const actorUserId = await this.requireUserId(authentikId);

    const cancelled = await this.repository.withTransaction(async (tx) => {
      const current = await this.loadPendingFinish(
        pendingFinishId,
        eventId,
        tx,
      );
      const updated = await this.repository.updateMark(tx, current.mark.id, {
        status: 'CANCELLED',
      });
      await this.repository.insertAudit(tx, {
        attemptId: current.attempt.id,
        actorUserId,
        action: 'PENDING_CANCEL',
        targetType: 'PASS',
        targetId: current.mark.id,
        oldValues: {
          kind: current.mark.kind,
          status: current.mark.status,
          officialAt: current.mark.officialAt.toISOString(),
          officialElapsedMs: current.mark.officialElapsedMs,
          workstationInstanceId: current.mark.workstationInstanceId,
          deviceSequence: current.mark.deviceSequence,
        },
        newValues: { kind: current.mark.kind, status: 'CANCELLED' },
        reason,
      });
      return updated;
    });
    return toPassView(cancelled);
  }

  /**
   * `POST /events/:eventId/timing/attempts/:attemptId/undo`: withdraw the last
   * pass this workstation created in the attempt, with no reason (E-11).
   *
   * AD-3 keeps a mark's creation sequence when a bind gives it a participant, so
   * `kind`, `status` and `deviceSequence` alone cannot tell a creation from a
   * bind; the `PASS_CAPTURE` audit row written in the same transaction can.
   * The undone pass is soft-cancelled and its participant's remaining passes are
   * renumbered by official instant.
   */
  async quickUndo(
    authentikId: string | undefined,
    eventId: string,
    attemptId: string,
    dto: QuickUndoTimingPassDto,
    idempotencyKey?: string,
  ): Promise<TimingPassView> {
    await this.rolesService.assertHasAnyRole(
      authentikId,
      TIMING_OPERATE_ROLE_CODES,
    );
    const attempt = await this.repository.findAttempt(attemptId);
    if (attempt === null || attempt.eventId !== eventId) {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'Timing attempt not found.',
        { attemptId },
      );
    }
    if (attempt.status !== 'RUNNING') {
      throw timingError(
        TimingErrorCode.ATTEMPT_CLOSED,
        'Undo accepts only a running attempt.',
        { attemptId, status: attempt.status },
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

    const actorUserId = await this.requireUserId(authentikId);
    const key = normalizeIdempotencyKey(idempotencyKey);
    return this.repository.withTransaction(async (tx) => {
      const receipt = await this.repository.findReceipt(
        tx,
        attemptId,
        dto.workstationInstanceId,
        dto.deviceSequence,
      );
      if (receipt !== null) {
        throw timingError(
          TimingErrorCode.CONFLICT,
          'This device sequence already has a receipt on the attempt.',
          {
            attemptId,
            workstationInstanceId: dto.workstationInstanceId,
            deviceSequence: dto.deviceSequence,
            receiptStatus: receipt.status,
            receiptReason: receipt.reason,
          },
        );
      }
      const marks = await this.repository.listMarks(attemptId, tx);
      const audit = await this.repository.listAudit(attemptId, tx);
      const target = lastPassCreation(marks, audit, dto.workstationInstanceId);
      if (target === null || target.enrollmentId === null) {
        throw timingError(
          TimingErrorCode.INVALID_STATE,
          'This workstation has no pass creation to undo in the attempt.',
          {
            attemptId,
            workstationInstanceId: dto.workstationInstanceId,
          },
        );
      }

      const cancelled = await this.repository.updateMark(tx, target.id, {
        status: 'CANCELLED',
        lapNumber: null,
      });
      await this.renumberPasses(
        tx,
        target.enrollmentId,
        marks.filter((mark) => mark.id !== target.id),
      );
      await this.repository.createReceipt(tx, {
        attemptId,
        workstationInstanceId: dto.workstationInstanceId,
        deviceSequence: dto.deviceSequence,
        status: 'APPLIED',
        reason: null,
      });
      await this.repository.insertAudit(tx, {
        attemptId,
        actorUserId,
        action: 'QUICK_UNDO',
        targetType: 'PASS',
        targetId: target.id,
        oldValues: {
          status: target.status,
          enrollmentId: target.enrollmentId,
          lapNumber: target.lapNumber,
          officialAt: target.officialAt.toISOString(),
          officialElapsedMs: target.officialElapsedMs,
          workstationInstanceId: target.workstationInstanceId,
          deviceSequence: target.deviceSequence,
        },
        newValues: {
          status: 'CANCELLED',
          lapNumber: null,
          workstationInstanceId: dto.workstationInstanceId,
          deviceSequence: dto.deviceSequence,
          idempotencyKey: key,
        },
        reason: null,
      });
      return toPassView(cancelled);
    });
  }

  /**
   * One unbound pending finish of the event's running attempt. The mark must
   * name a `PENDING_FINISH` that is still `PENDING`; a cancelled mark is state,
   * not a missing resource, and a wrong kind is no pending finish at all.
   */
  private async loadPendingFinish(
    pendingFinishId: string,
    eventId: string,
    tx?: TimingTx,
  ): Promise<PendingFinishContext> {
    const mark = await this.repository.findMark(pendingFinishId, tx);
    if (mark === null) {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'Pending finish not found.',
        { pendingFinishId },
      );
    }
    const attempt = await this.repository.findAttempt(mark.attemptId, tx);
    if (attempt === null || attempt.eventId !== eventId) {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'The pending finish belongs to another event.',
        { pendingFinishId, attemptId: mark.attemptId },
      );
    }
    if (mark.kind !== 'PENDING_FINISH') {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'The addressed mark is not a pending finish.',
        { pendingFinishId, kind: mark.kind },
      );
    }
    if (mark.status !== 'PENDING') {
      throw timingError(
        TimingErrorCode.INVALID_STATE,
        'The pending finish is no longer unbound.',
        { pendingFinishId, status: mark.status },
      );
    }
    if (attempt.status !== 'RUNNING') {
      throw timingError(
        TimingErrorCode.ATTEMPT_CLOSED,
        'A pending finish changes only while its attempt runs.',
        { attemptId: attempt.id, status: attempt.status },
      );
    }
    return { mark, attempt };
  }

  /**
   * The participant a bind names. Exactly one of the two identity fields is
   * present (the DTO guarantees it), and the target must be frozen in this
   * attempt: a number or enrollment of another attempt is not a target here.
   */
  private async resolveBindTarget(
    attemptId: string,
    dto: BindPendingFinishDto,
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
        TimingErrorCode.NOT_FOUND,
        'The bind names no participant.',
        { attemptId },
      );
    }
    const participant = await this.repository.findParticipantByStartNumber(
      attemptId,
      dto.startNumber,
      tx,
    );
    if (participant === null) {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'No frozen participant of this attempt carries the number.',
        { attemptId, startNumber: dto.startNumber },
      );
    }
    return participant;
  }

  /**
   * Resolves what one commit writes: a frozen participant of the addressed
   * attempt, or nothing for an unbound finish. Exclusion and N are checked on
   * the frozen row the capture actually targets, so a number that routed to an
   * eligible candidate cannot slip past them.
   */
  private async resolveCaptureTarget(
    eventId: string,
    dto: CaptureTimingPassDto,
    marks: readonly TimingMarkRow[],
    tx: TimingTx,
  ): Promise<CaptureTarget> {
    if (dto.kind === 'PENDING_FINISH') {
      return UNBOUND_TARGET;
    }
    const enrollmentId =
      dto.kind === 'TILE'
        ? this.tileTargetEnrollmentId(dto)
        : await this.numberTargetEnrollmentId(eventId, dto, tx);
    const participant = await this.repository.findParticipant(
      dto.attemptId,
      enrollmentId,
      tx,
    );
    if (participant === null) {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'The enrollment is not a frozen participant of this attempt.',
        { attemptId: dto.attemptId, enrollmentId },
      );
    }
    assertCaptureEligible(participant, boundPassCount(marks, enrollmentId));
    return {
      enrollmentId,
      registrationId: participant.registrationId,
      startNumber: participant.startNumber,
    };
  }

  /** A tile names its enrollment, so it is never ambiguous. */
  private tileTargetEnrollmentId(dto: CaptureTimingPassDto): string {
    if (dto.enrollmentId === undefined) {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'A tile capture names no enrollment.',
        { attemptId: dto.attemptId },
      );
    }
    return dto.enrollmentId;
  }

  /**
   * A committed number routes through every running attempt of the event. One
   * eligible enrollment lands silently; two ask for a choice; none names why.
   */
  private async numberTargetEnrollmentId(
    eventId: string,
    dto: CaptureTimingPassDto,
    tx: TimingTx,
  ): Promise<string> {
    if (dto.startNumber === undefined) {
      throw timingError(
        TimingErrorCode.NUMBER_REQUIRED,
        'A number capture requires a start number.',
        { attemptId: dto.attemptId },
      );
    }
    const candidates = await this.repository.findRoutingCandidates(
      eventId,
      { startNumber: dto.startNumber },
      tx,
    );
    const routing = classifyRouting(candidates.map(toRoutingCandidate));
    if (routing.kind === 'AMBIGUOUS') {
      throw timingError(
        TimingErrorCode.NUMBER_AMBIGUOUS,
        'The number resolves to more than one eligible enrollment.',
        {
          startNumber: dto.startNumber,
          enrollmentIds: routing.enrollmentIds,
        },
      );
    }
    if (routing.kind === 'NONE') {
      throw await this.numberRefusal(
        eventId,
        dto.startNumber,
        routing.reason,
        tx,
      );
    }
    const chosen = candidates.find(
      (candidate) => candidate.enrollmentId === routing.enrollmentId,
    );
    if (chosen === undefined) {
      throw timingError(
        TimingErrorCode.INVALID_STATE,
        'The routing decision named a candidate the query did not return.',
        { startNumber: dto.startNumber, enrollmentId: routing.enrollmentId },
      );
    }
    // The client resolves the number to the target attempt before posting. A
    // different attempt means a stale surface: refuse rather than write into
    // this attempt's epoch with another attempt's elapsed clock.
    if (chosen.attemptId !== dto.attemptId) {
      throw timingError(
        TimingErrorCode.INVALID_STATE,
        'The number routes to another attempt than the addressed one.',
        {
          attemptId: dto.attemptId,
          routedAttemptId: chosen.attemptId,
          enrollmentId: chosen.enrollmentId,
          startNumber: dto.startNumber,
        },
      );
    }
    return chosen.enrollmentId;
  }

  /**
   * The refusal of a number that resolves to no eligible enrollment. The
   * routing query sees running attempts only, so an empty result still has to
   * be told apart from a number the event does not know at all.
   */
  private async numberRefusal(
    eventId: string,
    startNumber: number,
    reason: TimingRoutingNoneReason,
    tx: TimingTx,
  ): Promise<TimingDomainError> {
    if (reason === 'UNKNOWN_NUMBER') {
      const known = await this.repository.existsStartNumber(
        eventId,
        startNumber,
        tx,
      );
      if (!known) {
        return timingError(
          TimingErrorCode.NUMBER_UNKNOWN,
          'No enrollment of this event carries the committed number.',
          { startNumber },
        );
      }
      return timingError(
        TimingErrorCode.ATTEMPT_CLOSED,
        'The participant has no running attempt: it has not started or is closed.',
        { startNumber, reason: 'NOT_RUNNING' },
      );
    }
    if (reason === 'EXCLUDED') {
      return timingError(
        TimingErrorCode.EXCLUDED_PARTICIPANT,
        'The participant is excluded from the running attempt.',
        { startNumber, reason },
      );
    }
    if (reason === 'ALREADY_N') {
      return timingError(
        TimingErrorCode.ALREADY_N_PASSES,
        'The participant already holds N passes.',
        { startNumber, reason },
      );
    }
    return timingError(
      TimingErrorCode.ATTEMPT_CLOSED,
      'The participant has no running attempt: it has not started or is closed.',
      { startNumber, reason },
    );
  }

  /**
   * U-14: renumbers one participant's bound passes 1..k in official-instant
   * order, including the pass the caller just bound, and writes only the rows
   * whose number changed, so the N-th pass is always the participant's total.
   */
  private async reindexLaps(
    tx: TimingTx,
    attemptId: string,
    enrollmentId: string,
    marks: readonly TimingMarkRow[],
    created: TimingMarkRow,
  ): Promise<TimingMarkRow> {
    const passes = new Map<string, TimingMarkRow>();
    for (const mark of marks) {
      if (mark.status === 'BOUND' && mark.enrollmentId === enrollmentId) {
        passes.set(mark.id, mark);
      }
    }
    passes.set(created.id, created);
    const written = await this.writeLapNumbers(tx, passes);
    return written.get(created.id) ?? created;
  }

  /**
   * U-14 after a cancellation or an undo: renumbers the remaining bound passes
   * of one participant 1..k in official-instant order.
   */
  private async renumberPasses(
    tx: TimingTx,
    enrollmentId: string,
    marks: readonly TimingMarkRow[],
  ): Promise<void> {
    const passes = new Map<string, TimingMarkRow>();
    for (const mark of marks) {
      if (mark.status === 'BOUND' && mark.enrollmentId === enrollmentId) {
        passes.set(mark.id, mark);
      }
    }
    await this.writeLapNumbers(tx, passes);
  }

  /** Assigns lap numbers 1..k and writes only the rows whose number changed. */
  private async writeLapNumbers(
    tx: TimingTx,
    passes: ReadonlyMap<string, TimingMarkRow>,
  ): Promise<Map<string, TimingMarkRow>> {
    const written = new Map(passes);
    const laps = assignLapNumbers(
      [...written.values()].map((mark) => ({
        passId: mark.id,
        officialAt: mark.officialAt,
      })),
    );
    for (const lap of laps) {
      const mark = written.get(lap.passId);
      if (mark === undefined || mark.lapNumber === lap.lapNumber) {
        continue;
      }
      const updated = await this.repository.updateMark(tx, lap.passId, {
        lapNumber: lap.lapNumber,
      });
      written.set(lap.passId, updated);
    }
    return written;
  }

  private async loadEventContext(
    eventId: string,
    now: Date,
  ): Promise<EventContext> {
    const event = await this.repository.findEvent(eventId);
    if (event === null) {
      throw timingError(TimingErrorCode.NOT_FOUND, 'Event not found.', {
        eventId,
      });
    }
    const starts = await this.repository.listStarts(eventId);
    if (starts.length === 0) {
      throw timingError(
        TimingErrorCode.NOT_AVAILABLE,
        TIMING_NOT_AVAILABLE_MESSAGE,
        { eventId },
      );
    }
    const [enrollments, ageCategories, ageSections, races, formats] =
      await Promise.all([
        this.repository.listEnrollmentRows(eventId),
        this.repository.listAgeCategories(eventId),
        this.repository.listLegacyAgeSections(eventId),
        this.repository.listClassCompetitions(eventId),
        this.repository.listFormats(),
      ]);
    return {
      event,
      startOrder: new Map(starts.map((start, index) => [start.id, index])),
      startsById: new Map(starts.map((start) => [start.id, start])),
      formatOrder: new Map(formats.map((format, index) => [format.id, index])),
      enrollments,
      ageCategories,
      ageSections,
      races,
      eventRecordable: isEventRecordable(event, now),
      controlYear: resolveControlYear(event.eventDate),
    };
  }

  /**
   * One group per protocol category that holds an active enrollment row, in the
   * surface order: start, then format catalog order, then `M` before `F`.
   */
  private groupCategories(context: EventContext): CategoryGroup[] {
    const groups = new Map<string, CategoryGroup>();
    for (const row of context.enrollments) {
      const key = protocolCategoryKey(
        context.event.id,
        row.startId,
        row.formatId,
        row.gender,
      );
      const group = groups.get(key);
      if (group === undefined) {
        groups.set(key, {
          startId: row.startId,
          formatId: row.formatId,
          gender: row.gender,
          rows: [row],
        });
      } else {
        group.rows.push(row);
      }
    }
    return [...groups.values()].sort((left, right) =>
      compareCategories(context, left, right),
    );
  }

  private async loadCategory(
    context: EventContext,
    group: CategoryGroup,
  ): Promise<CategoryContext> {
    const start = context.startsById.get(group.startId);
    if (start === undefined) {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'The protocol start is not part of this event.',
        { startId: group.startId },
      );
    }
    const storedCategories = context.ageCategories.filter((row) =>
      matchesCategory(row, group),
    );
    const categories =
      storedCategories.length > 0
        ? categoriesFromStoredRows(storedCategories)
        : convertLegacySections(
            context.ageSections.filter((row) => matchesCategory(row, group)),
          );
    const [categoryFinished, attempts] = await Promise.all([
      this.repository.isCategoryFinished(
        context.event.id,
        group.startId,
        group.formatId,
        group.gender,
      ),
      this.repository.findAttemptsForCategory(
        context.event.id,
        group.startId,
        group.formatId,
        group.gender,
      ),
    ]);
    return {
      ...group,
      start,
      lapCount: start.lapCount,
      categories,
      races: context.races.filter((row) => matchesCategory(row, group)),
      categoryFinished,
      attempts,
    };
  }

  private async buildBlock(
    context: EventContext,
    category: CategoryContext,
    now: Date,
  ): Promise<TimingCategoryBlockView> {
    const latest = category.attempts[0] ?? null;
    const frozen =
      latest === null
        ? null
        : await this.repository.listParticipantRoster(latest.id);
    const roster =
      frozen === null
        ? this.resolveRoster(context, category)
        : frozen.map(toTileSource);
    const timeable = roster.filter((row) => row.excludedReason === null);
    const missingNumbers = timeable.filter((row) => row.startNumber === null);
    const refusal = canStartAttempt({
      eventRecordable: context.eventRecordable,
      categoryFinished: category.categoryFinished,
      participantCount: timeable.length,
      participantsWithoutNumber: missingNumbers.length,
      previousAttemptStatus: latest?.status ?? null,
      // The read surface does not refuse on capture: the client compares this
      // workstation with the holder, and the Start route enforces it.
      captureHeldByThisWorkstation: true,
    });
    const marks =
      latest === null ? [] : await this.repository.listMarks(latest.id);
    const pendingFinishes =
      latest === null
        ? []
        : await this.repository.listPendingFinishes(latest.id);
    const statistics = passStatistics(marks);

    return {
      startId: category.startId,
      formatId: category.formatId,
      gender: category.gender,
      state: toCategoryState(latest),
      lapCount: category.lapCount,
      attemptId: latest?.id ?? null,
      officialStartedAt: latest?.officialStartedAt.toISOString() ?? null,
      elapsedMs:
        latest !== null && latest.status === 'RUNNING'
          ? runningElapsedMs(latest, now)
          : null,
      startControlEnabled: refusal === null,
      blockReason: refusal === null ? null : startRefusalMessage(refusal),
      participants: roster.map((row) =>
        toTileView(
          row,
          statistics.get(row.enrollmentId) ?? NO_PASSES,
          latest?.status ?? null,
        ),
      ),
      pendingFinishes: pendingFinishes.map((mark) => toPassView(mark)),
      lastAttempts: category.attempts.map((attempt) => toAttemptRef(attempt)),
    };
  }

  /**
   * The category roster with the two exclusion rules applied: a row displayed in
   * a multi-stage race section, and a row that already carries a result outcome.
   */
  private resolveRoster(
    context: EventContext,
    category: CategoryContext,
  ): TileSource[] {
    return category.rows.map((row) => {
      const placement = currentPlacement(
        row.birthYear,
        context.controlYear,
        category.categories,
      );
      const race = racePlacementForRow(category.races, {
        enrollmentId: row.enrollmentId,
        registrationId: row.registrationId,
        placement,
      });
      const outcome = row.result?.outcome ?? null;
      return {
        enrollmentId: row.enrollmentId,
        registrationId: row.registrationId,
        startNumber: row.startNumber,
        fullName: formatPersonName(row.firstName, row.lastName),
        sectionId:
          race === null
            ? placement.sectionId
            : (race.race.sectionId ?? placement.sectionId),
        requiredLaps: category.lapCount,
        excludedReason:
          race !== null
            ? EXCLUDED_RACE_SECTION
            : outcome !== null
              ? EXCLUDED_EXISTING_OUTCOME
              : null,
        initialOutcome: outcome,
      };
    });
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

  private startRefusal(
    code: TimingErrorCode,
    input: StartRefusalContext,
  ): TimingDomainError {
    const message = startRefusalMessage(code);
    if (code === TimingErrorCode.MISSING_START_NUMBER) {
      return timingError(code, message, {
        participants: input.missingNumbers.map((row) => ({
          enrollmentId: row.enrollmentId,
          registrationId: row.registrationId,
          fullName: row.fullName,
        })),
      });
    }
    if (code === TimingErrorCode.CAPTURE_NOT_HELD) {
      return timingError(code, message, {
        workstationInstanceId: input.workstationInstanceId,
        holderWorkstationInstanceId: input.holderWorkstationInstanceId,
      });
    }
    return timingError(code, message);
  }

  private toOrderedPassViews(
    marks: readonly TimingMarkRow[],
  ): TimingPassView[] {
    const passes = marks
      .filter((mark) => mark.kind === 'PASS' || mark.status === 'BOUND')
      .map((mark) => ({ passId: mark.id, officialAt: mark.officialAt, mark }));
    return orderByOfficialInstant(passes).map((pass) => toPassView(pass.mark));
  }
}

/** Whether the event still accepts timing writes. */
function isEventRecordable(event: TimingEventRow, now: Date): boolean {
  return (
    event.status !== 'CANCELLED' &&
    !isPastCompletedEvent(event.status, event.eventDate, now)
  );
}

/** The advisory-lock and grouping key of one protocol category. */
function protocolCategoryKey(
  eventId: string,
  startId: string,
  formatId: number,
  gender: TimingGender,
): string {
  return `${eventId}:${startId}:${formatId}:${gender}`;
}

/** The active enrollment rows of one protocol category. */
function enrollmentsForCategory(
  context: EventContext,
  startId: string,
  formatId: number,
  gender: TimingGender,
): TimingEnrollmentRow[] {
  return context.enrollments.filter(
    (row) =>
      row.startId === startId &&
      row.formatId === formatId &&
      row.gender === gender,
  );
}

/** Whether a configuration row belongs to the grouped category. */
function matchesCategory(
  row: {
    startId: string | null;
    formatId: number | null;
    gender: string;
  },
  group: CategoryGroup,
): boolean {
  return (
    row.startId === group.startId &&
    row.formatId === group.formatId &&
    row.gender === group.gender
  );
}

function compareCategories(
  context: EventContext,
  left: CategoryGroup,
  right: CategoryGroup,
): number {
  const startDifference =
    (context.startOrder.get(left.startId) ?? Number.MAX_SAFE_INTEGER) -
    (context.startOrder.get(right.startId) ?? Number.MAX_SAFE_INTEGER);
  if (startDifference !== 0) {
    return startDifference;
  }
  if (left.startId !== right.startId) {
    return left.startId < right.startId ? -1 : 1;
  }
  const leftFormat = context.formatOrder.get(left.formatId);
  const rightFormat = context.formatOrder.get(right.formatId);
  if (
    leftFormat !== undefined &&
    rightFormat !== undefined &&
    leftFormat !== rightFormat
  ) {
    return leftFormat - rightFormat;
  }
  if (left.formatId !== right.formatId) {
    return left.formatId - right.formatId;
  }
  if (left.gender === right.gender) {
    return 0;
  }
  return left.gender === 'M' ? -1 : 1;
}

function toCategoryState(
  attempt: TimingAttemptRow | null,
): TimingCategoryState {
  return attempt === null ? 'NOT_STARTED' : attempt.status;
}

/** Elapsed time since the attempt's official start, inside the published bound. */
function runningElapsedMs(attempt: TimingAttemptRow, now: Date): number {
  const elapsedMs = resolveElapsedMs(now, attempt.officialStartedAt);
  return Math.min(Math.max(elapsedMs, 0), TIMING_MAX_TOTAL_MS);
}

/** The Start refusal message shown as a block reason. */
function startRefusalMessage(code: TimingErrorCode): string {
  return START_REFUSAL_MESSAGES[code] ?? START_REFUSAL_FALLBACK_MESSAGE;
}

/** The tile contract has no nullable number; `0` marks a row without one. */
function tileStartNumber(startNumber: number | null): number {
  return startNumber ?? 0;
}

/** The tile contract has no nullable section; the freeze always computes one. */
function tileSectionId(sectionId: string | null): string {
  return sectionId ?? '';
}

function formatPersonName(
  firstName: string | null,
  lastName: string | null,
): string {
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return fullName || 'Участник';
}

function toTileSource(row: TimingParticipantRosterRow): TileSource {
  return {
    enrollmentId: row.enrollmentId,
    registrationId: row.registrationId,
    startNumber: row.startNumber,
    fullName: formatPersonName(row.firstName, row.lastName),
    sectionId: row.sectionId,
    requiredLaps: row.requiredLaps,
    excludedReason: row.excludedReason,
    initialOutcome: row.initialOutcome,
  };
}

function toParticipantInput(row: TileSource): TimingParticipantInput {
  return {
    enrollmentId: row.enrollmentId,
    registrationId: row.registrationId,
    startNumber: row.startNumber,
    sectionId: row.sectionId,
    requiredLaps: row.requiredLaps,
    initialOutcome: row.initialOutcome,
    excludedReason: row.excludedReason,
  };
}

function toTileView(
  row: TileSource,
  statistics: PassStatistics,
  attemptStatus: TimingAttemptState | null,
): TimingParticipantTileView {
  return {
    enrollmentId: row.enrollmentId,
    registrationId: row.registrationId,
    startNumber: tileStartNumber(row.startNumber),
    fullName: row.fullName,
    sectionId: tileSectionId(row.sectionId),
    passCount: statistics.passCount,
    requiredLaps: row.requiredLaps,
    lastPassAt: statistics.lastPassAt,
    state:
      attemptStatus === null
        ? row.excludedReason === null
          ? 'WAITING'
          : 'EXCLUDED'
        : classifyParticipantState({
            attemptStatus,
            passCount: statistics.passCount,
            requiredLaps: row.requiredLaps,
            excludedReason: row.excludedReason,
          }),
    excludedReason: row.excludedReason,
  };
}

/** Passes per enrollment in official-instant order, so the last one is latest. */
function passStatistics(
  marks: readonly TimingMarkRow[],
): Map<string, PassStatistics> {
  const statistics = new Map<string, PassStatistics>();
  for (const mark of marks) {
    if (mark.status !== 'BOUND' || mark.enrollmentId === null) {
      continue;
    }
    const current = statistics.get(mark.enrollmentId) ?? NO_PASSES;
    const officialAt = mark.officialAt.toISOString();
    statistics.set(mark.enrollmentId, {
      passCount: current.passCount + 1,
      lastPassAt:
        current.lastPassAt === null || current.lastPassAt < officialAt
          ? officialAt
          : current.lastPassAt,
    });
  }
  return statistics;
}

/**
 * Refuses a capture on a frozen participant that is excluded or already holds N
 * passes; `passCount` is the bound pass count of the addressed attempt.
 */
function assertCaptureEligible(
  participant: TimingParticipantRow,
  passCount: number,
): void {
  if (participant.excludedReason !== null) {
    throw timingError(
      TimingErrorCode.EXCLUDED_PARTICIPANT,
      'The participant is excluded from this attempt.',
      {
        enrollmentId: participant.enrollmentId,
        excludedReason: participant.excludedReason,
      },
    );
  }
  assertCanAddPass(passCount, participant.requiredLaps);
}

/** The bound passes one enrollment already holds in the attempt. */
function boundPassCount(
  marks: readonly TimingMarkRow[],
  enrollmentId: string,
): number {
  return marks.filter(
    (mark) => mark.status === 'BOUND' && mark.enrollmentId === enrollmentId,
  ).length;
}

/**
 * E-11: the last pass this workstation *created* in the attempt.
 *
 * A bind gives an existing pending-finish mark a participant while AD-3 keeps
 * that mark's capture sequence, so `kind: PASS`, `status: BOUND` and the highest
 * `deviceSequence` also match a freshly bound finish. The audit row a capture
 * writes in its own transaction is the only creation proof on the record, so
 * only a mark named by this workstation's `PASS_CAPTURE` is a candidate. A
 * correction, a rebind or another workstation's capture is never named.
 */
function lastPassCreation(
  marks: readonly TimingMarkRow[],
  audit: readonly TimingAuditRow[],
  workstationInstanceId: string,
): TimingMarkRow | null {
  const created = new Set<string>();
  for (const row of audit) {
    if (row.action !== 'PASS_CAPTURE') continue;
    if (row.newValues?.workstationInstanceId !== workstationInstanceId) {
      continue;
    }
    created.add(row.targetId);
  }
  const candidates = marks.filter(
    (mark) =>
      created.has(mark.id) &&
      mark.kind === 'PASS' &&
      mark.status === 'BOUND' &&
      mark.workstationInstanceId === workstationInstanceId,
  );
  candidates.sort((left, right) => {
    const sequence = (right.deviceSequence ?? -1) - (left.deviceSequence ?? -1);
    if (sequence !== 0) return sequence;
    const instant = right.officialAt.getTime() - left.officialAt.getTime();
    if (instant !== 0) return instant;
    if (left.id === right.id) return 0;
    return left.id < right.id ? 1 : -1;
  });
  return candidates[0] ?? null;
}

/** The routing facts of one candidate row; the attempt status is always running. */
function toRoutingCandidate(
  candidate: TimingRoutingCandidateRow,
): TimingRoutingCandidate {
  return {
    enrollmentId: candidate.enrollmentId,
    attemptStatus: candidate.attemptStatus,
    passCount: candidate.passCount,
    requiredLaps: candidate.requiredLaps,
    excludedReason: candidate.excludedReason,
  };
}

/**
 * The key stored on a mark: the client header when it sent one, otherwise a
 * fresh value. The global interceptor already replays a repeated header, so the
 * service only has to never store an empty key.
 */
function normalizeIdempotencyKey(idempotencyKey: string | undefined): string {
  const trimmed = idempotencyKey?.trim() ?? '';
  return trimmed.length === 0 ? randomUUID() : trimmed;
}

function toAttemptRef(attempt: TimingAttemptRow): TimingAttemptRef {
  return {
    attemptId: attempt.id,
    state: attempt.status,
    officialStartedAt: attempt.officialStartedAt.toISOString(),
  };
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

function toClockEpochView(
  epoch: TimingClockEpochRow,
  now: Date,
): ClockEpochView {
  return {
    epochId: epoch.id,
    attemptId: epoch.attemptId,
    officialElapsedAnchorMs: epoch.officialElapsedAnchorMs,
    serverNow: now.toISOString(),
  };
}

function toAuditView(row: {
  auditId: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  reason: string | null;
  createdAt: Date;
}): TimingAuditView {
  return {
    auditId: row.auditId,
    // The view has no nullable actor; a missing user row reads as no actor.
    actorUserId: row.actorUserId ?? '',
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    oldValues: row.oldValues,
    newValues: row.newValues,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Maps one published result. The read filters out a row without an enrollment or
 * an outcome, so reaching the refusal means the tables contradict a publication.
 */
function toPublishedResultView(
  row: TimingPublishedResultRow,
): TimingPublishedResultView {
  if (row.enrollmentId === null || row.outcome === null) {
    throw new Error(
      'A timing attempt published a result without an enrollment or an outcome.',
    );
  }
  return {
    id: row.id,
    enrollmentId: row.enrollmentId,
    registrationId: row.registrationId,
    outcome: row.outcome,
    timeMilliseconds: row.timeMilliseconds,
    recordedAt: row.recordedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.laps.length === 0 ? {} : { laps: row.laps }),
  };
}
