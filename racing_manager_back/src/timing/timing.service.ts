import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  EnrollmentStatus,
  Prisma,
  ResultOutcome,
} from '../../generated/prisma';
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
  canComplete,
  canCorrectOfficialTime,
  canRebindOrCancelPass,
  canStartAttempt,
  classifyParticipantState,
  classifyRouting,
  computeSplits,
  nextAttemptNumber,
  normalizeReason,
  orderByOfficialInstant,
  resolveElapsedMs,
  TIMING_MAX_TOTAL_MS,
  type TimingLapSplit,
  type TimingRoutingCandidate,
  type TimingRoutingNoneReason,
} from './timing.domain';
import type {
  BindPendingFinishDto,
  CancelPendingFinishDto,
  CancelTimingAttemptDto,
  CancelTimingPassDto,
  CaptureTimingPassDto,
  CompleteTimingAttemptDto,
  CorrectOfficialTimeDto,
  ForceCompleteTimingAttemptDto,
  ForceReleaseCaptureDto,
  OpenClockEpochDto,
  QuickUndoTimingPassDto,
  RebindTimingPassDto,
  StartTimingAttemptDto,
  TakeCaptureDto,
  TransferCaptureDto,
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
  type TimingCaptureLockRow,
  type TimingClassCompetitionRow,
  type TimingClockEpochRow,
  type TimingClosureReportRecord,
  type TimingEnrollmentRow,
  type TimingEventRow,
  type TimingMarkRow,
  type TimingParticipantInput,
  type TimingParticipantRow,
  type TimingParticipantRosterRow,
  type TimingPublishedResultRow,
  type TimingReceiptRow,
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
  TimingCaptureView,
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
 * pending cancellation, quick undo, attempt record, clock epoch, official-time
 * corrections and pass cancel/rebind.
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
 * a used sequence is a `CONFLICT`, never a second mutation. An administrator
 * correction, a pass cancellation and a pass rebind write no receipt at all:
 * they are record corrections, not workstation captures.
 *
 * Closure is the one indivisible action of this module: the state change, every
 * eligible result with its split set, the closure report, the capture-lock
 * release and the audit row commit together or not at all (U-20). A cancelled
 * attempt publishes nothing; a force-completed attempt publishes only the
 * participants that reached N. The event-wide capture hold is taken, handed
 * over and force-released explicitly (AD-5); the `REFEREE` grant route belongs
 * to a later wave and is not implemented here. A correction still republishes
 * an already timing-published result, because the published total must agree
 * with the official values as soon as the category is unfinished.
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

/** One bound pass of the attempt, resolved to the participant it belongs to. */
type BoundPassContext = {
  mark: TimingMarkRow;
  enrollmentId: string;
  attempt: TimingAttemptRow;
};

/**
 * The publication a correction has to rewrite, computed before any write so a
 * bound or split refusal leaves the record untouched. `null` means the
 * participant's result is not timing-owned and is never overwritten.
 */
type RepublishPlan = {
  enrollmentId: string;
  registrationId: string;
  totalMs: number;
  splits: TimingLapSplit[];
};

/** Everything one closure decides before it writes a row. */
type ClosureInput = {
  eventId: string;
  attemptId: string;
  actorUserId: string;
  status: 'COMPLETED' | 'INCOMPLETE' | 'CANCELLED';
  action: 'COMPLETE' | 'FORCE_COMPLETE' | 'CANCEL_ATTEMPT';
  reason: string | null;
  /** The completing workstation; `null` for an administrative closure. */
  workstationInstanceId: string | null;
  /** The completing workstation's highest issued sequence; `null` for admin. */
  lastIssuedSequence: number | null;
  /** Ordinary completion also requires every non-excluded participant at N. */
  requireEveryParticipantAtN: boolean;
};

/** One participant a closure publishes, with its exact split set. */
type ClosurePublication = {
  enrollmentId: string;
  registrationId: string;
  totalMs: number;
  splits: TimingLapSplit[];
};

/** What a closure publishes and what it reports for every other participant. */
type ClosurePlan = {
  publications: ClosurePublication[];
  report: TimingClosureReportRecord;
};

/** One workstation whose issued sequences lack a final receipt. */
type WorkstationReceiptGap = {
  workstationInstanceId: string;
  missingSequences: number[];
};

/** One running attempt whose outgoing workstation has receipt gaps. */
type CaptureReceiptGap = {
  attemptId: string;
  missingSequences: number[];
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
   * `POST /events/:eventId/timing/capture/take`: claim the one event-wide hold
   * explicitly (E-25, FR-53).
   *
   * Opening the surface, pressing Start and capturing never claim capture, so
   * this is the only route that takes it. The claim is a conditional insert: of
   * two simultaneous claims exactly one row is written and the other request
   * names the winner, so the surface can never show two capturing stations.
   *
   * AD-5 stale holder: a hold whose user no longer holds `REFEREE` or
   * `ADMINISTRATOR` is not a hold any more. It is released before the claim and
   * both the release and the take are audited, so a role removal that raced the
   * take still ends the old hold instead of blocking the new operator.
   */
  async takeCapture(
    authentikId: string | undefined,
    eventId: string,
    dto: TakeCaptureDto,
  ): Promise<TimingCaptureView> {
    await this.rolesService.assertHasAnyRole(
      authentikId,
      TIMING_OPERATE_ROLE_CODES,
    );
    await this.loadEvent(eventId);
    const workstationInstanceId = normalizeWorkstationInstanceId(
      dto.workstationInstanceId,
    );
    const actorUserId = await this.requireUserId(authentikId);

    const held = await this.repository.withTransaction(async (tx) => {
      const current = await this.repository.getCaptureLock(eventId, tx);
      if (current !== null) {
        // A repeated take from the same workstation is the same hold, not a
        // second claim and not a second audit row.
        if (current.workstationInstanceId === workstationInstanceId) {
          return current;
        }
        const holderRoles = await this.repository.findUserRoleCodes(
          current.heldByUserId,
          tx,
        );
        if (holdsTimingRole(holderRoles)) {
          throw captureHeldError(current);
        }
        await this.releaseStaleHolder(tx, current, actorUserId);
      }

      const claimed = await this.repository.claimCaptureLock(tx, {
        eventId,
        workstationInstanceId,
        heldByUserId: actorUserId,
      });
      if (claimed === null) {
        // The primary key decided the race inside `INSERT ... ON CONFLICT`.
        const winner = await this.repository.getCaptureLock(eventId, tx);
        if (
          winner !== null &&
          winner.workstationInstanceId === workstationInstanceId
        ) {
          return winner;
        }
        throw captureHeldError(winner);
      }
      await this.auditCaptureLock(tx, eventId, actorUserId, 'CAPTURE_TAKE', {
        oldValues: null,
        newValues: {
          workstationInstanceId,
          heldByUserId: actorUserId,
        },
        reason: null,
      });
      return claimed;
    });
    return toCaptureView(eventId, held);
  }

  /**
   * `POST /events/:eventId/timing/capture/transfer`: hand the event-wide hold
   * to another workstation voluntarily (E-28, FR-56).
   *
   * The outgoing workstation's captures must be fully receipted first: a
   * mutation that never reached the shared record would be stranded on a
   * station that no longer holds capture. Every running attempt of the event is
   * swept, because the hold covers all of them at once (AD-3, AD-5).
   *
   * `TransferCaptureDto` names only the target, so the outgoing workstation is
   * the one the lock row holds and the caller must be the user the lock names.
   * The move is one conditional update on the token that was read; a lost race
   * names the workstation that holds capture instead of overwriting it. The
   * receiving workstation opens its own clock epoch through the existing route.
   */
  async transferCapture(
    authentikId: string | undefined,
    eventId: string,
    dto: TransferCaptureDto,
  ): Promise<TimingCaptureView> {
    await this.rolesService.assertHasAnyRole(
      authentikId,
      TIMING_OPERATE_ROLE_CODES,
    );
    await this.loadEvent(eventId);
    const targetWorkstationInstanceId = normalizeWorkstationInstanceId(
      dto.toWorkstationInstanceId,
    );
    const actorUserId = await this.requireUserId(authentikId);

    const held = await this.repository.withTransaction(async (tx) => {
      const current = await this.repository.getCaptureLock(eventId, tx);
      if (current === null) {
        throw timingError(
          TimingErrorCode.CAPTURE_NOT_HELD,
          'No workstation holds capture for this event.',
          { eventId, workstationInstanceId: targetWorkstationInstanceId },
        );
      }
      if (current.heldByUserId !== actorUserId) {
        throw timingError(
          TimingErrorCode.CAPTURE_NOT_HELD,
          'Only the capture holder may hand capture over.',
          {
            workstationInstanceId: targetWorkstationInstanceId,
            holderWorkstationInstanceId: current.workstationInstanceId,
            holderUserId: current.heldByUserId,
          },
        );
      }
      if (current.workstationInstanceId === targetWorkstationInstanceId) {
        return current;
      }
      await this.assertOutgoingReceiptsConfirmed(
        tx,
        eventId,
        current.workstationInstanceId,
      );

      const transferred = await this.repository.transferCaptureLock(tx, {
        eventId,
        expectedLockToken: current.lockToken,
        workstationInstanceId: targetWorkstationInstanceId,
        heldByUserId: actorUserId,
      });
      if (transferred === null) {
        const winner = await this.repository.getCaptureLock(eventId, tx);
        if (
          winner !== null &&
          winner.workstationInstanceId === targetWorkstationInstanceId
        ) {
          return winner;
        }
        throw captureHeldError(winner);
      }
      await this.auditCaptureLock(
        tx,
        eventId,
        actorUserId,
        'CAPTURE_TRANSFER',
        {
          oldValues: captureLockAuditValues(current),
          newValues: {
            workstationInstanceId: targetWorkstationInstanceId,
            heldByUserId: actorUserId,
          },
          reason: null,
        },
      );
      return transferred;
    });
    return toCaptureView(eventId, held);
  }

  /**
   * `POST /events/:eventId/timing/capture/force-release`: an administrator ends
   * a hold whose workstation may be gone (E-28, F-28).
   *
   * The release is by the token the record currently holds, so a lost or
   * unreachable device does not have to cooperate. The possible loss of passes
   * that never reached the shared record is warned about by the surface; the
   * frozen `TimingCaptureView` gains no field for it, and this method returns
   * the view as it is after the release — nobody holds capture. Administrator
   * only: the method-level role is enforced here as well as on the route.
   */
  async forceReleaseCapture(
    authentikId: string | undefined,
    eventId: string,
    dto: ForceReleaseCaptureDto,
  ): Promise<TimingCaptureView> {
    await this.rolesService.assertHasAnyRole(authentikId, [
      RoleCode.ADMINISTRATOR,
    ]);
    const reason = normalizeReason(dto.reason);
    await this.loadEvent(eventId);
    const requestedWorkstationInstanceId = normalizeWorkstationInstanceId(
      dto.workstationInstanceId,
    );
    const actorUserId = await this.requireUserId(authentikId);

    const remaining = await this.repository.withTransaction(async (tx) => {
      const current = await this.repository.getCaptureLock(eventId, tx);
      if (current === null) {
        return null;
      }
      const released = await this.repository.releaseCaptureLock(tx, {
        eventId,
        lockToken: current.lockToken,
      });
      if (released === null) {
        // A transfer or another release changed the token between the read and
        // the delete. Nothing of this hold was released, and the response
        // reports whoever holds it now instead of claiming an empty surface.
        return this.repository.getCaptureLock(eventId, tx);
      }
      await this.auditCaptureLock(
        tx,
        eventId,
        actorUserId,
        'CAPTURE_FORCE_RELEASE',
        {
          oldValues: captureLockAuditValues(released),
          newValues: {
            releasedWorkstationInstanceId: released.workstationInstanceId,
            requestedWorkstationInstanceId,
            heldByUserId: released.heldByUserId,
          },
          reason,
        },
      );
      return null;
    });
    return toCaptureView(eventId, remaining);
  }

  /**
   * Ends the event-wide hold of one user because that user lost a timing role
   * (E-14, FR-10). Called by the role-removal route; it has no HTTP route of
   * its own.
   *
   * Nothing of the attempt moves: the start time, the passes and the pending
   * finishes stay exactly as they are, and another authorized workstation may
   * take capture and continue the same clock. A user without a hold is a no-op,
   * so a repeated removal stays idempotent. The releasing statement filters on
   * the holder, so a hold that changed hands before the removal is untouched.
   */
  async releaseCaptureForUser(userId: string): Promise<void> {
    await this.repository.withTransaction(async (tx) => {
      const released = await this.repository.releaseCaptureLocksForUser(
        tx,
        userId,
      );
      for (const lock of released) {
        await this.auditCaptureLock(
          tx,
          lock.eventId,
          null,
          'CAPTURE_RELEASE_ROLE_REMOVED',
          {
            oldValues: captureLockAuditValues(lock),
            newValues: {
              trigger: 'ROLE_REMOVED',
              heldByUserId: lock.heldByUserId,
            },
            reason: null,
          },
        );
      }
    });
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
   * `PATCH /events/:eventId/timing/passes/:passId/official-time`: move one
   * official instant and republish what it changes (E-15, E-16).
   *
   * A `PASS` correction returns the corrected pass. A `START` correction
   * returns the attempt reference — id, state and the corrected official start
   * — because the route addresses the attempt's start, not one pass; a caller
   * reads the attempt record for the shifted marks. Raw capture columns are
   * never part of the update.
   */
  async correctOfficialTime(
    authentikId: string | undefined,
    eventId: string,
    pathId: string,
    dto: CorrectOfficialTimeDto,
  ): Promise<TimingPassView | TimingAttemptRef> {
    await this.rolesService.assertHasAnyRole(authentikId, [
      RoleCode.ADMINISTRATOR,
    ]);
    if (dto.targetId !== pathId) {
      throw timingError(
        TimingErrorCode.INVALID_STATE,
        'The body addresses another target than the route.',
        { pathId, targetId: dto.targetId },
      );
    }
    const reason = normalizeReason(dto.reason);
    const officialAt = new Date(dto.officialAt);
    const actorUserId = await this.requireUserId(authentikId);
    if (dto.targetType === 'START') {
      return this.correctStartTime(
        actorUserId,
        eventId,
        dto.targetId,
        officialAt,
        reason,
      );
    }
    return this.correctPassTime(
      actorUserId,
      eventId,
      dto.targetId,
      officialAt,
      reason,
    );
  }

  /**
   * `POST /events/:eventId/timing/passes/:passId/cancel`: soft-cancel one bound
   * pass with a reason (E-10 analogue for a bound pass, F-17).
   *
   * The pass stays in the record as `CANCELLED` with no lap number, so the
   * remaining passes of its participant are renumbered 1..k by official instant.
   * Administrator only, no clock and no receipt.
   */
  async cancelPass(
    authentikId: string | undefined,
    eventId: string,
    passId: string,
    dto: CancelTimingPassDto,
  ): Promise<TimingPassView> {
    await this.rolesService.assertHasAnyRole(authentikId, [
      RoleCode.ADMINISTRATOR,
    ]);
    const reason = normalizeReason(dto.reason);
    // Refuse before opening the transaction; the pass is re-read under it.
    await this.loadPassContext(passId, eventId);
    const actorUserId = await this.requireUserId(authentikId);

    const cancelled = await this.repository.withTransaction(async (tx) => {
      const current = await this.loadPassContext(passId, eventId, tx);
      await this.assertTimingChangeAllowed(current.attempt, 'PASS_EDIT', tx);
      const updated = await this.repository.updateMark(tx, current.mark.id, {
        status: 'CANCELLED',
        lapNumber: null,
      });
      await this.renumberParticipantLaps(
        tx,
        current.attempt.id,
        current.enrollmentId,
      );
      await this.repository.insertAudit(tx, {
        attemptId: current.attempt.id,
        actorUserId,
        action: 'PASS_CANCEL',
        targetType: 'PASS',
        targetId: current.mark.id,
        oldValues: {
          status: current.mark.status,
          enrollmentId: current.enrollmentId,
          lapNumber: current.mark.lapNumber,
          officialAt: current.mark.officialAt.toISOString(),
          officialElapsedMs: current.mark.officialElapsedMs,
        },
        newValues: { status: 'CANCELLED', lapNumber: null },
        reason,
      });
      return updated;
    });
    return toPassView(cancelled);
  }

  /**
   * `POST /events/:eventId/timing/passes/:passId/rebind`: move one bound pass
   * to another frozen participant of the same running attempt (F-20, U-30).
   *
   * Both participants' lap numbers are rewritten in the same transaction, so a
   * failed rebind changes neither participant's laps. Administrator only, no
   * clock and no receipt.
   */
  async rebindPass(
    authentikId: string | undefined,
    eventId: string,
    passId: string,
    dto: RebindTimingPassDto,
  ): Promise<TimingPassView> {
    await this.rolesService.assertHasAnyRole(authentikId, [
      RoleCode.ADMINISTRATOR,
    ]);
    const reason = normalizeReason(dto.reason);
    await this.loadPassContext(passId, eventId);
    const actorUserId = await this.requireUserId(authentikId);

    return this.repository.withTransaction(async (tx) => {
      const current = await this.loadPassContext(passId, eventId, tx);
      await this.assertTimingChangeAllowed(current.attempt, 'PASS_EDIT', tx);
      if (dto.targetEnrollmentId === current.enrollmentId) {
        throw timingError(
          TimingErrorCode.INVALID_STATE,
          'The pass already belongs to that participant.',
          { passId, enrollmentId: current.enrollmentId },
        );
      }
      const target = await this.repository.findParticipant(
        current.attempt.id,
        dto.targetEnrollmentId,
        tx,
      );
      if (target === null) {
        throw timingError(
          TimingErrorCode.NOT_FOUND,
          'The enrollment is not a frozen participant of this attempt.',
          {
            attemptId: current.attempt.id,
            enrollmentId: dto.targetEnrollmentId,
          },
        );
      }
      const marks = await this.repository.listMarks(current.attempt.id, tx);
      // The moved pass belongs to the source participant until the update, so
      // the target count already answers "below N after the source pass leaves".
      assertCaptureEligible(target, boundPassCount(marks, target.enrollmentId));

      const moved = await this.repository.updateMark(tx, current.mark.id, {
        enrollmentId: target.enrollmentId,
        registrationId: target.registrationId,
        startNumber: target.startNumber,
      });
      await this.renumberParticipantLaps(
        tx,
        current.attempt.id,
        current.enrollmentId,
      );
      const destination = await this.renumberParticipantLaps(
        tx,
        current.attempt.id,
        target.enrollmentId,
      );
      const applied = destination.get(moved.id) ?? moved;
      await this.repository.insertAudit(tx, {
        attemptId: current.attempt.id,
        actorUserId,
        action: 'PASS_REBIND',
        targetType: 'PASS',
        targetId: current.mark.id,
        oldValues: {
          enrollmentId: current.enrollmentId,
          registrationId: current.mark.registrationId,
          startNumber: current.mark.startNumber,
          lapNumber: current.mark.lapNumber,
          officialAt: current.mark.officialAt.toISOString(),
          officialElapsedMs: current.mark.officialElapsedMs,
        },
        newValues: {
          enrollmentId: target.enrollmentId,
          registrationId: target.registrationId,
          startNumber: target.startNumber,
          lapNumber: applied.lapNumber,
        },
        reason,
      });
      return toPassView(applied);
    });
  }

  /**
   * `POST /events/:eventId/timing/attempts/:attemptId/complete`: the ordinary
   * closure (E-17, E-18).
   *
   * Closure is the capture holder's action, so the event-wide lock is checked
   * before the transaction and again inside it. Every gate is evaluated from
   * freshly read marks, receipts and roster rows inside the transaction, so a
   * mutation that lands between the check and the closure is still gated.
   */
  async completeAttempt(
    authentikId: string | undefined,
    eventId: string,
    attemptId: string,
    dto: CompleteTimingAttemptDto,
  ): Promise<TimingAttemptRecordView> {
    await this.rolesService.assertHasAnyRole(
      authentikId,
      TIMING_OPERATE_ROLE_CODES,
    );
    await this.loadRunningAttemptForEvent(attemptId, eventId);
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
    return this.closeAttempt({
      eventId,
      attemptId,
      actorUserId,
      status: 'COMPLETED',
      action: 'COMPLETE',
      reason: null,
      workstationInstanceId: dto.workstationInstanceId,
      lastIssuedSequence: dto.lastIssuedSequence,
      requireEveryParticipantAtN: true,
    });
  }

  /**
   * `POST /events/:eventId/timing/attempts/:attemptId/force-complete`: an
   * administrator closes a running attempt as `INCOMPLETE` (E-19).
   *
   * The resolution gates still hold — no unbound pending finish and every
   * issued mutation receipted — but the attempt closes without requiring N
   * passes. It writes no DNF, no synthetic pass and no invented time; only a
   * participant already holding exactly N passes is published.
   */
  async forceCompleteAttempt(
    authentikId: string | undefined,
    eventId: string,
    attemptId: string,
    dto: ForceCompleteTimingAttemptDto,
  ): Promise<TimingAttemptRecordView> {
    await this.rolesService.assertHasAnyRole(authentikId, [
      RoleCode.ADMINISTRATOR,
    ]);
    const reason = normalizeReason(dto.reason);
    await this.loadRunningAttemptForEvent(attemptId, eventId);
    const actorUserId = await this.requireUserId(authentikId);
    return this.closeAttempt({
      eventId,
      attemptId,
      actorUserId,
      status: 'INCOMPLETE',
      action: 'FORCE_COMPLETE',
      reason,
      workstationInstanceId: null,
      lastIssuedSequence: null,
      requireEveryParticipantAtN: false,
    });
  }

  /**
   * `POST /events/:eventId/timing/attempts/:attemptId/cancel`: an administrator
   * closes a running attempt as `CANCELLED` and publishes nothing (E-20).
   *
   * The start time, the passes and the history stay readable as
   * non-authoritative. The status change also frees the category for a new
   * attempt, because the partial unique index covers `RUNNING` only.
   */
  async cancelAttempt(
    authentikId: string | undefined,
    eventId: string,
    attemptId: string,
    dto: CancelTimingAttemptDto,
  ): Promise<TimingAttemptRecordView> {
    await this.rolesService.assertHasAnyRole(authentikId, [
      RoleCode.ADMINISTRATOR,
    ]);
    const reason = normalizeReason(dto.reason);
    await this.loadRunningAttemptForEvent(attemptId, eventId);
    const actorUserId = await this.requireUserId(authentikId);
    return this.closeAttempt({
      eventId,
      attemptId,
      actorUserId,
      status: 'CANCELLED',
      action: 'CANCEL_ATTEMPT',
      reason,
      workstationInstanceId: null,
      lastIssuedSequence: null,
      requireEveryParticipantAtN: false,
    });
  }

  /**
   * One bound pass of the event and the attempt it belongs to. The mark must be
   * a `PASS`; its state is read separately by the caller, so a correction after
   * closure can still address it while a cancellation cannot.
   */
  private async loadPassContext(
    passId: string,
    eventId: string,
    tx?: TimingTx,
  ): Promise<BoundPassContext> {
    const mark = await this.repository.findMark(passId, tx);
    if (mark === null) {
      throw timingError(TimingErrorCode.NOT_FOUND, 'Pass not found.', {
        passId,
      });
    }
    if (mark.kind !== 'PASS') {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'The addressed mark is not a pass.',
        { passId, kind: mark.kind },
      );
    }
    const attempt = await this.loadAttemptForEvent(mark.attemptId, eventId, tx);
    if (mark.status !== 'BOUND' || mark.enrollmentId === null) {
      throw timingError(
        TimingErrorCode.INVALID_STATE,
        'The pass is no longer a bound pass.',
        { passId, status: mark.status, enrollmentId: mark.enrollmentId },
      );
    }
    return { mark, enrollmentId: mark.enrollmentId, attempt };
  }

  /** One attempt that must belong to the addressed event. */
  private async loadAttemptForEvent(
    attemptId: string,
    eventId: string,
    tx?: TimingTx,
  ): Promise<TimingAttemptRow> {
    const attempt = await this.repository.findAttempt(attemptId, tx);
    if (attempt === null) {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'Timing attempt not found.',
        { attemptId },
      );
    }
    if (attempt.eventId !== eventId) {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'The timing attempt belongs to another event.',
        { attemptId, eventId },
      );
    }
    return attempt;
  }

  /**
   * One attempt that belongs to the addressed event and is still active. A
   * closure, like every other mutation, only accepts a `RUNNING` attempt.
   */
  private async loadRunningAttemptForEvent(
    attemptId: string,
    eventId: string,
    tx?: TimingTx,
  ): Promise<TimingAttemptRow> {
    const attempt = await this.loadAttemptForEvent(attemptId, eventId, tx);
    if (attempt.status !== 'RUNNING') {
      throw timingError(
        TimingErrorCode.ATTEMPT_CLOSED,
        'A closure requires a running attempt.',
        { attemptId, status: attempt.status },
      );
    }
    return attempt;
  }

  /** The event a capture-lock action addresses; a missing one is `NOT_FOUND`. */
  private async loadEvent(
    eventId: string,
    tx?: TimingTx,
  ): Promise<TimingEventRow> {
    const event = await this.repository.findEvent(eventId, tx);
    if (event === null) {
      throw timingError(TimingErrorCode.NOT_FOUND, 'Event not found.', {
        eventId,
      });
    }
    return event;
  }

  /**
   * AD-5: a hold whose user no longer holds a timing role is released before a
   * new workstation may claim it. The release is conditional on the token that
   * was read; a lost race leaves the fresh row to the claim, which then either
   * wins or names the new holder.
   */
  private async releaseStaleHolder(
    tx: TimingTx,
    lock: TimingCaptureLockRow,
    actorUserId: string,
  ): Promise<void> {
    const released = await this.repository.releaseCaptureLock(tx, {
      eventId: lock.eventId,
      lockToken: lock.lockToken,
    });
    if (released === null) {
      return;
    }
    await this.auditCaptureLock(
      tx,
      lock.eventId,
      actorUserId,
      'CAPTURE_RELEASE_ROLE_REMOVED',
      {
        oldValues: captureLockAuditValues(released),
        newValues: {
          trigger: 'STALE_HOLDER',
          heldByUserId: released.heldByUserId,
        },
        reason: null,
      },
    );
  }

  /**
   * E-28: no transfer while the outgoing workstation still has a capture
   * mutation without a final receipt. Each running attempt is swept, so a gap
   * in any of them blocks the move and names the missing sequences.
   */
  private async assertOutgoingReceiptsConfirmed(
    tx: TimingTx,
    eventId: string,
    workstationInstanceId: string,
  ): Promise<void> {
    const attemptIds = await this.repository.listRunningAttemptIds(eventId, tx);
    const gaps: CaptureReceiptGap[] = [];
    for (const attemptId of attemptIds) {
      const [marks, receipts] = await Promise.all([
        this.repository.listMarks(attemptId, tx),
        this.repository.listAttemptReceipts(attemptId, tx),
      ]);
      const missingSequences = missingReceiptSequences(
        marks,
        receipts,
        workstationInstanceId,
        0,
      );
      if (missingSequences.length > 0) {
        gaps.push({ attemptId, missingSequences });
      }
    }
    if (gaps.length === 0) {
      return;
    }
    throw timingError(
      TimingErrorCode.UNCONFIRMED_MUTATIONS,
      'The outgoing workstation still has captures without a final receipt.',
      {
        workstationInstanceId,
        attemptIds: gaps.map((gap) => gap.attemptId),
        missingSequences: [
          ...new Set(gaps.flatMap((gap) => gap.missingSequences)),
        ].sort((left, right) => left - right),
      },
    );
  }

  /**
   * One capture-lock change, audited on every running attempt of the event.
   *
   * `timing_audit` is session-scoped and the hold is event-wide, so the hold's
   * history lands on the attempts it actually covers. An event with no running
   * attempt has no session to attach the row to; its next Start press records
   * the workstation in the `START` audit instead.
   */
  private async auditCaptureLock(
    tx: TimingTx,
    eventId: string,
    actorUserId: string | null,
    action: string,
    values: {
      oldValues: Prisma.InputJsonValue | null;
      newValues: Prisma.InputJsonValue | null;
      reason: string | null;
    },
  ): Promise<void> {
    const attemptIds = await this.repository.listRunningAttemptIds(eventId, tx);
    for (const attemptId of attemptIds) {
      await this.repository.insertAudit(tx, {
        attemptId,
        actorUserId,
        action,
        targetType: 'CAPTURE_LOCK',
        targetId: eventId,
        oldValues: values.oldValues,
        newValues: values.newValues,
        reason: values.reason,
      });
    }
  }

  /**
   * E-15, E-16, F-17: the category finish and the attempt state refuse a
   * correction, a rebind or a cancellation before any write.
   */
  private async assertTimingChangeAllowed(
    attempt: TimingAttemptRow,
    change: 'CORRECTION' | 'PASS_EDIT',
    tx?: TimingTx,
  ): Promise<void> {
    const categoryFinished = await this.repository.isCategoryFinished(
      attempt.eventId,
      attempt.startId,
      attempt.formatId,
      attempt.gender,
      tx,
    );
    const context = {
      attemptStatus: attempt.status,
      categoryFinished,
    };
    const refusal =
      change === 'CORRECTION'
        ? canCorrectOfficialTime(context)
        : canRebindOrCancelPass(context);
    if (refusal === null) {
      return;
    }
    if (refusal === TimingErrorCode.CATEGORY_FINISHED) {
      throw timingError(refusal, CATEGORY_FINISHED_MESSAGE, {
        attemptId: attempt.id,
      });
    }
    if (refusal === TimingErrorCode.ATTEMPT_CLOSED) {
      throw timingError(
        refusal,
        'A pass rebind or a pass cancellation requires a running attempt.',
        { attemptId: attempt.id, status: attempt.status },
      );
    }
    throw timingError(
      refusal,
      'A cancelled attempt accepts no timing change.',
      {
        attemptId: attempt.id,
        status: attempt.status,
      },
    );
  }

  /** A `PASS` correction: one official instant, its lap order and publication. */
  private async correctPassTime(
    actorUserId: string,
    eventId: string,
    passId: string,
    officialAt: Date,
    reason: string,
  ): Promise<TimingPassView> {
    const { mark, attempt } = await this.loadPassContext(passId, eventId);
    await this.assertTimingChangeAllowed(attempt, 'CORRECTION');
    if (mark.enrollmentId === null) {
      throw timingError(
        TimingErrorCode.INVALID_STATE,
        'The pass names no participant.',
        { passId },
      );
    }
    const participant = await this.repository.findParticipant(
      attempt.id,
      mark.enrollmentId,
    );
    if (participant === null) {
      throw timingError(
        TimingErrorCode.NOT_FOUND,
        'The pass names no frozen participant of its attempt.',
        { passId, enrollmentId: mark.enrollmentId },
      );
    }

    return this.repository.withTransaction(async (tx) => {
      const current = await this.loadPassContext(passId, eventId, tx);
      await this.assertTimingChangeAllowed(current.attempt, 'CORRECTION', tx);
      assertWithinBounds(current.attempt.officialStartedAt, officialAt);
      const officialElapsedMs = resolveElapsedMs(
        officialAt,
        current.attempt.officialStartedAt,
      );
      const marks = await this.repository.listMarks(current.attempt.id, tx);
      const projected = marks.map((row) =>
        row.id === current.mark.id
          ? { ...row, officialAt, officialElapsedMs }
          : row,
      );
      // Publication only exists after closure; a running attempt republishes
      // nothing, because nothing of it is published yet.
      const plan =
        current.attempt.status === 'COMPLETED' ||
        current.attempt.status === 'INCOMPLETE'
          ? await this.planRepublish(
              tx,
              current.attempt,
              participant.enrollmentId,
              projected,
            )
          : null;

      const updated = await this.repository.updateMark(tx, current.mark.id, {
        officialAt,
        officialElapsedMs,
      });
      const applied = await this.reindexLaps(
        tx,
        current.attempt.id,
        participant.enrollmentId,
        marks,
        updated,
      );
      if (plan !== null) {
        await this.applyRepublish(tx, current.attempt.id, plan);
      }
      await this.repository.insertAudit(tx, {
        attemptId: current.attempt.id,
        actorUserId,
        action: 'OFFICIAL_TIME_CORRECT',
        targetType: 'PASS',
        targetId: current.mark.id,
        oldValues: {
          enrollmentId: current.mark.enrollmentId,
          officialAt: current.mark.officialAt.toISOString(),
          officialElapsedMs: current.mark.officialElapsedMs,
          lapNumber: current.mark.lapNumber,
        },
        newValues: {
          enrollmentId: current.mark.enrollmentId,
          officialAt: officialAt.toISOString(),
          officialElapsedMs,
          lapNumber: applied.lapNumber,
          republished: plan !== null,
        },
        reason,
      });
      return toPassView(applied);
    });
  }

  /**
   * A `START` correction: every mark of the attempt keeps its official instant
   * and gains the shifted elapsed value; no other attempt moves (E-16).
   */
  private async correctStartTime(
    actorUserId: string,
    eventId: string,
    attemptId: string,
    officialAt: Date,
    reason: string,
  ): Promise<TimingAttemptRef> {
    const attempt = await this.loadAttemptForEvent(attemptId, eventId);
    await this.assertTimingChangeAllowed(attempt, 'CORRECTION');
    const now = new Date();

    return this.repository.withTransaction(async (tx) => {
      const current = await this.loadAttemptForEvent(attemptId, eventId, tx);
      await this.assertTimingChangeAllowed(current, 'CORRECTION', tx);
      const marks = await this.repository.listMarks(current.id, tx);
      // F-15: a start that reaches a mark leaves an elapsed value at or below
      // zero. Every bound is checked before the first write.
      const projected = marks.map((mark) => {
        assertWithinBounds(officialAt, mark.officialAt);
        return {
          ...mark,
          officialElapsedMs: resolveElapsedMs(mark.officialAt, officialAt),
        };
      });
      const shiftedAttempt: TimingAttemptRow = {
        ...current,
        officialStartedAt: officialAt,
      };
      const participants = await this.repository.listParticipants(
        current.id,
        tx,
      );
      const plans: RepublishPlan[] = [];
      for (const participant of participants) {
        const plan = await this.planRepublish(
          tx,
          shiftedAttempt,
          participant.enrollmentId,
          projected,
        );
        if (plan !== null) {
          plans.push(plan);
        }
      }

      const updated = await this.repository.updateAttemptOfficialStart(
        tx,
        current.id,
        officialAt,
      );
      let changedMarkCount = 0;
      for (const [index, mark] of marks.entries()) {
        const next = projected[index];
        if (next.officialElapsedMs === mark.officialElapsedMs) {
          continue;
        }
        await this.repository.updateMark(tx, mark.id, {
          officialElapsedMs: next.officialElapsedMs,
        });
        changedMarkCount += 1;
      }
      // AD-2: a start correction re-anchors the running clock at the real
      // elapsed value. Without a capture holder there is no open epoch to
      // anchor, so any stale epoch is only closed.
      let epoch: TimingClockEpochRow | null = null;
      if (current.status === 'RUNNING') {
        const lock = await this.repository.getCaptureLock(eventId, tx);
        await this.repository.closeOpenEpochs(tx, current.id);
        if (lock !== null) {
          epoch = await this.repository.createClockEpoch(tx, {
            attemptId: current.id,
            workstationInstanceId: lock.workstationInstanceId,
            officialElapsedAnchorMs: Math.max(
              0,
              resolveElapsedMs(now, officialAt),
            ),
            openedByUserId: actorUserId,
            openedAt: now,
          });
        }
      }
      for (const plan of plans) {
        await this.applyRepublish(tx, current.id, plan);
      }
      await this.repository.insertAudit(tx, {
        attemptId: current.id,
        actorUserId,
        action: 'START_CORRECT',
        targetType: 'ATTEMPT',
        targetId: current.id,
        oldValues: {
          officialStartedAt: current.officialStartedAt.toISOString(),
        },
        newValues: {
          officialStartedAt: officialAt.toISOString(),
          changedMarkCount,
          clockEpochId: epoch?.id ?? null,
          officialElapsedAnchorMs: epoch?.officialElapsedAnchorMs ?? null,
          republishedEnrollmentIds: plans.map((plan) => plan.enrollmentId),
        },
        reason,
      });
      return toAttemptRef(updated);
    });
  }

  /**
   * The publication a correction republishes. A result is timing-owned only
   * when it names this attempt as `timingSessionId`; a hand-entered result or a
   * result of another attempt is never overwritten.
   */
  private async planRepublish(
    tx: TimingTx,
    attempt: TimingAttemptRow,
    enrollmentId: string,
    marks: readonly TimingMarkRow[],
  ): Promise<RepublishPlan | null> {
    const result = await this.repository.findResultByEnrollment(
      enrollmentId,
      tx,
    );
    if (
      result === null ||
      result.timingSessionId !== attempt.id ||
      result.outcome !== 'FINISHED'
    ) {
      return null;
    }
    const passes = marks
      .filter(
        (mark) =>
          mark.status === 'BOUND' &&
          mark.kind === 'PASS' &&
          mark.enrollmentId === enrollmentId,
      )
      .map((mark) => ({ passId: mark.id, officialAt: mark.officialAt }));
    if (passes.length === 0) {
      return null;
    }
    const splits = computeSplits(attempt.officialStartedAt, passes);
    return {
      enrollmentId,
      registrationId: result.registrationId,
      totalMs: splits[splits.length - 1].cumulativeMs,
      splits,
    };
  }

  /** Rewrites a timing-owned result with the corrected total and split set. */
  private async applyRepublish(
    tx: TimingTx,
    attemptId: string,
    plan: RepublishPlan,
  ): Promise<void> {
    const published = await this.repository.publishResult(tx, {
      enrollmentId: plan.enrollmentId,
      registrationId: plan.registrationId,
      outcome: 'FINISHED',
      timeMilliseconds: plan.totalMs,
      timingSessionId: attemptId,
    });
    await this.repository.replaceResultSplits(tx, published.id, plan.splits);
  }

  /**
   * One closure, in one transaction: the resolution gates, the publication of
   * every eligible result with its split set, the state change, the closure
   * report, the capture-lock release and the audit row.
   *
   * A refusal or a failed write throws out of the transaction, so PostgreSQL
   * rolls back all of it: the attempt stays `RUNNING`, no participant gains a
   * result or a split and the lock is still held (U-20, F-19).
   */
  private async closeAttempt(
    input: ClosureInput,
  ): Promise<TimingAttemptRecordView> {
    return this.repository.withTransaction(async (tx) => {
      const current = await this.loadRunningAttemptForEvent(
        input.attemptId,
        input.eventId,
        tx,
      );
      const participants = await this.repository.listParticipants(
        input.attemptId,
        tx,
      );
      const marks = await this.repository.listMarks(input.attemptId, tx);
      const pendingFinishes = await this.repository.listPendingFinishes(
        input.attemptId,
        tx,
      );
      const statuses = await this.repository.listEnrollmentStatuses(
        participants
          .filter((participant) => participant.excludedReason === null)
          .map((participant) => participant.enrollmentId),
        tx,
      );
      await this.assertClosureGates(
        tx,
        current,
        participants,
        marks,
        pendingFinishes,
        statuses,
        input,
      );
      const plan = await this.planClosure(
        tx,
        current,
        participants,
        marks,
        statuses,
        input.status !== 'CANCELLED',
      );

      for (const publication of plan.publications) {
        const published = await this.repository.publishResult(tx, {
          enrollmentId: publication.enrollmentId,
          registrationId: publication.registrationId,
          outcome: 'FINISHED',
          timeMilliseconds: publication.totalMs,
          timingSessionId: current.id,
        });
        await this.repository.replaceResultSplits(
          tx,
          published.id,
          publication.splits,
        );
      }

      const closedAt = new Date();
      const closed = await this.repository.updateAttemptStatus(tx, current.id, {
        status: input.status,
        closedAt,
        closedByUserId: input.actorUserId,
        closureReport: plan.report,
      });
      await this.releaseClosureLock(tx, input);
      await this.repository.insertAudit(tx, {
        attemptId: current.id,
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: 'ATTEMPT',
        targetId: current.id,
        oldValues: { status: current.status },
        newValues: {
          status: input.status,
          closureReport: plan.report,
        },
        reason: input.reason,
      });

      const [publishedResults, audit] = await Promise.all([
        this.repository.listPublishedResults(current.id, tx),
        this.repository.listAudit(current.id, tx),
      ]);
      return {
        attemptId: closed.id,
        state: closed.status,
        officialStartedAt: closed.officialStartedAt.toISOString(),
        passes: this.toOrderedPassViews(marks),
        pendingFinishes: pendingFinishes.map((mark) => toPassView(mark)),
        closureReport: closed.closureReport,
        publishedResults: publishedResults.map((row) =>
          toPublishedResultView(row),
        ),
        audit: audit.map(toAuditView),
      };
    });
  }

  /**
   * The three closure gates in the surface's order: an unbound pending finish,
   * an issued sequence without a final receipt, then a participant below N.
   * Force-completion and cancellation skip the third gate only.
   */
  private async assertClosureGates(
    tx: TimingTx,
    attempt: TimingAttemptRow,
    participants: readonly TimingParticipantRow[],
    marks: readonly TimingMarkRow[],
    pendingFinishes: readonly TimingMarkRow[],
    statuses: ReadonlyMap<string, EnrollmentStatus>,
    input: ClosureInput,
  ): Promise<void> {
    const receipts = await this.repository.listAttemptReceipts(attempt.id, tx);
    const coverage = closureReceiptCoverage(marks, receipts, input);
    const below = input.requireEveryParticipantAtN
      ? participants.filter(
          (participant) =>
            isGateParticipant(participant, statuses) &&
            boundPassCount(marks, participant.enrollmentId) !==
              participant.requiredLaps,
        )
      : [];
    const refusal = canComplete({
      pendingFinishCount: pendingFinishes.length,
      unconfirmedMutationCount: coverage.missingSequences.length,
      participantsBelowRequiredLaps: below.length,
    });
    if (refusal === null) {
      return;
    }
    if (refusal === TimingErrorCode.PENDING_REMAINS) {
      throw timingError(
        TimingErrorCode.PENDING_REMAINS,
        'An unbound pending finish still blocks closure.',
        {
          attemptId: attempt.id,
          pendingFinishIds: pendingFinishes.map((mark) => mark.id),
        },
      );
    }
    if (refusal === TimingErrorCode.UNCONFIRMED_MUTATIONS) {
      throw timingError(
        TimingErrorCode.UNCONFIRMED_MUTATIONS,
        'Unconfirmed workstation mutations block closure.',
        {
          attemptId: attempt.id,
          missingSequences: coverage.missingSequences,
          workstations: coverage.workstations,
        },
      );
    }
    throw timingError(
      TimingErrorCode.PARTICIPANTS_BELOW_LAPS,
      'Every participant must hold N passes to complete.',
      {
        attemptId: attempt.id,
        participants: below.map((participant) => ({
          enrollmentId: participant.enrollmentId,
          registrationId: participant.registrationId,
          startNumber: participant.startNumber,
          passCount: boundPassCount(marks, participant.enrollmentId),
          requiredLaps: participant.requiredLaps,
        })),
      },
    );
  }

  /**
   * The publication set of one closure. A cancellation publishes nothing; a
   * completed or forced attempt publishes every non-excluded participant that
   * holds exactly N passes, unless the enrollment was withdrawn or already
   * carries another outcome, which is reported instead of overwritten (F-21,
   * F-30, U-10).
   */
  private async planClosure(
    tx: TimingTx,
    attempt: TimingAttemptRow,
    participants: readonly TimingParticipantRow[],
    marks: readonly TimingMarkRow[],
    statuses: ReadonlyMap<string, EnrollmentStatus>,
    publish: boolean,
  ): Promise<ClosurePlan> {
    const publishedEnrollmentIds: string[] = [];
    const unpublishedEnrollmentIds: string[] = [];
    const conflictEnrollmentIds: string[] = [];
    const publications: ClosurePublication[] = [];
    if (!publish) {
      return {
        publications,
        report: {
          publishedEnrollmentIds,
          unpublishedEnrollmentIds: participants.map(
            (participant) => participant.enrollmentId,
          ),
          conflictEnrollmentIds,
        },
      };
    }

    const eligible = new Set(
      participants
        .filter(
          (participant) =>
            isGateParticipant(participant, statuses) &&
            boundPassCount(marks, participant.enrollmentId) ===
              participant.requiredLaps,
        )
        .map((participant) => participant.enrollmentId),
    );
    for (const participant of participants) {
      if (!eligible.has(participant.enrollmentId)) {
        unpublishedEnrollmentIds.push(participant.enrollmentId);
        continue;
      }
      const existing = await this.repository.findResultByEnrollment(
        participant.enrollmentId,
        tx,
      );
      if (
        existing !== null &&
        existing.outcome !== null &&
        existing.timingSessionId !== attempt.id
      ) {
        conflictEnrollmentIds.push(participant.enrollmentId);
        continue;
      }
      publications.push({
        enrollmentId: participant.enrollmentId,
        registrationId: participant.registrationId,
        ...participantPublication(attempt, participant, marks),
      });
      publishedEnrollmentIds.push(participant.enrollmentId);
    }
    return {
      publications,
      report: {
        publishedEnrollmentIds,
        unpublishedEnrollmentIds,
        conflictEnrollmentIds,
      },
    };
  }

  /**
   * Releases the one event-wide capture hold inside the closure transaction.
   * Ordinary completion releases only the hold the completing workstation still
   * owns; an administrative closure releases whatever hold exists.
   */
  private async releaseClosureLock(
    tx: TimingTx,
    input: ClosureInput,
  ): Promise<void> {
    const lock = await this.repository.getCaptureLock(input.eventId, tx);
    if (lock === null) {
      return;
    }
    if (
      input.status === 'COMPLETED' &&
      lock.workstationInstanceId !== input.workstationInstanceId
    ) {
      throw timingError(
        TimingErrorCode.CAPTURE_NOT_HELD,
        'This workstation does not hold capture.',
        {
          workstationInstanceId: input.workstationInstanceId,
          holderWorkstationInstanceId: lock.workstationInstanceId,
        },
      );
    }
    await this.repository.releaseCaptureLock(tx, {
      eventId: input.eventId,
      lockToken: lock.lockToken,
    });
  }

  /** Rewrites one participant's bound lap numbers in official-instant order. */
  private async renumberParticipantLaps(
    tx: TimingTx,
    attemptId: string,
    enrollmentId: string,
  ): Promise<Map<string, TimingMarkRow>> {
    const marks = await this.repository.listParticipantMarks(
      attemptId,
      enrollmentId,
      tx,
    );
    const passes = new Map<string, TimingMarkRow>();
    for (const mark of marks) {
      if (mark.status === 'BOUND') {
        passes.set(mark.id, mark);
      }
    }
    return this.writeLapNumbers(tx, passes);
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
 * Whether a frozen participant takes part in a closure gate and publication:
 * it was not excluded at the freeze and its enrollment is still `REGISTERED`.
 * A withdrawn or missing enrollment row is neither gated nor published (S-08).
 */
function isGateParticipant(
  participant: TimingParticipantRow,
  statuses: ReadonlyMap<string, EnrollmentStatus>,
): boolean {
  return (
    participant.excludedReason === null &&
    statuses.get(participant.enrollmentId) === 'REGISTERED'
  );
}

/**
 * The publication of one participant that holds exactly N passes: the total is
 * the elapsed value of the N-th pass and the splits are the N lap times in
 * official-instant order, so the last cumulative value equals the total
 * (U-11, U-12, U-15).
 */
function participantPublication(
  attempt: TimingAttemptRow,
  participant: TimingParticipantRow,
  marks: readonly TimingMarkRow[],
): { totalMs: number; splits: TimingLapSplit[] } {
  const passes = marks
    .filter(
      (mark) =>
        mark.status === 'BOUND' &&
        mark.enrollmentId === participant.enrollmentId,
    )
    .map((mark) => ({ passId: mark.id, officialAt: mark.officialAt }));
  const splits = computeSplits(attempt.officialStartedAt, passes);
  if (splits.length !== participant.requiredLaps) {
    throw timingError(
      TimingErrorCode.INVALID_STATE,
      'A published participant must hold exactly N passes.',
      {
        enrollmentId: participant.enrollmentId,
        passCount: splits.length,
        requiredLaps: participant.requiredLaps,
      },
    );
  }
  return { totalMs: splits[splits.length - 1].cumulativeMs, splits };
}

/**
 * The sequences of one workstation that have no final receipt. The ceiling is
 * the higher of the caller's `lastIssuedSequence` and the highest sequence the
 * shared record already holds, so a stale or dishonest client count can never
 * hide an issued mutation (AD-3).
 */
function missingReceiptSequences(
  marks: readonly TimingMarkRow[],
  receipts: readonly TimingReceiptRow[],
  workstationInstanceId: string,
  lastIssuedSequence: number,
): number[] {
  const covered = new Set(
    receipts
      .filter(
        (receipt) => receipt.workstationInstanceId === workstationInstanceId,
      )
      .map((receipt) => receipt.deviceSequence),
  );
  let highest = Math.max(0, lastIssuedSequence);
  for (const mark of marks) {
    if (mark.workstationInstanceId !== workstationInstanceId) continue;
    if (mark.deviceSequence !== null && mark.deviceSequence > highest) {
      highest = mark.deviceSequence;
    }
  }
  const missing: number[] = [];
  for (let sequence = 1; sequence <= highest; sequence += 1) {
    if (!covered.has(sequence)) {
      missing.push(sequence);
    }
  }
  return missing;
}

/**
 * The receipted sequence coverage of a closure. Ordinary completion checks the
 * completing workstation only; an administrative closure checks every
 * workstation that captured in the attempt. Every contiguous run from 1 to the
 * highest issued sequence must have a receipt.
 */
function closureReceiptCoverage(
  marks: readonly TimingMarkRow[],
  receipts: readonly TimingReceiptRow[],
  input: Pick<ClosureInput, 'workstationInstanceId' | 'lastIssuedSequence'>,
): { missingSequences: number[]; workstations: WorkstationReceiptGap[] } {
  const workstations =
    input.workstationInstanceId === null
      ? [
          ...new Set([
            ...marks.map((mark) => mark.workstationInstanceId),
            ...receipts.map((receipt) => receipt.workstationInstanceId),
          ]),
        ].sort()
      : [input.workstationInstanceId];
  const gaps: WorkstationReceiptGap[] = [];
  for (const workstationInstanceId of workstations) {
    const missingSequences = missingReceiptSequences(
      marks,
      receipts,
      workstationInstanceId,
      workstationInstanceId === input.workstationInstanceId
        ? (input.lastIssuedSequence ?? 0)
        : 0,
    );
    if (missingSequences.length > 0) {
      gaps.push({ workstationInstanceId, missingSequences });
    }
  }
  const missingSequences = [
    ...new Set(gaps.flatMap((gap) => gap.missingSequences)),
  ].sort((left, right) => left - right);
  return { missingSequences, workstations: gaps };
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

/** Whether a user's current role set still permits holding capture (AD-6). */
function holdsTimingRole(roleCodes: readonly string[]): boolean {
  return TIMING_OPERATE_ROLE_CODES.some((code) => roleCodes.includes(code));
}

/**
 * A workstation id is an opaque client value; the only normalization is the
 * trim that keeps a padded copy from becoming a second station. A blank one can
 * never match a hold or open an epoch, so it is refused instead of stored.
 */
function normalizeWorkstationInstanceId(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw timingError(
      TimingErrorCode.INVALID_STATE,
      'The workstation instance id is blank.',
    );
  }
  return normalized;
}

/** The one refusal of a claim or a transfer that lost to another station. */
function captureHeldError(
  lock: TimingCaptureLockRow | null,
): TimingDomainError {
  return timingError(
    TimingErrorCode.CAPTURE_HELD,
    'Another workstation holds capture for this event.',
    {
      holderWorkstationInstanceId: lock?.workstationInstanceId ?? null,
      holderUserId: lock?.heldByUserId ?? null,
    },
  );
}

/** The old values of a capture-lock audit row: who held it and since when. */
function captureLockAuditValues(lock: TimingCaptureLockRow): {
  workstationInstanceId: string;
  heldByUserId: string;
  heldAt: string;
} {
  return {
    workstationInstanceId: lock.workstationInstanceId,
    heldByUserId: lock.heldByUserId,
    heldAt: lock.acquiredAt.toISOString(),
  };
}

/** The frozen capture view of the hold as it stands after the action. */
function toCaptureView(
  eventId: string,
  lock: TimingCaptureLockRow | null,
): TimingCaptureView {
  return {
    eventId,
    workstationInstanceId: lock?.workstationInstanceId ?? null,
    heldByUserId: lock?.heldByUserId ?? null,
    heldAt: lock === null ? null : lock.acquiredAt.toISOString(),
  };
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
