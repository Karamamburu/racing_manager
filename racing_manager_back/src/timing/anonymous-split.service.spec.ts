import { ForbiddenException } from '@nestjs/common';
import type { RolesService } from '../auth/roles.service';
import { TIMING_OPERATE_ROLE_CODES, RoleCode } from '../auth/role-codes';
import {
  AnonymousSplitService,
  attemptBlockKey,
} from './anonymous-split.service';
import type {
  AssignAnonymousSplitDto,
  CancelAnonymousSplitDto,
} from './timing.dto';
import { TimingErrorCode } from './timing.errors';
import {
  TimingRepository,
  type AssignAnonymousSplitInput,
  type CreateReceiptInput,
  type CreateRejectedReceiptInput,
  type InsertAuditInput,
  type TimingAnonymousSplitRow,
  type TimingAttemptRow,
  type TimingEventSplitRow,
  type TimingCaptureLockRow,
  type TimingClassCompetitionRow,
  type TimingMarkRow,
  type TimingParticipantRow,
  type TimingReceiptRow,
  type TimingStartRow,
  type TimingTx,
  type UpdateMarkInput,
} from './timing.repository';

/**
 * Unit tests for the anonymous split queue, assignment and cancellation
 * (AD-17, AD-18). The repository is a fake and the roles service is a fake: no
 * Prisma, no database, no HTTP. The mark, receipt and audit maps behave like
 * the tables so a refusal can be checked for "nothing changed".
 */

const EVENT_ID = 'event-a';
const OTHER_EVENT_ID = 'event-b';
const ATTEMPT_ID = 'attempt-a';
const SPLIT_ID = 'split-a';
const USER_ID = 'user-a';
const WORKSTATION = 'workstation-a';
const START_ID = 'start-a';
const RACE_ID = 'race-a';
const NOW = new Date('2026-11-13T10:00:00.000Z');
/** The opaque transaction scope the fake hands to a write. */
const TX = { transaction: 'tx' } as unknown as TimingTx;

type RepositoryFake = ReturnType<typeof createRepositoryFake>;

function receiptKey(
  attemptId: string,
  workstationInstanceId: string,
  deviceSequence: number,
): string {
  return `${attemptId}:${workstationInstanceId}:${deviceSequence}`;
}

