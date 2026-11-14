import { ForbiddenException } from '@nestjs/common';
import { TIMING_OPERATE_ROLE_CODES, RoleCode } from '../auth/role-codes';
import type { RolesService } from '../auth/roles.service';
import type {
  ClassCompetitionView,
  ClassCompetitionsService,
} from '../class-competitions/class-competitions.service';
import type { EnrollmentStatus } from '../../generated/prisma';
import type { AnonymousSplitService } from './anonymous-split.service';
import { TIMING_MAX_TOTAL_MS, type TimingLapSplit } from './timing.domain';
import type {
  BindPendingFinishDto,
  CaptureTimingPassDto,
  CancelPendingFinishDto,
  CancelTimingAttemptDto,
  CancelTimingPassDto,
  CompleteTimingAttemptDto,
  CorrectOfficialTimeDto,
  ForceCompleteTimingAttemptDto,
  ForceReleaseCaptureDto,
  QuickUndoTimingPassDto,
  RebindTimingPassDto,
  StartHeatAttemptDto,
  TakeCaptureDto,
  TransferCaptureDto,
} from './timing.dto';
import { TimingErrorCode, TimingDomainError } from './timing.errors';
import type {
  ClaimCaptureLockInput,
  CreateAnonymousSplitInput,
  CreateAttemptInput,
  CreateClockEpochInput,
  CreateHeatTimeInput,
  CreateMarkInput,
  CreateReceiptInput,
  CreateRejectedReceiptInput,
  InsertAuditInput,
  PublishResultInput,
  ReleaseCaptureLockInput,
  TimingAgeCategoryRow,
  TimingAgeSectionRow,
  TimingAttemptRow,
  TimingAuditRow,
  TimingCaptureLockRow,
  TimingClassCompetitionRow,
  TimingClockEpochRow,
  TimingClosureReportRecord,
  TimingEnrollmentRow,
  TimingEventRow,
  TimingEventSplitRow,
  TimingFormatRow,
  TimingHeatRosterEnrollmentRow,
  TimingHeatTimeRow,
  TimingMarkRow,
  TimingAnonymousSplitRow,
  TimingParticipantRosterRow,
  TimingParticipantRow,
  TimingPublishedResultRow,
  TimingReceiptRow,
  TimingResultRow,
  TimingRoutingCandidateRow,
  TimingStartRow,
  TransferCaptureLockInput,
  UpdateAttemptStatusInput,
  UpdateMarkInput,
} from './timing.repository';
import { TimingRepository } from './timing.repository';
import { TimingService } from './timing.service';
import type {
  TimingAnonymousSplitView,
  TimingClosureReportView,
  TimingPassView,
} from './timing.views';

/**
 * Unit tests for the timing surface, the Start press, number/tile capture, the
 * clock epoch and the attempt record. Every repository call is a fake: no
 * Prisma, no database, no HTTP. The rules themselves stay in `timing.domain.ts`
 * and are covered there.
 */

const EVENT_ID = 'event-a';
const START_A = 'start-a';
const START_B = 'start-b';
const NOW = new Date('2026-06-01T10:00:00.000Z');
const USER_ID = 'user-a';
const WORKSTATION = 'workstation-a';
const ATTEMPT_ID = 'attempt-1';
/** The opaque transaction scope the fake hands to a write. */
const TX = { transaction: 'tx' };

type RepositoryFake = ReturnType<typeof createRepositoryFake>;

function createRepositoryFake() {
  return {
    withTransaction: jest.fn(
      (run: (tx: unknown) => Promise<unknown>): Promise<unknown> => run(TX),
    ),
    lockCategory: jest.fn((): Promise<void> => Promise.resolve()),
    findEvent: jest.fn(
      (): Promise<TimingEventRow | null> => Promise.resolve(null),
    ),
    findUserIdByAuthentikId: jest.fn(
      (): Promise<string | null> => Promise.resolve(USER_ID),
    ),
    listStarts: jest.fn((): Promise<TimingStartRow[]> => Promise.resolve([])),
    listFormats: jest.fn((): Promise<TimingFormatRow[]> => Promise.resolve([])),
    listEnrollmentRows: jest.fn(
      (): Promise<TimingEnrollmentRow[]> => Promise.resolve([]),
    ),
    listAgeCategories: jest.fn(
      (): Promise<TimingAgeCategoryRow[]> => Promise.resolve([]),
    ),
    listLegacyAgeSections: jest.fn(
      (): Promise<TimingAgeSectionRow[]> => Promise.resolve([]),
    ),
    listClassCompetitions: jest.fn(
      (): Promise<TimingClassCompetitionRow[]> => Promise.resolve([]),
    ),
    isCategoryFinished: jest.fn((): Promise<boolean> => Promise.resolve(false)),
    findAttempt: jest.fn(
      (): Promise<TimingAttemptRow | null> => Promise.resolve(null),
    ),
    findAttemptsForCategory: jest.fn(
      (): Promise<TimingAttemptRow[]> => Promise.resolve([]),
    ),
    findHeatAttempts: jest.fn(
      (): Promise<TimingAttemptRow[]> => Promise.resolve([]),
    ),
    findRunningHeatAttempt: jest.fn(
      (): Promise<TimingAttemptRow | null> => Promise.resolve(null),
    ),
    findAttemptsForRace: jest.fn(
      (): Promise<TimingAttemptRow[]> => Promise.resolve([]),
    ),
    listEnrollmentsForRegistrations: jest.fn(
      (): Promise<TimingHeatRosterEnrollmentRow[]> => Promise.resolve([]),
    ),
    listHeatTimesForHeat: jest.fn(
      (): Promise<TimingHeatTimeRow[]> => Promise.resolve([]),
    ),
    listAnonymousSplits: jest.fn(
      (): Promise<TimingAnonymousSplitRow[]> => Promise.resolve([]),
    ),
    listQueuedEventSplits: jest.fn(
      (): Promise<TimingEventSplitRow[]> => Promise.resolve([]),
    ),
    findEventSplit: jest.fn((): Promise<TimingEventSplitRow | null> => Promise.resolve(null)),
    listBlockingEventSplitsForAttempt: jest.fn(
      (): Promise<TimingEventSplitRow[]> => Promise.resolve([]),
    ),
    assignEventSplit: jest.fn(),
    findRegistrationsByStartNumber: jest.fn(),
    listEnrollmentsForRegistration: jest.fn(),
    findLatestAttemptNumber: jest.fn((): Promise<number> => Promise.resolve(0)),
    createAttempt: jest.fn(),
    listParticipantRoster: jest.fn(
      (): Promise<TimingParticipantRosterRow[]> => Promise.resolve([]),
    ),
    findParticipant: jest.fn<
      Promise<TimingParticipantRow | null>,
      [string, string]
    >(() => Promise.resolve(null)),
    findParticipantByStartNumber: jest.fn<
      Promise<TimingParticipantRow | null>,
      [string, number]
    >(() => Promise.resolve(null)),
    findRoutingCandidates: jest.fn(
      (): Promise<TimingRoutingCandidateRow[]> => Promise.resolve([]),
    ),
    existsStartNumber: jest.fn((): Promise<boolean> => Promise.resolve(false)),
    listMarks: jest.fn((): Promise<TimingMarkRow[]> => Promise.resolve([])),
    findMark: jest.fn<Promise<TimingMarkRow | null>, [string]>(() =>
      Promise.resolve(null),
    ),
    listPendingFinishes: jest.fn(
      (): Promise<TimingMarkRow[]> => Promise.resolve([]),
    ),
    listPublishedResults: jest.fn(
      (): Promise<TimingPublishedResultRow[]> => Promise.resolve([]),
    ),
    listAudit: jest.fn((): Promise<TimingAuditRow[]> => Promise.resolve([])),
    listParticipants: jest.fn(
      (): Promise<TimingParticipantRow[]> => Promise.resolve([]),
    ),
    listParticipantMarks: jest.fn<Promise<TimingMarkRow[]>, [string, string]>(
      () => Promise.resolve([]),
    ),
    findResultByEnrollment: jest.fn<Promise<TimingResultRow | null>, [string]>(
      () => Promise.resolve(null),
    ),
    publishResult: jest.fn(),
    replaceResultSplits: jest.fn(),
    createHeatTime: jest.fn(),
    createHeatLapTime: jest.fn(),
    listEventLaps: jest.fn((): Promise<Array<{ eventLapId: string; lapNumber: number }>> => Promise.resolve([])),
    updateAttemptStatus: jest.fn(),
    listEnrollmentStatuses: jest.fn(
      (
        enrollmentIds: readonly string[],
      ): Promise<Map<string, EnrollmentStatus>> =>
        Promise.resolve(
          new Map(
            enrollmentIds.map(
              (enrollmentId) => [enrollmentId, 'REGISTERED'] as const,
            ),
          ),
        ),
    ),
    listAttemptReceipts: jest.fn(
      (): Promise<TimingReceiptRow[]> => Promise.resolve([]),
    ),
    releaseCaptureLock: jest.fn(
      (): Promise<TimingCaptureLockRow | null> => Promise.resolve(null),
    ),
    releaseCaptureLocksForUser: jest.fn(
      (): Promise<TimingCaptureLockRow[]> => Promise.resolve([]),
    ),
    claimCaptureLock: jest.fn(
      (): Promise<TimingCaptureLockRow | null> => Promise.resolve(null),
    ),
    transferCaptureLock: jest.fn(
      (): Promise<TimingCaptureLockRow | null> => Promise.resolve(null),
    ),
    findUserRoleCodes: jest.fn(
      (): Promise<string[]> => Promise.resolve([RoleCode.REFEREE]),
    ),
    listRunningAttemptIds: jest.fn(
      (): Promise<string[]> => Promise.resolve([]),
    ),
    getCaptureLock: jest.fn(
      (): Promise<TimingCaptureLockRow | null> => Promise.resolve(null),
    ),
    createClockEpoch: jest.fn(),
    findOpenEpoch: jest.fn(
      (): Promise<TimingClockEpochRow | null> => Promise.resolve(null),
    ),
    closeOpenEpochs: jest.fn((): Promise<number> => Promise.resolve(0)),
    createMark: jest.fn(),
    createAnonymousSplit: jest.fn(),
    updateMark: jest.fn(),
    updateAttemptOfficialStart: jest.fn(),
    findReceipt: jest.fn(
      (): Promise<TimingReceiptRow | null> => Promise.resolve(null),
    ),
    createReceipt: jest.fn(),
    createRejectedReceipt: jest.fn(
      (
        _tx: unknown,
        input: CreateRejectedReceiptInput,
      ): Promise<TimingReceiptRow> =>
        Promise.resolve({
          attemptId: input.attemptId,
          workstationInstanceId: input.workstationInstanceId,
          deviceSequence: input.deviceSequence,
          status: 'REJECTED',
          reason: input.reason,
          createdAt: NOW,
        }),
    ),
    insertAudit: jest.fn(),
  };
}

function createRolesFake() {
  return { assertHasAnyRole: jest.fn((): Promise<void> => Promise.resolve()) };
}

function createClassCompetitionsFake() {
  return {
    list: jest.fn((): Promise<ClassCompetitionView[]> => Promise.resolve([])),
  };
}

function createAnonymousSplitFake() {
  return {
    listQueue: jest.fn(
      (): Promise<TimingAnonymousSplitView[]> => Promise.resolve([]),
    ),
  };
}

/** One recorded call of a `jest.fn()`, typed at the assertion site. */
function callArguments<A extends readonly unknown[]>(
  mock: jest.Mock,
  call = 0,
): A {
  return mock.mock.calls[call] as A;
}

function eventRow(overrides: Partial<TimingEventRow> = {}): TimingEventRow {
  return {
    id: EVENT_ID,
    status: 'IN_PROGRESS',
    // June is before the 1 July season boundary, so the control year is 2026.
    eventDate: new Date('2026-06-01T07:00:00.000Z'),
    ...overrides,
  };
}

function startRow(
  overrides: Partial<TimingStartRow> & Pick<TimingStartRow, 'id'>,
): TimingStartRow {
  return {
    purposeType: 'CUP_RACE',
    lapCount: 3,
    lapLengthMeters: 2000,
    displayName: null,
    sortOrder: 1,
    formatIds: [1],
    ...overrides,
  };
}

function formatRow(id: number, sortOrder: number): TimingFormatRow {
  return { id, sortOrder };
}

function enrollmentRow(
  overrides: Partial<TimingEnrollmentRow> &
    Pick<TimingEnrollmentRow, 'enrollmentId'>,
): TimingEnrollmentRow {
  return {
    eventId: EVENT_ID,
    startId: START_A,
    formatId: 1,
    enrollmentStatus: 'REGISTERED',
    registrationId: `registration-${overrides.enrollmentId}`,
    userId: null,
    firstName: 'Иван',
    lastName: 'Петров',
    gender: 'M',
    birthYear: 2000,
    startNumber: 10,
    registrationStatus: 'CONFIRMED',
    note: null,
    registeredAt: new Date('2026-05-01T10:00:00.000Z'),
    result: null,
    ...overrides,
  };
}

