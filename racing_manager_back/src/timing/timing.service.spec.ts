import { TIMING_OPERATE_ROLE_CODES } from '../auth/role-codes';
import type { RolesService } from '../auth/roles.service';
import { TIMING_MAX_TOTAL_MS } from './timing.domain';
import type { CaptureTimingPassDto } from './timing.dto';
import { TimingErrorCode, TimingDomainError } from './timing.errors';
import type {
  CreateAttemptInput,
  CreateClockEpochInput,
  CreateMarkInput,
  CreateReceiptInput,
  InsertAuditInput,
  TimingAgeCategoryRow,
  TimingAgeSectionRow,
  TimingAttemptRow,
  TimingAuditRow,
  TimingCaptureLockRow,
  TimingClassCompetitionRow,
  TimingClockEpochRow,
  TimingEnrollmentRow,
  TimingEventRow,
  TimingFormatRow,
  TimingMarkRow,
  TimingParticipantRosterRow,
  TimingParticipantRow,
  TimingPublishedResultRow,
  TimingReceiptRow,
  TimingRoutingCandidateRow,
  TimingStartRow,
  UpdateMarkInput,
} from './timing.repository';
import { TimingRepository } from './timing.repository';
import { TimingService } from './timing.service';

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
    findLatestAttemptNumber: jest.fn((): Promise<number> => Promise.resolve(0)),
    createAttempt: jest.fn(),
    listParticipantRoster: jest.fn(
      (): Promise<TimingParticipantRosterRow[]> => Promise.resolve([]),
    ),
    findParticipant: jest.fn<
      Promise<TimingParticipantRow | null>,
      [string, string]
    >(() => Promise.resolve(null)),
    findRoutingCandidates: jest.fn(
      (): Promise<TimingRoutingCandidateRow[]> => Promise.resolve([]),
    ),
    existsStartNumber: jest.fn((): Promise<boolean> => Promise.resolve(false)),
    listMarks: jest.fn((): Promise<TimingMarkRow[]> => Promise.resolve([])),
    listPendingFinishes: jest.fn(
      (): Promise<TimingMarkRow[]> => Promise.resolve([]),
    ),
    listPublishedResults: jest.fn(
      (): Promise<TimingPublishedResultRow[]> => Promise.resolve([]),
    ),
    listAudit: jest.fn((): Promise<TimingAuditRow[]> => Promise.resolve([])),
    getCaptureLock: jest.fn(
      (): Promise<TimingCaptureLockRow | null> => Promise.resolve(null),
    ),
    createClockEpoch: jest.fn(),
    findOpenEpoch: jest.fn(
      (): Promise<TimingClockEpochRow | null> => Promise.resolve(null),
    ),
    closeOpenEpochs: jest.fn((): Promise<number> => Promise.resolve(0)),
    createMark: jest.fn(),
    updateMark: jest.fn(),
    findReceipt: jest.fn(
      (): Promise<TimingReceiptRow | null> => Promise.resolve(null),
    ),
    createReceipt: jest.fn(),
    insertAudit: jest.fn(),
  };
}

function createRolesFake() {
  return { assertHasAnyRole: jest.fn((): Promise<void> => Promise.resolve()) };
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

function lockRow(): TimingCaptureLockRow {
  return {
    eventId: EVENT_ID,
    workstationInstanceId: WORKSTATION,
    lockToken: 'lock-token',
    heldByUserId: USER_ID,
    acquiredAt: NOW,
    lastSeenAt: NOW,
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

function receiptRow(): TimingReceiptRow {
  return {
    attemptId: ATTEMPT_ID,
    workstationInstanceId: WORKSTATION,
    deviceSequence: 1,
    status: 'APPLIED',
    reason: null,
    createdAt: NOW,
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

const TIMING_OPERATE_ROLES = TIMING_OPERATE_ROLE_CODES;

describe('TimingService', () => {
  let repository: RepositoryFake;
  let roles: ReturnType<typeof createRolesFake>;
  let service: TimingService;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    repository = createRepositoryFake();
    roles = createRolesFake();
    service = new TimingService(
      repository as unknown as TimingRepository,
      roles as unknown as RolesService,
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

      const pass = await service.capturePass(
        USER_ID,
        EVENT_ID,
        capturePassDto({ deviceSequence: 3 }),
        'key-3',
      );

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
      expect(repository.findReceipt).not.toHaveBeenCalled();
    });

    it('refuses a capture without an open epoch on this workstation', async () => {
      arrangeCapture({ epoch: null });

      await expect(
        service.capturePass(USER_ID, EVENT_ID, capturePassDto(), 'key-1'),
      ).rejects.toMatchObject({ code: TimingErrorCode.CAPTURE_NOT_HELD });
      expect(repository.createMark).not.toHaveBeenCalled();
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
});