function createRepositoryFake() {
  const marks = new Map<string, TimingMarkRow>();
  const receipts = new Map<string, TimingReceiptRow>();

  const repository = {
    marks,
    receipts,
    withTransaction: jest.fn(
      (run: (tx: TimingTx) => Promise<unknown>): Promise<unknown> => run(TX),
    ),
    findMark: jest.fn(
      (markId: string): Promise<TimingMarkRow | null> =>
        Promise.resolve(marks.get(markId) ?? null),
    ),
    findAttempt: jest.fn(
      (): Promise<TimingAttemptRow | null> => Promise.resolve(attemptRow()),
    ),
    getCaptureLock: jest.fn(
      (): Promise<TimingCaptureLockRow | null> => Promise.resolve(lockRow()),
    ),
    findReceipt: jest.fn(
      (
        tx: TimingTx,
        attemptId: string,
        workstationInstanceId: string,
        deviceSequence: number,
      ): Promise<TimingReceiptRow | null> =>
        Promise.resolve(
          receipts.get(
            receiptKey(attemptId, workstationInstanceId, deviceSequence),
          ) ?? null,
        ),
    ),
    listMarks: jest.fn(
      (): Promise<TimingMarkRow[]> => Promise.resolve([...marks.values()]),
    ),
    findParticipant: jest.fn(
      (): Promise<TimingParticipantRow | null> => Promise.resolve(null),
    ),
    findParticipantByStartNumber: jest.fn(
      (): Promise<TimingParticipantRow | null> => Promise.resolve(null),
    ),
    existsStartNumber: jest.fn((): Promise<boolean> => Promise.resolve(false)),
    assignAnonymousSplit: jest.fn(
      (
        _tx: TimingTx,
        splitId: string,
        input: AssignAnonymousSplitInput,
      ): Promise<TimingMarkRow> => {
        const mark = marks.get(splitId);
        if (mark === undefined) {
          throw new Error('The fake has no such split.');
        }
        const updated: TimingMarkRow = {
          ...mark,
          enrollmentId: input.enrollmentId,
          registrationId: input.registrationId,
          startNumber: input.startNumber,
          kind: 'PASS',
          status: 'BOUND',
          deviceSequence: input.deviceSequence,
        };
        marks.set(splitId, updated);
        return Promise.resolve(updated);
      },
    ),
    updateMark: jest.fn(
      (
        _tx: TimingTx,
        markId: string,
        input: UpdateMarkInput,
      ): Promise<TimingMarkRow> => {
        const mark = marks.get(markId);
        if (mark === undefined) {
          throw new Error('The fake has no such mark.');
        }
        const updated = applyMarkUpdate(mark, input);
        marks.set(markId, updated);
        return Promise.resolve(updated);
      },
    ),
    cancelAnonymousSplit: jest.fn(
      (_tx: TimingTx, splitId: string): Promise<TimingMarkRow> => {
        const mark = marks.get(splitId);
        if (mark === undefined) {
          throw new Error('The fake has no such split.');
        }
        const updated: TimingMarkRow = { ...mark, status: 'CANCELLED' };
        marks.set(splitId, updated);
        return Promise.resolve(updated);
      },
    ),
    createReceipt: jest.fn(
      (_tx: TimingTx, input: CreateReceiptInput): Promise<TimingReceiptRow> => {
        const receipt: TimingReceiptRow = {
          attemptId: input.attemptId,
          workstationInstanceId: input.workstationInstanceId,
          deviceSequence: input.deviceSequence,
          status: input.status,
          reason: input.reason,
          createdAt: NOW,
        };
        receipts.set(
          receiptKey(
            receipt.attemptId,
            receipt.workstationInstanceId,
            receipt.deviceSequence,
          ),
          receipt,
        );
        return Promise.resolve(receipt);
      },
    ),
    createRejectedReceipt: jest.fn(
      (
        _tx: TimingTx,
        input: CreateRejectedReceiptInput,
      ): Promise<TimingReceiptRow> => {
        const receipt: TimingReceiptRow = {
          attemptId: input.attemptId,
          workstationInstanceId: input.workstationInstanceId,
          deviceSequence: input.deviceSequence,
          status: 'REJECTED',
          reason: input.reason,
          createdAt: NOW,
        };
        receipts.set(
          receiptKey(
            receipt.attemptId,
            receipt.workstationInstanceId,
            receipt.deviceSequence,
          ),
          receipt,
        );
        return Promise.resolve(receipt);
      },
    ),
    insertAudit: jest.fn(
      (_tx: TimingTx, input: InsertAuditInput): Promise<InsertAuditInput> =>
        Promise.resolve(input),
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
    listStarts: jest.fn((): Promise<TimingStartRow[]> => Promise.resolve([])),
    listClassCompetitions: jest.fn(
      (): Promise<TimingClassCompetitionRow[]> => Promise.resolve([]),
    ),
    findUserIdByAuthentikId: jest.fn(
      (): Promise<string | null> => Promise.resolve(USER_ID),
    ),
  };
  return repository;
}

function createRolesFake() {
  return { assertHasAnyRole: jest.fn((): Promise<void> => Promise.resolve()) };
}

function createService(
  repository: RepositoryFake,
  roles: ReturnType<typeof createRolesFake>,
): AnonymousSplitService {
  return new AnonymousSplitService(
    repository as unknown as TimingRepository,
    roles as unknown as RolesService,
  );
}

/** One recorded call of a `jest.fn()`, typed at the assertion site. */
function callArguments<A extends readonly unknown[]>(
  mock: jest.Mock,
  call = 0,
): A {
  return mock.mock.calls[call] as A;
}

/** Applies a mark correction the way `repository.updateMark` would. */
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

function attemptRow(
  overrides: Partial<TimingAttemptRow> = {},
): TimingAttemptRow {
  return {
    id: ATTEMPT_ID,
    eventId: EVENT_ID,
    startId: START_ID,
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

function splitMarkRow(overrides: Partial<TimingMarkRow> = {}): TimingMarkRow {
  return {
    id: SPLIT_ID,
    attemptId: ATTEMPT_ID,
    clockEpochId: 'epoch-a',
    enrollmentId: null,
    registrationId: null,
    startNumber: null,
    kind: 'ANONYMOUS_SPLIT',
    rawCapturedAt: new Date(NOW.getTime() + 30_000),
    rawElapsedMs: 30_000,
    officialAt: new Date(NOW.getTime() + 30_000),
    officialElapsedMs: 30_000,
    lapNumber: null,
    status: 'PENDING',
    workstationInstanceId: WORKSTATION,
    deviceSequence: 4,
    idempotencyKey: 'key-split',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function boundPassRow(
  overrides: Partial<TimingMarkRow> & Pick<TimingMarkRow, 'id'>,
): TimingMarkRow {
  return splitMarkRow({
    kind: 'PASS',
    status: 'BOUND',
    enrollmentId: 'enrollment-a',
    registrationId: 'registration-a',
    startNumber: 10,
    lapNumber: 1,
    ...overrides,
  });
}

function participantRow(
  overrides: Partial<TimingParticipantRow> = {},
): TimingParticipantRow {
  return {
    enrollmentId: 'enrollment-a',
    registrationId: 'registration-a',
    startNumber: 10,
    sectionId: 'CATEGORY_1',
    requiredLaps: 3,
    initialOutcome: null,
    excludedReason: null,
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

function classCompetitionRow(
  overrides: Partial<TimingClassCompetitionRow> &
    Pick<TimingClassCompetitionRow, 'id'>,
): TimingClassCompetitionRow {
  return {
    startId: START_ID,
    formatId: 1,
    gender: 'M',
    sectionId: 'CATEGORY_1',
    sectionKind: null,
    targetKey: 'TARGET',
    targetGroupIds: [],
    targetWholeCategory: false,
    frozenTitle: null,
    frozenSubtitle: null,
    frozenYoungestBound: null,
    frozenMemberBounds: [],
    frozenSectionNumber: null,
    capturedEnrollmentIds: [],
    capturedRegistrationIds: [],
    ...overrides,
  };
}

function anonymousSplitRow(
  overrides: Partial<TimingAnonymousSplitRow> = {},
): TimingAnonymousSplitRow {
  return {
    splitId: SPLIT_ID,
    attemptId: ATTEMPT_ID,
    attemptKind: 'CATEGORY',
    attemptStatus: 'RUNNING',
    eventId: EVENT_ID,
    startId: START_ID,
    formatId: 1,
    gender: 'M',
    classCompetitionId: null,
    stageId: null,
    heatNumber: null,
    officialStartedAt: NOW,
    clockEpochId: 'epoch-a',
    capturedAt: new Date(NOW.getTime() + 30_000),
    officialElapsedMs: 30_000,
    status: 'PENDING',
    ...overrides,
  };
}

function assignDto(
  overrides: Partial<AssignAnonymousSplitDto> = {},
): AssignAnonymousSplitDto {
  return {
    startNumber: 10,
    workstationInstanceId: WORKSTATION,
    deviceSequence: 5,
    ...overrides,
  };
}

function cancelDto(
  overrides: Partial<CancelAnonymousSplitDto> = {},
): CancelAnonymousSplitDto {
  return { reason: 'Ошибочный сплит', ...overrides };
}

describe('AnonymousSplitService', () => {
  let repository: RepositoryFake;
  let roles: ReturnType<typeof createRolesFake>;
  let service: AnonymousSplitService;

  beforeEach(() => {
    repository = createRepositoryFake();
    roles = createRolesFake();
    service = createService(repository, roles);
  });

  function arrangePendingSplit(): void {
    repository.marks.set(SPLIT_ID, splitMarkRow());
    repository.findAttempt.mockResolvedValue(attemptRow());
  }

  describe('listQueue', () => {
    it('maps the pending splits in capture order with a stable block key and label', async () => {
      repository.listAnonymousSplits.mockResolvedValue([
        anonymousSplitRow(),
        anonymousSplitRow({
          splitId: 'split-b',
          attemptId: 'attempt-heat',
          attemptKind: 'HEAT',
          classCompetitionId: RACE_ID,
          stageId: 'stage-1',
          heatNumber: 2,
          capturedAt: new Date(NOW.getTime() + 40_000),
          officialElapsedMs: 40_000,
        }),
      ]);
      repository.listStarts.mockResolvedValue([
        startRow({ id: START_ID, displayName: '  Кубковая гонка  ' }),
      ]);
      repository.listClassCompetitions.mockResolvedValue([
        classCompetitionRow({ id: RACE_ID, frozenTitle: 'Спринт' }),
      ]);

      const queue = await service.listQueue(EVENT_ID);

      expect(queue).toEqual([
        {
          splitId: SPLIT_ID,
          attemptId: ATTEMPT_ID,
          blockKey: `category:${START_ID}:1:M`,
          attemptLabel: 'Кубковая гонка · Формат 1 · M',
          capturedAt: new Date(NOW.getTime() + 30_000).toISOString(),
          officialElapsedMs: 30_000,
          status: 'QUEUED',
          bound: true,
          candidates: [
            {
              attemptId: ATTEMPT_ID,
              blockKey: `category:${START_ID}:1:M`,
              attemptLabel: 'Кубковая гонка · Формат 1 · M',
              officialElapsedMs: 30_000,
            },
          ],
          captureDeviceSequence: null,
        },
        {
          splitId: 'split-b',
          attemptId: 'attempt-heat',
          blockKey: `heat:${RACE_ID}:stage-1:2`,
          attemptLabel: 'Спринт · Этап stage-1 · Заезд 2',
          capturedAt: new Date(NOW.getTime() + 40_000).toISOString(),
          officialElapsedMs: 40_000,
          status: 'QUEUED',
          bound: true,
          candidates: [
            {
              attemptId: 'attempt-heat',
              blockKey: `heat:${RACE_ID}:stage-1:2`,
              attemptLabel: 'Спринт · Этап stage-1 · Заезд 2',
              officialElapsedMs: 40_000,
            },
          ],
          captureDeviceSequence: null,
        },
      ]);
      expect(repository.listAnonymousSplits).toHaveBeenCalledWith(
        EVENT_ID,
        undefined,
      );
      expect(repository.withTransaction).not.toHaveBeenCalled();
      expect(repository.getCaptureLock).not.toHaveBeenCalled();
    });

    it('returns only pending splits and never a resolved entry', async () => {
      repository.listAnonymousSplits.mockResolvedValue([
        anonymousSplitRow({ splitId: 'split-cancelled', status: 'CANCELLED' }),
        anonymousSplitRow({ splitId: 'split-bound', status: 'BOUND' }),
        anonymousSplitRow(),
      ]);

      const queue = await service.listQueue(EVENT_ID);

      expect(queue.map((entry) => entry.splitId)).toEqual([SPLIT_ID]);
    });

    it('addresses the read through an open transaction when one is given', async () => {
      repository.listAnonymousSplits.mockResolvedValue([anonymousSplitRow()]);

      await service.listQueue(EVENT_ID, TX);

      expect(repository.listAnonymousSplits).toHaveBeenCalledWith(EVENT_ID, TX);
      expect(repository.listStarts).toHaveBeenCalledWith(EVENT_ID, TX);
      expect(repository.listClassCompetitions).toHaveBeenCalledWith(
        EVENT_ID,
        TX,
      );
    });
  });

  describe('assign', () => {
    it('assigns by start number and returns the bound pass at the split instant', async () => {
      arrangePendingSplit();
      repository.findParticipantByStartNumber.mockResolvedValue(
        participantRow(),
      );

      const pass = await service.assign(
        USER_ID,
        EVENT_ID,
        SPLIT_ID,
        assignDto(),
        'idempotency-1',
      );

      expect(pass).toEqual({
        passId: SPLIT_ID,
        attemptId: ATTEMPT_ID,
        enrollmentId: 'enrollment-a',
        lapNumber: 1,
        rawCapturedAt: new Date(NOW.getTime() + 30_000).toISOString(),
        officialAt: new Date(NOW.getTime() + 30_000).toISOString(),
        officialElapsedMs: 30_000,
        status: 'BOUND',
      });
      expect(repository.findParticipantByStartNumber).toHaveBeenCalledWith(
        ATTEMPT_ID,
        10,
        TX,
      );
      expect(repository.findParticipant).not.toHaveBeenCalled();
      expect(repository.assignAnonymousSplit).toHaveBeenCalledWith(
        TX,
        SPLIT_ID,
        {
          enrollmentId: 'enrollment-a',
          registrationId: 'registration-a',
          startNumber: 10,
          deviceSequence: 5,
        },
      );
      expect(repository.createReceipt).toHaveBeenCalledWith(TX, {
        attemptId: ATTEMPT_ID,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 5,
        status: 'APPLIED',
        reason: null,
      });
      expect(repository.insertAudit).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({
          attemptId: ATTEMPT_ID,
          actorUserId: USER_ID,
          action: 'ANONYMOUS_SPLIT_ASSIGN',
          targetType: 'PASS',
          targetId: SPLIT_ID,
          reason: null,
        }),
      );
      const [, audit] = callArguments<[TimingTx, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(audit.oldValues).toMatchObject({
        kind: 'ANONYMOUS_SPLIT',
        status: 'PENDING',
        officialAt: new Date(NOW.getTime() + 30_000).toISOString(),
        clockEpochId: 'epoch-a',
      });
      expect(audit.newValues).toMatchObject({
        kind: 'PASS',
        status: 'BOUND',
        enrollmentId: 'enrollment-a',
        startNumber: 10,
        lapNumber: 1,
        officialElapsedMs: 30_000,
        clockEpochId: 'epoch-a',
        workstationInstanceId: WORKSTATION,
        deviceSequence: 5,
        idempotencyKey: 'idempotency-1',
      });
      expect(repository.createRejectedReceipt).not.toHaveBeenCalled();
      expect(repository.withTransaction).toHaveBeenCalledTimes(1);
    });

    it('assigns by enrollment inside the attempt', async () => {
      arrangePendingSplit();
      repository.findParticipant.mockResolvedValue(participantRow());

      const pass = await service.assign(
        USER_ID,
        EVENT_ID,
        SPLIT_ID,
        assignDto({
          startNumber: undefined,
          enrollmentId: 'enrollment-a',
        }),
      );

      expect(pass.enrollmentId).toBe('enrollment-a');
      expect(repository.findParticipant).toHaveBeenCalledWith(
        ATTEMPT_ID,
        'enrollment-a',
        TX,
      );
      expect(repository.findParticipantByStartNumber).not.toHaveBeenCalled();
    });

    it('reindexes the participant laps by official instant', async () => {
      arrangePendingSplit();
      repository.marks.set(
        'pass-before',
        boundPassRow({
          id: 'pass-before',
          officialAt: new Date(NOW.getTime() + 20_000),
          officialElapsedMs: 20_000,
          lapNumber: 1,
        }),
      );
      repository.marks.set(
        'pass-after',
        boundPassRow({
          id: 'pass-after',
          officialAt: new Date(NOW.getTime() + 40_000),
          officialElapsedMs: 40_000,
          lapNumber: 2,
          deviceSequence: 3,
        }),
      );
      repository.findParticipantByStartNumber.mockResolvedValue(
        participantRow(),
      );

      const pass = await service.assign(
        USER_ID,
        EVENT_ID,
        SPLIT_ID,
        assignDto(),
      );

      expect(pass.lapNumber).toBe(2);
      expect(repository.updateMark).toHaveBeenCalledWith(TX, SPLIT_ID, {
        lapNumber: 2,
      });
      expect(repository.updateMark).toHaveBeenCalledWith(TX, 'pass-after', {
        lapNumber: 3,
      });
      expect(repository.updateMark).not.toHaveBeenCalledWith(
        TX,
        'pass-before',
        expect.anything(),
      );
      expect(repository.marks.get('pass-before')?.lapNumber).toBe(1);
    });

    it('refuses an unknown number with NUMBER_UNKNOWN and a rejected receipt', async () => {
      arrangePendingSplit();
      repository.findParticipantByStartNumber.mockResolvedValue(null);
      repository.existsStartNumber.mockResolvedValue(false);

      await expect(
        service.assign(USER_ID, EVENT_ID, SPLIT_ID, assignDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.NUMBER_UNKNOWN });

      expect(repository.assignAnonymousSplit).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
      expect(repository.marks.get(SPLIT_ID)?.status).toBe('PENDING');
      expect(repository.createRejectedReceipt).toHaveBeenCalledWith(TX, {
        attemptId: ATTEMPT_ID,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 5,
        reason: TimingErrorCode.NUMBER_UNKNOWN,
      });
      expect(repository.withTransaction).toHaveBeenCalledTimes(2);
    });

    it('refuses the number of another attempt with NOT_FOUND', async () => {
      arrangePendingSplit();
      repository.findParticipantByStartNumber.mockResolvedValue(null);
      repository.existsStartNumber.mockResolvedValue(true);

      await expect(
        service.assign(USER_ID, EVENT_ID, SPLIT_ID, assignDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.NOT_FOUND });

      expect(repository.marks.get(SPLIT_ID)?.status).toBe('PENDING');
      expect(repository.createRejectedReceipt).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({ reason: TimingErrorCode.NOT_FOUND }),
      );
    });

    it('refuses an excluded target and leaves the split pending', async () => {
      arrangePendingSplit();
      repository.findParticipantByStartNumber.mockResolvedValue(
        participantRow({ excludedReason: 'EXISTING_OUTCOME' }),
      );

      await expect(
        service.assign(USER_ID, EVENT_ID, SPLIT_ID, assignDto()),
      ).rejects.toMatchObject({
        code: TimingErrorCode.EXCLUDED_PARTICIPANT,
      });

      expect(repository.assignAnonymousSplit).not.toHaveBeenCalled();
      expect(repository.marks.get(SPLIT_ID)?.status).toBe('PENDING');
      expect(repository.createRejectedReceipt).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({
          reason: TimingErrorCode.EXCLUDED_PARTICIPANT,
        }),
      );
    });

    it('refuses a target already holding N passes', async () => {
      arrangePendingSplit();
      for (const id of ['pass-1', 'pass-2', 'pass-3']) {
        repository.marks.set(
          id,
          boundPassRow({ id, officialAt: new Date(NOW.getTime() + 10_000) }),
        );
      }
      repository.findParticipantByStartNumber.mockResolvedValue(
        participantRow({ requiredLaps: 3 }),
      );

      await expect(
        service.assign(USER_ID, EVENT_ID, SPLIT_ID, assignDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.ALREADY_N_PASSES });

      expect(repository.assignAnonymousSplit).not.toHaveBeenCalled();
      expect(repository.marks.get(SPLIT_ID)?.status).toBe('PENDING');
      expect(repository.createRejectedReceipt).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({ reason: TimingErrorCode.ALREADY_N_PASSES }),
      );
    });

    it('refuses a closed attempt before any write or receipt', async () => {
      arrangePendingSplit();
      repository.findAttempt.mockResolvedValue(
        attemptRow({ status: 'COMPLETED' }),
      );

      await expect(
        service.assign(USER_ID, EVENT_ID, SPLIT_ID, assignDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.ATTEMPT_CLOSED });

      expect(repository.withTransaction).not.toHaveBeenCalled();
      expect(repository.createRejectedReceipt).not.toHaveBeenCalled();
      expect(repository.assignAnonymousSplit).not.toHaveBeenCalled();
    });

    it('refuses a used device sequence without touching the split', async () => {
      arrangePendingSplit();
      repository.findParticipantByStartNumber.mockResolvedValue(
        participantRow(),
      );
      repository.receipts.set(receiptKey(ATTEMPT_ID, WORKSTATION, 5), {
        attemptId: ATTEMPT_ID,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 5,
        status: 'APPLIED',
        reason: null,
        createdAt: NOW,
      });

      await expect(
        service.assign(USER_ID, EVENT_ID, SPLIT_ID, assignDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.CONFLICT });

      expect(repository.assignAnonymousSplit).not.toHaveBeenCalled();
      expect(repository.marks.get(SPLIT_ID)?.status).toBe('PENDING');
      expect(repository.createRejectedReceipt).not.toHaveBeenCalled();
    });

    it('refuses an assignment when the workstation lost capture', async () => {
      arrangePendingSplit();
      repository.getCaptureLock.mockResolvedValue(
        lockRow({ workstationInstanceId: 'workstation-b' }),
      );

      await expect(
        service.assign(USER_ID, EVENT_ID, SPLIT_ID, assignDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.CAPTURE_NOT_HELD });

      expect(repository.withTransaction).not.toHaveBeenCalled();
      expect(repository.createRejectedReceipt).not.toHaveBeenCalled();
      expect(repository.marks.get(SPLIT_ID)?.status).toBe('PENDING');
    });

    it('refuses a split resolved by another actor and closes its sequence', async () => {
      arrangePendingSplit();
      repository.marks.set(SPLIT_ID, splitMarkRow({ status: 'CANCELLED' }));

      await expect(
        service.assign(USER_ID, EVENT_ID, SPLIT_ID, assignDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.INVALID_STATE });

      expect(repository.assignAnonymousSplit).not.toHaveBeenCalled();
      expect(repository.createRejectedReceipt).toHaveBeenCalledWith(TX, {
        attemptId: ATTEMPT_ID,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 5,
        reason: TimingErrorCode.INVALID_STATE,
      });
    });

    it('refuses a split of another event', async () => {
      arrangePendingSplit();

      await expect(
        service.assign(USER_ID, OTHER_EVENT_ID, SPLIT_ID, assignDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.NOT_FOUND });

      expect(repository.withTransaction).not.toHaveBeenCalled();
      expect(repository.createRejectedReceipt).not.toHaveBeenCalled();
    });

    it('asserts the timing role before it reads the split', async () => {
      roles.assertHasAnyRole.mockRejectedValueOnce(
        new ForbiddenException('Insufficient role.'),
      );
      arrangePendingSplit();

      await expect(
        service.assign(USER_ID, EVENT_ID, SPLIT_ID, assignDto()),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(roles.assertHasAnyRole).toHaveBeenCalledWith(
        USER_ID,
        TIMING_OPERATE_ROLE_CODES,
      );
      expect(repository.findMark).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('retires an unassigned split with actor, moment and reason', async () => {
      arrangePendingSplit();
      repository.listStarts.mockResolvedValue([
        startRow({ id: START_ID, displayName: 'Кубковая гонка' }),
      ]);

      const entry = await service.cancel(
        USER_ID,
        EVENT_ID,
        SPLIT_ID,
        cancelDto({ reason: '  Ошибочный сплит  ' }),
      );

      expect(entry).toEqual({
        splitId: SPLIT_ID,
        attemptId: ATTEMPT_ID,
        blockKey: `category:${START_ID}:1:M`,
        attemptLabel: 'Кубковая гонка · Формат 1 · M',
        capturedAt: new Date(NOW.getTime() + 30_000).toISOString(),
        officialElapsedMs: 30_000,
        status: 'QUEUED',
        bound: true,
        candidates: [
          {
            attemptId: ATTEMPT_ID,
            blockKey: `category:${START_ID}:1:M`,
            attemptLabel: 'Кубковая гонка · Формат 1 · M',
            officialElapsedMs: 30_000,
          },
        ],
        captureDeviceSequence: 4,
      });
      expect(roles.assertHasAnyRole).toHaveBeenCalledWith(
        USER_ID,
        TIMING_OPERATE_ROLE_CODES,
      );
      expect(repository.cancelAnonymousSplit).toHaveBeenCalledWith(
        TX,
        SPLIT_ID,
      );
      expect(repository.insertAudit).toHaveBeenCalledWith(
        TX,
        expect.objectContaining({
          attemptId: ATTEMPT_ID,
          actorUserId: USER_ID,
          action: 'ANONYMOUS_SPLIT_CANCEL',
          targetType: 'ANONYMOUS_SPLIT',
          targetId: SPLIT_ID,
          reason: 'Ошибочный сплит',
        }),
      );
      const [, audit] = callArguments<[TimingTx, InsertAuditInput]>(
        repository.insertAudit,
      );
      expect(audit.oldValues).toMatchObject({
        kind: 'ANONYMOUS_SPLIT',
        status: 'PENDING',
        officialElapsedMs: 30_000,
      });
      expect(audit.newValues).toMatchObject({ status: 'CANCELLED' });
      expect(repository.marks.get(SPLIT_ID)?.status).toBe('CANCELLED');
      expect(repository.withTransaction).toHaveBeenCalledTimes(1);
    });

    it('needs no capture lock, clock epoch or receipt', async () => {
      arrangePendingSplit();
      repository.getCaptureLock.mockResolvedValue(null);

      await service.cancel(USER_ID, EVENT_ID, SPLIT_ID, cancelDto());

      expect(repository.getCaptureLock).not.toHaveBeenCalled();
      expect(repository.createReceipt).not.toHaveBeenCalled();
      expect(repository.createRejectedReceipt).not.toHaveBeenCalled();
      expect(repository.marks.get(SPLIT_ID)?.status).toBe('CANCELLED');
    });

    it('lets an administrator use the same capability as a referee', async () => {
      arrangePendingSplit();

      await service.cancel(USER_ID, EVENT_ID, SPLIT_ID, cancelDto());

      const [authentikId, codes] = roles.assertHasAnyRole.mock
        .calls[0] as unknown as [string, RoleCode[]];
      expect(authentikId).toBe(USER_ID);
      expect(codes).toContain(RoleCode.REFEREE);
      expect(codes).toContain(RoleCode.ADMINISTRATOR);
    });

    it('refuses a blank reason before it reads the split', async () => {
      arrangePendingSplit();

      await expect(
        service.cancel(
          USER_ID,
          EVENT_ID,
          SPLIT_ID,
          cancelDto({ reason: '   ' }),
        ),
      ).rejects.toMatchObject({ code: TimingErrorCode.REASON_REQUIRED });

      expect(repository.withTransaction).not.toHaveBeenCalled();
      expect(repository.cancelAnonymousSplit).not.toHaveBeenCalled();
      expect(repository.marks.get(SPLIT_ID)?.status).toBe('PENDING');
    });

    it('refuses a split that is no longer pending', async () => {
      arrangePendingSplit();
      repository.marks.set(SPLIT_ID, splitMarkRow({ status: 'BOUND' }));

      await expect(
        service.cancel(USER_ID, EVENT_ID, SPLIT_ID, cancelDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.INVALID_STATE });

      expect(repository.cancelAnonymousSplit).not.toHaveBeenCalled();
      expect(repository.insertAudit).not.toHaveBeenCalled();
    });

    it('refuses an actor without a timing role and changes nothing', async () => {
      roles.assertHasAnyRole.mockRejectedValueOnce(
        new ForbiddenException('Insufficient role.'),
      );
      arrangePendingSplit();

      await expect(
        service.cancel(USER_ID, EVENT_ID, SPLIT_ID, cancelDto()),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(repository.withTransaction).not.toHaveBeenCalled();
      expect(repository.marks.get(SPLIT_ID)?.status).toBe('PENDING');
    });

    it('refuses a split of another event', async () => {
      arrangePendingSplit();

      await expect(
        service.cancel(USER_ID, OTHER_EVENT_ID, SPLIT_ID, cancelDto()),
      ).rejects.toMatchObject({ code: TimingErrorCode.NOT_FOUND });

      expect(repository.cancelAnonymousSplit).not.toHaveBeenCalled();
    });
  });

  describe('attemptBlockKey', () => {
    it('keeps a category block and a heat block apart', () => {
      expect(attemptBlockKey(anonymousSplitRow())).toBe(
        `category:${START_ID}:1:M`,
      );
      expect(
        attemptBlockKey(
          anonymousSplitRow({
            attemptKind: 'HEAT',
            classCompetitionId: RACE_ID,
            stageId: 'stage-1',
            heatNumber: 2,
          }),
        ),
      ).toBe(`heat:${RACE_ID}:stage-1:2`);
    });
  });
});

describe('event-scoped number-only assignment', () => {
  const split: TimingEventSplitRow = {
    splitId: SPLIT_ID,
    eventId: EVENT_ID,
    state: 'QUEUED',
    captureInstant: NOW,
    anchorClockEpochId: 'epoch-a',
    anchorAttemptId: ATTEMPT_ID,
    anchorElapsedAnchorMs: 0,
    clientCapturedAt: NOW,
    clientElapsedMs: 0,
    capturedByUserId: USER_ID,
    captureWorkstationInstanceId: WORKSTATION,
    captureDeviceSequence: 4,
    legacyMarkId: null,
    boundAttemptId: null,
    assignedAttemptId: null,
    assignedAt: null,
    assignedByUserId: null,
    assignedWorkstationInstanceId: null,
    assignmentDeviceSequence: null,
    offeredAttemptIds: null,
    chosenByReferee: false,
    resolvedAt: null,
    resolvedByUserId: null,
    resolvedWorkstationInstanceId: null,
    resolutionReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    candidates: [
      {
        attemptId: ATTEMPT_ID,
        attemptKind: 'CATEGORY',
        attemptStatus: 'RUNNING',
        eventId: EVENT_ID,
        startId: START_ID,
        formatId: 1,
        gender: 'M',
        classCompetitionId: null,
        stageId: null,
        heatNumber: null,
        officialStartedAt: new Date(NOW.getTime() - 60_000),
      },
    ],
  };
  const participant = participantRow({
    enrollmentId: 'enrollment-a',
    registrationId: 'registration-a',
    startNumber: 31,
    requiredLaps: 2,
    excludedReason: null,
  });
  const createdMark: TimingMarkRow = {
    id: 'pass-new',
    attemptId: ATTEMPT_ID,
    clockEpochId: null,
    enrollmentId: 'enrollment-a',
    registrationId: 'registration-a',
    startNumber: 31,
    kind: 'PASS',
    rawCapturedAt: NOW,
    rawElapsedMs: 60_000,
    officialAt: NOW,
    officialElapsedMs: 60_000,
    lapNumber: null,
    status: 'BOUND',
    workstationInstanceId: WORKSTATION,
    deviceSequence: 9,
    idempotencyKey: 'key-assign',
    createdAt: NOW,
    updatedAt: NOW,
  };

  function repositoryForAssignment(): {
    repository: TimingRepository;
    updateMark: jest.Mock;
    createMark: jest.Mock;
    assignEventSplit: jest.Mock;
    createReceipt: jest.Mock;
  } {
    const updateMark = jest.fn(
      (_tx: TimingTx, _id: string, input: UpdateMarkInput) =>
        Promise.resolve({ ...createdMark, ...input }),
    );
    const createMark = jest.fn(() => Promise.resolve(createdMark));
    const assignEventSplit = jest.fn(() =>
      Promise.resolve({ ...split, state: 'ASSIGNED' as const }),
    );
    const createReceipt = jest.fn(() => Promise.resolve({}));
    const repository = {
      findEventSplit: jest.fn(() => Promise.resolve(split)),
      getCaptureLock: jest.fn(() =>
        Promise.resolve(lockRow({ workstationInstanceId: WORKSTATION })),
      ),
      findRegistrationsByStartNumber: jest.fn(() =>
        Promise.resolve([
          { registrationId: 'registration-a', firstName: 'Иван', lastName: 'Петров' },
        ]),
      ),
      listEnrollmentsForRegistration: jest.fn(() =>
        Promise.resolve([
          { enrollmentId: 'enrollment-a', startId: START_ID, formatId: 1 },
        ]),
      ),
      findParticipant: jest.fn(() => Promise.resolve(participant)),
      lockParticipant: jest.fn(() => Promise.resolve()),
      listMarks: jest.fn(() => Promise.resolve([])),
      withTransaction: jest.fn((run: (tx: TimingTx) => Promise<unknown>) =>
        run(TX),
      ),
      findUserIdByAuthentikId: jest.fn(() => Promise.resolve(USER_ID)),
      createMark,
      updateMark,
      assignEventSplit,
      createReceipt,
      createEventReceipt: jest.fn(() => Promise.resolve({})),
      insertAudit: jest.fn(() => Promise.resolve({})),
      findEventReceipt: jest.fn(() => Promise.resolve(null)),
    } as unknown as TimingRepository;
    return { repository, updateMark, createMark, assignEventSplit, createReceipt };
  }

  it('assigns exactly one qualifying candidate at the captured instant', async () => {
    const { repository, createMark, assignEventSplit, createReceipt } =
      repositoryForAssignment();
    const service = new AnonymousSplitService(repository, {
      assertHasAnyRole: jest.fn(),
    } as unknown as RolesService);

    const result = await service.assign(
      USER_ID,
      EVENT_ID,
      SPLIT_ID,
      {
        startNumber: 31,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 9,
      } as AssignAnonymousSplitDto,
      'key-assign',
    );

    expect(result).toMatchObject({
      passId: 'pass-new',
      attemptId: ATTEMPT_ID,
      enrollmentId: 'enrollment-a',
      lapNumber: 1,
      status: 'BOUND',
    });
    expect(createMark).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        attemptId: ATTEMPT_ID,
        clockEpochId: null,
        sourceSplitId: SPLIT_ID,
        officialAt: NOW,
        officialElapsedMs: 60_000,
        rawElapsedMs: 60_000,
      }),
    );
    expect(assignEventSplit).toHaveBeenCalledWith(
      TX,
      SPLIT_ID,
      expect.objectContaining({
        assignedAttemptId: ATTEMPT_ID,
        offeredAttemptIds: [ATTEMPT_ID],
        chosenByReferee: false,
      }),
    );
    expect(createReceipt).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        attemptId: ATTEMPT_ID,
        origin: 'SPLIT_ASSIGN',
        status: 'APPLIED',
      }),
    );
  });
});