function attemptRow(
  overrides: Partial<TimingAttemptRow> & Pick<TimingAttemptRow, 'id'>,
): TimingAttemptRow {
  return {
    eventId: EVENT_ID,
    startId: START_A,
    formatId: 1,
    gender: 'M',
    attemptNumber: 1,
    attemptKind: 'CATEGORY',
    classCompetitionId: null,
    stageId: null,
    heatNumber: null,
    status: 'RUNNING',
    officialStartedAt: NOW,
    clientStartedAt: NOW,
    startedByUserId: USER_ID,
    closedAt: null,
    closedByUserId: null,
    closureReport: null,
    participantCount: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** One `HEAT` attempt of a race, stage and heat, ready to close (AD-14). */
function heatAttemptRow(
  overrides: Partial<TimingAttemptRow> = {},
): TimingAttemptRow {
  return attemptRow({
    id: 'heat-attempt-1',
    attemptKind: 'HEAT',
    classCompetitionId: 'race-1',
    stageId: 'stage-1',
    heatNumber: 1,
    ...overrides,
  });
}

function rosterRow(
  overrides: Partial<TimingParticipantRosterRow> &
    Pick<TimingParticipantRosterRow, 'enrollmentId'>,
): TimingParticipantRosterRow {
  return {
    registrationId: `registration-${overrides.enrollmentId}`,
    startNumber: 10,
    sectionId: 'CATEGORY',
    requiredLaps: 3,
    initialOutcome: null,
    excludedReason: null,
    firstName: 'Иван',
    lastName: 'Петров',
    ...overrides,
  };
}

function markRow(
  overrides: Partial<TimingMarkRow> & Pick<TimingMarkRow, 'id'>,
): TimingMarkRow {
  return {
    attemptId: 'attempt-1',
    clockEpochId: 'epoch-1',
    enrollmentId: 'enrollment-a',
    registrationId: 'registration-enrollment-a',
    startNumber: 10,
    kind: 'PASS',
    rawCapturedAt: NOW,
    rawElapsedMs: 30_000,
    officialAt: new Date(NOW.getTime() + 30_000),
    officialElapsedMs: 30_000,
    lapNumber: 1,
    status: 'BOUND',
    workstationInstanceId: WORKSTATION,
    deviceSequence: 1,
    idempotencyKey: 'idempotency-1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function publishedResultRow(
  overrides: Partial<TimingPublishedResultRow> &
    Pick<TimingPublishedResultRow, 'id'>,
): TimingPublishedResultRow {
  return {
    enrollmentId: 'enrollment-a',
    registrationId: 'registration-enrollment-a',
    outcome: 'FINISHED',
    timeMilliseconds: 90_000,
    place: null,
    recordedAt: NOW,
    updatedAt: NOW,
    timingSessionId: 'attempt-1',
    laps: [
      { lapNumber: 1, lapTimeMs: 30_000, cumulativeMs: 30_000 },
      { lapNumber: 2, lapTimeMs: 30_000, cumulativeMs: 60_000 },
      { lapNumber: 3, lapTimeMs: 30_000, cumulativeMs: 90_000 },
    ],
    ...overrides,
  };
}

function clockEpochRow(
  overrides: Partial<TimingClockEpochRow> & Pick<TimingClockEpochRow, 'id'>,
): TimingClockEpochRow {
  return {
    attemptId: 'attempt-1',
    workstationInstanceId: WORKSTATION,
    officialElapsedAnchorMs: 0,
    openedAt: NOW,
    closedAt: null,
    openedByUserId: USER_ID,
    ...overrides,
  };
}

function lockRow(
  overrides: Partial<TimingCaptureLockRow> = {},
): TimingCaptureLockRow {
  return {
    eventId: EVENT_ID,
    workstationInstanceId: WORKSTATION,
    lockToken: 'lock-token',
    heldByUserId: USER_ID,
    acquiredAt: NOW,
    lastSeenAt: NOW,
    ...overrides,
  };
}

function participantRow(
  overrides: Partial<TimingParticipantRow> &
    Pick<TimingParticipantRow, 'enrollmentId'>,
): TimingParticipantRow {
  return {
    registrationId: `registration-${overrides.enrollmentId}`,
    startNumber: 10,
    sectionId: 'CATEGORY',
    requiredLaps: 3,
    initialOutcome: null,
    excludedReason: null,
    ...overrides,
  };
}

function candidateRow(
  overrides: Partial<TimingRoutingCandidateRow> &
    Pick<TimingRoutingCandidateRow, 'enrollmentId'>,
): TimingRoutingCandidateRow {
  return {
    attemptId: ATTEMPT_ID,
    attemptStatus: 'RUNNING',
    registrationId: `registration-${overrides.enrollmentId}`,
    startNumber: 10,
    sectionId: 'CATEGORY',
    excludedReason: null,
    requiredLaps: 3,
    passCount: 0,
    ...overrides,
  };
}

function receiptRow(
  overrides: Partial<TimingReceiptRow> = {},
): TimingReceiptRow {
  return {
    attemptId: ATTEMPT_ID,
    workstationInstanceId: WORKSTATION,
    deviceSequence: 1,
    status: 'APPLIED',
    reason: null,
    createdAt: NOW,
    ...overrides,
  };
}

/** One pending finish: a captured instant that names no participant yet. */
function pendingMarkRow(overrides: Partial<TimingMarkRow> = {}): TimingMarkRow {
  return markRow({
    id: 'mark-pending',
    kind: 'PENDING_FINISH',
    status: 'PENDING',
    enrollmentId: null,
    registrationId: null,
    startNumber: null,
    lapNumber: null,
    deviceSequence: 4,
    officialElapsedMs: 70_000,
    officialAt: new Date(NOW.getTime() + 70_000),
    ...overrides,
  });
}

/** One audit row; a capture row is the creation proof quick undo reads. */
function auditRow(
  overrides: Partial<TimingAuditRow> & Pick<TimingAuditRow, 'auditId'>,
): TimingAuditRow {
  return {
    actorUserId: USER_ID,
    action: 'PASS_CAPTURE',
    targetType: 'PASS',
    targetId: 'mark-1',
    oldValues: null,
    newValues: {
      workstationInstanceId: WORKSTATION,
      deviceSequence: 1,
    },
    reason: null,
    createdAt: NOW,
    ...overrides,
  };
}

/** Applies a mark update the way `repository.updateMark` would. */
function applyMarkUpdate(
  mark: TimingMarkRow,
  input: UpdateMarkInput,
): TimingMarkRow {
  return {
    ...mark,
    ...(input.enrollmentId === undefined
      ? {}
      : { enrollmentId: input.enrollmentId }),
    ...(input.registrationId === undefined
      ? {}
      : { registrationId: input.registrationId }),
    ...(input.startNumber === undefined
      ? {}
      : { startNumber: input.startNumber }),
    ...(input.kind === undefined ? {} : { kind: input.kind }),
    ...(input.lapNumber === undefined ? {} : { lapNumber: input.lapNumber }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.officialAt === undefined ? {} : { officialAt: input.officialAt }),
    ...(input.officialElapsedMs === undefined
      ? {}
      : { officialElapsedMs: input.officialElapsedMs }),
    ...(input.deviceSequence === undefined
      ? {}
      : { deviceSequence: input.deviceSequence }),
  };
}

function bindDto(
  overrides: Partial<BindPendingFinishDto> = {},
): BindPendingFinishDto {
  return {
    pendingFinishId: 'mark-pending',
    startNumber: 10,
    workstationInstanceId: WORKSTATION,
    deviceSequence: 5,
    ...overrides,
  };
}

function cancelDto(
  overrides: Partial<CancelPendingFinishDto> = {},
): CancelPendingFinishDto {
  return { reason: 'Ошибочный финиш', ...overrides };
}

function undoDto(
  overrides: Partial<QuickUndoTimingPassDto> = {},
): QuickUndoTimingPassDto {
  return {
    workstationInstanceId: WORKSTATION,
    deviceSequence: 13,
    ...overrides,
  };
}

function capturePassDto(
  overrides: Partial<CaptureTimingPassDto> = {},
): CaptureTimingPassDto {
  return {
    attemptId: ATTEMPT_ID,
    kind: 'NUMBER',
    startNumber: 10,
    clientCapturedAt: NOW.toISOString(),
    clientElapsedMs: 30_000,
    clockEpochId: 'epoch-1',
    workstationInstanceId: WORKSTATION,
    deviceSequence: 1,
    ...overrides,
  };
}

function correctDto(
  overrides: Partial<CorrectOfficialTimeDto> = {},
): CorrectOfficialTimeDto {
  return {
    targetType: 'PASS',
    targetId: 'mark-1',
    officialAt: new Date(NOW.getTime() + 45_000).toISOString(),
    reason: 'Ошибка секундомера',
    ...overrides,
  };
}

function cancelPassDto(
  overrides: Partial<CancelTimingPassDto> = {},
): CancelTimingPassDto {
  return { reason: 'Лишний круг', ...overrides };
}

function rebindPassDto(
  overrides: Partial<RebindTimingPassDto> = {},
): RebindTimingPassDto {
  return {
    targetEnrollmentId: 'enrollment-b',
    reason: 'Не тот участник',
    ...overrides,
  };
}

function completeAttemptDto(
  overrides: Partial<CompleteTimingAttemptDto> = {},
): CompleteTimingAttemptDto {
  return {
    workstationInstanceId: WORKSTATION,
    lastIssuedSequence: 3,
    ...overrides,
  };
}

function forceCompleteDto(
  overrides: Partial<ForceCompleteTimingAttemptDto> = {},
): ForceCompleteTimingAttemptDto {
  return { reason: 'Досрочное завершение', ...overrides };
}

function cancelAttemptDto(
  overrides: Partial<CancelTimingAttemptDto> = {},
): CancelTimingAttemptDto {
  return { reason: 'Забег отменён', ...overrides };
}

function takeCaptureDto(
  overrides: Partial<TakeCaptureDto> = {},
): TakeCaptureDto {
  return { workstationInstanceId: WORKSTATION, ...overrides };
}

function transferCaptureDto(
  overrides: Partial<TransferCaptureDto> = {},
): TransferCaptureDto {
  return { toWorkstationInstanceId: 'workstation-b', ...overrides };
}

function forceReleaseCaptureDto(
  overrides: Partial<ForceReleaseCaptureDto> = {},
): ForceReleaseCaptureDto {
  return {
    workstationInstanceId: WORKSTATION,
    reason: 'Устройство потеряно',
    ...overrides,
  };
}

/** One authoritative result row; a timing-owned row names the attempt. */
function resultRow(
  overrides: Partial<TimingResultRow> & Pick<TimingResultRow, 'id'>,
): TimingResultRow {
  return {
    enrollmentId: 'enrollment-a',
    registrationId: 'registration-enrollment-a',
    outcome: 'FINISHED',
    timeMilliseconds: 90_000,
    place: null,
    recordedAt: NOW,
    updatedAt: NOW,
    timingSessionId: ATTEMPT_ID,
    ...overrides,
  };
}

const TIMING_OPERATE_ROLES = TIMING_OPERATE_ROLE_CODES;

/** One race view of the class-competitions façade, with no stages by default. */
function raceView(
  overrides: Partial<ClassCompetitionView> = {},
): ClassCompetitionView {
  return {
    id: 'race-1',
    eventId: EVENT_ID,
    startId: START_A,
    formatId: 1,
    gender: 'M',
    sectionId: 'CATEGORY',
    sectionKind: 'CATEGORY',
    title: 'Гонка 1',
    subtitle: null,
    targetGroupIds: [],
    targetWholeCategory: true,
    capturedEnrollmentIds: [],
    youngestBound: null,
    status: 'IN_PROGRESS',
    stages: [],
    classification: [],
    ...overrides,
  };
}

type RaceStageView = ClassCompetitionView['stages'][number];
type RaceHeatView = RaceStageView['heats'][number];
type RaceSlotView = RaceHeatView['slots'][number];

function stageView(
  overrides: Partial<RaceStageView> & Pick<RaceStageView, 'stageId'>,
): RaceStageView {
  return {
    kind: 'HEAT',
    label: null,
    status: 'SEEDED',
    sourceStageId: null,
    qualifierStatus: null,
    heats: [],
    entries: [],
    ...overrides,
  };
}

function heatView(
  overrides: Partial<RaceHeatView> & Pick<RaceHeatView, 'heatNumber'>,
): RaceHeatView {
  return { slots: [], ...overrides };
}

function slotView(
  overrides: Partial<RaceSlotView> & Pick<RaceSlotView, 'registrationId'>,
): RaceSlotView {
  return {
    position: 1,
    firstName: 'Иван',
    lastName: 'Петров',
    startNumber: 10,
    registrationStatus: 'REGISTERED',
    timeMilliseconds: null,
    resultStatus: null,
    laps: [],
    ...overrides,
  };
}

function heatEnrollmentRow(
  overrides: Partial<TimingHeatRosterEnrollmentRow> &
    Pick<TimingHeatRosterEnrollmentRow, 'registrationId'>,
): TimingHeatRosterEnrollmentRow {
  return {
    enrollmentId: `enrollment-${overrides.registrationId}`,
    startNumber: 10,
    enrollmentStatus: 'REGISTERED',
    registrationStatus: 'REGISTERED',
    ...overrides,
  };
}

function heatTimeRow(
  overrides: Partial<TimingHeatTimeRow> &
    Pick<TimingHeatTimeRow, 'registrationId'>,
): TimingHeatTimeRow {
  return {
    id: `heat-time-${overrides.registrationId}`,
    classCompetitionId: 'race-1',
    stageId: 'stage-1',
    heatNumber: 1,
    timeMilliseconds: 90_000,
    status: 'OK',
    ...overrides,
  };
}

function anonymousSplitRow(
  overrides: Partial<TimingAnonymousSplitRow> &
    Pick<TimingAnonymousSplitRow, 'splitId'>,
): TimingAnonymousSplitRow {
  return {
    attemptId: ATTEMPT_ID,
    attemptKind: 'CATEGORY',
    attemptStatus: 'RUNNING',
    eventId: EVENT_ID,
    startId: START_A,
    formatId: 1,
    gender: 'M',
    classCompetitionId: null,
    stageId: null,
    heatNumber: null,
    officialStartedAt: NOW,
    clockEpochId: 'epoch-1',
    capturedAt: new Date(NOW.getTime() + 20_000),
    officialElapsedMs: 20_000,
    status: 'PENDING',
    ...overrides,
  };
}

function startHeatDto(
  overrides: Partial<StartHeatAttemptDto> = {},
): StartHeatAttemptDto {
  return {
    classCompetitionId: 'race-1',
    stageId: 'stage-1',
    heatNumber: 1,
    workstationInstanceId: WORKSTATION,
    clientStartedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe('TimingService', () => {
  let repository: RepositoryFake;
  let roles: ReturnType<typeof createRolesFake>;
  let classCompetitions: ReturnType<typeof createClassCompetitionsFake>;
  let anonymousSplits: ReturnType<typeof createAnonymousSplitFake>;
  let service: TimingService;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    repository = createRepositoryFake();
    roles = createRolesFake();
    classCompetitions = createClassCompetitionsFake();
    anonymousSplits = createAnonymousSplitFake();
    service = new TimingService(
      repository as unknown as TimingRepository,
      roles as unknown as RolesService,
      classCompetitions as unknown as ClassCompetitionsService,
      anonymousSplits as unknown as AnonymousSplitService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function arrangeStarts(
    starts: TimingStartRow[],
    formats: TimingFormatRow[],
  ): void {
    repository.findEvent.mockResolvedValue(eventRow());
    repository.listStarts.mockResolvedValue(starts);
    repository.listFormats.mockResolvedValue(formats);
  }

  describe('getSurface', () => {
    it('orders one block per category by start, format catalog order and M before F', async () => {
      arrangeStarts(
        [
          startRow({ id: START_A, sortOrder: 1, formatIds: [1, 2] }),
          startRow({ id: START_B, sortOrder: 2, formatIds: [1] }),
        ],
        [formatRow(1, 1), formatRow(2, 2)],
      );
      repository.listEnrollmentRows.mockResolvedValue([
        enrollmentRow({
          enrollmentId: 'enrollment-b-m',
          startId: START_B,
          formatId: 1,
          gender: 'M',
        }),
        enrollmentRow({
          enrollmentId: 'enrollment-a-2-f',
          startId: START_A,
          formatId: 2,
          gender: 'F',
        }),
        enrollmentRow({
          enrollmentId: 'enrollment-a-1-m',
          startId: START_A,
          formatId: 1,
          gender: 'M',
        }),
        enrollmentRow({
          enrollmentId: 'enrollment-a-2-m',
          startId: START_A,
          formatId: 2,
          gender: 'M',
        }),
      ]);

      const surface = await service.getSurface(USER_ID, EVENT_ID);

      expect(
        surface.categories.map(
          (block) => `${block.startId}:${block.formatId}:${block.gender}`,
        ),
      ).toEqual([
        `${START_A}:1:M`,
        `${START_A}:2:M`,
        `${START_A}:2:F`,
        `${START_B}:1:M`,
      ]);
      expect(surface.categories[0].state).toBe('NOT_STARTED');
      expect(surface.categories[0].lapCount).toBe(3);
      expect(surface.categories[0].attemptId).toBeNull();
      expect(surface.categories[0].lastAttempts).toEqual([]);
      expect(roles.assertHasAnyRole).toHaveBeenCalledWith(
        USER_ID,
        TIMING_OPERATE_ROLES,
      );
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('refuses an event without starts with NOT_AVAILABLE', async () => {
      arrangeStarts([], [formatRow(1, 1)]);

      await expect(service.getSurface(USER_ID, EVENT_ID)).rejects.toMatchObject(
        { code: TimingErrorCode.NOT_AVAILABLE },
      );
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('excludes race-section rows and pre-existing outcomes from the roster', async () => {
      arrangeStarts([startRow({ id: START_A })], [formatRow(1, 1)]);
      repository.listAgeCategories.mockResolvedValue([
        {
          startId: START_A,
          formatId: 1,
          gender: 'M',
          categoryNumber: 1,
          groupId: 'AGE_24_40',
        },
      ]);
      repository.listEnrollmentRows.mockResolvedValue([
        enrollmentRow({
          enrollmentId: 'enrollment-race',
          startNumber: 11,
          birthYear: 2000,
        }),
        enrollmentRow({
          enrollmentId: 'enrollment-outcome',
          startNumber: 12,
          birthYear: 1980,
          result: {
            id: 'result-1',
            outcome: 'FINISHED',
            timeMilliseconds: 90_000,
            timingSessionId: null,
          },
        }),
        enrollmentRow({
          enrollmentId: 'enrollment-timeable',
          startNumber: 13,
          birthYear: 1985,
        }),
      ]);
      repository.listClassCompetitions.mockResolvedValue([
        {
          id: 'race-1',
          startId: START_A,
          formatId: 1,
          gender: 'M',
          sectionId: 'CATEGORY_1',
          sectionKind: 'CATEGORY_NUMBER',
          targetKey: 'GROUPS:AGE_24_40',
          targetGroupIds: ['AGE_24_40'],
          targetWholeCategory: false,
          frozenTitle: 'Категория 1',
          frozenSubtitle: null,
          frozenYoungestBound: 24,
          frozenMemberBounds: [24],
          frozenSectionNumber: 1,
          capturedEnrollmentIds: ['enrollment-race'],
          capturedRegistrationIds: [],
        },
      ]);

      const surface = await service.getSurface(USER_ID, EVENT_ID);
      const tiles = surface.categories[0].participants;

      expect(tiles.map((tile) => [tile.enrollmentId, tile.state])).toEqual([
        ['enrollment-race', 'EXCLUDED'],
        ['enrollment-outcome', 'EXCLUDED'],
        ['enrollment-timeable', 'WAITING'],
      ]);
      expect(tiles[0].excludedReason).toBe('RACE_SECTION');
      expect(tiles[0].sectionId).toBe('CATEGORY_1');
      expect(tiles[1].excludedReason).toBe('EXISTING_OUTCOME');
      expect(surface.categories[0].startControlEnabled).toBe(true);
      expect(surface.categories[0].blockReason).toBeNull();
    });

    it('disables the start control and names the reason when every row is excluded', async () => {
      arrangeStarts([startRow({ id: START_A })], [formatRow(1, 1)]);
      repository.listEnrollmentRows.mockResolvedValue([
        enrollmentRow({ enrollmentId: 'enrollment-1', startNumber: 11 }),
      ]);
      repository.listClassCompetitions.mockResolvedValue([
        {
          id: 'race-1',
          startId: START_A,
          formatId: 1,
          gender: 'M',
          sectionId: null,
          sectionKind: null,
          targetKey: 'WHOLE',
          targetGroupIds: [],
          targetWholeCategory: true,
          frozenTitle: null,
          frozenSubtitle: null,
          frozenYoungestBound: null,
          frozenMemberBounds: [],
          frozenSectionNumber: null,
          capturedEnrollmentIds: [],
          capturedRegistrationIds: [],
        },
      ]);

      const surface = await service.getSurface(USER_ID, EVENT_ID);
      const block = surface.categories[0];

      expect(block.startControlEnabled).toBe(false);
      expect(block.blockReason).toBe(
        'В категории нет участников, доступных для хронометража.',
      );
      expect(block.participants[0].state).toBe('EXCLUDED');
    });

    it('shows a running attempt with its elapsed time, tiles and pending finishes', async () => {
      arrangeStarts(
        [startRow({ id: START_A, lapCount: 3 })],
        [formatRow(1, 1)],
      );
      repository.listEnrollmentRows.mockResolvedValue([
        enrollmentRow({ enrollmentId: 'enrollment-a', startNumber: 10 }),
      ]);
      repository.findAttemptsForCategory.mockResolvedValue([
        attemptRow({
          id: 'attempt-1',
          attemptNumber: 1,
          officialStartedAt: new Date(NOW.getTime() - 90_000),
        }),
      ]);
      repository.listParticipantRoster.mockResolvedValue([
        rosterRow({ enrollmentId: 'enrollment-a', requiredLaps: 3 }),
      ]);
      repository.listMarks.mockResolvedValue([
        markRow({
          id: 'mark-1',
          officialElapsedMs: 30_000,
          officialAt: new Date(NOW.getTime() - 60_000),
        }),
        markRow({
          id: 'mark-2',
          officialElapsedMs: 60_000,
          officialAt: new Date(NOW.getTime() - 30_000),
          lapNumber: 2,
        }),
      ]);
      repository.listPendingFinishes.mockResolvedValue([
        markRow({
          id: 'mark-pending',
          kind: 'PENDING_FINISH',
          status: 'PENDING',
          enrollmentId: null,
          registrationId: null,
          startNumber: null,
          lapNumber: null,
          officialElapsedMs: 70_000,
        }),
      ]);
      repository.getCaptureLock.mockResolvedValue(lockRow());

      const surface = await service.getSurface(USER_ID, EVENT_ID);
      const block = surface.categories[0];

      expect(surface.captureWorkstationInstanceId).toBe(WORKSTATION);
      expect(block.state).toBe('RUNNING');
      expect(block.attemptId).toBe('attempt-1');
      expect(block.elapsedMs).toBe(90_000);
      expect(block.startControlEnabled).toBe(false);
      expect(block.blockReason).toBe('Забег этой категории уже запущен.');
      expect(block.participants[0]).toMatchObject({
        enrollmentId: 'enrollment-a',
        passCount: 2,
        requiredLaps: 3,
        state: 'RACING',
        lastPassAt: new Date(NOW.getTime() - 30_000).toISOString(),
      });
      expect(block.pendingFinishes.map((finish) => finish.passId)).toEqual([
        'mark-pending',
      ]);
      expect(block.lastAttempts).toEqual([
        {
          attemptId: 'attempt-1',
          state: 'RUNNING',
          officialStartedAt: new Date(NOW.getTime() - 90_000).toISOString(),
        },
      ]);
    });

    it('shows a closed attempt with no elapsed time and keeps the earlier attempts', async () => {
      arrangeStarts([startRow({ id: START_A })], [formatRow(1, 1)]);
      repository.listEnrollmentRows.mockResolvedValue([
        enrollmentRow({ enrollmentId: 'enrollment-a' }),
      ]);
      repository.findAttemptsForCategory.mockResolvedValue([
        attemptRow({
          id: 'attempt-2',
          attemptNumber: 2,
          status: 'COMPLETED',
          closedAt: NOW,
        }),
        attemptRow({
          id: 'attempt-1',
          attemptNumber: 1,
          status: 'CANCELLED',
          closedAt: NOW,
        }),
      ]);
      repository.listParticipantRoster.mockResolvedValue([
        rosterRow({ enrollmentId: 'enrollment-a', requiredLaps: 3 }),
      ]);

      const surface = await service.getSurface(USER_ID, EVENT_ID);
      const block = surface.categories[0];

      expect(block.state).toBe('COMPLETED');
      expect(block.elapsedMs).toBeNull();
      expect(block.startControlEnabled).toBe(false);
      expect(block.blockReason).toBe(
        'Забег этой категории уже закрыт. Новый старт возможен только после отмены.',
      );
      expect(block.lastAttempts.map((ref) => ref.attemptId)).toEqual([
        'attempt-2',
        'attempt-1',
      ]);
      expect(block.participants[0].state).toBe('INCOMPLETE');
    });

    it('builds a stage group and ascending heat blocks from a seeded race', async () => {
      arrangeStarts([startRow({ id: START_A })], [formatRow(1, 1)]);
      classCompetitions.list.mockResolvedValue([
        raceView({
          stages: [
            stageView({
              stageId: 'stage-1',
              label: 'Квалификация',
              status: 'SEEDED',
              heats: [
                heatView({
                  heatNumber: 2,
                  slots: [slotView({ registrationId: 'reg-2' })],
                }),
                heatView({
                  heatNumber: 1,
                  slots: [slotView({ registrationId: 'reg-1' })],
                }),
              ],
            }),
          ],
        }),
      ]);
      repository.listEnrollmentsForRegistrations.mockResolvedValue([
        heatEnrollmentRow({
          registrationId: 'reg-1',
          enrollmentId: 'enrollment-1',
        }),
        heatEnrollmentRow({
          registrationId: 'reg-2',
          enrollmentId: 'enrollment-2',
          startNumber: 12,
        }),
      ]);

      const surface = await service.getSurface(USER_ID, EVENT_ID);

      expect(surface.stageGroups).toHaveLength(1);
      expect(surface.stageGroups?.[0]).toMatchObject({
        raceId: 'race-1',
        raceTitle: 'Гонка 1',
        stageId: 'stage-1',
        stageLabel: 'Квалификация',
        stageState: 'SEEDED',
        blockReason: null,
      });
      const heatBlocks = surface.categories.filter(
        (block) => block.kind === 'HEAT',
      );
      expect(
        heatBlocks.map((block) => [block.heatNumber, block.heatLabel]),
      ).toEqual([
        [1, 'Заезд 1'],
        [2, 'Заезд 2'],
      ]);
      expect(surface.stageGroups?.[0].heatBlockKeys).toEqual(
        heatBlocks.map((block) => block.blockKey),
      );
      expect(heatBlocks[0]).toMatchObject({
        startId: START_A,
        formatId: 1,
        gender: 'M',
        lapCount: 3,
        state: 'NOT_STARTED',
        startControlEnabled: true,
        blockReason: null,
        classCompetitionId: 'race-1',
        stageId: 'stage-1',
        stageState: 'SEEDED',
      });
      expect(heatBlocks[0].blockKey).toBe('heat:race-1:stage-1:1');
      expect(heatBlocks[0].participants[0]).toMatchObject({
        enrollmentId: 'enrollment-1',
        requiredLaps: 3,
        state: 'WAITING',
      });
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('shows a PENDING stage without heats as untimeable and offers no heat block', async () => {
      arrangeStarts([startRow({ id: START_A })], [formatRow(1, 1)]);
      classCompetitions.list.mockResolvedValue([
        raceView({
          stages: [stageView({ stageId: 'stage-1', status: 'PENDING' })],
        }),
      ]);

      const surface = await service.getSurface(USER_ID, EVENT_ID);

      expect(
        surface.categories.filter((block) => block.kind === 'HEAT'),
      ).toEqual([]);
      expect(surface.stageGroups?.[0]).toMatchObject({
        stageState: 'PENDING',
        heatBlockKeys: [],
      });
      expect(surface.stageGroups?.[0].blockReason).toBe(
        'Заезды этапа ещё не сформированы.',
      );
    });

    it('shows a COMPLETED stage heat closed with no Start control', async () => {
      arrangeStarts([startRow({ id: START_A })], [formatRow(1, 1)]);
      classCompetitions.list.mockResolvedValue([
        raceView({
          stages: [
            stageView({
              stageId: 'stage-1',
              status: 'COMPLETED',
              heats: [
                heatView({
                  heatNumber: 1,
                  slots: [slotView({ registrationId: 'reg-1' })],
                }),
              ],
            }),
          ],
        }),
      ]);
      repository.listEnrollmentsForRegistrations.mockResolvedValue([
        heatEnrollmentRow({ registrationId: 'reg-1' }),
      ]);

      const surface = await service.getSurface(USER_ID, EVENT_ID);
      const block = surface.categories.find((item) => item.kind === 'HEAT');

      expect(block).toMatchObject({
        startControlEnabled: false,
        blockReason: 'Этап уже завершён.',
        stageState: 'COMPLETED',
      });
    });

    it('offers no heat block for a race with no start or on a legacy event', async () => {
      arrangeStarts([startRow({ id: START_A })], [formatRow(1, 1)]);
      classCompetitions.list.mockResolvedValue([
        raceView({
          startId: null,
          formatId: null,
          stages: [
            stageView({
              stageId: 'stage-1',
              status: 'SEEDED',
              heats: [
                heatView({
                  heatNumber: 1,
                  slots: [slotView({ registrationId: 'reg-1' })],
                }),
              ],
            }),
          ],
        }),
      ]);

      const surface = await service.getSurface(USER_ID, EVENT_ID);

      expect(
        surface.categories.filter((block) => block.kind === 'HEAT'),
      ).toEqual([]);
      expect(surface.stageGroups).toEqual([]);
    });

    it('places a race after its category block by section, stage and heat order', async () => {
      arrangeStarts(
        [
          startRow({ id: START_A, formatIds: [1] }),
          startRow({ id: START_B, sortOrder: 2, formatIds: [1] }),
        ],
        [formatRow(1, 1)],
      );
      repository.listEnrollmentRows.mockResolvedValue([
        enrollmentRow({
          enrollmentId: 'enrollment-a-m',
          startId: START_A,
          formatId: 1,
          gender: 'M',
          birthYear: 2000,
        }),
        enrollmentRow({
          enrollmentId: 'enrollment-a-f',
          startId: START_A,
          formatId: 1,
          gender: 'F',
          birthYear: 2000,
        }),
        enrollmentRow({
          enrollmentId: 'enrollment-b-m',
          startId: START_B,
          formatId: 1,
          gender: 'M',
          birthYear: 2000,
        }),
      ]);
      classCompetitions.list.mockResolvedValue([
        raceView({
          id: 'race-two',
          sectionId: 'CATEGORY_2',
          stages: [
            stageView({
              stageId: 'stage-1',
              heats: [heatView({ heatNumber: 1 })],
            }),
          ],
        }),
        raceView({
          id: 'race-one',
          sectionId: 'CATEGORY_1',
          stages: [
            stageView({
              stageId: 'stage-1',
              heats: [heatView({ heatNumber: 2 }), heatView({ heatNumber: 1 })],
            }),
          ],
        }),
        raceView({
          id: 'race-b',
          startId: START_B,
          sectionId: 'CATEGORY',
          stages: [
            stageView({
              stageId: 'stage-1',
              heats: [heatView({ heatNumber: 1 })],
            }),
          ],
        }),
      ]);

      const surface = await service.getSurface(USER_ID, EVENT_ID);

      expect(
        surface.categories.map((block) =>
          block.kind === 'HEAT'
            ? `${block.classCompetitionId}:${block.heatNumber}`
            : `category:${block.startId}:${block.gender}`,
        ),
      ).toEqual([
        `category:${START_A}:M`,
        'race-one:1',
        'race-one:2',
        'race-two:1',
        `category:${START_A}:F`,
        `category:${START_B}:M`,
        'race-b:1',
      ]);
      expect(
        surface.stageGroups?.map((group) => `${group.raceId}:${group.stageId}`),
      ).toEqual(['race-one:stage-1', 'race-two:stage-1', 'race-b:stage-1']);
    });

    it('excludes no-enrollment, withdrawn and existing-heat-time slots and takes N from the start', async () => {
      arrangeStarts(
        [startRow({ id: START_A, lapCount: 4 })],
        [formatRow(1, 1)],
      );
      classCompetitions.list.mockResolvedValue([
        raceView({
          sectionId: 'CATEGORY_1',
          stages: [
            stageView({
              stageId: 'stage-1',
              heats: [
                heatView({
                  heatNumber: 1,
                  slots: [
                    slotView({ registrationId: 'reg-active', position: 1 }),
                    slotView({ registrationId: 'reg-withdrawn', position: 2 }),
                    slotView({ registrationId: 'reg-existing', position: 3 }),
                    slotView({ registrationId: 'reg-missing', position: 4 }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ]);
      repository.listEnrollmentsForRegistrations.mockResolvedValue([
        heatEnrollmentRow({
          registrationId: 'reg-active',
          enrollmentId: 'enrollment-active',
          startNumber: 10,
        }),
        heatEnrollmentRow({
          registrationId: 'reg-withdrawn',
          enrollmentId: 'enrollment-withdrawn',
          startNumber: 11,
          registrationStatus: 'WITHDRAWN',
        }),
        heatEnrollmentRow({
          registrationId: 'reg-existing',
          enrollmentId: 'enrollment-existing',
          startNumber: 12,
        }),
      ]);
      repository.listHeatTimesForHeat.mockResolvedValue([
        heatTimeRow({ registrationId: 'reg-existing' }),
      ]);

      const surface = await service.getSurface(USER_ID, EVENT_ID);
      const block = surface.categories.find((item) => item.kind === 'HEAT');

      expect(block?.lapCount).toBe(4);
      expect(block?.startControlEnabled).toBe(true);
      expect(block?.blockReason).toBeNull();
      expect(
        block?.participants.map((tile) => [
          tile.registrationId,
          tile.state,
          tile.excludedReason,
          tile.requiredLaps,
        ]),
      ).toEqual([
        ['reg-active', 'WAITING', null, 4],
        ['reg-withdrawn', 'EXCLUDED', 'WITHDRAWN', 4],
        ['reg-existing', 'EXCLUDED', 'EXISTING_HEAT_TIME', 4],
        ['reg-missing', 'EXCLUDED', 'NO_ENROLLMENT', 4],
      ]);
    });

    it('uses the frozen heat roster and marks once an attempt exists', async () => {
      arrangeStarts([startRow({ id: START_A })], [formatRow(1, 1)]);
      classCompetitions.list.mockResolvedValue([
        raceView({
          stages: [
            stageView({
              stageId: 'stage-1',
              heats: [heatView({ heatNumber: 1 })],
            }),
          ],
        }),
      ]);
      repository.findAttemptsForRace.mockResolvedValue([
        attemptRow({
          id: 'heat-attempt-1',
          attemptKind: 'HEAT',
          classCompetitionId: 'race-1',
          stageId: 'stage-1',
          heatNumber: 1,
        }),
      ]);
      repository.listParticipantRoster.mockResolvedValue([
        rosterRow({
          enrollmentId: 'enrollment-frozen',
          startNumber: 21,
          sectionId: 'CATEGORY_1',
          requiredLaps: 3,
        }),
      ]);
      repository.listMarks.mockResolvedValue([
        markRow({
          id: 'frozen-pass-1',
          attemptId: 'heat-attempt-1',
          enrollmentId: 'enrollment-frozen',
          registrationId: 'registration-enrollment-frozen',
          startNumber: 21,
          lapNumber: 1,
        }),
        markRow({
          id: 'frozen-pass-2',
          attemptId: 'heat-attempt-1',
          enrollmentId: 'enrollment-frozen',
          registrationId: 'registration-enrollment-frozen',
          startNumber: 21,
          lapNumber: 2,
          deviceSequence: 2,
          officialAt: new Date(NOW.getTime() + 60_000),
          officialElapsedMs: 60_000,
        }),
      ]);

      const surface = await service.getSurface(USER_ID, EVENT_ID);
      const block = surface.categories.find((item) => item.kind === 'HEAT');

      expect(block).toMatchObject({
        attemptId: 'heat-attempt-1',
        state: 'RUNNING',
        elapsedMs: 0,
        startControlEnabled: false,
        blockReason: 'Этот заезд уже запущен.',
      });
      expect(block?.participants).toHaveLength(1);
      expect(block?.participants[0]).toMatchObject({
        enrollmentId: 'enrollment-frozen',
        startNumber: 21,
        passCount: 2,
        requiredLaps: 3,
        state: 'RACING',
      });
      expect(repository.listEnrollmentsForRegistrations).not.toHaveBeenCalled();
    });

    it('reads the anonymous split queue beside the categories', async () => {
      arrangeStarts([startRow({ id: START_A })], [formatRow(1, 1)]);
      anonymousSplits.listQueue.mockResolvedValue([
        {
          splitId: 'split-1',
          attemptId: ATTEMPT_ID,
          blockKey: `category:${START_A}:1:M`,
          attemptLabel: 'Старт · Формат 1 · M',
          capturedAt: NOW.toISOString(),
          officialElapsedMs: 20_000,
          status: 'QUEUED',
          bound: true,
          candidates: [
            {
              attemptId: ATTEMPT_ID,
              blockKey: `category:${START_A}:1:M`,
              attemptLabel: 'Старт · Формат 1 · M',
              officialElapsedMs: 20_000,
            },
          ],
          captureDeviceSequence: null,
        },
      ]);

      const surface = await service.getSurface(USER_ID, EVENT_ID);

      expect(anonymousSplits.listQueue).toHaveBeenCalledWith(EVENT_ID);
      expect(surface.anonymousSplits).toHaveLength(1);
      expect(surface.anonymousSplits?.[0].splitId).toBe('split-1');
    });
  });

  describe('startAttempt', () => {
    function arrangeStartPress(
      overrides: {
        event?: TimingEventRow;
        enrollments?: TimingEnrollmentRow[];
        attempts?: TimingAttemptRow[];
        categoryFinished?: boolean;
        lock?: TimingCaptureLockRow | null;
        start?: TimingStartRow;
      } = {},
    ): void {
      arrangeStarts(
        [overrides.start ?? startRow({ id: START_A, lapCount: 3 })],
        [formatRow(1, 1)],
      );
      if (overrides.event !== undefined) {
        repository.findEvent.mockResolvedValue(overrides.event);
      }
      repository.listEnrollmentRows.mockResolvedValue(
        overrides.enrollments ?? [
          enrollmentRow({ enrollmentId: 'enrollment-a' }),
        ],
      );
      repository.findAttemptsForCategory.mockResolvedValue(
        overrides.attempts ?? [],
      );
      repository.isCategoryFinished.mockResolvedValue(
        overrides.categoryFinished ?? false,
      );
      repository.getCaptureLock.mockResolvedValue(
        overrides.lock === undefined ? lockRow() : overrides.lock,
      );
      repository.findLatestAttemptNumber.mockResolvedValue(
        (overrides.attempts ?? []).reduce(
          (highest, attempt) =>
            attempt.attemptNumber > highest ? attempt.attemptNumber : highest,
          0,
        ),
      );
    }

    const startPress = {
      startId: START_A,
      formatId: 1,
      gender: 'M' as const,
      workstationInstanceId: WORKSTATION,
      clientStartedAt: new Date(NOW.getTime() - 250).toISOString(),
    };

    it('freezes the roster, allocates the next number, anchors the epoch and audits the start', async () => {
      arrangeStartPress({
        enrollments: [
          enrollmentRow({
            enrollmentId: 'enrollment-timeable',
            startNumber: 10,
          }),
          enrollmentRow({ enrollmentId: 'enrollment-race', startNumber: 11 }),
        ],
        attempts: [
          attemptRow({
            id: 'attempt-2',
            attemptNumber: 2,
            status: 'CANCELLED',
            closedAt: NOW,
          }),
        ],
        start: startRow({ id: START_A, lapCount: 3 }),
      });
      repository.listClassCompetitions.mockResolvedValue([
        {
          id: 'race-1',
          startId: START_A,
          formatId: 1,
          gender: 'M',
          sectionId: 'CATEGORY_1',
          sectionKind: 'CATEGORY_NUMBER',
          targetKey: 'GROUPS:AGE_24_40',
          targetGroupIds: ['AGE_24_40'],
          targetWholeCategory: false,
          frozenTitle: null,
          frozenSubtitle: null,
          frozenYoungestBound: 24,
          frozenMemberBounds: [24],
          frozenSectionNumber: 1,
          capturedEnrollmentIds: ['enrollment-race'],
          capturedRegistrationIds: [],
        },
      ]);
      repository.createAttempt.mockImplementation(
        (_tx: unknown, input: CreateAttemptInput) =>
          attemptRow({
            id: 'attempt-new',
            attemptNumber: input.attemptNumber,
            officialStartedAt: input.officialStartedAt,
            status: 'RUNNING',
          }),
      );
      repository.createClockEpoch.mockImplementation(
        (_tx: unknown, input: CreateClockEpochInput) =>
          clockEpochRow({
            id: 'epoch-1',
            attemptId: input.attemptId,
            officialElapsedAnchorMs: input.officialElapsedAnchorMs,
          }),
      );
      repository.insertAudit.mockImplementation(
        (_tx: unknown, input: InsertAuditInput) => ({
          auditId: 'audit-1',
          actorUserId: input.actorUserId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          oldValues: null,
          newValues: null,
          reason: null,
          createdAt: NOW,
        }),
      );
      repository.listParticipantRoster.mockResolvedValue([
        rosterRow({
          enrollmentId: 'enrollment-timeable',
          startNumber: 10,
          requiredLaps: 3,
        }),
        rosterRow({
          enrollmentId: 'enrollment-race',
          startNumber: 11,
          requiredLaps: 3,
          sectionId: 'CATEGORY_1',
          excludedReason: 'RACE_SECTION',
        }),
      ]);

      const result = await service.startAttempt(USER_ID, EVENT_ID, startPress);

      expect(repository.lockCategory).toHaveBeenCalledWith(
        expect.anything(),
        `${EVENT_ID}:${START_A}:1:M`,
      );
      const [, attemptInput] = callArguments<[unknown, CreateAttemptInput]>(
        repository.createAttempt,
      );
      expect(attemptInput).toMatchObject({
        eventId: EVENT_ID,
        startId: START_A,
        formatId: 1,
        gender: 'M',
        attemptNumber: 3,
        officialStartedAt: NOW,
        clientStartedAt: new Date(startPress.clientStartedAt),
        startedByUserId: USER_ID,
      });
      expect(attemptInput.participants).toEqual([
        {
          enrollmentId: 'enrollment-timeable',
          registrationId: 'registration-enrollment-timeable',
          startNumber: 10,
          sectionId: 'CATEGORY',
          requiredLaps: 3,
          initialOutcome: null,
          excludedReason: null,
        },
        {
          enrollmentId: 'enrollment-race',
          registrationId: 'registration-enrollment-race',
          startNumber: 11,
          sectionId: 'CATEGORY_1',
          requiredLaps: 3,
          initialOutcome: null,
          excludedReason: 'RACE_SECTION',
        },
      ]);
      const [, epochInput] = callArguments<[unknown, CreateClockEpochInput]>(
        repository.createClockEpoch,
      );
      expect(epochInput).toMatchObject({
        attemptId: 'attempt-new',
        workstationInstanceId: WORKSTATION,
        officialElapsedAnchorMs: 0,
        openedAt: NOW,
      });
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        attemptId: 'attempt-new',
        actorUserId: USER_ID,
        action: 'START',
        targetType: 'ATTEMPT',
        targetId: 'attempt-new',
      });
      expect(result.attempt).toMatchObject({
        startId: START_A,
        state: 'RUNNING',
        attemptId: 'attempt-new',
        lapCount: 3,
        startControlEnabled: false,
        pendingFinishes: [],
      });
      expect(result.attempt.participants.map((tile) => tile.state)).toEqual([
        'WAITING',
        'EXCLUDED',
      ]);
      expect(result.epoch).toEqual({
        epochId: 'epoch-1',
        attemptId: 'attempt-new',
        officialElapsedAnchorMs: 0,
        serverNow: NOW.toISOString(),
      });
    });

    it('refuses a cancelled event with NOT_AVAILABLE and creates nothing', async () => {
      arrangeStartPress({ event: eventRow({ status: 'CANCELLED' }) });

      await expect(
        service.startAttempt(USER_ID, EVENT_ID, startPress),
      ).rejects.toMatchObject({ code: TimingErrorCode.NOT_AVAILABLE });
      expect(repository.withTransaction).not.toHaveBeenCalled();
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('refuses a past-completed event with NOT_AVAILABLE', async () => {
      arrangeStartPress({
        event: eventRow({
          status: 'DONE',
          eventDate: new Date('2020-06-01T07:00:00.000Z'),
        }),
      });

      await expect(
        service.startAttempt(USER_ID, EVENT_ID, startPress),
      ).rejects.toMatchObject({ code: TimingErrorCode.NOT_AVAILABLE });
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('refuses a finished category', async () => {
      arrangeStartPress({ categoryFinished: true });

      await expect(
        service.startAttempt(USER_ID, EVENT_ID, startPress),
      ).rejects.toMatchObject({ code: TimingErrorCode.CATEGORY_FINISHED });
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('refuses a category whose every row is excluded', async () => {
      arrangeStartPress({
        enrollments: [
          enrollmentRow({
            enrollmentId: 'enrollment-race',
            result: {
              id: 'result-1',
              outcome: 'FINISHED',
              timeMilliseconds: 90_000,
              timingSessionId: null,
            },
          }),
        ],
      });

      await expect(
        service.startAttempt(USER_ID, EVENT_ID, startPress),
      ).rejects.toMatchObject({
        code: TimingErrorCode.NO_TIMEABLE_PARTICIPANT,
      });
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('refuses a timeable participant without a start number and names them', async () => {
      arrangeStartPress({
        enrollments: [
          enrollmentRow({ enrollmentId: 'enrollment-a', startNumber: 10 }),
          enrollmentRow({ enrollmentId: 'enrollment-b', startNumber: null }),
        ],
      });

      const refusal = await service
        .startAttempt(USER_ID, EVENT_ID, startPress)
        .catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(TimingDomainError);
      expect(refusal).toMatchObject({
        code: TimingErrorCode.MISSING_START_NUMBER,
        details: {
          participants: [
            {
              enrollmentId: 'enrollment-b',
              registrationId: 'registration-enrollment-b',
              fullName: 'Иван Петров',
            },
          ],
        },
      });
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('refuses a second Start while an attempt is running', async () => {
      arrangeStartPress({ attempts: [attemptRow({ id: 'attempt-1' })] });

      await expect(
        service.startAttempt(USER_ID, EVENT_ID, startPress),
      ).rejects.toMatchObject({ code: TimingErrorCode.ATTEMPT_RUNNING });
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('refuses a Start after a completed attempt', async () => {
      arrangeStartPress({
        attempts: [attemptRow({ id: 'attempt-1', status: 'COMPLETED' })],
      });

      await expect(
        service.startAttempt(USER_ID, EVENT_ID, startPress),
      ).rejects.toMatchObject({ code: TimingErrorCode.ATTEMPT_CLOSED });
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('refuses a workstation that does not hold capture and names the holder', async () => {
      arrangeStartPress({
        lock: { ...lockRow(), workstationInstanceId: 'workstation-b' },
      });

      const refusal = await service
        .startAttempt(USER_ID, EVENT_ID, startPress)
        .catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        code: TimingErrorCode.CAPTURE_NOT_HELD,
        details: {
          workstationInstanceId: WORKSTATION,
          holderWorkstationInstanceId: 'workstation-b',
        },
      });
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('refuses a protocol category that the event does not have', async () => {
      arrangeStartPress();

      await expect(
        service.startAttempt(USER_ID, EVENT_ID, {
          ...startPress,
          formatId: 9,
        }),
      ).rejects.toMatchObject({ code: TimingErrorCode.NOT_FOUND });
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('refuses a simultaneous second press read under the category lock', async () => {
      arrangeStartPress();
      // The pre-check saw only a cancellable history; the transaction, running
      // under the category lock, sees the attempt that won the race.
      repository.findAttemptsForCategory
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([attemptRow({ id: 'attempt-winner' })]);

      await expect(
        service.startAttempt(USER_ID, EVENT_ID, startPress),
      ).rejects.toMatchObject({ code: TimingErrorCode.ATTEMPT_RUNNING });
      expect(repository.lockCategory).toHaveBeenCalled();
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });
  });

  describe('startHeatAttempt', () => {
    function arrangeSeededHeat(options: {
      slots: RaceSlotView[];
      enrollments?: TimingHeatRosterEnrollmentRow[];
      heatTimes?: TimingHeatTimeRow[];
      attempts?: TimingAttemptRow[];
      race?: Partial<ClassCompetitionView>;
      stage?: Partial<RaceStageView>;
      lapCount?: number;
      event?: TimingEventRow;
      lock?: TimingCaptureLockRow | null;
    }): void {
      repository.findEvent.mockResolvedValue(options.event ?? eventRow());
      repository.listStarts.mockResolvedValue([
        startRow({ id: START_A, lapCount: options.lapCount ?? 3 }),
      ]);
      repository.listFormats.mockResolvedValue([formatRow(1, 1)]);
      classCompetitions.list.mockResolvedValue([
        raceView({
          ...options.race,
          stages: [
            stageView({
              stageId: 'stage-1',
              status: 'SEEDED',
              heats: [heatView({ heatNumber: 1, slots: options.slots })],
              ...options.stage,
            }),
          ],
        }),
      ]);
      repository.listEnrollmentsForRegistrations.mockResolvedValue(
        options.enrollments ?? [],
      );
      repository.listHeatTimesForHeat.mockResolvedValue(
        options.heatTimes ?? [],
      );
      repository.findHeatAttempts.mockResolvedValue(options.attempts ?? []);
      repository.getCaptureLock.mockResolvedValue(
        options.lock === undefined ? lockRow() : options.lock,
      );
      repository.createAttempt.mockImplementation(
        (_tx: unknown, input: CreateAttemptInput) =>
          Promise.resolve(
            attemptRow({
              id: 'heat-attempt-1',
              attemptKind: 'HEAT',
              classCompetitionId: input.classCompetitionId ?? null,
              stageId: input.stageId ?? null,
              heatNumber: input.heatNumber ?? null,
              startId: input.startId,
              formatId: input.formatId,
              gender: input.gender,
              attemptNumber: input.attemptNumber,
              participantCount: input.participants.length,
            }),
          ),
      );
      repository.createClockEpoch.mockResolvedValue(
        clockEpochRow({ id: 'epoch-heat', attemptId: 'heat-attempt-1' }),
      );
      repository.listParticipantRoster.mockResolvedValue([
        rosterRow({ enrollmentId: 'enrollment-active', startNumber: 10 }),
      ]);
    }

    it('freezes the heat roster, opens the first epoch and audits START', async () => {
      arrangeSeededHeat({
        slots: [
          slotView({ registrationId: 'reg-active', position: 1 }),
          slotView({ registrationId: 'reg-withdrawn', position: 2 }),
          slotView({ registrationId: 'reg-existing', position: 3 }),
          slotView({ registrationId: 'reg-missing', position: 4 }),
        ],
        enrollments: [
          heatEnrollmentRow({
            registrationId: 'reg-active',
            enrollmentId: 'enrollment-active',
            startNumber: 10,
          }),
          heatEnrollmentRow({
            registrationId: 'reg-withdrawn',
            enrollmentId: 'enrollment-withdrawn',
            startNumber: 11,
            registrationStatus: 'WITHDRAWN',
          }),
          heatEnrollmentRow({
            registrationId: 'reg-existing',
            enrollmentId: 'enrollment-existing',
            startNumber: 12,
          }),
        ],
        heatTimes: [heatTimeRow({ registrationId: 'reg-existing' })],
      });

      const result = await service.startHeatAttempt(
        USER_ID,
        EVENT_ID,
        startHeatDto(),
      );

      expect(repository.lockCategory).toHaveBeenCalledWith(
        TX,
        'heat:event-a:race-1:stage-1:1',
      );
      const [tx, input] = callArguments<[unknown, CreateAttemptInput]>(
        repository.createAttempt,
      );
      expect(tx).toBe(TX);
      expect(input).toMatchObject({
        eventId: EVENT_ID,
        startId: START_A,
        formatId: 1,
        gender: 'M',
        attemptKind: 'HEAT',
        classCompetitionId: 'race-1',
        stageId: 'stage-1',
        heatNumber: 1,
        attemptNumber: 1,
        officialStartedAt: NOW,
      });
      expect(
        input.participants.map((row) => [
          row.registrationId,
          row.excludedReason,
        ]),
      ).toEqual([
        ['reg-active', null],
        ['reg-withdrawn', 'WITHDRAWN'],
        ['reg-existing', 'EXISTING_HEAT_TIME'],
      ]);
      const [, epochInput] = callArguments<[unknown, CreateClockEpochInput]>(
        repository.createClockEpoch,
      );
      expect(epochInput).toMatchObject({
        attemptId: 'heat-attempt-1',
        workstationInstanceId: WORKSTATION,
        officialElapsedAnchorMs: 0,
      });
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        action: 'START',
        targetType: 'ATTEMPT',
        targetId: 'heat-attempt-1',
      });
      expect(auditInput.newValues).toMatchObject({
        attemptKind: 'HEAT',
        classCompetitionId: 'race-1',
        stageId: 'stage-1',
        heatNumber: 1,
        attemptNumber: 1,
        participantCount: 3,
      });
      expect(result.attempt.kind).toBe('HEAT');
      expect(result.attempt.attemptId).toBe('heat-attempt-1');
      expect(result.attempt.state).toBe('RUNNING');
      expect(result.epoch).toMatchObject({
        attemptId: 'heat-attempt-1',
        officialElapsedAnchorMs: 0,
        serverNow: NOW.toISOString(),
      });
    });

    it('refuses a heat start when a timeable participant has no number', async () => {
      arrangeSeededHeat({
        slots: [slotView({ registrationId: 'reg-1' })],
        enrollments: [
          heatEnrollmentRow({ registrationId: 'reg-1', startNumber: null }),
        ],
      });

      await expect(
        service.startHeatAttempt(USER_ID, EVENT_ID, startHeatDto()),
      ).rejects.toMatchObject({
        code: TimingErrorCode.MISSING_START_NUMBER,
        details: {
          participants: [{ registrationId: 'reg-1' }],
        },
      });
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('refuses a heat start when no participant is timeable', async () => {
      arrangeSeededHeat({
        slots: [slotView({ registrationId: 'reg-1' })],
        enrollments: [
          heatEnrollmentRow({
            registrationId: 'reg-1',
            registrationStatus: 'WITHDRAWN',
          }),
        ],
      });

      await expect(
        service.startHeatAttempt(USER_ID, EVENT_ID, startHeatDto()),
      ).rejects.toMatchObject({
        code: TimingErrorCode.NO_TIMEABLE_PARTICIPANT,
      });
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('refuses an unknown race, stage or heat without creating anything', async () => {
      arrangeSeededHeat({
        slots: [slotView({ registrationId: 'reg-1' })],
        enrollments: [heatEnrollmentRow({ registrationId: 'reg-1' })],
      });
      classCompetitions.list.mockResolvedValue([]);
      await expect(
        service.startHeatAttempt(USER_ID, EVENT_ID, startHeatDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.NOT_FOUND });

      arrangeSeededHeat({
        slots: [slotView({ registrationId: 'reg-1' })],
        enrollments: [heatEnrollmentRow({ registrationId: 'reg-1' })],
      });
      await expect(
        service.startHeatAttempt(
          USER_ID,
          EVENT_ID,
          startHeatDto({ stageId: 'stage-x' }),
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.NOT_FOUND });

      await expect(
        service.startHeatAttempt(
          USER_ID,
          EVENT_ID,
          startHeatDto({ heatNumber: 2 }),
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.NOT_FOUND });
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('refuses an unseeded stage and a done race', async () => {
      arrangeSeededHeat({
        slots: [slotView({ registrationId: 'reg-1' })],
        enrollments: [heatEnrollmentRow({ registrationId: 'reg-1' })],
        stage: { status: 'PENDING' },
      });
      await expect(
        service.startHeatAttempt(USER_ID, EVENT_ID, startHeatDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.INVALID_STATE });

      arrangeSeededHeat({
        slots: [slotView({ registrationId: 'reg-1' })],
        enrollments: [heatEnrollmentRow({ registrationId: 'reg-1' })],
        race: { status: 'DONE' },
      });
      await expect(
        service.startHeatAttempt(USER_ID, EVENT_ID, startHeatDto()),
      ).rejects.toMatchObject({
        code: TimingErrorCode.CATEGORY_FINISHED,
      });
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('refuses a cancelled event and a workstation without capture', async () => {
      arrangeSeededHeat({
        slots: [slotView({ registrationId: 'reg-1' })],
        enrollments: [heatEnrollmentRow({ registrationId: 'reg-1' })],
        event: eventRow({ status: 'CANCELLED' }),
      });
      await expect(
        service.startHeatAttempt(USER_ID, EVENT_ID, startHeatDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.NOT_AVAILABLE });

      arrangeSeededHeat({
        slots: [slotView({ registrationId: 'reg-1' })],
        enrollments: [heatEnrollmentRow({ registrationId: 'reg-1' })],
        lock: null,
      });
      await expect(
        service.startHeatAttempt(USER_ID, EVENT_ID, startHeatDto()),
      ).rejects.toMatchObject({
        code: TimingErrorCode.CAPTURE_NOT_HELD,
      });
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('refuses a running heat and a completed previous heat attempt', async () => {
      arrangeSeededHeat({
        slots: [slotView({ registrationId: 'reg-1' })],
        enrollments: [heatEnrollmentRow({ registrationId: 'reg-1' })],
        attempts: [
          attemptRow({
            id: 'heat-attempt-running',
            attemptKind: 'HEAT',
            classCompetitionId: 'race-1',
            stageId: 'stage-1',
            heatNumber: 1,
            status: 'RUNNING',
          }),
        ],
      });
      await expect(
        service.startHeatAttempt(USER_ID, EVENT_ID, startHeatDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.ATTEMPT_RUNNING });

      arrangeSeededHeat({
        slots: [slotView({ registrationId: 'reg-1' })],
        enrollments: [heatEnrollmentRow({ registrationId: 'reg-1' })],
        attempts: [
          attemptRow({
            id: 'heat-attempt-completed',
            attemptKind: 'HEAT',
            classCompetitionId: 'race-1',
            stageId: 'stage-1',
            heatNumber: 1,
            status: 'COMPLETED',
          }),
        ],
      });
      await expect(
        service.startHeatAttempt(USER_ID, EVENT_ID, startHeatDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.ATTEMPT_CLOSED });
      expect(repository.createAttempt).not.toHaveBeenCalled();
    });

    it('lets a heat start beside a running category attempt of the same race', async () => {
      arrangeSeededHeat({
        slots: [slotView({ registrationId: 'reg-1' })],
        enrollments: [heatEnrollmentRow({ registrationId: 'reg-1' })],
      });
      repository.findAttemptsForCategory.mockResolvedValue([
        attemptRow({ id: 'category-attempt', status: 'RUNNING' }),
      ]);

      const result = await service.startHeatAttempt(
        USER_ID,
        EVENT_ID,
        startHeatDto(),
      );

      expect(repository.createAttempt).toHaveBeenCalledTimes(1);
      expect(result.attempt.kind).toBe('HEAT');
      expect(result.attempt.attemptId).toBe('heat-attempt-1');
    });
  });

  describe('openClockEpoch', () => {
    function arrangeEpochOpen(
      attempt: TimingAttemptRow,
      lock: TimingCaptureLockRow | null = lockRow(),
    ): void {
      repository.findEvent.mockResolvedValue(eventRow());
      repository.findAttempt.mockResolvedValue(attempt);
      repository.getCaptureLock.mockResolvedValue(lock);
      repository.createClockEpoch.mockImplementation(
        (_tx: unknown, input: CreateClockEpochInput) =>
          clockEpochRow({
            id: 'epoch-2',
            attemptId: input.attemptId,
            officialElapsedAnchorMs: input.officialElapsedAnchorMs,
            openedAt: input.openedAt ?? NOW,
          }),
      );
      repository.insertAudit.mockImplementation(
        (_tx: unknown, input: InsertAuditInput) => ({
          auditId: 'audit-1',
          actorUserId: input.actorUserId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          oldValues: null,
          newValues: null,
          reason: null,
          createdAt: NOW,
        }),
      );
    }

    it('closes the open epochs and anchors the new one at the real elapsed time', async () => {
      arrangeEpochOpen(
        attemptRow({
          id: 'attempt-1',
          officialStartedAt: new Date(NOW.getTime() - 300_000),
        }),
      );

      const epoch = await service.openClockEpoch(
        USER_ID,
        EVENT_ID,
        'attempt-1',
        {
          workstationInstanceId: WORKSTATION,
        },
      );

      expect(repository.closeOpenEpochs).toHaveBeenCalledWith(
        expect.anything(),
        'attempt-1',
      );
      expect(
        repository.closeOpenEpochs.mock.invocationCallOrder[0],
      ).toBeLessThan(repository.createClockEpoch.mock.invocationCallOrder[0]);
      const [, epochInput] = callArguments<[unknown, CreateClockEpochInput]>(
        repository.createClockEpoch,
      );
      expect(epochInput.officialElapsedAnchorMs).toBe(300_000);
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        action: 'EPOCH_OPEN',
        targetType: 'CLOCK_EPOCH',
        targetId: 'epoch-2',
        newValues: {
          workstationInstanceId: WORKSTATION,
          officialElapsedAnchorMs: 300_000,
        },
      });
      expect(epoch).toEqual({
        epochId: 'epoch-2',
        attemptId: 'attempt-1',
        officialElapsedAnchorMs: 300_000,
        serverNow: NOW.toISOString(),
      });
    });

    it('clamps a clock that reads before the official start to zero', async () => {
      arrangeEpochOpen(
        attemptRow({
          id: 'attempt-1',
          officialStartedAt: new Date(NOW.getTime() + 5_000),
        }),
      );

      const epoch = await service.openClockEpoch(
        USER_ID,
        EVENT_ID,
        'attempt-1',
        {
          workstationInstanceId: WORKSTATION,
        },
      );

      expect(epoch.officialElapsedAnchorMs).toBe(0);
    });

    it('refuses an attempt that is not running', async () => {
      arrangeEpochOpen(
        attemptRow({ id: 'attempt-1', status: 'COMPLETED', closedAt: NOW }),
      );

      await expect(
        service.openClockEpoch(USER_ID, EVENT_ID, 'attempt-1', {
          workstationInstanceId: WORKSTATION,
        }),
      ).rejects.toMatchObject({ code: TimingErrorCode.ATTEMPT_CLOSED });
      expect(repository.createClockEpoch).not.toHaveBeenCalled();
    });

    it('refuses a workstation that does not hold capture', async () => {
      arrangeEpochOpen(attemptRow({ id: 'attempt-1' }), {
        ...lockRow(),
        workstationInstanceId: 'workstation-b',
      });

      await expect(
        service.openClockEpoch(USER_ID, EVENT_ID, 'attempt-1', {
          workstationInstanceId: WORKSTATION,
        }),
      ).rejects.toMatchObject({ code: TimingErrorCode.CAPTURE_NOT_HELD });
      expect(repository.createClockEpoch).not.toHaveBeenCalled();
    });
  });

  describe('capturePass', () => {
    function arrangeCapture(
      overrides: {
        attempt?: TimingAttemptRow;
        lock?: TimingCaptureLockRow | null;
        epoch?: TimingClockEpochRow | null;
        receipt?: TimingReceiptRow | null;
        participants?: TimingParticipantRow[];
        candidates?: TimingRoutingCandidateRow[];
        knownNumber?: boolean;
        marks?: TimingMarkRow[];
      } = {},
    ): void {
      repository.findAttempt.mockResolvedValue(
        overrides.attempt ?? attemptRow({ id: ATTEMPT_ID }),
      );
      repository.getCaptureLock.mockResolvedValue(
        overrides.lock === undefined ? lockRow() : overrides.lock,
      );
      repository.findOpenEpoch.mockResolvedValue(
        overrides.epoch === undefined
          ? clockEpochRow({ id: 'epoch-1', attemptId: ATTEMPT_ID })
          : overrides.epoch,
      );
      repository.findReceipt.mockResolvedValue(overrides.receipt ?? null);
      const participants = overrides.participants ?? [
        participantRow({ enrollmentId: 'enrollment-a' }),
      ];
      repository.findParticipant.mockImplementation(
        (
          _attemptId: string,
          enrollmentId: string,
        ): Promise<TimingParticipantRow | null> =>
          Promise.resolve(
            participants.find((row) => row.enrollmentId === enrollmentId) ??
              null,
          ),
      );
      repository.findRoutingCandidates.mockResolvedValue(
        overrides.candidates ?? [],
      );
      repository.existsStartNumber.mockResolvedValue(
        overrides.knownNumber ?? false,
      );
      repository.listMarks.mockResolvedValue(overrides.marks ?? []);
      const written = new Map<string, TimingMarkRow>(
        (overrides.marks ?? []).map((mark) => [mark.id, mark]),
      );
      repository.createMark.mockImplementation(
        (_tx: unknown, input: CreateMarkInput) => {
          const created = markRow({
            id: 'mark-new',
            attemptId: input.attemptId,
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
          });
          written.set(created.id, created);
          return created;
        },
      );
      repository.updateMark.mockImplementation(
        (_tx: unknown, markId: string, input: UpdateMarkInput) => {
          const updated = markRow({
            ...(written.get(markId) ?? markRow({ id: markId })),
            ...(input.lapNumber === undefined
              ? {}
              : { lapNumber: input.lapNumber }),
            ...(input.status === undefined ? {} : { status: input.status }),
          });
          written.set(markId, updated);
          return updated;
        },
      );
      repository.createAnonymousSplit.mockImplementation(
        (_tx: unknown, input: CreateAnonymousSplitInput) => {
          const created = markRow({
            id: 'split-new',
            attemptId: input.attemptId,
            clockEpochId: input.clockEpochId,
            enrollmentId: null,
            registrationId: null,
            startNumber: null,
            kind: 'ANONYMOUS_SPLIT',
            rawCapturedAt: input.rawCapturedAt,
            rawElapsedMs: input.rawElapsedMs,
            officialAt: input.officialAt,
            officialElapsedMs: input.officialElapsedMs,
            lapNumber: null,
            status: 'PENDING',
            workstationInstanceId: input.workstationInstanceId,
            deviceSequence: input.deviceSequence,
            idempotencyKey: input.idempotencyKey,
          });
          written.set(created.id, created);
          return Promise.resolve(created);
        },
      );
      repository.createReceipt.mockImplementation(
        (_tx: unknown, input: CreateReceiptInput): TimingReceiptRow => ({
          attemptId: input.attemptId,
          workstationInstanceId: input.workstationInstanceId,
          deviceSequence: input.deviceSequence,
          status: input.status,
          reason: input.reason,
          createdAt: NOW,
        }),
      );
      repository.insertAudit.mockImplementation(
        (_tx: unknown, input: InsertAuditInput) => ({
          auditId: 'audit-1',
          actorUserId: input.actorUserId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          oldValues: null,
          newValues: null,
          reason: null,
          createdAt: NOW,
        }),
      );
    }

    it('routes one committed number to the single eligible enrollment', async () => {
      arrangeCapture({
        candidates: [
          candidateRow({ enrollmentId: 'enrollment-a', startNumber: 10 }),
        ],
        participants: [
          participantRow({ enrollmentId: 'enrollment-a', startNumber: 10 }),
        ],
      });

      const pass = await service.capturePass(
        USER_ID,
        EVENT_ID,
        capturePassDto(),
        'key-1',
      );

      expect(roles.assertHasAnyRole).toHaveBeenCalledWith(
        USER_ID,
        TIMING_OPERATE_ROLES,
      );
      expect(repository.findRoutingCandidates).toHaveBeenCalledWith(
        EVENT_ID,
        { startNumber: 10 },
        TX,
      );
      expect(repository.findParticipant).toHaveBeenCalledWith(
        ATTEMPT_ID,
        'enrollment-a',
        TX,
      );
      const [, markInput] = callArguments<[unknown, CreateMarkInput]>(
        repository.createMark,
      );
      expect(markInput).toEqual({
        attemptId: ATTEMPT_ID,
        clockEpochId: 'epoch-1',
        enrollmentId: 'enrollment-a',
        registrationId: 'registration-enrollment-a',
        startNumber: 10,
        kind: 'PASS',
        rawCapturedAt: NOW,
        rawElapsedMs: 30_000,
        officialAt: new Date(NOW.getTime() + 30_000),
        officialElapsedMs: 30_000,
        lapNumber: null,
        status: 'BOUND',
        workstationInstanceId: WORKSTATION,
        deviceSequence: 1,
        idempotencyKey: 'key-1',
      });
      const [, receiptInput] = callArguments<[unknown, CreateReceiptInput]>(
        repository.createReceipt,
      );
      expect(receiptInput).toEqual({
        attemptId: ATTEMPT_ID,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 1,
        status: 'APPLIED',
        reason: null,
      });
      expect(repository.updateMark).toHaveBeenCalledWith(TX, 'mark-new', {
        lapNumber: 1,
      });
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        attemptId: ATTEMPT_ID,
        actorUserId: USER_ID,
        action: 'PASS_CAPTURE',
        targetType: 'PASS',
        targetId: 'mark-new',
        reason: null,
        newValues: {
          kind: 'NUMBER',
          enrollmentId: 'enrollment-a',
          startNumber: 10,
          lapNumber: 1,
          rawCapturedAt: NOW.toISOString(),
          rawElapsedMs: 30_000,
          officialAt: new Date(NOW.getTime() + 30_000).toISOString(),
          officialElapsedMs: 30_000,
          clockEpochId: 'epoch-1',
          workstationInstanceId: WORKSTATION,
          deviceSequence: 1,
          idempotencyKey: 'key-1',
        },
      });
      expect(pass).toEqual({
        passId: 'mark-new',
        attemptId: ATTEMPT_ID,
        enrollmentId: 'enrollment-a',
        lapNumber: 1,
        rawCapturedAt: NOW.toISOString(),
        officialAt: new Date(NOW.getTime() + 30_000).toISOString(),
        officialElapsedMs: 30_000,
        status: 'BOUND',
      });
    });

    it('captures a tile by enrollment without routing a number', async () => {
      arrangeCapture({
        participants: [
          participantRow({ enrollmentId: 'enrollment-b', startNumber: 22 }),
        ],
      });

      const pass = await service.capturePass(
        USER_ID,
        EVENT_ID,
        capturePassDto({
          kind: 'TILE',
          startNumber: undefined,
          enrollmentId: 'enrollment-b',
          deviceSequence: 2,
        }),
        'key-2',
      );

      expect(repository.findRoutingCandidates).not.toHaveBeenCalled();
      expect(repository.findParticipant).toHaveBeenCalledWith(
        ATTEMPT_ID,
        'enrollment-b',
        TX,
      );
      const [, markInput] = callArguments<[unknown, CreateMarkInput]>(
        repository.createMark,
      );
      expect(markInput).toMatchObject({
        enrollmentId: 'enrollment-b',
        registrationId: 'registration-enrollment-b',
        startNumber: 22,
        kind: 'PASS',
        status: 'BOUND',
        deviceSequence: 2,
      });
      expect(pass).toMatchObject({
        enrollmentId: 'enrollment-b',
        lapNumber: 1,
        status: 'BOUND',
      });
    });

    it('refuses a tile whose enrollment is not a frozen participant', async () => {
      arrangeCapture({
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
      });

      await expect(
        service.capturePass(
          USER_ID,
          EVENT_ID,
          capturePassDto({
            kind: 'TILE',
            startNumber: undefined,
            enrollmentId: 'enrollment-elsewhere',
            deviceSequence: 2,
          }),
          'key-2',
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.NOT_FOUND });
      expect(repository.createMark).not.toHaveBeenCalled();
    });

    it('asks for a choice when the number resolves to two eligible enrollments', async () => {
      arrangeCapture({
        candidates: [
          candidateRow({
            enrollmentId: 'enrollment-a',
            attemptId: 'attempt-a',
          }),
          candidateRow({
            enrollmentId: 'enrollment-b',
            attemptId: 'attempt-b',
          }),
        ],
      });

      const refusal = await service
        .capturePass(USER_ID, EVENT_ID, capturePassDto(), 'key-1')
        .catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(TimingDomainError);
      expect(refusal).toMatchObject({
        code: TimingErrorCode.NUMBER_AMBIGUOUS,
        details: {
          startNumber: 10,
          enrollmentIds: ['enrollment-a', 'enrollment-b'],
        },
      });
      expect(repository.createMark).not.toHaveBeenCalled();
      expect(repository.createReceipt).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('names an unknown number without creating a pass', async () => {
      arrangeCapture({ candidates: [], knownNumber: false });

      await expect(
        service.capturePass(USER_ID, EVENT_ID, capturePassDto(), 'key-1'),
      ).rejects.toMatchObject({
        code: TimingErrorCode.NUMBER_UNKNOWN,
        details: { startNumber: 10 },
      });
      expect(repository.existsStartNumber).toHaveBeenCalledWith(
        EVENT_ID,
        10,
        TX,
      );
      expect(repository.createMark).not.toHaveBeenCalled();
    });

    it('names a number whose attempt has not started or is closed', async () => {
      arrangeCapture({ candidates: [], knownNumber: true });

      await expect(
        service.capturePass(USER_ID, EVENT_ID, capturePassDto(), 'key-1'),
      ).rejects.toMatchObject({ code: TimingErrorCode.ATTEMPT_CLOSED });
      expect(repository.createMark).not.toHaveBeenCalled();
    });

    it('names an excluded participant', async () => {
      arrangeCapture({
        candidates: [
          candidateRow({
            enrollmentId: 'enrollment-race',
            excludedReason: 'RACE_SECTION',
          }),
        ],
      });

      await expect(
        service.capturePass(USER_ID, EVENT_ID, capturePassDto(), 'key-1'),
      ).rejects.toMatchObject({
        code: TimingErrorCode.EXCLUDED_PARTICIPANT,
        details: { startNumber: 10, reason: 'EXCLUDED' },
      });
      expect(repository.createMark).not.toHaveBeenCalled();
    });

    it('names a participant that already holds N passes', async () => {
      arrangeCapture({
        candidates: [
          candidateRow({
            enrollmentId: 'enrollment-a',
            passCount: 3,
            requiredLaps: 3,
          }),
        ],
      });

      await expect(
        service.capturePass(USER_ID, EVENT_ID, capturePassDto(), 'key-1'),
      ).rejects.toMatchObject({ code: TimingErrorCode.ALREADY_N_PASSES });
      expect(repository.createMark).not.toHaveBeenCalled();
    });

    it('refuses a number that routes to another attempt than the addressed one', async () => {
      arrangeCapture({
        candidates: [
          candidateRow({
            enrollmentId: 'enrollment-a',
            attemptId: 'attempt-other',
          }),
        ],
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
      });

      const refusal = await service
        .capturePass(USER_ID, EVENT_ID, capturePassDto(), 'key-1')
        .catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        code: TimingErrorCode.INVALID_STATE,
        details: {
          attemptId: ATTEMPT_ID,
          routedAttemptId: 'attempt-other',
          enrollmentId: 'enrollment-a',
        },
      });
      expect(repository.createMark).not.toHaveBeenCalled();
      expect(repository.createReceipt).not.toHaveBeenCalled();
    });

    it('creates an unbound pending finish with no participant and no lap', async () => {
      arrangeCapture();

      const pass = await service.capturePass(
        USER_ID,
        EVENT_ID,
        capturePassDto({
          kind: 'PENDING_FINISH',
          startNumber: undefined,
          deviceSequence: 7,
        }),
        'key-7',
      );

      expect(repository.findRoutingCandidates).not.toHaveBeenCalled();
      expect(repository.findParticipant).not.toHaveBeenCalled();
      expect(repository.updateMark).not.toHaveBeenCalled();
      const [, markInput] = callArguments<[unknown, CreateMarkInput]>(
        repository.createMark,
      );
      expect(markInput).toMatchObject({
        kind: 'PENDING_FINISH',
        status: 'PENDING',
        enrollmentId: null,
        registrationId: null,
        startNumber: null,
        lapNumber: null,
      });
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        action: 'PENDING_FINISH_CAPTURE',
        targetType: 'PASS',
        targetId: 'mark-new',
      });
      expect(pass).toMatchObject({
        passId: 'mark-new',
        enrollmentId: null,
        lapNumber: null,
        status: 'PENDING',
      });
    });

    it('captures an anonymous split with no participant, no lap and no routing', async () => {
      arrangeCapture();

      const pass = await service.capturePass(
        USER_ID,
        EVENT_ID,
        capturePassDto({
          kind: 'ANONYMOUS_SPLIT',
          startNumber: undefined,
          deviceSequence: 6,
        }),
        'key-6',
      );

      // AD-17: no number routing, no participant lookup, no pass mark and no
      // N check; the split is its own pending mark of the attempt.
      expect(repository.findRoutingCandidates).not.toHaveBeenCalled();
      expect(repository.findParticipant).not.toHaveBeenCalled();
      expect(repository.createMark).not.toHaveBeenCalled();
      const [, splitInput] = callArguments<
        [unknown, CreateAnonymousSplitInput]
      >(repository.createAnonymousSplit);
      expect(splitInput).toEqual({
        attemptId: ATTEMPT_ID,
        clockEpochId: 'epoch-1',
        rawCapturedAt: NOW,
        rawElapsedMs: 30_000,
        officialAt: new Date(NOW.getTime() + 30_000),
        officialElapsedMs: 30_000,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 6,
        idempotencyKey: 'key-6',
      });
      const [, receiptInput] = callArguments<[unknown, CreateReceiptInput]>(
        repository.createReceipt,
      );
      expect(receiptInput).toEqual({
        attemptId: ATTEMPT_ID,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 6,
        status: 'APPLIED',
        reason: null,
      });
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        attemptId: ATTEMPT_ID,
        actorUserId: USER_ID,
        action: 'ANONYMOUS_SPLIT_CAPTURE',
        targetType: 'ANONYMOUS_SPLIT',
        targetId: 'split-new',
        reason: null,
        newValues: {
          kind: 'ANONYMOUS_SPLIT',
          enrollmentId: null,
          startNumber: null,
          lapNumber: null,
          officialElapsedMs: 30_000,
          workstationInstanceId: WORKSTATION,
          deviceSequence: 6,
          idempotencyKey: 'key-6',
        },
      });
      expect(pass).toEqual({
        passId: 'split-new',
        attemptId: ATTEMPT_ID,
        enrollmentId: null,
        lapNumber: null,
        rawCapturedAt: NOW.toISOString(),
        officialAt: new Date(NOW.getTime() + 30_000).toISOString(),
        officialElapsedMs: 30_000,
        status: 'PENDING',
      });
    });

    it('closes a refused tile sequence with a REJECTED receipt', async () => {
      arrangeCapture({
        participants: [
          participantRow({
            enrollmentId: 'enrollment-race',
            excludedReason: 'RACE_SECTION',
          }),
        ],
      });

      const refusal = await service
        .capturePass(
          USER_ID,
          EVENT_ID,
          capturePassDto({
            kind: 'TILE',
            startNumber: undefined,
            enrollmentId: 'enrollment-race',
            deviceSequence: 4,
          }),
          'key-4',
        )
        .catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        code: TimingErrorCode.EXCLUDED_PARTICIPANT,
        details: {
          enrollmentId: 'enrollment-race',
          excludedReason: 'RACE_SECTION',
        },
      });
      expect(repository.createMark).not.toHaveBeenCalled();
      expect(repository.createReceipt).not.toHaveBeenCalled();
      const [, rejectedInput] = callArguments<
        [unknown, CreateRejectedReceiptInput]
      >(repository.createRejectedReceipt);
      expect(rejectedInput).toEqual({
        attemptId: ATTEMPT_ID,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 4,
        reason: TimingErrorCode.EXCLUDED_PARTICIPANT,
      });
    });

    it('refuses a device sequence that already has a receipt', async () => {
      arrangeCapture({ receipt: receiptRow() });

      const refusal = await service
        .capturePass(USER_ID, EVENT_ID, capturePassDto(), 'key-1')
        .catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        code: TimingErrorCode.CONFLICT,
        details: {
          attemptId: ATTEMPT_ID,
          workstationInstanceId: WORKSTATION,
          deviceSequence: 1,
          receiptStatus: 'APPLIED',
        },
      });
      expect(repository.findReceipt).toHaveBeenCalledWith(
        TX,
        ATTEMPT_ID,
        WORKSTATION,
        1,
      );
      expect(repository.createMark).not.toHaveBeenCalled();
      expect(repository.createReceipt).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('refuses a tile pass beyond N and changes nothing', async () => {
      arrangeCapture({
        participants: [
          participantRow({ enrollmentId: 'enrollment-a', requiredLaps: 2 }),
        ],
        marks: [
          markRow({ id: 'mark-1', officialElapsedMs: 30_000 }),
          markRow({
            id: 'mark-2',
            officialElapsedMs: 60_000,
            officialAt: new Date(NOW.getTime() + 60_000),
            lapNumber: 2,
          }),
        ],
      });

      await expect(
        service.capturePass(
          USER_ID,
          EVENT_ID,
          capturePassDto({
            kind: 'TILE',
            startNumber: undefined,
            enrollmentId: 'enrollment-a',
            deviceSequence: 3,
          }),
          'key-3',
        ),
      ).rejects.toMatchObject({
        code: TimingErrorCode.ALREADY_N_PASSES,
        details: { passCount: 2, requiredLaps: 2 },
      });
      expect(repository.createMark).not.toHaveBeenCalled();
      expect(repository.createReceipt).not.toHaveBeenCalled();
    });

    it('refuses a capture at or before the start and beyond 24 hours', async () => {
      arrangeCapture({
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
      });

      await expect(
        service.capturePass(
          USER_ID,
          EVENT_ID,
          capturePassDto({
            kind: 'TILE',
            startNumber: undefined,
            enrollmentId: 'enrollment-a',
            clientElapsedMs: 0,
          }),
          'key-1',
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.OUT_OF_BOUNDS });
      await expect(
        service.capturePass(
          USER_ID,
          EVENT_ID,
          capturePassDto({
            kind: 'TILE',
            startNumber: undefined,
            enrollmentId: 'enrollment-a',
            clientElapsedMs: TIMING_MAX_TOTAL_MS + 1,
          }),
          'key-1',
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.OUT_OF_BOUNDS });
      expect(repository.createMark).not.toHaveBeenCalled();
      expect(repository.createReceipt).not.toHaveBeenCalled();
    });

    it('renumbers laps when a capture lands before existing official instants', async () => {
      arrangeCapture({
        candidates: [candidateRow({ enrollmentId: 'enrollment-a' })],
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        marks: [
          markRow({
            id: 'mark-existing-1',
            officialElapsedMs: 60_000,
            officialAt: new Date(NOW.getTime() + 60_000),
            lapNumber: 1,
          }),
          markRow({
            id: 'mark-existing-2',
            officialElapsedMs: 90_000,
            officialAt: new Date(NOW.getTime() + 90_000),
            lapNumber: 2,
          }),
        ],
      });

      const pass = (await service.capturePass(
        USER_ID,
        EVENT_ID,
        capturePassDto({ deviceSequence: 3 }),
        'key-3',
      )) as TimingPassView;

      expect(repository.updateMark.mock.calls).toEqual([
        [TX, 'mark-new', { lapNumber: 1 }],
        [TX, 'mark-existing-1', { lapNumber: 2 }],
        [TX, 'mark-existing-2', { lapNumber: 3 }],
      ]);
      expect(pass.lapNumber).toBe(1);
    });

    it('writes the mark, its receipt and its audit in one transaction', async () => {
      arrangeCapture();

      await service.capturePass(
        USER_ID,
        EVENT_ID,
        capturePassDto({
          kind: 'PENDING_FINISH',
          startNumber: undefined,
          deviceSequence: 5,
        }),
        'key-5',
      );

      const transactionOf = (mock: jest.Mock): unknown =>
        callArguments<[unknown]>(mock)[0];
      expect(transactionOf(repository.createMark)).toBe(TX);
      expect(transactionOf(repository.createReceipt)).toBe(TX);
      expect(transactionOf(repository.insertAudit)).toBe(TX);
      expect(repository.findReceipt).toHaveBeenCalledWith(
        TX,
        ATTEMPT_ID,
        WORKSTATION,
        5,
      );
      expect(repository.createMark.mock.invocationCallOrder[0]).toBeLessThan(
        repository.createReceipt.mock.invocationCallOrder[0],
      );
      expect(repository.createReceipt.mock.invocationCallOrder[0]).toBeLessThan(
        repository.insertAudit.mock.invocationCallOrder[0],
      );
    });

    it('refuses a capture on a closed attempt', async () => {
      arrangeCapture({
        attempt: attemptRow({
          id: ATTEMPT_ID,
          status: 'COMPLETED',
          closedAt: NOW,
        }),
      });

      await expect(
        service.capturePass(USER_ID, EVENT_ID, capturePassDto(), 'key-1'),
      ).rejects.toMatchObject({ code: TimingErrorCode.ATTEMPT_CLOSED });
      expect(repository.findReceipt).not.toHaveBeenCalled();
      expect(repository.createMark).not.toHaveBeenCalled();
    });

    it('refuses a capture from a workstation that does not hold it', async () => {
      arrangeCapture({
        lock: { ...lockRow(), workstationInstanceId: 'workstation-b' },
      });

      const refusal = await service
        .capturePass(USER_ID, EVENT_ID, capturePassDto(), 'key-1')
        .catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        code: TimingErrorCode.CAPTURE_NOT_HELD,
        details: {
          workstationInstanceId: WORKSTATION,
          holderWorkstationInstanceId: 'workstation-b',
        },
      });
      // AD-18: the refused capture still leaves a final receipt for its issued
      // sequence, so it cannot become an unconfirmed gap at closure.
      const rejectedInput = callArguments<
        [unknown, CreateRejectedReceiptInput]
      >(repository.createRejectedReceipt)[1];
      expect(rejectedInput).toEqual({
        attemptId: ATTEMPT_ID,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 1,
        reason: TimingErrorCode.CAPTURE_NOT_HELD,
      });
      expect(repository.createMark).not.toHaveBeenCalled();
    });

    it('refuses a capture without an open epoch on this workstation', async () => {
      arrangeCapture({ epoch: null });

      await expect(
        service.capturePass(USER_ID, EVENT_ID, capturePassDto(), 'key-1'),
      ).rejects.toMatchObject({ code: TimingErrorCode.CAPTURE_NOT_HELD });
      expect(repository.createMark).not.toHaveBeenCalled();
      const rejectedInput = callArguments<
        [unknown, CreateRejectedReceiptInput]
      >(repository.createRejectedReceipt)[1];
      expect(rejectedInput).toMatchObject({
        deviceSequence: 1,
        reason: TimingErrorCode.CAPTURE_NOT_HELD,
      });
    });

    it('refuses a clock epoch that is not the open one', async () => {
      arrangeCapture({
        epoch: clockEpochRow({ id: 'epoch-2', attemptId: ATTEMPT_ID }),
      });

      const refusal = await service
        .capturePass(USER_ID, EVENT_ID, capturePassDto(), 'key-1')
        .catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        code: TimingErrorCode.INVALID_STATE,
        details: { clockEpochId: 'epoch-1', openEpochId: 'epoch-2' },
      });
      expect(repository.createMark).not.toHaveBeenCalled();
    });
  });

  describe('getAttemptRecord', () => {
    it('maps passes in official order, pending finishes, the report, results and audit', async () => {
      repository.findAttempt.mockResolvedValue(
        attemptRow({
          id: 'attempt-1',
          status: 'COMPLETED',
          closedAt: NOW,
          closureReport: {
            publishedEnrollmentIds: ['enrollment-a'],
            unpublishedEnrollmentIds: [],
            conflictEnrollmentIds: [],
          },
        }),
      );
      repository.listMarks.mockResolvedValue([
        markRow({
          id: 'mark-late',
          officialAt: new Date(NOW.getTime() + 60_000),
          officialElapsedMs: 60_000,
          lapNumber: 2,
        }),
        markRow({
          id: 'mark-early',
          officialAt: new Date(NOW.getTime() + 30_000),
          officialElapsedMs: 30_000,
        }),
        markRow({
          id: 'mark-cancelled',
          status: 'CANCELLED',
          officialAt: new Date(NOW.getTime() + 20_000),
          officialElapsedMs: 20_000,
          lapNumber: null,
        }),
        markRow({
          id: 'mark-pending',
          kind: 'PENDING_FINISH',
          status: 'PENDING',
          enrollmentId: null,
          registrationId: null,
          startNumber: null,
          lapNumber: null,
          officialAt: new Date(NOW.getTime() + 40_000),
          officialElapsedMs: 40_000,
        }),
      ]);
      repository.listPendingFinishes.mockResolvedValue([
        markRow({
          id: 'mark-pending',
          kind: 'PENDING_FINISH',
          status: 'PENDING',
          enrollmentId: null,
          registrationId: null,
          startNumber: null,
          lapNumber: null,
        }),
      ]);
      repository.listPublishedResults.mockResolvedValue([
        publishedResultRow({ id: 'result-1' }),
      ]);
      repository.listAudit.mockResolvedValue([
        {
          auditId: 'audit-1',
          actorUserId: null,
          action: 'START',
          targetType: 'ATTEMPT',
          targetId: 'attempt-1',
          oldValues: null,
          newValues: { participantCount: 3 },
          reason: null,
          createdAt: NOW,
        },
      ]);

      const record = await service.getAttemptRecord(
        USER_ID,
        EVENT_ID,
        'attempt-1',
      );

      expect(record).toMatchObject({
        attemptId: 'attempt-1',
        state: 'COMPLETED',
        officialStartedAt: NOW.toISOString(),
        closureReport: {
          publishedEnrollmentIds: ['enrollment-a'],
          unpublishedEnrollmentIds: [],
          conflictEnrollmentIds: [],
        },
      });
      expect(record.passes.map((pass) => pass.passId)).toEqual([
        'mark-cancelled',
        'mark-early',
        'mark-late',
      ]);
      expect(record.passes[0].status).toBe('CANCELLED');
      expect(record.pendingFinishes.map((finish) => finish.passId)).toEqual([
        'mark-pending',
      ]);
      expect(record.publishedResults).toEqual([
        {
          id: 'result-1',
          enrollmentId: 'enrollment-a',
          registrationId: 'registration-enrollment-a',
          outcome: 'FINISHED',
          timeMilliseconds: 90_000,
          recordedAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
          laps: [
            { lapNumber: 1, lapTimeMs: 30_000, cumulativeMs: 30_000 },
            { lapNumber: 2, lapTimeMs: 30_000, cumulativeMs: 60_000 },
            { lapNumber: 3, lapTimeMs: 30_000, cumulativeMs: 90_000 },
          ],
        },
      ]);
      expect(record.audit).toEqual([
        {
          auditId: 'audit-1',
          actorUserId: '',
          action: 'START',
          targetType: 'ATTEMPT',
          targetId: 'attempt-1',
          oldValues: null,
          newValues: { participantCount: 3 },
          reason: null,
          createdAt: NOW.toISOString(),
        },
      ]);
      expect(repository.createAttempt).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('omits laps for a published result without a split set', async () => {
      repository.findAttempt.mockResolvedValue(attemptRow({ id: 'attempt-1' }));
      repository.listPublishedResults.mockResolvedValue([
        publishedResultRow({ id: 'result-1', laps: [] }),
      ]);

      const record = await service.getAttemptRecord(
        USER_ID,
        EVENT_ID,
        'attempt-1',
      );

      expect(record.publishedResults[0]).not.toHaveProperty('laps');
    });

    it('refuses an attempt of another event', async () => {
      repository.findAttempt.mockResolvedValue(
        attemptRow({ id: 'attempt-1', eventId: 'event-b' }),
      );

      await expect(
        service.getAttemptRecord(USER_ID, EVENT_ID, 'attempt-1'),
      ).rejects.toMatchObject({ code: TimingErrorCode.NOT_FOUND });
    });
  });

  describe('bindPendingFinish', () => {
    type PendingArrange = {
      attempt?: TimingAttemptRow;
      lock?: TimingCaptureLockRow | null;
      marks?: TimingMarkRow[];
      receipt?: TimingReceiptRow | null;
      participants?: TimingParticipantRow[];
      audit?: TimingAuditRow[];
    };

    function arrangePending(overrides: PendingArrange = {}): void {
      repository.findAttempt.mockResolvedValue(
        overrides.attempt ?? attemptRow({ id: ATTEMPT_ID }),
      );
      repository.getCaptureLock.mockResolvedValue(
        overrides.lock === undefined ? lockRow() : overrides.lock,
      );
      const participants = overrides.participants ?? [
        participantRow({ enrollmentId: 'enrollment-a' }),
      ];
      const written = new Map(
        (overrides.marks ?? [pendingMarkRow()]).map((mark) => [mark.id, mark]),
      );
      repository.findMark.mockImplementation(
        (markId: string): Promise<TimingMarkRow | null> =>
          Promise.resolve(written.get(markId) ?? null),
      );
      repository.listMarks.mockResolvedValue(
        overrides.marks ?? [pendingMarkRow()],
      );
      repository.listAudit.mockResolvedValue(overrides.audit ?? []);
      repository.findReceipt.mockResolvedValue(overrides.receipt ?? null);
      repository.findParticipant.mockImplementation(
        (
          _attemptId: string,
          enrollmentId: string,
        ): Promise<TimingParticipantRow | null> =>
          Promise.resolve(
            participants.find((row) => row.enrollmentId === enrollmentId) ??
              null,
          ),
      );
      repository.findParticipantByStartNumber.mockImplementation(
        (
          _attemptId: string,
          startNumber: number,
        ): Promise<TimingParticipantRow | null> =>
          Promise.resolve(
            participants.find((row) => row.startNumber === startNumber) ?? null,
          ),
      );
      repository.updateMark.mockImplementation(
        (_tx: unknown, markId: string, input: UpdateMarkInput) => {
          const current = written.get(markId) ?? markRow({ id: markId });
          const updated = applyMarkUpdate(current, input);
          written.set(markId, updated);
          return Promise.resolve(updated);
        },
      );
      repository.createReceipt.mockImplementation(
        (_tx: unknown, input: CreateReceiptInput): TimingReceiptRow => ({
          attemptId: input.attemptId,
          workstationInstanceId: input.workstationInstanceId,
          deviceSequence: input.deviceSequence,
          status: input.status,
          reason: input.reason,
          createdAt: NOW,
        }),
      );
      repository.insertAudit.mockImplementation(
        (_tx: unknown, input: InsertAuditInput) => ({
          auditId: 'audit-1',
          actorUserId: input.actorUserId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          oldValues: null,
          newValues: null,
          reason: input.reason,
          createdAt: NOW,
        }),
      );
    }

    it('binds a pending finish by number, keeps its instant and renumbers the laps', async () => {
      arrangePending({
        marks: [
          markRow({
            id: 'mark-pass-1',
            enrollmentId: 'enrollment-a',
            registrationId: 'registration-enrollment-a',
            startNumber: 10,
            lapNumber: 1,
            officialElapsedMs: 30_000,
            officialAt: new Date(NOW.getTime() + 30_000),
          }),
          pendingMarkRow(),
        ],
      });

      const pass = await service.bindPendingFinish(
        USER_ID,
        EVENT_ID,
        'mark-pending',
        bindDto(),
        'key-5',
      );

      expect(roles.assertHasAnyRole).toHaveBeenCalledWith(
        USER_ID,
        TIMING_OPERATE_ROLES,
      );
      expect(repository.findParticipantByStartNumber).toHaveBeenCalledWith(
        ATTEMPT_ID,
        10,
        TX,
      );
      expect(repository.updateMark.mock.calls).toEqual([
        [
          TX,
          'mark-pending',
          {
            enrollmentId: 'enrollment-a',
            registrationId: 'registration-enrollment-a',
            startNumber: 10,
            kind: 'PASS',
            status: 'BOUND',
          },
        ],
        [TX, 'mark-pending', { lapNumber: 2 }],
      ]);
      // AD-3: the bind keeps the creation sequence and every raw column.
      const [, , bindInput] = callArguments<[unknown, string, UpdateMarkInput]>(
        repository.updateMark,
      );
      expect(bindInput).not.toHaveProperty('deviceSequence');
      expect(bindInput).not.toHaveProperty('officialAt');
      expect(pass).toEqual({
        passId: 'mark-pending',
        attemptId: ATTEMPT_ID,
        enrollmentId: 'enrollment-a',
        lapNumber: 2,
        rawCapturedAt: NOW.toISOString(),
        officialAt: new Date(NOW.getTime() + 70_000).toISOString(),
        officialElapsedMs: 70_000,
        status: 'BOUND',
      });
      const [, receiptInput] = callArguments<[unknown, CreateReceiptInput]>(
        repository.createReceipt,
      );
      expect(receiptInput).toEqual({
        attemptId: ATTEMPT_ID,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 5,
        status: 'APPLIED',
        reason: null,
      });
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        attemptId: ATTEMPT_ID,
        actorUserId: USER_ID,
        action: 'PENDING_BIND',
        targetType: 'PASS',
        targetId: 'mark-pending',
        reason: null,
        oldValues: { kind: 'PENDING_FINISH', status: 'PENDING' },
        newValues: {
          kind: 'PASS',
          status: 'BOUND',
          enrollmentId: 'enrollment-a',
          startNumber: 10,
          lapNumber: 2,
          bindOfSequence: 4,
          workstationInstanceId: WORKSTATION,
          deviceSequence: 5,
        },
      });
    });

    it('binds by enrollment without routing a number', async () => {
      arrangePending({
        marks: [pendingMarkRow()],
        participants: [participantRow({ enrollmentId: 'enrollment-b' })],
      });

      const pass = await service.bindPendingFinish(
        USER_ID,
        EVENT_ID,
        'mark-pending',
        bindDto({ startNumber: undefined, enrollmentId: 'enrollment-b' }),
        'key-5',
      );

      expect(repository.findParticipantByStartNumber).not.toHaveBeenCalled();
      expect(repository.findParticipant).toHaveBeenCalledWith(
        ATTEMPT_ID,
        'enrollment-b',
        TX,
      );
      expect(pass).toMatchObject({
        passId: 'mark-pending',
        enrollmentId: 'enrollment-b',
        lapNumber: 1,
        status: 'BOUND',
      });
    });

    it('refuses a target of another attempt and keeps the pending finish', async () => {
      arrangePending({ marks: [pendingMarkRow()], participants: [] });

      await expect(
        service.bindPendingFinish(
          USER_ID,
          EVENT_ID,
          'mark-pending',
          bindDto({
            startNumber: undefined,
            enrollmentId: 'enrollment-elsewhere',
          }),
          'key-5',
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.NOT_FOUND });
      expect(repository.updateMark).not.toHaveBeenCalled();
      expect(repository.createReceipt).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
      const [, rejectedInput] = callArguments<
        [unknown, CreateRejectedReceiptInput]
      >(repository.createRejectedReceipt);
      expect(rejectedInput).toEqual({
        attemptId: ATTEMPT_ID,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 5,
        reason: TimingErrorCode.NOT_FOUND,
      });
    });

    it('refuses an excluded target and keeps the pending finish', async () => {
      arrangePending({
        marks: [pendingMarkRow()],
        participants: [
          participantRow({
            enrollmentId: 'enrollment-a',
            excludedReason: 'RACE_SECTION',
          }),
        ],
      });

      await expect(
        service.bindPendingFinish(
          USER_ID,
          EVENT_ID,
          'mark-pending',
          bindDto(),
          'key-5',
        ),
      ).rejects.toMatchObject({
        code: TimingErrorCode.EXCLUDED_PARTICIPANT,
        details: {
          enrollmentId: 'enrollment-a',
          excludedReason: 'RACE_SECTION',
        },
      });
      expect(repository.updateMark).not.toHaveBeenCalled();
      expect(repository.createReceipt).not.toHaveBeenCalled();
      const [, rejectedInput] = callArguments<
        [unknown, CreateRejectedReceiptInput]
      >(repository.createRejectedReceipt);
      expect(rejectedInput).toEqual({
        attemptId: ATTEMPT_ID,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 5,
        reason: TimingErrorCode.EXCLUDED_PARTICIPANT,
      });
    });

    it('refuses a target that already holds N passes and keeps the pending finish', async () => {
      arrangePending({
        marks: [
          markRow({ id: 'mark-1', lapNumber: 1 }),
          markRow({
            id: 'mark-2',
            lapNumber: 2,
            officialElapsedMs: 60_000,
            officialAt: new Date(NOW.getTime() + 60_000),
          }),
          pendingMarkRow(),
        ],
        participants: [
          participantRow({ enrollmentId: 'enrollment-a', requiredLaps: 2 }),
        ],
      });

      await expect(
        service.bindPendingFinish(
          USER_ID,
          EVENT_ID,
          'mark-pending',
          bindDto(),
          'key-5',
        ),
      ).rejects.toMatchObject({
        code: TimingErrorCode.ALREADY_N_PASSES,
        details: { passCount: 2, requiredLaps: 2 },
      });
      expect(repository.updateMark).not.toHaveBeenCalled();
      expect(repository.createReceipt).not.toHaveBeenCalled();
      const [, rejectedInput] = callArguments<
        [unknown, CreateRejectedReceiptInput]
      >(repository.createRejectedReceipt);
      expect(rejectedInput).toEqual({
        attemptId: ATTEMPT_ID,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 5,
        reason: TimingErrorCode.ALREADY_N_PASSES,
      });
    });

    it('refuses a bind sequence that already has a receipt', async () => {
      arrangePending({ marks: [pendingMarkRow()], receipt: receiptRow() });

      const refusal = await service
        .bindPendingFinish(
          USER_ID,
          EVENT_ID,
          'mark-pending',
          bindDto(),
          'key-5',
        )
        .catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        code: TimingErrorCode.CONFLICT,
        details: {
          attemptId: ATTEMPT_ID,
          workstationInstanceId: WORKSTATION,
          deviceSequence: 5,
          receiptStatus: 'APPLIED',
        },
      });
      expect(repository.findReceipt).toHaveBeenCalledWith(
        TX,
        ATTEMPT_ID,
        WORKSTATION,
        5,
      );
      expect(repository.updateMark).not.toHaveBeenCalled();
      expect(repository.createReceipt).not.toHaveBeenCalled();
    });

    it('refuses a pending finish that is already cancelled', async () => {
      arrangePending({
        marks: [pendingMarkRow({ status: 'CANCELLED' })],
      });

      await expect(
        service.bindPendingFinish(USER_ID, EVENT_ID, 'mark-pending', bindDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.INVALID_STATE });
      expect(repository.withTransaction).not.toHaveBeenCalled();
      expect(repository.updateMark).not.toHaveBeenCalled();
    });

    it('refuses a pending finish of another event and one that is not a pending finish', async () => {
      arrangePending({
        attempt: attemptRow({ id: ATTEMPT_ID, eventId: 'event-b' }),
      });

      await expect(
        service.bindPendingFinish(USER_ID, EVENT_ID, 'mark-pending', bindDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.NOT_FOUND });

      repository.findAttempt.mockResolvedValue(attemptRow({ id: ATTEMPT_ID }));
      repository.findMark.mockResolvedValue(
        markRow({ id: 'mark-pending', kind: 'PASS' }),
      );

      await expect(
        service.bindPendingFinish(USER_ID, EVENT_ID, 'mark-pending', bindDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.NOT_FOUND });
      expect(repository.updateMark).not.toHaveBeenCalled();
    });

    it('refuses a bind from a workstation that does not hold capture', async () => {
      arrangePending({
        marks: [pendingMarkRow()],
        lock: { ...lockRow(), workstationInstanceId: 'workstation-b' },
      });

      await expect(
        service.bindPendingFinish(USER_ID, EVENT_ID, 'mark-pending', bindDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.CAPTURE_NOT_HELD });
      expect(repository.withTransaction).not.toHaveBeenCalled();
    });

    it('writes the mark, its receipt and its audit in one transaction', async () => {
      arrangePending({ marks: [pendingMarkRow()] });

      await service.bindPendingFinish(
        USER_ID,
        EVENT_ID,
        'mark-pending',
        bindDto(),
        'key-5',
      );

      const transactionOf = (mock: jest.Mock): unknown =>
        callArguments<[unknown]>(mock)[0];
      expect(transactionOf(repository.updateMark)).toBe(TX);
      expect(transactionOf(repository.createReceipt)).toBe(TX);
      expect(transactionOf(repository.insertAudit)).toBe(TX);
      expect(repository.updateMark.mock.invocationCallOrder[0]).toBeLessThan(
        repository.createReceipt.mock.invocationCallOrder[0],
      );
      expect(repository.createReceipt.mock.invocationCallOrder[0]).toBeLessThan(
        repository.insertAudit.mock.invocationCallOrder[0],
      );
    });
  });

  describe('cancelPendingFinish', () => {
    function arrangeCancel(
      overrides: {
        attempt?: TimingAttemptRow;
        marks?: TimingMarkRow[];
      } = {},
    ): void {
      repository.findAttempt.mockResolvedValue(
        overrides.attempt ?? attemptRow({ id: ATTEMPT_ID }),
      );
      const written = new Map(
        (overrides.marks ?? [pendingMarkRow()]).map((mark) => [mark.id, mark]),
      );
      repository.findMark.mockImplementation(
        (markId: string): Promise<TimingMarkRow | null> =>
          Promise.resolve(written.get(markId) ?? null),
      );
      repository.updateMark.mockImplementation(
        (_tx: unknown, markId: string, input: UpdateMarkInput) => {
          const current = written.get(markId) ?? markRow({ id: markId });
          const updated = applyMarkUpdate(current, input);
          written.set(markId, updated);
          return Promise.resolve(updated);
        },
      );
      repository.insertAudit.mockImplementation(
        (_tx: unknown, input: InsertAuditInput) => ({
          auditId: 'audit-1',
          actorUserId: input.actorUserId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          oldValues: null,
          newValues: null,
          reason: input.reason,
          createdAt: NOW,
        }),
      );
    }

    it('cancels an unbound pending finish as an administrator with its reason', async () => {
      arrangeCancel();

      const pass = await service.cancelPendingFinish(
        USER_ID,
        EVENT_ID,
        'mark-pending',
        cancelDto(),
      );

      expect(roles.assertHasAnyRole).toHaveBeenCalledWith(USER_ID, [
        RoleCode.ADMINISTRATOR,
      ]);
      expect(repository.updateMark).toHaveBeenCalledWith(TX, 'mark-pending', {
        status: 'CANCELLED',
      });
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        attemptId: ATTEMPT_ID,
        actorUserId: USER_ID,
        action: 'PENDING_CANCEL',
        targetType: 'PASS',
        targetId: 'mark-pending',
        reason: 'Ошибочный финиш',
        oldValues: { kind: 'PENDING_FINISH', status: 'PENDING' },
        newValues: { status: 'CANCELLED' },
      });
      // A correction of the record, not a capture mutation of a workstation.
      expect(repository.getCaptureLock).not.toHaveBeenCalled();
      expect(repository.findReceipt).not.toHaveBeenCalled();
      expect(repository.createReceipt).not.toHaveBeenCalled();
      expect(pass).toMatchObject({
        passId: 'mark-pending',
        status: 'CANCELLED',
        lapNumber: null,
      });
    });

    it('refuses a pending cancellation from a referee', async () => {
      arrangeCancel();
      roles.assertHasAnyRole.mockRejectedValue(new Error('Insufficient role.'));

      await expect(
        service.cancelPendingFinish(
          USER_ID,
          EVENT_ID,
          'mark-pending',
          cancelDto(),
        ),
      ).rejects.toThrow('Insufficient role.');
      expect(roles.assertHasAnyRole).toHaveBeenCalledWith(USER_ID, [
        RoleCode.ADMINISTRATOR,
      ]);
      expect(repository.withTransaction).not.toHaveBeenCalled();
      expect(repository.updateMark).not.toHaveBeenCalled();
    });

    it('refuses a reason that is blank', async () => {
      arrangeCancel();

      await expect(
        service.cancelPendingFinish(
          USER_ID,
          EVENT_ID,
          'mark-pending',
          cancelDto({ reason: '   ' }),
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.REASON_REQUIRED });
      expect(repository.updateMark).not.toHaveBeenCalled();
    });

    it('refuses a mark that is no longer pending', async () => {
      arrangeCancel({ marks: [pendingMarkRow({ status: 'BOUND' })] });

      await expect(
        service.cancelPendingFinish(
          USER_ID,
          EVENT_ID,
          'mark-pending',
          cancelDto(),
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.INVALID_STATE });
      expect(repository.updateMark).not.toHaveBeenCalled();
    });
  });

  describe('quickUndo', () => {
    function arrangeUndo(
      overrides: {
        attempt?: TimingAttemptRow;
        lock?: TimingCaptureLockRow | null;
        marks?: TimingMarkRow[];
        audit?: TimingAuditRow[];
        receipt?: TimingReceiptRow | null;
      } = {},
    ): void {
      repository.findAttempt.mockResolvedValue(
        overrides.attempt ?? attemptRow({ id: ATTEMPT_ID }),
      );
      repository.getCaptureLock.mockResolvedValue(
        overrides.lock === undefined ? lockRow() : overrides.lock,
      );
      const written = new Map(
        (overrides.marks ?? []).map((mark) => [mark.id, mark]),
      );
      repository.listMarks.mockResolvedValue(overrides.marks ?? []);
      repository.listAudit.mockResolvedValue(overrides.audit ?? []);
      repository.findReceipt.mockResolvedValue(overrides.receipt ?? null);
      repository.updateMark.mockImplementation(
        (_tx: unknown, markId: string, input: UpdateMarkInput) => {
          const current = written.get(markId) ?? markRow({ id: markId });
          const updated = applyMarkUpdate(current, input);
          written.set(markId, updated);
          return Promise.resolve(updated);
        },
      );
      repository.createReceipt.mockImplementation(
        (_tx: unknown, input: CreateReceiptInput): TimingReceiptRow => ({
          attemptId: input.attemptId,
          workstationInstanceId: input.workstationInstanceId,
          deviceSequence: input.deviceSequence,
          status: input.status,
          reason: input.reason,
          createdAt: NOW,
        }),
      );
      repository.insertAudit.mockImplementation(
        (_tx: unknown, input: InsertAuditInput) => ({
          auditId: 'audit-1',
          actorUserId: input.actorUserId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          oldValues: null,
          newValues: null,
          reason: input.reason,
          createdAt: NOW,
        }),
      );
    }

    it('cancels the last pass creation of this workstation, not a bound finish or another workstation', async () => {
      arrangeUndo({
        marks: [
          markRow({
            id: 'mark-pass-1',
            lapNumber: 1,
            deviceSequence: 3,
            officialElapsedMs: 30_000,
            officialAt: new Date(NOW.getTime() + 30_000),
          }),
          markRow({
            id: 'mark-pass-2',
            lapNumber: 2,
            deviceSequence: 8,
            officialElapsedMs: 60_000,
            officialAt: new Date(NOW.getTime() + 60_000),
          }),
          // A bind keeps the pending capture's sequence (9) and becomes PASS.
          markRow({
            id: 'mark-bound-pending',
            lapNumber: 3,
            deviceSequence: 9,
            officialElapsedMs: 90_000,
            officialAt: new Date(NOW.getTime() + 90_000),
          }),
          markRow({
            id: 'mark-other-workstation',
            lapNumber: 4,
            deviceSequence: 12,
            workstationInstanceId: 'workstation-b',
            officialElapsedMs: 120_000,
            officialAt: new Date(NOW.getTime() + 120_000),
          }),
        ],
        audit: [
          auditRow({
            auditId: 'audit-1',
            targetId: 'mark-pass-1',
            newValues: {
              workstationInstanceId: WORKSTATION,
              deviceSequence: 3,
            },
          }),
          auditRow({
            auditId: 'audit-2',
            targetId: 'mark-pass-2',
            newValues: {
              workstationInstanceId: WORKSTATION,
              deviceSequence: 8,
            },
          }),
          auditRow({
            auditId: 'audit-3',
            action: 'PENDING_FINISH_CAPTURE',
            targetId: 'mark-bound-pending',
            newValues: {
              workstationInstanceId: WORKSTATION,
              deviceSequence: 9,
            },
          }),
          auditRow({
            auditId: 'audit-4',
            action: 'PENDING_BIND',
            targetId: 'mark-bound-pending',
            newValues: {
              workstationInstanceId: WORKSTATION,
              deviceSequence: 10,
            },
          }),
          auditRow({
            auditId: 'audit-5',
            targetId: 'mark-other-workstation',
            newValues: {
              workstationInstanceId: 'workstation-b',
              deviceSequence: 12,
            },
          }),
        ],
      });

      const pass = await service.quickUndo(
        USER_ID,
        EVENT_ID,
        ATTEMPT_ID,
        undoDto(),
        'key-13',
      );

      expect(roles.assertHasAnyRole).toHaveBeenCalledWith(
        USER_ID,
        TIMING_OPERATE_ROLES,
      );
      expect(repository.updateMark.mock.calls).toEqual([
        [TX, 'mark-pass-2', { status: 'CANCELLED', lapNumber: null }],
        [TX, 'mark-bound-pending', { lapNumber: 2 }],
        [TX, 'mark-other-workstation', { lapNumber: 3 }],
      ]);
      expect(pass).toEqual({
        passId: 'mark-pass-2',
        attemptId: ATTEMPT_ID,
        enrollmentId: 'enrollment-a',
        lapNumber: null,
        rawCapturedAt: NOW.toISOString(),
        officialAt: new Date(NOW.getTime() + 60_000).toISOString(),
        officialElapsedMs: 60_000,
        status: 'CANCELLED',
      });
      const [, receiptInput] = callArguments<[unknown, CreateReceiptInput]>(
        repository.createReceipt,
      );
      expect(receiptInput).toEqual({
        attemptId: ATTEMPT_ID,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 13,
        status: 'APPLIED',
        reason: null,
      });
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        action: 'QUICK_UNDO',
        targetType: 'PASS',
        targetId: 'mark-pass-2',
        reason: null,
        oldValues: { status: 'BOUND', lapNumber: 2, deviceSequence: 8 },
        newValues: { status: 'CANCELLED', lapNumber: null, deviceSequence: 13 },
      });
    });

    it('retires the last anonymous split creation without a participant renumber', async () => {
      arrangeUndo({
        marks: [
          markRow({
            id: 'mark-pass-1',
            lapNumber: 2,
            deviceSequence: 3,
            officialElapsedMs: 30_000,
            officialAt: new Date(NOW.getTime() + 30_000),
          }),
          markRow({
            id: 'mark-split-1',
            kind: 'ANONYMOUS_SPLIT',
            status: 'PENDING',
            enrollmentId: null,
            registrationId: null,
            startNumber: null,
            lapNumber: null,
            deviceSequence: 14,
            officialElapsedMs: 40_000,
            officialAt: new Date(NOW.getTime() + 40_000),
          }),
        ],
        audit: [
          auditRow({ auditId: 'audit-1', targetId: 'mark-pass-1' }),
          auditRow({
            auditId: 'audit-2',
            action: 'ANONYMOUS_SPLIT_CAPTURE',
            targetType: 'ANONYMOUS_SPLIT',
            targetId: 'mark-split-1',
            newValues: {
              workstationInstanceId: WORKSTATION,
              deviceSequence: 14,
            },
          }),
        ],
      });

      const pass = await service.quickUndo(
        USER_ID,
        EVENT_ID,
        ATTEMPT_ID,
        undoDto({ deviceSequence: 15 }),
        'key-15',
      );

      // Only the split is retired; the pass and its lap number stay untouched,
      // because a split has no participant to renumber.
      expect(repository.updateMark.mock.calls).toEqual([
        [TX, 'mark-split-1', { status: 'CANCELLED', lapNumber: null }],
      ]);
      expect(pass).toEqual({
        passId: 'mark-split-1',
        attemptId: ATTEMPT_ID,
        enrollmentId: null,
        lapNumber: null,
        rawCapturedAt: NOW.toISOString(),
        officialAt: new Date(NOW.getTime() + 40_000).toISOString(),
        officialElapsedMs: 40_000,
        status: 'CANCELLED',
      });
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        action: 'QUICK_UNDO',
        targetType: 'ANONYMOUS_SPLIT',
        targetId: 'mark-split-1',
        oldValues: {
          kind: 'ANONYMOUS_SPLIT',
          status: 'PENDING',
          enrollmentId: null,
          deviceSequence: 14,
        },
        newValues: { status: 'CANCELLED', deviceSequence: 15 },
      });
    });

    it('refuses an undo when this workstation created no pass', async () => {
      arrangeUndo({
        marks: [
          pendingMarkRow(),
          markRow({ id: 'mark-bound-pending', deviceSequence: 9 }),
        ],
        audit: [
          auditRow({
            auditId: 'audit-1',
            action: 'PENDING_FINISH_CAPTURE',
            targetId: 'mark-pending',
            newValues: {
              workstationInstanceId: WORKSTATION,
              deviceSequence: 4,
            },
          }),
          auditRow({
            auditId: 'audit-2',
            action: 'PENDING_BIND',
            targetId: 'mark-bound-pending',
            newValues: {
              workstationInstanceId: WORKSTATION,
              deviceSequence: 10,
            },
          }),
        ],
      });

      await expect(
        service.quickUndo(USER_ID, EVENT_ID, ATTEMPT_ID, undoDto(), 'key-13'),
      ).rejects.toMatchObject({
        code: TimingErrorCode.INVALID_STATE,
        details: { attemptId: ATTEMPT_ID, workstationInstanceId: WORKSTATION },
      });
      expect(repository.updateMark).not.toHaveBeenCalled();
      expect(repository.createReceipt).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
      // AD-18: the refused undo sequence is resolved, not left unconfirmed.
      const [, rejectedInput] = callArguments<
        [unknown, CreateRejectedReceiptInput]
      >(repository.createRejectedReceipt);
      expect(rejectedInput).toEqual({
        attemptId: ATTEMPT_ID,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 13,
        reason: TimingErrorCode.INVALID_STATE,
      });
    });

    it('refuses an undo sequence that already has a receipt', async () => {
      arrangeUndo({
        marks: [markRow({ id: 'mark-pass-1', deviceSequence: 3 })],
        receipt: { ...receiptRow(), deviceSequence: 13 },
      });

      await expect(
        service.quickUndo(USER_ID, EVENT_ID, ATTEMPT_ID, undoDto(), 'key-13'),
      ).rejects.toMatchObject({ code: TimingErrorCode.CONFLICT });
      expect(repository.findReceipt).toHaveBeenCalledWith(
        TX,
        ATTEMPT_ID,
        WORKSTATION,
        13,
      );
      expect(repository.updateMark).not.toHaveBeenCalled();
    });

    it('refuses an undo on a closed attempt and from a workstation without capture', async () => {
      arrangeUndo({
        attempt: attemptRow({
          id: ATTEMPT_ID,
          status: 'COMPLETED',
          closedAt: NOW,
        }),
      });

      await expect(
        service.quickUndo(USER_ID, EVENT_ID, ATTEMPT_ID, undoDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.ATTEMPT_CLOSED });
      expect(repository.withTransaction).not.toHaveBeenCalled();

      arrangeUndo({
        lock: { ...lockRow(), workstationInstanceId: 'workstation-b' },
      });

      await expect(
        service.quickUndo(USER_ID, EVENT_ID, ATTEMPT_ID, undoDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.CAPTURE_NOT_HELD });
      expect(repository.withTransaction).not.toHaveBeenCalled();
    });

    it('refuses an undo of an attempt of another event', async () => {
      arrangeUndo({
        attempt: attemptRow({ id: ATTEMPT_ID, eventId: 'event-b' }),
      });

      await expect(
        service.quickUndo(USER_ID, EVENT_ID, ATTEMPT_ID, undoDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.NOT_FOUND });
      expect(repository.withTransaction).not.toHaveBeenCalled();
    });

    it('writes the cancellation, its receipt and its audit in one transaction', async () => {
      arrangeUndo({
        marks: [markRow({ id: 'mark-pass-1', deviceSequence: 3 })],
        audit: [auditRow({ auditId: 'audit-1', targetId: 'mark-pass-1' })],
      });

      await service.quickUndo(
        USER_ID,
        EVENT_ID,
        ATTEMPT_ID,
        undoDto(),
        'key-13',
      );

      const transactionOf = (mock: jest.Mock): unknown =>
        callArguments<[unknown]>(mock)[0];
      expect(transactionOf(repository.updateMark)).toBe(TX);
      expect(transactionOf(repository.createReceipt)).toBe(TX);
      expect(transactionOf(repository.insertAudit)).toBe(TX);
      expect(repository.updateMark.mock.invocationCallOrder[0]).toBeLessThan(
        repository.createReceipt.mock.invocationCallOrder[0],
      );
      expect(repository.createReceipt.mock.invocationCallOrder[0]).toBeLessThan(
        repository.insertAudit.mock.invocationCallOrder[0],
      );
    });
  });

  describe('official-time corrections and pass edits', () => {
    /** Marks of one participant at +30 s, +60 s and +90 s from the start. */
    function threeLaps(): TimingMarkRow[] {
      return [
        markRow({
          id: 'mark-1',
          enrollmentId: 'enrollment-a',
          lapNumber: 1,
          officialAt: new Date(NOW.getTime() + 30_000),
          officialElapsedMs: 30_000,
        }),
        markRow({
          id: 'mark-2',
          enrollmentId: 'enrollment-a',
          lapNumber: 2,
          officialAt: new Date(NOW.getTime() + 60_000),
          officialElapsedMs: 60_000,
        }),
        markRow({
          id: 'mark-3',
          enrollmentId: 'enrollment-a',
          lapNumber: 3,
          officialAt: new Date(NOW.getTime() + 90_000),
          officialElapsedMs: 90_000,
        }),
      ];
    }

    /**
     * Wires the fake repository around one attempt, its marks, its frozen
     * roster and the result a correction may republish. Every write mutates the
     * returned mark store, so an assertion sees the record the service built.
     */
    function arrangeCorrection(
      overrides: {
        attempt?: TimingAttemptRow;
        marks?: TimingMarkRow[];
        participants?: TimingParticipantRow[];
        result?: TimingResultRow | null;
        categoryFinished?: boolean;
        lock?: TimingCaptureLockRow | null;
      } = {},
    ): Map<string, TimingMarkRow> {
      const attempt =
        overrides.attempt ??
        attemptRow({ id: ATTEMPT_ID, status: 'COMPLETED', closedAt: NOW });
      const participants = overrides.participants ?? [];
      const markStore = new Map(
        (overrides.marks ?? []).map((mark) => [mark.id, mark]),
      );
      repository.findAttempt.mockResolvedValue(attempt);
      repository.isCategoryFinished.mockResolvedValue(
        overrides.categoryFinished ?? false,
      );
      repository.findMark.mockImplementation((markId: string) =>
        Promise.resolve(markStore.get(markId) ?? null),
      );
      repository.listMarks.mockImplementation(() =>
        Promise.resolve([...markStore.values()]),
      );
      repository.listParticipantMarks.mockImplementation(
        (_attemptId: string, enrollmentId: string) =>
          Promise.resolve(
            [...markStore.values()].filter(
              (mark) => mark.enrollmentId === enrollmentId,
            ),
          ),
      );
      repository.listParticipants.mockResolvedValue(participants);
      repository.findParticipant.mockImplementation(
        (_attemptId: string, enrollmentId: string) =>
          Promise.resolve(
            participants.find((row) => row.enrollmentId === enrollmentId) ??
              null,
          ),
      );
      repository.updateMark.mockImplementation(
        (_tx: unknown, markId: string, input: UpdateMarkInput) => {
          const current = markStore.get(markId) ?? markRow({ id: markId });
          const updated = applyMarkUpdate(current, input);
          markStore.set(markId, updated);
          return Promise.resolve(updated);
        },
      );
      repository.findResultByEnrollment.mockResolvedValue(
        overrides.result ?? null,
      );
      repository.publishResult.mockImplementation(
        (_tx: unknown, input: PublishResultInput) =>
          Promise.resolve(
            resultRow({
              id: 'result-1',
              enrollmentId: input.enrollmentId,
              registrationId: input.registrationId,
              outcome: input.outcome,
              timeMilliseconds: input.timeMilliseconds,
              timingSessionId: input.timingSessionId,
            }),
          ),
      );
      repository.updateAttemptOfficialStart.mockImplementation(
        (_tx: unknown, _attemptId: string, officialStartedAt: Date) =>
          Promise.resolve({ ...attempt, officialStartedAt }),
      );
      repository.getCaptureLock.mockResolvedValue(overrides.lock ?? null);
      repository.createClockEpoch.mockImplementation(
        (_tx: unknown, input: CreateClockEpochInput) =>
          Promise.resolve(
            clockEpochRow({
              id: 'epoch-2',
              attemptId: input.attemptId,
              workstationInstanceId: input.workstationInstanceId,
              officialElapsedAnchorMs: input.officialElapsedAnchorMs,
              openedAt: input.openedAt ?? NOW,
            }),
          ),
      );
      repository.insertAudit.mockImplementation(
        (_tx: unknown, input: InsertAuditInput) =>
          Promise.resolve({
            auditId: 'audit-1',
            actorUserId: input.actorUserId,
            action: input.action,
            targetType: input.targetType,
            targetId: input.targetId,
            oldValues: null,
            newValues: null,
            reason: input.reason,
            createdAt: NOW,
          }),
      );
      return markStore;
    }

    /** The lap-number writes of `updateMark`, in call order. */
    function lapWrites(): Array<{ markId: string; lapNumber: number }> {
      return repository.updateMark.mock.calls
        .map(([, markId, input]) => ({
          markId: markId as string,
          lapNumber: (input as UpdateMarkInput).lapNumber,
        }))
        .filter(
          (row): row is { markId: string; lapNumber: number } =>
            typeof row.lapNumber === 'number' && row.lapNumber > 0,
        );
    }

    it('moves a pass official time, renumbers its laps and republishes total and splits', async () => {
      arrangeCorrection({
        marks: threeLaps(),
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        result: resultRow({ id: 'result-a' }),
      });
      const correctedAt = new Date(NOW.getTime() + 100_000);

      const pass = await service.correctOfficialTime(
        USER_ID,
        EVENT_ID,
        'mark-1',
        correctDto({
          targetType: 'PASS',
          targetId: 'mark-1',
          officialAt: correctedAt.toISOString(),
          reason: '  Ошибка секундомера  ',
        }),
      );

      expect(roles.assertHasAnyRole).toHaveBeenCalledWith(USER_ID, [
        RoleCode.ADMINISTRATOR,
      ]);
      expect(repository.updateMark).toHaveBeenCalledWith(TX, 'mark-1', {
        officialAt: correctedAt,
        officialElapsedMs: 100_000,
      });
      // U-14: laps follow the official instant, not the capture order.
      expect(lapWrites()).toEqual([
        { markId: 'mark-2', lapNumber: 1 },
        { markId: 'mark-3', lapNumber: 2 },
        { markId: 'mark-1', lapNumber: 3 },
      ]);
      const [, publishInput] = callArguments<[unknown, PublishResultInput]>(
        repository.publishResult,
      );
      expect(publishInput).toEqual({
        enrollmentId: 'enrollment-a',
        registrationId: 'registration-enrollment-a',
        outcome: 'FINISHED',
        timeMilliseconds: 100_000,
        timingSessionId: ATTEMPT_ID,
      });
      expect(repository.replaceResultSplits).toHaveBeenCalledWith(
        TX,
        'result-1',
        [
          { lapNumber: 1, lapTimeMs: 60_000, cumulativeMs: 60_000 },
          { lapNumber: 2, lapTimeMs: 30_000, cumulativeMs: 90_000 },
          { lapNumber: 3, lapTimeMs: 10_000, cumulativeMs: 100_000 },
        ],
      );
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        attemptId: ATTEMPT_ID,
        actorUserId: USER_ID,
        action: 'OFFICIAL_TIME_CORRECT',
        targetType: 'PASS',
        targetId: 'mark-1',
        reason: 'Ошибка секундомера',
        oldValues: {
          enrollmentId: 'enrollment-a',
          officialAt: new Date(NOW.getTime() + 30_000).toISOString(),
          officialElapsedMs: 30_000,
          lapNumber: 1,
        },
        newValues: {
          enrollmentId: 'enrollment-a',
          officialAt: correctedAt.toISOString(),
          officialElapsedMs: 100_000,
          lapNumber: 3,
          republished: true,
        },
      });
      expect(pass).toMatchObject({
        passId: 'mark-1',
        enrollmentId: 'enrollment-a',
        officialAt: correctedAt.toISOString(),
        officialElapsedMs: 100_000,
        lapNumber: 3,
        status: 'BOUND',
      });
      // An administrator correction is not a workstation capture.
      expect(repository.findReceipt).not.toHaveBeenCalled();
      expect(repository.createReceipt).not.toHaveBeenCalled();
    });

    it('shifts every elapsed value of a start correction and re-anchors a new epoch', async () => {
      arrangeCorrection({
        attempt: attemptRow({ id: ATTEMPT_ID, status: 'RUNNING' }),
        marks: threeLaps(),
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        lock: lockRow(),
      });
      const newStart = new Date(NOW.getTime() + 5_000);

      const ref = await service.correctOfficialTime(
        USER_ID,
        EVENT_ID,
        ATTEMPT_ID,
        correctDto({
          targetType: 'START',
          targetId: ATTEMPT_ID,
          officialAt: newStart.toISOString(),
          reason: 'Неточный старт',
        }),
      );

      expect(repository.updateAttemptOfficialStart).toHaveBeenCalledWith(
        TX,
        ATTEMPT_ID,
        newStart,
      );
      const elapsedWrites = repository.updateMark.mock.calls
        .map(([, markId, input]) => ({
          markId: markId as string,
          officialElapsedMs: (input as UpdateMarkInput).officialElapsedMs,
        }))
        .filter((row) => row.officialElapsedMs !== undefined);
      expect(elapsedWrites).toEqual([
        { markId: 'mark-1', officialElapsedMs: 25_000 },
        { markId: 'mark-2', officialElapsedMs: 55_000 },
        { markId: 'mark-3', officialElapsedMs: 85_000 },
      ]);
      expect(repository.closeOpenEpochs).toHaveBeenCalledWith(TX, ATTEMPT_ID);
      // The corrected start is in the future of the fake clock, so the anchor
      // clamps to zero instead of going negative.
      expect(repository.createClockEpoch).toHaveBeenCalledWith(TX, {
        attemptId: ATTEMPT_ID,
        workstationInstanceId: WORKSTATION,
        officialElapsedAnchorMs: 0,
        openedByUserId: USER_ID,
        openedAt: NOW,
      });
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        attemptId: ATTEMPT_ID,
        action: 'START_CORRECT',
        targetType: 'ATTEMPT',
        targetId: ATTEMPT_ID,
        reason: 'Неточный старт',
        oldValues: { officialStartedAt: NOW.toISOString() },
        newValues: {
          officialStartedAt: newStart.toISOString(),
          changedMarkCount: 3,
          clockEpochId: 'epoch-2',
          officialElapsedAnchorMs: 0,
          republishedEnrollmentIds: [],
        },
      });
      expect(repository.publishResult).not.toHaveBeenCalled();
      expect(ref).toEqual({
        attemptId: ATTEMPT_ID,
        state: 'RUNNING',
        officialStartedAt: newStart.toISOString(),
      });
    });

    it('republishes a timing-owned result of the attempt after a start correction', async () => {
      arrangeCorrection({
        attempt: attemptRow({
          id: ATTEMPT_ID,
          status: 'COMPLETED',
          closedAt: NOW,
        }),
        marks: threeLaps(),
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        result: resultRow({ id: 'result-a' }),
      });
      const newStart = new Date(NOW.getTime() + 5_000);

      await service.correctOfficialTime(
        USER_ID,
        EVENT_ID,
        ATTEMPT_ID,
        correctDto({
          targetType: 'START',
          targetId: ATTEMPT_ID,
          officialAt: newStart.toISOString(),
        }),
      );

      const [, publishInput] = callArguments<[unknown, PublishResultInput]>(
        repository.publishResult,
      );
      expect(publishInput).toMatchObject({
        enrollmentId: 'enrollment-a',
        outcome: 'FINISHED',
        timeMilliseconds: 85_000,
        timingSessionId: ATTEMPT_ID,
      });
      expect(repository.replaceResultSplits).toHaveBeenCalledWith(
        TX,
        'result-1',
        [
          { lapNumber: 1, lapTimeMs: 25_000, cumulativeMs: 25_000 },
          { lapNumber: 2, lapTimeMs: 30_000, cumulativeMs: 55_000 },
          { lapNumber: 3, lapTimeMs: 30_000, cumulativeMs: 85_000 },
        ],
      );
    });

    it('refuses a correction outside the bounds and changes nothing', async () => {
      arrangeCorrection({
        marks: threeLaps(),
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
      });

      await expect(
        service.correctOfficialTime(
          USER_ID,
          EVENT_ID,
          'mark-1',
          correctDto({ targetId: 'mark-1', officialAt: NOW.toISOString() }),
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.OUT_OF_BOUNDS });

      const newStart = new Date(NOW.getTime() + 40_000);
      await expect(
        service.correctOfficialTime(
          USER_ID,
          EVENT_ID,
          ATTEMPT_ID,
          correctDto({
            targetType: 'START',
            targetId: ATTEMPT_ID,
            officialAt: newStart.toISOString(),
          }),
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.OUT_OF_BOUNDS });

      expect(repository.updateMark).not.toHaveBeenCalled();
      expect(repository.updateAttemptOfficialStart).not.toHaveBeenCalled();
      expect(repository.closeOpenEpochs).not.toHaveBeenCalled();
      expect(repository.publishResult).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('refuses every change when the protocol category is finished', async () => {
      arrangeCorrection({
        attempt: attemptRow({ id: ATTEMPT_ID, status: 'RUNNING' }),
        marks: threeLaps(),
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        categoryFinished: true,
      });

      await expect(
        service.correctOfficialTime(USER_ID, EVENT_ID, 'mark-1', correctDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.CATEGORY_FINISHED });
      await expect(
        service.cancelPass(USER_ID, EVENT_ID, 'mark-1', cancelPassDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.CATEGORY_FINISHED });
      await expect(
        service.rebindPass(USER_ID, EVENT_ID, 'mark-1', rebindPassDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.CATEGORY_FINISHED });

      expect(repository.updateMark).not.toHaveBeenCalled();
      expect(repository.updateAttemptOfficialStart).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('refuses every change to a cancelled attempt', async () => {
      arrangeCorrection({
        attempt: attemptRow({ id: ATTEMPT_ID, status: 'CANCELLED' }),
        marks: threeLaps(),
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
      });

      await expect(
        service.correctOfficialTime(USER_ID, EVENT_ID, 'mark-1', correctDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.INVALID_STATE });
      await expect(
        service.cancelPass(USER_ID, EVENT_ID, 'mark-1', cancelPassDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.INVALID_STATE });
      await expect(
        service.rebindPass(USER_ID, EVENT_ID, 'mark-1', rebindPassDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.INVALID_STATE });

      expect(repository.updateMark).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('refuses a rebind or a cancellation after closure', async () => {
      arrangeCorrection({
        attempt: attemptRow({
          id: ATTEMPT_ID,
          status: 'COMPLETED',
          closedAt: NOW,
        }),
        marks: threeLaps(),
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
      });

      await expect(
        service.cancelPass(USER_ID, EVENT_ID, 'mark-1', cancelPassDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.ATTEMPT_CLOSED });
      await expect(
        service.rebindPass(USER_ID, EVENT_ID, 'mark-1', rebindPassDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.ATTEMPT_CLOSED });

      expect(repository.updateMark).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('soft-cancels a bound pass and renumbers the remaining laps', async () => {
      arrangeCorrection({
        attempt: attemptRow({ id: ATTEMPT_ID, status: 'RUNNING' }),
        marks: threeLaps(),
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
      });

      const pass = await service.cancelPass(
        USER_ID,
        EVENT_ID,
        'mark-1',
        cancelPassDto(),
      );

      expect(roles.assertHasAnyRole).toHaveBeenCalledWith(USER_ID, [
        RoleCode.ADMINISTRATOR,
      ]);
      expect(repository.updateMark).toHaveBeenCalledWith(TX, 'mark-1', {
        status: 'CANCELLED',
        lapNumber: null,
      });
      expect(lapWrites()).toEqual([
        { markId: 'mark-2', lapNumber: 1 },
        { markId: 'mark-3', lapNumber: 2 },
      ]);
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        action: 'PASS_CANCEL',
        targetType: 'PASS',
        targetId: 'mark-1',
        reason: 'Лишний круг',
        oldValues: {
          status: 'BOUND',
          enrollmentId: 'enrollment-a',
          lapNumber: 1,
          officialAt: new Date(NOW.getTime() + 30_000).toISOString(),
          officialElapsedMs: 30_000,
        },
        newValues: { status: 'CANCELLED', lapNumber: null },
      });
      expect(pass).toMatchObject({
        passId: 'mark-1',
        status: 'CANCELLED',
        lapNumber: null,
      });
      expect(repository.findReceipt).not.toHaveBeenCalled();
      expect(repository.createReceipt).not.toHaveBeenCalled();
      expect(repository.getCaptureLock).not.toHaveBeenCalled();
    });

    it('moves one pass to another participant and renumbers both', async () => {
      arrangeCorrection({
        attempt: attemptRow({ id: ATTEMPT_ID, status: 'RUNNING' }),
        marks: [
          markRow({
            id: 'mark-a1',
            enrollmentId: 'enrollment-a',
            lapNumber: 1,
            officialAt: new Date(NOW.getTime() + 30_000),
            officialElapsedMs: 30_000,
          }),
          markRow({
            id: 'mark-a2',
            enrollmentId: 'enrollment-a',
            lapNumber: 2,
            officialAt: new Date(NOW.getTime() + 60_000),
            officialElapsedMs: 60_000,
          }),
          markRow({
            id: 'mark-b1',
            enrollmentId: 'enrollment-b',
            registrationId: 'registration-enrollment-b',
            startNumber: 11,
            lapNumber: 1,
            officialAt: new Date(NOW.getTime() + 70_000),
            officialElapsedMs: 70_000,
          }),
        ],
        participants: [
          participantRow({ enrollmentId: 'enrollment-a', startNumber: 10 }),
          participantRow({ enrollmentId: 'enrollment-b', startNumber: 11 }),
        ],
      });

      const pass = await service.rebindPass(
        USER_ID,
        EVENT_ID,
        'mark-a2',
        rebindPassDto(),
      );

      expect(repository.updateMark).toHaveBeenCalledWith(TX, 'mark-a2', {
        enrollmentId: 'enrollment-b',
        registrationId: 'registration-enrollment-b',
        startNumber: 11,
      });
      // Both participants are renumbered by official instant in one transaction.
      expect(repository.listParticipantMarks).toHaveBeenCalledWith(
        ATTEMPT_ID,
        'enrollment-a',
        TX,
      );
      expect(repository.listParticipantMarks).toHaveBeenCalledWith(
        ATTEMPT_ID,
        'enrollment-b',
        TX,
      );
      expect(lapWrites()).toEqual([
        { markId: 'mark-a2', lapNumber: 1 },
        { markId: 'mark-b1', lapNumber: 2 },
      ]);
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        action: 'PASS_REBIND',
        targetType: 'PASS',
        targetId: 'mark-a2',
        reason: 'Не тот участник',
        oldValues: {
          enrollmentId: 'enrollment-a',
          registrationId: 'registration-enrollment-a',
          startNumber: 10,
          lapNumber: 2,
          officialAt: new Date(NOW.getTime() + 60_000).toISOString(),
          officialElapsedMs: 60_000,
        },
        newValues: {
          enrollmentId: 'enrollment-b',
          registrationId: 'registration-enrollment-b',
          startNumber: 11,
          lapNumber: 1,
        },
      });
      expect(pass).toMatchObject({
        passId: 'mark-a2',
        enrollmentId: 'enrollment-b',
        lapNumber: 1,
        status: 'BOUND',
      });
      expect(repository.publishResult).not.toHaveBeenCalled();
      expect(repository.createReceipt).not.toHaveBeenCalled();
    });

    it('refuses a rebind across attempts, to an excluded participant or at N', async () => {
      const attempt = attemptRow({ id: ATTEMPT_ID, status: 'RUNNING' });
      const marks = threeLaps();
      const source = participantRow({ enrollmentId: 'enrollment-a' });

      arrangeCorrection({ attempt, marks, participants: [source] });
      await expect(
        service.rebindPass(
          USER_ID,
          EVENT_ID,
          'mark-1',
          rebindPassDto({ targetEnrollmentId: 'enrollment-other' }),
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.NOT_FOUND });
      expect(repository.updateMark).not.toHaveBeenCalled();

      arrangeCorrection({
        attempt,
        marks,
        participants: [
          source,
          participantRow({
            enrollmentId: 'enrollment-b',
            excludedReason: 'RACE_SECTION',
          }),
        ],
      });
      await expect(
        service.rebindPass(USER_ID, EVENT_ID, 'mark-1', rebindPassDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.EXCLUDED_PARTICIPANT });
      expect(repository.updateMark).not.toHaveBeenCalled();

      arrangeCorrection({
        attempt,
        marks: [
          markRow({ id: 'mark-a1', enrollmentId: 'enrollment-a' }),
          markRow({
            id: 'mark-b1',
            enrollmentId: 'enrollment-b',
            lapNumber: 1,
          }),
          markRow({
            id: 'mark-b2',
            enrollmentId: 'enrollment-b',
            lapNumber: 2,
          }),
          markRow({
            id: 'mark-b3',
            enrollmentId: 'enrollment-b',
            lapNumber: 3,
          }),
        ],
        participants: [
          source,
          participantRow({ enrollmentId: 'enrollment-b' }),
        ],
      });
      await expect(
        service.rebindPass(USER_ID, EVENT_ID, 'mark-a1', rebindPassDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.ALREADY_N_PASSES });
      expect(repository.updateMark).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('does not overwrite a hand-entered result after a pass correction', async () => {
      arrangeCorrection({
        marks: threeLaps(),
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        result: resultRow({ id: 'result-manual', timingSessionId: null }),
      });

      await service.correctOfficialTime(
        USER_ID,
        EVENT_ID,
        'mark-1',
        correctDto({ targetId: 'mark-1' }),
      );

      expect(repository.updateMark).toHaveBeenCalled();
      expect(repository.publishResult).not.toHaveBeenCalled();
      expect(repository.replaceResultSplits).not.toHaveBeenCalled();
    });

    it('refuses a blank reason for every administrative change', async () => {
      arrangeCorrection({
        attempt: attemptRow({ id: ATTEMPT_ID, status: 'RUNNING' }),
        marks: threeLaps(),
      });

      await expect(
        service.correctOfficialTime(
          USER_ID,
          EVENT_ID,
          'mark-1',
          correctDto({ reason: '   ' }),
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.REASON_REQUIRED });
      await expect(
        service.cancelPass(
          USER_ID,
          EVENT_ID,
          'mark-1',
          cancelPassDto({ reason: ' ' }),
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.REASON_REQUIRED });
      await expect(
        service.rebindPass(
          USER_ID,
          EVENT_ID,
          'mark-1',
          rebindPassDto({ reason: '' }),
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.REASON_REQUIRED });

      expect(repository.withTransaction).not.toHaveBeenCalled();
      expect(repository.updateMark).not.toHaveBeenCalled();
    });

    describe('heat corrections', () => {
      it('refuses a pass-time and a start correction on a closed heat attempt', async () => {
        const markStore = arrangeCorrection({
          attempt: heatAttemptRow({ status: 'COMPLETED', closedAt: NOW }),
          marks: threeLaps(),
          participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        });

        await expect(
          service.correctOfficialTime(
            USER_ID,
            EVENT_ID,
            'mark-1',
            correctDto({ targetId: 'mark-1' }),
          ),
        ).rejects.toMatchObject({ code: TimingErrorCode.ATTEMPT_CLOSED });
        await expect(
          service.correctOfficialTime(
            USER_ID,
            EVENT_ID,
            ATTEMPT_ID,
            correctDto({ targetType: 'START', targetId: ATTEMPT_ID }),
          ),
        ).rejects.toMatchObject({ code: TimingErrorCode.ATTEMPT_CLOSED });

        // F-22: the closed heat's record and its heat times stay untouched.
        expect(markStore.get('mark-1')?.officialElapsedMs).toBe(30_000);
        expect(repository.updateMark).not.toHaveBeenCalled();
        expect(repository.updateAttemptOfficialStart).not.toHaveBeenCalled();
        expect(repository.publishResult).not.toHaveBeenCalled();
        expect(repository.insertAudit).not.toHaveBeenCalled();
        expect(repository.createHeatTime).not.toHaveBeenCalled();
      });

      it('corrects a running heat pass time and publishes nothing before closure', async () => {
        arrangeCorrection({
          attempt: heatAttemptRow({ status: 'RUNNING' }),
          marks: threeLaps(),
          participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        });
        const correctedAt = new Date(NOW.getTime() + 95_000);

        const pass = await service.correctOfficialTime(
          USER_ID,
          EVENT_ID,
          'mark-1',
          correctDto({
            targetId: 'mark-1',
            officialAt: correctedAt.toISOString(),
          }),
        );

        expect(pass).toMatchObject({ passId: 'mark-1', lapNumber: 3 });
        expect(repository.updateMark).toHaveBeenCalledWith(TX, 'mark-1', {
          officialAt: correctedAt,
          officialElapsedMs: 95_000,
        });
        // T7: a correction rewrites the record only; no heat time, no result.
        expect(repository.publishResult).not.toHaveBeenCalled();
        expect(repository.replaceResultSplits).not.toHaveBeenCalled();
        expect(repository.createHeatTime).not.toHaveBeenCalled();
        const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
          repository.insertAudit,
        );
        expect(auditInput).toMatchObject({
          action: 'OFFICIAL_TIME_CORRECT',
          targetType: 'PASS',
          newValues: { republished: false },
        });
      });

      it('corrects a running heat start and republishes no result', async () => {
        arrangeCorrection({
          attempt: heatAttemptRow({ id: ATTEMPT_ID, status: 'RUNNING' }),
          marks: threeLaps(),
          participants: [participantRow({ enrollmentId: 'enrollment-a' })],
          result: resultRow({ id: 'result-manual', timingSessionId: null }),
        });
        const correctedAt = new Date(NOW.getTime() + 5_000);

        await service.correctOfficialTime(
          USER_ID,
          EVENT_ID,
          ATTEMPT_ID,
          correctDto({
            targetType: 'START',
            targetId: ATTEMPT_ID,
            officialAt: correctedAt.toISOString(),
          }),
        );

        expect(repository.updateAttemptOfficialStart).toHaveBeenCalledWith(
          TX,
          ATTEMPT_ID,
          correctedAt,
        );
        expect(repository.publishResult).not.toHaveBeenCalled();
        expect(repository.replaceResultSplits).not.toHaveBeenCalled();
        expect(repository.createHeatTime).not.toHaveBeenCalled();
      });
    });
  });

  describe('closure, publication and splits', () => {
    /** One participant's passes at the given elapsed values, in lap order. */
    function passesOf(
      enrollmentId: string,
      elapsedValues: number[],
      options: {
        workstationInstanceId?: string;
        firstSequence?: number;
        idPrefix?: string;
      } = {},
    ): TimingMarkRow[] {
      const firstSequence = options.firstSequence ?? 1;
      const idPrefix = options.idPrefix ?? `mark-${enrollmentId}`;
      return elapsedValues.map((officialElapsedMs, index) =>
        markRow({
          id: `${idPrefix}-${index + 1}`,
          enrollmentId,
          registrationId: `registration-${enrollmentId}`,
          lapNumber: index + 1,
          officialAt: new Date(NOW.getTime() + officialElapsedMs),
          officialElapsedMs,
          deviceSequence: firstSequence + index,
          workstationInstanceId: options.workstationInstanceId ?? WORKSTATION,
        }),
      );
    }

    /** Final receipts for the given sequences of one workstation. */
    function receiptRows(
      sequences: number[],
      workstationInstanceId = WORKSTATION,
    ): TimingReceiptRow[] {
      return sequences.map((deviceSequence) => ({
        attemptId: ATTEMPT_ID,
        workstationInstanceId,
        deviceSequence,
        status: 'APPLIED',
        reason: null,
        createdAt: NOW,
      }));
    }

    /**
     * Wires the fake repository around one running attempt. The stores record
     * what a closure writes, so a test sees the publication the service built
     * without a database.
     */
    function arrangeClosure(
      overrides: {
        attempt?: TimingAttemptRow;
        participants?: TimingParticipantRow[];
        marks?: TimingMarkRow[];
        receipts?: TimingReceiptRow[];
        pendingFinishes?: TimingMarkRow[];
        lock?: TimingCaptureLockRow | null;
        withdrawn?: string[];
        result?: (enrollmentId: string) => TimingResultRow | null;
      } = {},
    ): {
      attempt: TimingAttemptRow;
      published: TimingPublishedResultRow[];
      auditInputs: InsertAuditInput[];
    } {
      const attempt =
        overrides.attempt ?? attemptRow({ id: ATTEMPT_ID, status: 'RUNNING' });
      const participants = overrides.participants ?? [];
      const published: TimingPublishedResultRow[] = [];
      const auditInputs: InsertAuditInput[] = [];
      const withdrawn = new Set(overrides.withdrawn ?? []);
      repository.findAttempt.mockResolvedValue(attempt);
      repository.listParticipants.mockResolvedValue(participants);
      repository.listMarks.mockResolvedValue(overrides.marks ?? []);
      repository.listPendingFinishes.mockResolvedValue(
        overrides.pendingFinishes ?? [],
      );
      repository.listAttemptReceipts.mockResolvedValue(
        overrides.receipts ?? [],
      );
      repository.getCaptureLock.mockResolvedValue(
        overrides.lock === undefined ? lockRow() : overrides.lock,
      );
      repository.listEnrollmentStatuses.mockImplementation(
        (enrollmentIds: readonly string[]) =>
          Promise.resolve(
            new Map<string, EnrollmentStatus>(
              enrollmentIds.map((enrollmentId) => [
                enrollmentId,
                withdrawn.has(enrollmentId) ? 'WITHDRAWN' : 'REGISTERED',
              ]),
            ),
          ),
      );
      repository.findResultByEnrollment.mockImplementation(
        (enrollmentId: string) =>
          Promise.resolve(overrides.result?.(enrollmentId) ?? null),
      );
      repository.publishResult.mockImplementation(
        (_tx: unknown, input: PublishResultInput) => {
          const row = publishedResultRow({
            id: `result-${input.enrollmentId}`,
            enrollmentId: input.enrollmentId,
            registrationId: input.registrationId,
            outcome: input.outcome,
            timeMilliseconds: input.timeMilliseconds,
            timingSessionId: input.timingSessionId,
            laps: [],
          });
          published.push(row);
          return Promise.resolve(
            resultRow({
              id: row.id,
              enrollmentId: input.enrollmentId,
              registrationId: input.registrationId,
              outcome: input.outcome,
              timeMilliseconds: input.timeMilliseconds,
              timingSessionId: input.timingSessionId,
            }),
          );
        },
      );
      repository.replaceResultSplits.mockImplementation(
        (_tx: unknown, resultId: string, splits: TimingLapSplit[]) => {
          const row = published.find((entry) => entry.id === resultId);
          if (row !== undefined) {
            row.laps = splits;
          }
          return Promise.resolve();
        },
      );
      repository.updateAttemptStatus.mockImplementation(
        (_tx: unknown, _attemptId: string, input: UpdateAttemptStatusInput) =>
          Promise.resolve({
            ...attempt,
            status: input.status,
            closedAt: input.closedAt,
            closedByUserId: input.closedByUserId,
            closureReport: input.closureReport,
          }),
      );
      repository.listPublishedResults.mockImplementation(() =>
        Promise.resolve([...published]),
      );
      repository.insertAudit.mockImplementation(
        (_tx: unknown, input: InsertAuditInput) => {
          auditInputs.push(input);
          return Promise.resolve({
            auditId: `audit-${auditInputs.length}`,
            actorUserId: input.actorUserId,
            action: input.action,
            targetType: input.targetType,
            targetId: input.targetId,
            oldValues: null,
            newValues: null,
            reason: input.reason,
            createdAt: NOW,
          });
        },
      );
      repository.listAudit.mockImplementation(() =>
        Promise.resolve(
          auditInputs.map((input, index) => ({
            auditId: `audit-${index + 1}`,
            actorUserId: input.actorUserId,
            action: input.action,
            targetType: input.targetType,
            targetId: input.targetId,
            oldValues: null,
            newValues: null,
            reason: input.reason,
            createdAt: NOW,
          })),
        ),
      );
      return { attempt, published, auditInputs };
    }

    /** The transaction a repository write was called on. */
    function transactionOf(mock: jest.Mock): unknown {
      return callArguments<[unknown]>(mock)[0];
    }

    it('publishes every at-N participant with exactly N splits and reports the rest', async () => {
      const { published, auditInputs } = arrangeClosure({
        participants: [
          participantRow({ enrollmentId: 'enrollment-a', requiredLaps: 3 }),
          participantRow({
            enrollmentId: 'enrollment-excluded',
            startNumber: 11,
            requiredLaps: 3,
            excludedReason: 'RACE_SECTION',
          }),
        ],
        marks: passesOf('enrollment-a', [30_000, 60_000, 90_000]),
        receipts: receiptRows([1, 2, 3]),
      });

      const record = await service.completeAttempt(
        USER_ID,
        EVENT_ID,
        ATTEMPT_ID,
        completeAttemptDto({ lastIssuedSequence: 99 }),
      );

      expect(roles.assertHasAnyRole).toHaveBeenCalledWith(
        USER_ID,
        TIMING_OPERATE_ROLES,
      );
      expect(repository.publishResult).toHaveBeenCalledTimes(1);
      const [, publishInput] = callArguments<[unknown, PublishResultInput]>(
        repository.publishResult,
      );
      expect(publishInput).toEqual({
        enrollmentId: 'enrollment-a',
        registrationId: 'registration-enrollment-a',
        outcome: 'FINISHED',
        timeMilliseconds: 90_000,
        timingSessionId: ATTEMPT_ID,
      });
      // U-11, U-12: exactly N splits, the last cumulative value is the total.
      expect(repository.replaceResultSplits).toHaveBeenCalledWith(
        TX,
        'result-enrollment-a',
        [
          { lapNumber: 1, lapTimeMs: 30_000, cumulativeMs: 30_000 },
          { lapNumber: 2, lapTimeMs: 30_000, cumulativeMs: 60_000 },
          { lapNumber: 3, lapTimeMs: 30_000, cumulativeMs: 90_000 },
        ],
      );
      expect(published.map((row) => row.laps)).toEqual([
        [
          { lapNumber: 1, lapTimeMs: 30_000, cumulativeMs: 30_000 },
          { lapNumber: 2, lapTimeMs: 30_000, cumulativeMs: 60_000 },
          { lapNumber: 3, lapTimeMs: 30_000, cumulativeMs: 90_000 },
        ],
      ]);
      const expectedReport: TimingClosureReportRecord = {
        publishedEnrollmentIds: ['enrollment-a'],
        unpublishedEnrollmentIds: ['enrollment-excluded'],
        conflictEnrollmentIds: [],
      };
      const [, , updateInput] = callArguments<
        [unknown, string, UpdateAttemptStatusInput]
      >(repository.updateAttemptStatus);
      expect(updateInput).toMatchObject({
        status: 'COMPLETED',
        closedAt: NOW,
        closedByUserId: USER_ID,
        closureReport: expectedReport,
      });
      // U-20: the publication, the state change and the audit commit on one
      // transaction; the capture hold survives the closure.
      expect(transactionOf(repository.publishResult)).toBe(TX);
      expect(transactionOf(repository.replaceResultSplits)).toBe(TX);
      expect(transactionOf(repository.updateAttemptStatus)).toBe(TX);
      expect(transactionOf(repository.insertAudit)).toBe(TX);
      expect(repository.releaseCaptureLock).not.toHaveBeenCalled();
      expect(auditInputs).toEqual([
        expect.objectContaining({
          attemptId: ATTEMPT_ID,
          actorUserId: USER_ID,
          action: 'COMPLETE',
          targetType: 'ATTEMPT',
          targetId: ATTEMPT_ID,
          reason: null,
          newValues: { status: 'COMPLETED', closureReport: expectedReport },
        }),
      ]);
      expect(record.state).toBe('COMPLETED');
      expect(record.closureReport).toEqual(expectedReport);
      expect(
        record.publishedResults.map((result) => result.enrollmentId),
      ).toEqual(['enrollment-a']);
    });

    it('refuses completion while a pending finish is unbound and writes nothing', async () => {
      arrangeClosure({
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        marks: passesOf('enrollment-a', [30_000, 60_000, 90_000]),
        receipts: receiptRows([1, 2, 3]),
        pendingFinishes: [pendingMarkRow()],
      });

      const refusal = await service
        .completeAttempt(USER_ID, EVENT_ID, ATTEMPT_ID, completeAttemptDto())
        .catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        code: TimingErrorCode.PENDING_REMAINS,
        details: {
          attemptId: ATTEMPT_ID,
          pendingFinishIds: ['mark-pending'],
        },
      });
      expect(repository.publishResult).not.toHaveBeenCalled();
      expect(repository.updateAttemptStatus).not.toHaveBeenCalled();
      expect(repository.releaseCaptureLock).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('refuses completion, force-completion and cancellation while an anonymous split is queued', async () => {
      arrangeClosure();
      repository.listAnonymousSplits.mockResolvedValue([
        anonymousSplitRow({ splitId: 'split-1' }),
      ]);

      for (const close of [
        () =>
          service.completeAttempt(
            USER_ID,
            EVENT_ID,
            ATTEMPT_ID,
            completeAttemptDto({ lastIssuedSequence: 0 }),
          ),
        () =>
          service.forceCompleteAttempt(
            USER_ID,
            EVENT_ID,
            ATTEMPT_ID,
            forceCompleteDto(),
          ),
        () =>
          service.cancelAttempt(
            USER_ID,
            EVENT_ID,
            ATTEMPT_ID,
            cancelAttemptDto(),
          ),
      ]) {
        const refusal = await close().catch((error: unknown) => error);
        expect(refusal).toMatchObject({
          code: TimingErrorCode.PENDING_REMAINS,
          details: {
            attemptId: ATTEMPT_ID,
            anonymousSplitIds: ['split-1'],
          },
        });
        expect((refusal as { message?: string }).message).toContain(
          'В попытке есть неразмеченный сплит (00:20.000)',
        );
      }
      expect(repository.updateAttemptStatus).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('ignores an anonymous split queued on another attempt', async () => {
      arrangeClosure();
      repository.listAnonymousSplits.mockResolvedValue([
        anonymousSplitRow({ splitId: 'split-other', attemptId: 'attempt-2' }),
      ]);

      const record = await service.completeAttempt(
        USER_ID,
        EVENT_ID,
        ATTEMPT_ID,
        completeAttemptDto({ lastIssuedSequence: 0 }),
      );

      expect(record.state).toBe('COMPLETED');
      expect(repository.updateAttemptStatus).toHaveBeenCalledTimes(1);
    });

    it('refuses completion when the workstation has an unreceipted sequence', async () => {
      arrangeClosure({
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        marks: passesOf('enrollment-a', [30_000, 60_000, 90_000]),
        receipts: receiptRows([1, 3]),
      });

      const refusal = await service
        .completeAttempt(
          USER_ID,
          EVENT_ID,
          ATTEMPT_ID,
          completeAttemptDto({ lastIssuedSequence: 4 }),
        )
        .catch((error: unknown) => error);

      // AD-18: the cursor 4 is above the attempt's highest known sequence (3),
      // so it is a foreign value and is not expanded into a phantom sequence 4.
      // The real gap 2 inside the attempt still blocks.
      expect(refusal).toMatchObject({
        code: TimingErrorCode.UNCONFIRMED_MUTATIONS,
        details: {
          attemptId: ATTEMPT_ID,
          missingSequences: [2],
          workstations: [
            { workstationInstanceId: WORKSTATION, missingSequences: [2] },
          ],
        },
      });
      expect(repository.publishResult).not.toHaveBeenCalled();
      expect(repository.updateAttemptStatus).not.toHaveBeenCalled();
    });

    it('ignores a foreign cursor above the attempt high while a real gap still blocks', async () => {
      arrangeClosure({
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        marks: passesOf('enrollment-a', [30_000, 60_000, 90_000]),
        receipts: receiptRows([1, 2, 3]),
      });

      const record = await service.completeAttempt(
        USER_ID,
        EVENT_ID,
        ATTEMPT_ID,
        completeAttemptDto({ lastIssuedSequence: 9 }),
      );

      expect(record.state).toBe('COMPLETED');
      expect(repository.publishResult).toHaveBeenCalledTimes(1);
    });

    it('closes a capture-less attempt on the participant gate and publishes nothing', async () => {
      arrangeClosure({ participants: [] });

      const record = await service.completeAttempt(
        USER_ID,
        EVENT_ID,
        ATTEMPT_ID,
        completeAttemptDto({ lastIssuedSequence: 7 }),
      );

      expect(record.state).toBe('COMPLETED');
      expect(repository.publishResult).not.toHaveBeenCalled();
      expect(repository.replaceResultSplits).not.toHaveBeenCalled();
      const [, , updateInput] = callArguments<
        [unknown, string, UpdateAttemptStatusInput]
      >(repository.updateAttemptStatus);
      expect(updateInput.closureReport).toEqual({
        publishedEnrollmentIds: [],
        unpublishedEnrollmentIds: [],
        conflictEnrollmentIds: [],
      });
    });

    it('closes an all-excluded attempt and publishes nothing', async () => {
      arrangeClosure({
        participants: [
          participantRow({
            enrollmentId: 'enrollment-excluded',
            excludedReason: 'RACE_SECTION',
          }),
        ],
      });

      const record = await service.completeAttempt(
        USER_ID,
        EVENT_ID,
        ATTEMPT_ID,
        completeAttemptDto({ lastIssuedSequence: 5 }),
      );

      expect(record.state).toBe('COMPLETED');
      expect(repository.publishResult).not.toHaveBeenCalled();
      const [, , updateInput] = callArguments<
        [unknown, string, UpdateAttemptStatusInput]
      >(repository.updateAttemptStatus);
      expect(updateInput.closureReport).toEqual({
        publishedEnrollmentIds: [],
        unpublishedEnrollmentIds: ['enrollment-excluded'],
        conflictEnrollmentIds: [],
      });
    });

    it('does not let a REJECTED receipt block the closing attempt', async () => {
      arrangeClosure({
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        marks: passesOf('enrollment-a', [30_000, 60_000, 90_000]),
        receipts: [
          ...receiptRows([1, 2, 3]),
          {
            attemptId: ATTEMPT_ID,
            workstationInstanceId: WORKSTATION,
            deviceSequence: 4,
            status: 'REJECTED',
            reason: TimingErrorCode.EXCLUDED_PARTICIPANT,
            createdAt: NOW,
          },
        ],
      });

      const record = await service.completeAttempt(
        USER_ID,
        EVENT_ID,
        ATTEMPT_ID,
        completeAttemptDto({ lastIssuedSequence: 4 }),
      );

      expect(record.state).toBe('COMPLETED');
      expect(repository.publishResult).toHaveBeenCalledTimes(1);
    });

    it('refuses ordinary completion while a non-excluded participant is below N', async () => {
      arrangeClosure({
        participants: [
          participantRow({ enrollmentId: 'enrollment-a', requiredLaps: 3 }),
          participantRow({
            enrollmentId: 'enrollment-b',
            startNumber: 11,
            requiredLaps: 3,
          }),
        ],
        marks: [
          ...passesOf('enrollment-a', [30_000, 60_000, 90_000]),
          ...passesOf('enrollment-b', [30_000, 60_000], {
            firstSequence: 4,
          }),
        ],
        receipts: receiptRows([1, 2, 3, 4, 5]),
      });

      const refusal = await service
        .completeAttempt(
          USER_ID,
          EVENT_ID,
          ATTEMPT_ID,
          completeAttemptDto({ lastIssuedSequence: 5 }),
        )
        .catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        code: TimingErrorCode.PARTICIPANTS_BELOW_LAPS,
        details: {
          attemptId: ATTEMPT_ID,
          participants: [
            {
              enrollmentId: 'enrollment-b',
              registrationId: 'registration-enrollment-b',
              startNumber: 11,
              passCount: 2,
              requiredLaps: 3,
            },
          ],
        },
      });
      expect(repository.publishResult).not.toHaveBeenCalled();
      expect(repository.updateAttemptStatus).not.toHaveBeenCalled();
    });

    it('force-completes as INCOMPLETE, publishing only the participants at N', async () => {
      const { published, auditInputs } = arrangeClosure({
        participants: [
          participantRow({ enrollmentId: 'enrollment-a', requiredLaps: 3 }),
          participantRow({
            enrollmentId: 'enrollment-b',
            startNumber: 11,
            requiredLaps: 3,
          }),
          participantRow({
            enrollmentId: 'enrollment-excluded',
            startNumber: 12,
            requiredLaps: 3,
            excludedReason: 'EXISTING_OUTCOME',
          }),
        ],
        marks: [
          ...passesOf('enrollment-a', [30_000, 60_000, 90_000]),
          ...passesOf('enrollment-b', [30_000, 60_000], { firstSequence: 4 }),
        ],
        receipts: receiptRows([1, 2, 3, 4, 5]),
        lock: { ...lockRow(), workstationInstanceId: 'workstation-b' },
      });

      const record = await service.forceCompleteAttempt(
        USER_ID,
        EVENT_ID,
        ATTEMPT_ID,
        forceCompleteDto({ reason: '  Дождь  ' }),
      );

      expect(roles.assertHasAnyRole).toHaveBeenCalledWith(USER_ID, [
        RoleCode.ADMINISTRATOR,
      ]);
      // No DNF and no result for the short participant.
      expect(repository.publishResult).toHaveBeenCalledTimes(1);
      expect(published.map((row) => row.enrollmentId)).toEqual([
        'enrollment-a',
      ]);
      const [, , updateInput] = callArguments<
        [unknown, string, UpdateAttemptStatusInput]
      >(repository.updateAttemptStatus);
      expect(updateInput).toMatchObject({
        status: 'INCOMPLETE',
        closureReport: {
          publishedEnrollmentIds: ['enrollment-a'],
          unpublishedEnrollmentIds: ['enrollment-b', 'enrollment-excluded'],
          conflictEnrollmentIds: [],
        },
      });
      expect(repository.releaseCaptureLock).not.toHaveBeenCalled();
      expect(auditInputs[0]).toMatchObject({
        action: 'FORCE_COMPLETE',
        reason: 'Дождь',
        newValues: { status: 'INCOMPLETE' },
      });
      expect(record.state).toBe('INCOMPLETE');
    });

    it('force-completion checks the receipts of every capturing workstation', async () => {
      arrangeClosure({
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        marks: [
          ...passesOf('enrollment-a', [30_000]),
          ...passesOf('enrollment-a', [60_000, 90_000], {
            workstationInstanceId: 'workstation-b',
            idPrefix: 'mark-b',
          }),
        ],
        receipts: receiptRows([1]),
      });

      const refusal = await service
        .forceCompleteAttempt(USER_ID, EVENT_ID, ATTEMPT_ID, forceCompleteDto())
        .catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        code: TimingErrorCode.UNCONFIRMED_MUTATIONS,
        details: {
          missingSequences: [1, 2],
          workstations: [
            {
              workstationInstanceId: 'workstation-b',
              missingSequences: [1, 2],
            },
          ],
        },
      });
      expect(repository.updateAttemptStatus).not.toHaveBeenCalled();
    });

    it('ignores a split-derived pass sequence in capture receipt coverage', async () => {
      arrangeClosure({
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        marks: [
          ...passesOf('enrollment-a', [30_000, 60_000, 90_000]),
          markRow({
            id: 'split-pass',
            enrollmentId: null,
            registrationId: null,
            startNumber: null,
            sourceSplitId: 'split-1',
            deviceSequence: 99,
            status: 'BOUND',
          }),
        ],
        receipts: receiptRows([1, 2, 3]),
      });

      const closed = await service.completeAttempt(
        USER_ID,
        EVENT_ID,
        ATTEMPT_ID,
        completeAttemptDto({ lastIssuedSequence: 3 }),
      );

      expect(closed.state).toBe('COMPLETED');
    });

    it('cancels as CANCELLED and publishes nothing', async () => {
      const { published, auditInputs } = arrangeClosure({
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        marks: passesOf('enrollment-a', [30_000, 60_000, 90_000]),
        receipts: receiptRows([1, 2, 3]),
      });

      const record = await service.cancelAttempt(
        USER_ID,
        EVENT_ID,
        ATTEMPT_ID,
        cancelAttemptDto({ reason: 'Забег отменён' }),
      );

      expect(roles.assertHasAnyRole).toHaveBeenCalledWith(USER_ID, [
        RoleCode.ADMINISTRATOR,
      ]);
      expect(repository.publishResult).not.toHaveBeenCalled();
      expect(repository.replaceResultSplits).not.toHaveBeenCalled();
      expect(published).toEqual([]);
      const [, , updateInput] = callArguments<
        [unknown, string, UpdateAttemptStatusInput]
      >(repository.updateAttemptStatus);
      expect(updateInput).toMatchObject({
        status: 'CANCELLED',
        closureReport: {
          publishedEnrollmentIds: [],
          unpublishedEnrollmentIds: ['enrollment-a'],
          conflictEnrollmentIds: [],
        },
      });
      expect(auditInputs[0]).toMatchObject({
        action: 'CANCEL_ATTEMPT',
        reason: 'Забег отменён',
      });
      expect(record.state).toBe('CANCELLED');
    });

    it('reports a pre-existing hand-entered result as a conflict and leaves it unchanged', async () => {
      const { published } = arrangeClosure({
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        marks: passesOf('enrollment-a', [30_000, 60_000, 90_000]),
        receipts: receiptRows([1, 2, 3]),
        result: (enrollmentId) =>
          enrollmentId === 'enrollment-a'
            ? resultRow({ id: 'result-manual', timingSessionId: null })
            : null,
      });

      await service.completeAttempt(
        USER_ID,
        EVENT_ID,
        ATTEMPT_ID,
        completeAttemptDto(),
      );

      expect(repository.publishResult).not.toHaveBeenCalled();
      expect(repository.replaceResultSplits).not.toHaveBeenCalled();
      expect(published).toEqual([]);
      const [, , updateInput] = callArguments<
        [unknown, string, UpdateAttemptStatusInput]
      >(repository.updateAttemptStatus);
      expect(updateInput.closureReport).toEqual({
        publishedEnrollmentIds: [],
        unpublishedEnrollmentIds: [],
        conflictEnrollmentIds: ['enrollment-a'],
      });
    });

    it('skips a withdrawn enrollment and reports it unpublished', async () => {
      const { published } = arrangeClosure({
        participants: [
          participantRow({ enrollmentId: 'enrollment-a', requiredLaps: 3 }),
          participantRow({
            enrollmentId: 'enrollment-b',
            startNumber: 11,
            requiredLaps: 3,
          }),
        ],
        marks: [
          ...passesOf('enrollment-a', [30_000, 60_000, 90_000]),
          ...passesOf('enrollment-b', [40_000, 80_000, 120_000], {
            firstSequence: 4,
            idPrefix: 'mark-b',
          }),
        ],
        receipts: receiptRows([1, 2, 3, 4, 5, 6]),
        withdrawn: ['enrollment-a'],
      });

      await service.completeAttempt(
        USER_ID,
        EVENT_ID,
        ATTEMPT_ID,
        completeAttemptDto({ lastIssuedSequence: 6 }),
      );

      expect(published.map((row) => row.enrollmentId)).toEqual([
        'enrollment-b',
      ]);
      expect(published[0].timeMilliseconds).toBe(120_000);
      const [, , updateInput] = callArguments<
        [unknown, string, UpdateAttemptStatusInput]
      >(repository.updateAttemptStatus);
      expect(updateInput.closureReport).toEqual({
        publishedEnrollmentIds: ['enrollment-b'],
        unpublishedEnrollmentIds: ['enrollment-a'],
        conflictEnrollmentIds: [],
      });
    });

    it('accepts lastIssuedSequence zero when the completing workstation issued nothing', async () => {
      arrangeClosure({
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        marks: passesOf('enrollment-a', [30_000, 60_000, 90_000], {
          workstationInstanceId: 'workstation-earlier',
        }),
        receipts: receiptRows([1, 2, 3], 'workstation-earlier'),
      });

      const record = await service.completeAttempt(
        USER_ID,
        EVENT_ID,
        ATTEMPT_ID,
        completeAttemptDto({ lastIssuedSequence: 0 }),
      );

      expect(record.state).toBe('COMPLETED');
      expect(repository.publishResult).toHaveBeenCalledTimes(1);
    });

    it('leaves the attempt running and writes nothing when a publication fails', async () => {
      arrangeClosure({
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        marks: passesOf('enrollment-a', [30_000, 60_000, 90_000]),
        receipts: receiptRows([1, 2, 3]),
      });
      repository.publishResult.mockRejectedValue(
        new Error('Result insert failed.'),
      );

      await expect(
        service.completeAttempt(
          USER_ID,
          EVENT_ID,
          ATTEMPT_ID,
          completeAttemptDto(),
        ),
      ).rejects.toThrow('Result insert failed.');

      expect(repository.replaceResultSplits).not.toHaveBeenCalled();
      expect(repository.updateAttemptStatus).not.toHaveBeenCalled();
      expect(repository.releaseCaptureLock).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('refuses every closure on an attempt that is not running', async () => {
      arrangeClosure({
        attempt: attemptRow({
          id: ATTEMPT_ID,
          status: 'CANCELLED',
          closedAt: NOW,
        }),
      });

      await expect(
        service.completeAttempt(
          USER_ID,
          EVENT_ID,
          ATTEMPT_ID,
          completeAttemptDto(),
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.ATTEMPT_CLOSED });
      await expect(
        service.forceCompleteAttempt(
          USER_ID,
          EVENT_ID,
          ATTEMPT_ID,
          forceCompleteDto(),
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.ATTEMPT_CLOSED });
      await expect(
        service.cancelAttempt(
          USER_ID,
          EVENT_ID,
          ATTEMPT_ID,
          cancelAttemptDto(),
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.ATTEMPT_CLOSED });
      expect(repository.updateAttemptStatus).not.toHaveBeenCalled();
      expect(repository.publishResult).not.toHaveBeenCalled();
    });

    it('refuses ordinary completion from a workstation that does not hold capture', async () => {
      arrangeClosure({
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
        marks: passesOf('enrollment-a', [30_000, 60_000, 90_000]),
        receipts: receiptRows([1, 2, 3]),
        lock: { ...lockRow(), workstationInstanceId: 'workstation-b' },
      });

      const refusal = await service
        .completeAttempt(USER_ID, EVENT_ID, ATTEMPT_ID, completeAttemptDto())
        .catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        code: TimingErrorCode.CAPTURE_NOT_HELD,
        details: {
          workstationInstanceId: WORKSTATION,
          holderWorkstationInstanceId: 'workstation-b',
        },
      });
      expect(repository.updateAttemptStatus).not.toHaveBeenCalled();
    });

    it('refuses a blank reason for force-completion and cancellation', async () => {
      arrangeClosure({
        participants: [participantRow({ enrollmentId: 'enrollment-a' })],
      });

      await expect(
        service.forceCompleteAttempt(
          USER_ID,
          EVENT_ID,
          ATTEMPT_ID,
          forceCompleteDto({ reason: '   ' }),
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.REASON_REQUIRED });
      await expect(
        service.cancelAttempt(
          USER_ID,
          EVENT_ID,
          ATTEMPT_ID,
          cancelAttemptDto({ reason: '' }),
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.REASON_REQUIRED });
      expect(repository.withTransaction).not.toHaveBeenCalled();
    });

    describe('heat closure', () => {
      /**
       * Wires the fake repository around one running heat attempt. The heat-time
       * store mimics the closure transaction: a failed write empties it, so a
       * test sees "no heat time" the way PostgreSQL would leave it.
       */
      function arrangeHeatClosure(
        overrides: {
          attempt?: TimingAttemptRow;
          participants?: TimingParticipantRow[];
          marks?: TimingMarkRow[];
          receipts?: TimingReceiptRow[];
          heatTimes?: TimingHeatTimeRow[];
          eventLaps?: Array<{ eventLapId: string; lapNumber: number }>;
          withdrawn?: string[];
          lock?: TimingCaptureLockRow | null;
        } = {},
      ): {
        attempt: TimingAttemptRow;
        written: CreateHeatTimeInput[];
        auditInputs: InsertAuditInput[];
      } {
        const attempt = overrides.attempt ?? heatAttemptRow();
        const participants = overrides.participants ?? [];
        const written: CreateHeatTimeInput[] = [];
        const auditInputs: InsertAuditInput[] = [];
        const withdrawn = new Set(overrides.withdrawn ?? []);
        repository.withTransaction.mockImplementation(
          async (run: (tx: unknown) => Promise<unknown>) => {
            try {
              return await run(TX);
            } catch (error) {
              written.length = 0;
              throw error;
            }
          },
        );
        repository.findAttempt.mockResolvedValue(attempt);
        repository.listParticipants.mockResolvedValue(participants);
        repository.listMarks.mockResolvedValue(overrides.marks ?? []);
        repository.listAttemptReceipts.mockResolvedValue(
          overrides.receipts ?? [],
        );
        repository.listHeatTimesForHeat.mockResolvedValue(
          overrides.heatTimes ?? [],
        );
        repository.listEventLaps.mockResolvedValue(overrides.eventLaps ?? []);
        repository.getCaptureLock.mockResolvedValue(
          overrides.lock === undefined ? lockRow() : overrides.lock,
        );
        repository.listEnrollmentStatuses.mockImplementation(
          (enrollmentIds: readonly string[]) =>
            Promise.resolve(
              new Map<string, EnrollmentStatus>(
                enrollmentIds.map((enrollmentId) => [
                  enrollmentId,
                  withdrawn.has(enrollmentId) ? 'WITHDRAWN' : 'REGISTERED',
                ]),
              ),
            ),
        );
        repository.createHeatTime.mockImplementation(
          (_tx: unknown, input: CreateHeatTimeInput) => {
            written.push(input);
            return Promise.resolve(
              heatTimeRow({
                id: `heat-time-${input.registrationId}`,
                classCompetitionId: input.classCompetitionId,
                stageId: input.stageId,
                heatNumber: input.heatNumber,
                registrationId: input.registrationId,
                timeMilliseconds: input.timeMilliseconds,
                status: 'OK',
              }),
            );
          },
        );
        repository.updateAttemptStatus.mockImplementation(
          (_tx: unknown, _attemptId: string, input: UpdateAttemptStatusInput) =>
            Promise.resolve({
              ...attempt,
              status: input.status,
              closedAt: input.closedAt,
              closedByUserId: input.closedByUserId,
              closureReport: input.closureReport,
            }),
        );
        repository.insertAudit.mockImplementation(
          (_tx: unknown, input: InsertAuditInput) => {
            auditInputs.push(input);
            return Promise.resolve({
              auditId: `audit-${auditInputs.length}`,
              actorUserId: input.actorUserId,
              action: input.action,
              targetType: input.targetType,
              targetId: input.targetId,
              oldValues: null,
              newValues: null,
              reason: input.reason,
              createdAt: NOW,
            });
          },
        );
        repository.listAudit.mockImplementation(() =>
          Promise.resolve(
            auditInputs.map((input, index) => ({
              auditId: `audit-${index + 1}`,
              actorUserId: input.actorUserId,
              action: input.action,
              targetType: input.targetType,
              targetId: input.targetId,
              oldValues: null,
              newValues: null,
              reason: input.reason,
              createdAt: NOW,
            })),
          ),
        );
        return { attempt, written, auditInputs };
      }

      /** The closure report one closure froze on the attempt. */
      function frozenReport(): TimingClosureReportView {
        const [, , updateInput] = callArguments<
          [unknown, string, UpdateAttemptStatusInput]
        >(repository.updateAttemptStatus);
        if (updateInput.closureReport === null) {
          throw new Error('The closure froze no report.');
        }
        return updateInput.closureReport;
      }

      it('publishes one total and OK heat time per at-N participant and no ordinary result', async () => {
        const { written, auditInputs } = arrangeHeatClosure({
          participants: [
            participantRow({ enrollmentId: 'enrollment-a', requiredLaps: 3 }),
            participantRow({
              enrollmentId: 'enrollment-b',
              startNumber: 11,
              requiredLaps: 3,
            }),
            participantRow({
              enrollmentId: 'enrollment-excluded',
              startNumber: 13,
              requiredLaps: 3,
              excludedReason: 'EXISTING_HEAT_TIME',
            }),
            participantRow({
              enrollmentId: 'enrollment-withdrawn',
              startNumber: 14,
              requiredLaps: 3,
            }),
          ],
          marks: [
            ...passesOf('enrollment-a', [30_000, 60_000, 90_000]),
            ...passesOf('enrollment-b', [40_000, 80_000, 120_000], {
              firstSequence: 4,
              idPrefix: 'mark-b',
            }),
          ],
          receipts: receiptRows([1, 2, 3, 4, 5, 6]),
          heatTimes: [
            heatTimeRow({ registrationId: 'registration-enrollment-excluded' }),
          ],
          eventLaps: [
            { eventLapId: 'event-lap-1', lapNumber: 1 },
            { eventLapId: 'event-lap-2', lapNumber: 2 },
            { eventLapId: 'event-lap-3', lapNumber: 3 },
          ],
          withdrawn: ['enrollment-withdrawn'],
        });

        const record = await service.completeAttempt(
          USER_ID,
          EVENT_ID,
          ATTEMPT_ID,
          completeAttemptDto({ lastIssuedSequence: 6 }),
        );

        // AD-16: one row per at-N participant, total and registration only.
        expect(written).toEqual([
          {
            classCompetitionId: 'race-1',
            stageId: 'stage-1',
            heatNumber: 1,
            registrationId: 'registration-enrollment-a',
            timeMilliseconds: 90_000,
          },
          {
            classCompetitionId: 'race-1',
            stageId: 'stage-1',
            heatNumber: 1,
            registrationId: 'registration-enrollment-b',
            timeMilliseconds: 120_000,
          },
        ]);
        expect(transactionOf(repository.createHeatTime)).toBe(TX);
        // A multi-lap heat publishes the per-lap heat times from the same marks.
        expect(repository.createHeatLapTime).toHaveBeenCalledTimes(6);
        expect(repository.createHeatLapTime).toHaveBeenCalledWith(TX, {
          classHeatTimeId: 'heat-time-registration-enrollment-a',
          eventLapId: 'event-lap-1',
          timeMilliseconds: 30_000,
        });
        expect(repository.createHeatLapTime).toHaveBeenCalledWith(TX, {
          classHeatTimeId: 'heat-time-registration-enrollment-b',
          eventLapId: 'event-lap-3',
          timeMilliseconds: 40_000,
        });
        // U-18: no ordinary result and no enrollment split.
        expect(repository.publishResult).not.toHaveBeenCalled();
        expect(repository.replaceResultSplits).not.toHaveBeenCalled();

        expect(frozenReport()).toEqual({
          publishedEnrollmentIds: [],
          unpublishedEnrollmentIds: [
            'enrollment-a',
            'enrollment-b',
            'enrollment-excluded',
            'enrollment-withdrawn',
          ],
          conflictEnrollmentIds: [],
          publishedRegistrationIds: [
            'registration-enrollment-a',
            'registration-enrollment-b',
          ],
          conflictRegistrationIds: [],
        });
        expect(transactionOf(repository.updateAttemptStatus)).toBe(TX);
        expect(repository.releaseCaptureLock).not.toHaveBeenCalled();
        expect(transactionOf(repository.insertAudit)).toBe(TX);
        expect(auditInputs[0]).toMatchObject({
          action: 'COMPLETE',
          newValues: { status: 'COMPLETED' },
        });
        expect(record.state).toBe('COMPLETED');
        expect(record.publishedResults).toEqual([]);
        expect(record.closureReport).toMatchObject({
          publishedRegistrationIds: [
            'registration-enrollment-a',
            'registration-enrollment-b',
          ],
          conflictRegistrationIds: [],
        });
      });

      it('publishes nothing for a heat with only below-N, withdrawn or excluded participants', async () => {
        arrangeHeatClosure({
          participants: [
            participantRow({
              enrollmentId: 'enrollment-short',
              requiredLaps: 3,
            }),
            participantRow({
              enrollmentId: 'enrollment-excluded',
              startNumber: 11,
              requiredLaps: 3,
              excludedReason: 'EXISTING_HEAT_TIME',
            }),
            participantRow({
              enrollmentId: 'enrollment-withdrawn',
              startNumber: 12,
              requiredLaps: 3,
            }),
          ],
          marks: [
            ...passesOf('enrollment-short', [30_000, 60_000]),
            ...passesOf('enrollment-withdrawn', [30_000, 60_000, 90_000], {
              firstSequence: 3,
              idPrefix: 'mark-withdrawn',
            }),
          ],
          receipts: receiptRows([1, 2, 3, 4, 5]),
          heatTimes: [
            heatTimeRow({ registrationId: 'registration-enrollment-excluded' }),
          ],
          withdrawn: ['enrollment-withdrawn'],
        });

        const record = await service.forceCompleteAttempt(
          USER_ID,
          EVENT_ID,
          ATTEMPT_ID,
          forceCompleteDto(),
        );

        expect(record.state).toBe('INCOMPLETE');
        // U-17: no synthetic DNS, DNF, DSQ or time for a short participant.
        expect(repository.createHeatTime).not.toHaveBeenCalled();
        expect(repository.publishResult).not.toHaveBeenCalled();
        expect(frozenReport()).toEqual({
          publishedEnrollmentIds: [],
          unpublishedEnrollmentIds: [
            'enrollment-short',
            'enrollment-excluded',
            'enrollment-withdrawn',
          ],
          conflictEnrollmentIds: [],
          publishedRegistrationIds: [],
          conflictRegistrationIds: [],
        });
      });

      it('keeps a heat time that existed at the start out of the conflict list', async () => {
        const { written } = arrangeHeatClosure({
          participants: [
            participantRow({ enrollmentId: 'enrollment-a', requiredLaps: 3 }),
            participantRow({
              enrollmentId: 'enrollment-excluded',
              startNumber: 11,
              requiredLaps: 3,
              excludedReason: 'EXISTING_HEAT_TIME',
            }),
          ],
          marks: passesOf('enrollment-a', [30_000, 60_000, 90_000]),
          receipts: receiptRows([1, 2, 3]),
          heatTimes: [
            heatTimeRow({ registrationId: 'registration-enrollment-excluded' }),
          ],
        });

        await service.completeAttempt(
          USER_ID,
          EVENT_ID,
          ATTEMPT_ID,
          completeAttemptDto(),
        );

        // F-14: excluded at the freeze is excluded, never a conflict.
        expect(written.map((input) => input.registrationId)).toEqual([
          'registration-enrollment-a',
        ]);
        expect(frozenReport().conflictRegistrationIds).toEqual([]);
        expect(frozenReport().publishedRegistrationIds).toEqual([
          'registration-enrollment-a',
        ]);
      });

      it('reports a heat time that appeared during the attempt as a conflict and still closes', async () => {
        const { written, auditInputs } = arrangeHeatClosure({
          participants: [
            participantRow({ enrollmentId: 'enrollment-a', requiredLaps: 3 }),
            participantRow({
              enrollmentId: 'enrollment-b',
              startNumber: 11,
              requiredLaps: 3,
            }),
          ],
          marks: [
            ...passesOf('enrollment-a', [30_000, 60_000, 90_000]),
            ...passesOf('enrollment-b', [40_000, 80_000, 120_000], {
              firstSequence: 4,
              idPrefix: 'mark-b',
            }),
          ],
          receipts: receiptRows([1, 2, 3, 4, 5, 6]),
          heatTimes: [
            heatTimeRow({ registrationId: 'registration-enrollment-a' }),
          ],
        });

        const record = await service.completeAttempt(
          USER_ID,
          EVENT_ID,
          ATTEMPT_ID,
          completeAttemptDto({ lastIssuedSequence: 6 }),
        );

        expect(repository.listHeatTimesForHeat).toHaveBeenCalledWith(
          'race-1',
          'stage-1',
          1,
          TX,
        );
        // E-15: the hand-entered time is left untouched, the closure completes.
        expect(written.map((input) => input.registrationId)).toEqual([
          'registration-enrollment-b',
        ]);
        expect(frozenReport().conflictRegistrationIds).toEqual([
          'registration-enrollment-a',
        ]);
        expect(frozenReport().conflictEnrollmentIds).toEqual([]);
        expect(auditInputs).toHaveLength(1);
        expect(record.state).toBe('COMPLETED');
      });

      it('force-completes a heat and publishes only the participants at N', async () => {
        const { written } = arrangeHeatClosure({
          participants: [
            participantRow({ enrollmentId: 'enrollment-a', requiredLaps: 3 }),
            participantRow({
              enrollmentId: 'enrollment-b',
              startNumber: 11,
              requiredLaps: 3,
            }),
          ],
          marks: [
            ...passesOf('enrollment-a', [30_000, 60_000, 90_000]),
            ...passesOf('enrollment-b', [40_000, 80_000], {
              firstSequence: 4,
              idPrefix: 'mark-b',
            }),
          ],
          receipts: receiptRows([1, 2, 3, 4, 5]),
          lock: { ...lockRow(), workstationInstanceId: 'workstation-b' },
        });

        const record = await service.forceCompleteAttempt(
          USER_ID,
          EVENT_ID,
          ATTEMPT_ID,
          forceCompleteDto({ reason: '  Дождь  ' }),
        );

        expect(record.state).toBe('INCOMPLETE');
        expect(written.map((input) => input.registrationId)).toEqual([
          'registration-enrollment-a',
        ]);
        expect(written[0].timeMilliseconds).toBe(90_000);
        expect(frozenReport()).toMatchObject({
          publishedRegistrationIds: ['registration-enrollment-a'],
          conflictRegistrationIds: [],
        });
      });

      it('cancels a heat without publishing a heat time', async () => {
        const { auditInputs } = arrangeHeatClosure({
          participants: [participantRow({ enrollmentId: 'enrollment-a' })],
          marks: passesOf('enrollment-a', [30_000, 60_000, 90_000]),
          receipts: receiptRows([1, 2, 3]),
        });

        const record = await service.cancelAttempt(
          USER_ID,
          EVENT_ID,
          ATTEMPT_ID,
          cancelAttemptDto({ reason: 'Забег отменён' }),
        );

        expect(record.state).toBe('CANCELLED');
        // E-21: a cancellation publishes nothing and reads no heat time.
        expect(repository.listHeatTimesForHeat).not.toHaveBeenCalled();
        expect(repository.createHeatTime).not.toHaveBeenCalled();
        expect(repository.publishResult).not.toHaveBeenCalled();
        expect(frozenReport()).toEqual({
          publishedEnrollmentIds: [],
          unpublishedEnrollmentIds: ['enrollment-a'],
          conflictEnrollmentIds: [],
          publishedRegistrationIds: [],
          conflictRegistrationIds: [],
        });
        expect(auditInputs[0]).toMatchObject({
          action: 'CANCEL_ATTEMPT',
          reason: 'Забег отменён',
        });
      });

      it('leaves the heat attempt running and writes no heat time when a publication fails', async () => {
        const { written } = arrangeHeatClosure({
          participants: [
            participantRow({ enrollmentId: 'enrollment-a', requiredLaps: 3 }),
            participantRow({
              enrollmentId: 'enrollment-b',
              startNumber: 11,
              requiredLaps: 3,
            }),
          ],
          marks: [
            ...passesOf('enrollment-a', [30_000, 60_000, 90_000]),
            ...passesOf('enrollment-b', [40_000, 80_000, 120_000], {
              firstSequence: 4,
              idPrefix: 'mark-b',
            }),
          ],
          receipts: receiptRows([1, 2, 3, 4, 5, 6]),
        });
        repository.createHeatTime
          .mockImplementationOnce(
            (_tx: unknown, input: CreateHeatTimeInput) => {
              written.push(input);
              return Promise.resolve(
                heatTimeRow({ registrationId: input.registrationId }),
              );
            },
          )
          .mockRejectedValueOnce(new Error('Heat time insert failed.'));

        await expect(
          service.completeAttempt(
            USER_ID,
            EVENT_ID,
            ATTEMPT_ID,
            completeAttemptDto({ lastIssuedSequence: 6 }),
          ),
        ).rejects.toThrow('Heat time insert failed.');

        // F-13: the whole closure rolled back, so no participant keeps a time.
        expect(written).toEqual([]);
        expect(repository.updateAttemptStatus).not.toHaveBeenCalled();
        expect(repository.releaseCaptureLock).not.toHaveBeenCalled();
        expect(repository.insertAudit).not.toHaveBeenCalled();
      });
    });
  });

  describe('capture lock', () => {
    beforeEach(() => {
      repository.findEvent.mockResolvedValue(eventRow());
    });

    it('takes capture when no workstation holds it and audits the take', async () => {
      repository.claimCaptureLock.mockResolvedValue(lockRow());
      repository.listRunningAttemptIds.mockResolvedValue([ATTEMPT_ID]);

      const view = await service.takeCapture(
        USER_ID,
        EVENT_ID,
        takeCaptureDto(),
      );

      expect(view).toEqual({
        eventId: EVENT_ID,
        workstationInstanceId: WORKSTATION,
        heldByUserId: USER_ID,
        heldAt: NOW.toISOString(),
      });
      const [, claimInput] = callArguments<[unknown, ClaimCaptureLockInput]>(
        repository.claimCaptureLock,
      );
      expect(claimInput).toMatchObject({
        eventId: EVENT_ID,
        workstationInstanceId: WORKSTATION,
        heldByUserId: USER_ID,
      });
      expect(repository.insertAudit).toHaveBeenCalledTimes(1);
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        attemptId: ATTEMPT_ID,
        actorUserId: USER_ID,
        action: 'CAPTURE_TAKE',
        targetType: 'CAPTURE_LOCK',
        targetId: EVENT_ID,
        newValues: {
          workstationInstanceId: WORKSTATION,
          heldByUserId: USER_ID,
        },
      });
      expect(roles.assertHasAnyRole).toHaveBeenCalledWith(
        USER_ID,
        TIMING_OPERATE_ROLES,
      );
    });

    it('returns the same hold when the same workstation takes capture again', async () => {
      repository.getCaptureLock.mockResolvedValue(lockRow());

      const view = await service.takeCapture(
        USER_ID,
        EVENT_ID,
        takeCaptureDto(),
      );

      expect(view.workstationInstanceId).toBe(WORKSTATION);
      expect(repository.claimCaptureLock).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('refuses a take while an entitled workstation holds capture and names the holder', async () => {
      repository.getCaptureLock.mockResolvedValue(
        lockRow({
          workstationInstanceId: 'workstation-b',
          heldByUserId: 'user-b',
        }),
      );
      repository.findUserRoleCodes.mockResolvedValue([RoleCode.REFEREE]);

      const refusal = await service
        .takeCapture(USER_ID, EVENT_ID, takeCaptureDto())
        .catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        code: TimingErrorCode.CAPTURE_HELD,
        details: {
          holderWorkstationInstanceId: 'workstation-b',
          holderUserId: 'user-b',
        },
      });
      expect(repository.findUserRoleCodes).toHaveBeenCalledWith('user-b', TX);
      expect(repository.releaseCaptureLock).not.toHaveBeenCalled();
      expect(repository.claimCaptureLock).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('releases a stale hold whose user lost every timing role, then claims and audits both', async () => {
      const stale = lockRow({
        workstationInstanceId: 'workstation-b',
        heldByUserId: 'user-b',
        lockToken: 'stale-token',
      });
      repository.getCaptureLock.mockResolvedValue(stale);
      repository.findUserRoleCodes.mockResolvedValue([RoleCode.ORGANIZER]);
      repository.releaseCaptureLock.mockResolvedValue(stale);
      repository.claimCaptureLock.mockResolvedValue(lockRow());
      repository.listRunningAttemptIds.mockResolvedValue([ATTEMPT_ID]);

      const view = await service.takeCapture(
        USER_ID,
        EVENT_ID,
        takeCaptureDto(),
      );

      expect(view.workstationInstanceId).toBe(WORKSTATION);
      expect(view.heldByUserId).toBe(USER_ID);
      const [, releaseInput] = callArguments<
        [unknown, ReleaseCaptureLockInput]
      >(repository.releaseCaptureLock);
      expect(releaseInput).toEqual({
        eventId: EVENT_ID,
        lockToken: 'stale-token',
      });
      const actions = repository.insertAudit.mock.calls.map(
        (call: unknown[]) => (call[1] as InsertAuditInput).action,
      );
      expect(actions).toEqual(['CAPTURE_RELEASE_ROLE_REMOVED', 'CAPTURE_TAKE']);
      expect(repository.claimCaptureLock).toHaveBeenCalled();
    });

    it('lets exactly one simultaneous claim win and names the winner', async () => {
      repository.getCaptureLock
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          lockRow({
            workstationInstanceId: 'workstation-b',
            heldByUserId: 'user-b',
          }),
        );
      repository.claimCaptureLock.mockResolvedValue(null);

      const refusal = await service
        .takeCapture(USER_ID, EVENT_ID, takeCaptureDto())
        .catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        code: TimingErrorCode.CAPTURE_HELD,
        details: {
          holderWorkstationInstanceId: 'workstation-b',
          holderUserId: 'user-b',
        },
      });
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('transfers capture after the outgoing workstation has no receipt gap and audits the move', async () => {
      repository.getCaptureLock.mockResolvedValue(lockRow());
      repository.listRunningAttemptIds.mockResolvedValue([ATTEMPT_ID]);
      repository.listMarks.mockResolvedValue([
        markRow({ id: 'mark-1', deviceSequence: 1 }),
        markRow({ id: 'mark-2', deviceSequence: 2 }),
      ]);
      repository.listAttemptReceipts.mockResolvedValue([
        receiptRow({ deviceSequence: 1 }),
        receiptRow({ deviceSequence: 2 }),
      ]);
      repository.transferCaptureLock.mockResolvedValue(
        lockRow({ workstationInstanceId: 'workstation-b' }),
      );

      const view = await service.transferCapture(
        USER_ID,
        EVENT_ID,
        transferCaptureDto(),
      );

      expect(view).toEqual({
        eventId: EVENT_ID,
        workstationInstanceId: 'workstation-b',
        heldByUserId: USER_ID,
        heldAt: NOW.toISOString(),
      });
      const [, transferInput] = callArguments<
        [unknown, TransferCaptureLockInput]
      >(repository.transferCaptureLock);
      expect(transferInput).toMatchObject({
        eventId: EVENT_ID,
        expectedLockToken: 'lock-token',
        workstationInstanceId: 'workstation-b',
        heldByUserId: USER_ID,
      });
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        attemptId: ATTEMPT_ID,
        actorUserId: USER_ID,
        action: 'CAPTURE_TRANSFER',
        targetType: 'CAPTURE_LOCK',
        targetId: EVENT_ID,
        oldValues: {
          workstationInstanceId: WORKSTATION,
          heldByUserId: USER_ID,
        },
        newValues: {
          workstationInstanceId: 'workstation-b',
          heldByUserId: USER_ID,
        },
      });
    });

    it('refuses a transfer while the outgoing workstation has an unconfirmed capture', async () => {
      repository.getCaptureLock.mockResolvedValue(lockRow());
      repository.listRunningAttemptIds.mockResolvedValue([ATTEMPT_ID]);
      repository.listMarks.mockResolvedValue([
        markRow({ id: 'mark-1', deviceSequence: 1 }),
        markRow({ id: 'mark-3', deviceSequence: 3 }),
      ]);
      repository.listAttemptReceipts.mockResolvedValue([
        receiptRow({ deviceSequence: 1 }),
      ]);

      const refusal = await service
        .transferCapture(USER_ID, EVENT_ID, transferCaptureDto())
        .catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        code: TimingErrorCode.UNCONFIRMED_MUTATIONS,
        details: {
          workstationInstanceId: WORKSTATION,
          attemptIds: [ATTEMPT_ID],
          missingSequences: [2, 3],
        },
      });
      expect(repository.transferCaptureLock).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('refuses a transfer when no workstation holds capture', async () => {
      const refusal = await service
        .transferCapture(USER_ID, EVENT_ID, transferCaptureDto())
        .catch((error: unknown) => error);

      expect(refusal).toMatchObject({ code: TimingErrorCode.CAPTURE_NOT_HELD });
      expect(repository.transferCaptureLock).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('refuses a transfer from a user who does not hold capture', async () => {
      repository.getCaptureLock.mockResolvedValue(
        lockRow({ heldByUserId: 'user-b' }),
      );

      const refusal = await service
        .transferCapture(USER_ID, EVENT_ID, transferCaptureDto())
        .catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        code: TimingErrorCode.CAPTURE_NOT_HELD,
        details: {
          holderWorkstationInstanceId: WORKSTATION,
          holderUserId: 'user-b',
        },
      });
      expect(repository.transferCaptureLock).not.toHaveBeenCalled();
    });

    it('force-releases the hold for an administrator with the reason and the workstation', async () => {
      repository.getCaptureLock.mockResolvedValue(lockRow());
      repository.releaseCaptureLock.mockResolvedValue(lockRow());
      repository.listRunningAttemptIds.mockResolvedValue([ATTEMPT_ID]);

      const view = await service.forceReleaseCapture(
        USER_ID,
        EVENT_ID,
        forceReleaseCaptureDto(),
      );

      expect(view).toEqual({
        eventId: EVENT_ID,
        workstationInstanceId: null,
        heldByUserId: null,
        heldAt: null,
      });
      expect(roles.assertHasAnyRole).toHaveBeenCalledWith(USER_ID, [
        RoleCode.ADMINISTRATOR,
      ]);
      const [, releaseInput] = callArguments<
        [unknown, ReleaseCaptureLockInput]
      >(repository.releaseCaptureLock);
      expect(releaseInput).toEqual({
        eventId: EVENT_ID,
        lockToken: 'lock-token',
      });
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        attemptId: ATTEMPT_ID,
        actorUserId: USER_ID,
        action: 'CAPTURE_FORCE_RELEASE',
        targetType: 'CAPTURE_LOCK',
        targetId: EVENT_ID,
        reason: 'Устройство потеряно',
        oldValues: {
          workstationInstanceId: WORKSTATION,
          heldByUserId: USER_ID,
        },
        newValues: {
          releasedWorkstationInstanceId: WORKSTATION,
          requestedWorkstationInstanceId: WORKSTATION,
        },
      });
    });

    it('refuses a forced release by a referee', async () => {
      roles.assertHasAnyRole.mockRejectedValue(
        new ForbiddenException('Insufficient role.'),
      );

      await expect(
        service.forceReleaseCapture(
          USER_ID,
          EVENT_ID,
          forceReleaseCaptureDto(),
        ),
      ).rejects.toThrow('Insufficient role.');
      expect(roles.assertHasAnyRole).toHaveBeenCalledWith(USER_ID, [
        RoleCode.ADMINISTRATOR,
      ]);
      expect(repository.releaseCaptureLock).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('refuses a forced release without a reason', async () => {
      await expect(
        service.forceReleaseCapture(
          USER_ID,
          EVENT_ID,
          forceReleaseCaptureDto({ reason: '   ' }),
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.REASON_REQUIRED });
      expect(repository.withTransaction).not.toHaveBeenCalled();
    });

    it("ends a user's hold when the role is removed and audits the release", async () => {
      repository.releaseCaptureLocksForUser.mockResolvedValue([
        lockRow({ heldByUserId: 'user-b' }),
      ]);
      repository.listRunningAttemptIds.mockResolvedValue([ATTEMPT_ID]);

      await service.releaseCaptureForUser('user-b');

      expect(repository.releaseCaptureLocksForUser).toHaveBeenCalledWith(
        TX,
        'user-b',
      );
      const [, auditInput] = callArguments<[unknown, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(auditInput).toMatchObject({
        attemptId: ATTEMPT_ID,
        actorUserId: null,
        action: 'CAPTURE_RELEASE_ROLE_REMOVED',
        targetType: 'CAPTURE_LOCK',
        targetId: EVENT_ID,
        newValues: { trigger: 'ROLE_REMOVED', heldByUserId: 'user-b' },
      });
    });

    it('does nothing when the user holds no capture', async () => {
      await service.releaseCaptureForUser('user-b');

      expect(repository.releaseCaptureLocksForUser).toHaveBeenCalledWith(
        TX,
        'user-b',
      );
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });
  });
});
