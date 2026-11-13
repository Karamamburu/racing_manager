import { TIMING_OPERATE_ROLE_CODES } from '../auth/role-codes';
import type { RolesService } from '../auth/roles.service';
import { TimingErrorCode, TimingDomainError } from './timing.errors';
import type {
  CreateAttemptInput,
  CreateClockEpochInput,
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
  TimingPublishedResultRow,
  TimingStartRow,
} from './timing.repository';
import { TimingRepository } from './timing.repository';
import { TimingService } from './timing.service';

/**
 * Unit tests for the timing surface, the Start press, the clock epoch and the
 * attempt record. Every repository call is a fake: no Prisma, no database, no
 * HTTP. The rules themselves stay in `timing.domain.ts` and are covered there.
 */

const EVENT_ID = 'event-a';
const START_A = 'start-a';
const START_B = 'start-b';
const NOW = new Date('2026-06-01T10:00:00.000Z');
const USER_ID = 'user-a';
const WORKSTATION = 'workstation-a';

type RepositoryFake = ReturnType<typeof createRepositoryFake>;

function createRepositoryFake() {
  return {
    withTransaction: jest.fn(
      (run: (tx: unknown) => Promise<unknown>): Promise<unknown> => run({}),
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
    closeOpenEpochs: jest.fn((): Promise<number> => Promise.resolve(0)),
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
