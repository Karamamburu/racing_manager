import { Injectable } from '@nestjs/common';
import type { ResultOutcome } from '../../generated/prisma';
import { TIMING_OPERATE_ROLE_CODES } from '../auth/role-codes';
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
  canStartAttempt,
  classifyParticipantState,
  nextAttemptNumber,
  orderByOfficialInstant,
  resolveElapsedMs,
  TIMING_MAX_TOTAL_MS,
} from './timing.domain';
import type { OpenClockEpochDto, StartTimingAttemptDto } from './timing.dto';
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
  type TimingClassCompetitionRow,
  type TimingClockEpochRow,
  type TimingEnrollmentRow,
  type TimingEventRow,
  type TimingMarkRow,
  type TimingParticipantInput,
  type TimingParticipantRosterRow,
  type TimingPublishedResultRow,
  type TimingStartRow,
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
 * MANUAL-TIMING read surface, Start press, attempt record and clock epoch.
 *
 * The service owns every refusal: it loads the event-wide facts the rules read,
 * asks the pure domain helpers, and only then writes. A refused Start press
 * creates nothing, so there is no "prepared" attempt.
 *
 * Capture, corrections, closure, the lock lifecycle and the role grant belong to
 * later waves and are not implemented here.
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
