import { randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import type { Server } from 'http';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Response as SupertestResponse } from 'supertest';
import { RoleCode } from '../auth/role-codes';
import { RolesGuard } from '../auth/roles.guard';
import { RolesService } from '../auth/roles.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  ClassCompetitionsService,
  type ClassCompetitionView,
} from '../class-competitions/class-competitions.service';
import { AnonymousSplitService } from './anonymous-split.service';
import { TimingController } from './timing.controller';
import { TimingErrorCode } from './timing.errors';
import {
  TimingExceptionFilter,
  type TimingErrorBody,
} from './timing.exception.filter';
import {
  TimingRepository,
  type AssignAnonymousSplitInput,
  type CreateAnonymousSplitInput,
  type CreateAttemptInput,
  type CreateClockEpochInput,
  type CreateHeatTimeInput,
  type CreateMarkInput,
  type CreateReceiptInput,
  type CreateRejectedReceiptInput,
  type InsertAuditInput,
  type PublishResultInput,
  type ReleaseCaptureLockInput,
  type TimingAnonymousSplitRow,
  type TimingAttemptRow,
  type TimingAuditRow,
  type TimingCaptureLockRow,
  type TimingClassCompetitionRow,
  type TimingClockEpochRow,
  type TimingEnrollmentRow,
  type TimingEventRow,
  type TimingEventSplitRow,
  type TimingFormatRow,
  type TimingHeatRosterEnrollmentRow,
  type TimingHeatTimeRow,
  type TimingMarkRow,
  type TimingParticipantRosterRow,
  type TimingParticipantRow,
  type TimingPublishedResultRow,
  type TimingReceiptRow,
  type TimingResultRow,
  type TimingStartRow,
  type TimingTx,
  type UpdateAttemptStatusInput,
  type UpdateMarkInput,
} from './timing.repository';
import { TimingService } from './timing.service';
import type {
  StartTimingAttemptResult,
  TimingAnonymousSplitView,
  TimingAttemptRecordView,
  TimingPassView,
  TimingSurfaceView,
} from './timing.views';

/**
 * API-level integration suite of MANUAL-TIMING-2 (T14): the real controller,
 * the real `TimingService` / `AnonymousSplitService` wiring, the real guards and
 * exception filter, exercised through supertest.
 *
 * Only the infrastructure is faked: the repository is an in-memory store, the
 * class-competitions façade returns a fixed race view and the roles service
 * reads a fixed user table. No Prisma client, no database and no network are
 * opened, so the suite is deterministic and runs in `npm test`.
 */

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const RACE_ID = '22222222-2222-4222-8222-222222222222';
const START_ID = 'start-1';
const FORMAT_ID = 1;
const LAP_COUNT = 3;
const STAGE_PENDING = 'stage-pending';
const STAGE_SEEDED = 'stage-seeded';
const STAGE_DONE = 'stage-done';
const ENROLLMENT_1 = '33333333-3333-4333-8333-333333333333';
const ENROLLMENT_2 = '44444444-4444-4444-8444-444444444444';
const ENROLLMENT_3 = '55555555-5555-4555-8555-555555555555';
const REGISTRATION_1 = 'registration-1';
const REGISTRATION_2 = 'registration-2';
const REGISTRATION_3 = 'registration-3';
const START_NUMBER_1 = 11;
const START_NUMBER_2 = 12;
const START_NUMBER_3 = 13;
const WORKSTATION = 'workstation-1';
const OTHER_WORKSTATION = 'workstation-2';
const REFEREE = 'referee-1';
const ADMIN = 'admin-1';
const ORGANIZER = 'organizer-1';
const REFEREE_USER_ID = 'user-referee';
const ADMIN_USER_ID = 'user-admin';
const ORGANIZER_USER_ID = 'user-organizer';
const BASE_PATH = `/events/${EVENT_ID}/timing`;
const CLIENT_STARTED_AT = '2026-11-13T10:00:00.000Z';
const CAPTURE_BASE_MS = Date.UTC(2026, 10, 13, 10, 0, 0);
const TRANSACTION = {} as TimingTx;

const ROLES_BY_USER: Readonly<Record<string, readonly RoleCode[]>> = {
  [REFEREE]: [RoleCode.REFEREE],
  [ADMIN]: [RoleCode.ADMINISTRATOR],
  [ORGANIZER]: [RoleCode.ORGANIZER],
};

/** `attempt: <race>: <stage>: <heat>` as the service derives it (AD-20). */
function heatBlockKey(stageId: string, heatNumber: number): string {
  return `heat:${RACE_ID}:${stageId}:${heatNumber}`;
}

function heatRequest(heatNumber: number, stageId = STAGE_SEEDED) {
  return {
    classCompetitionId: RACE_ID,
    stageId,
    heatNumber,
    workstationInstanceId: WORKSTATION,
    clientStartedAt: CLIENT_STARTED_AT,
  };
}

function isoAt(elapsedMs: number): string {
  return new Date(CAPTURE_BASE_MS + elapsedMs).toISOString();
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function enrollmentRow(
  overrides: Partial<TimingEnrollmentRow> &
    Pick<
      TimingEnrollmentRow,
      'enrollmentId' | 'registrationId' | 'startNumber'
    >,
): TimingEnrollmentRow {
  return {
    eventId: EVENT_ID,
    startId: START_ID,
    formatId: FORMAT_ID,
    enrollmentStatus: 'REGISTERED',
    userId: null,
    firstName: 'Иван',
    lastName: 'Петров',
    gender: 'M',
    birthYear: 2000,
    registrationStatus: 'CONFIRMED',
    note: null,
    registeredAt: new Date('2026-05-01T10:00:00.000Z'),
    result: null,
    ...overrides,
  };
}

function startRow(): TimingStartRow {
  return {
    id: START_ID,
    purposeType: 'CUP_RACE',
    lapCount: LAP_COUNT,
    lapLengthMeters: 2000,
    displayName: 'Кубок',
    sortOrder: 1,
    formatIds: [FORMAT_ID],
  };
}

/**
 * The stored race row the label of a queue entry reads (AD-17). Only the two
 * captured registrations belong to the race, so the third enrollment of the
 * category stays timeable as a category block (FR-34).
 */
function classCompetitionRow(): TimingClassCompetitionRow {
  return {
    id: RACE_ID,
    startId: START_ID,
    formatId: FORMAT_ID,
    gender: 'M',
    sectionId: 'CATEGORY',
    sectionKind: 'CATEGORY',
    targetKey: 'GROUPS:none',
    targetGroupIds: [],
    targetWholeCategory: false,
    frozenTitle: 'Кубок',
    frozenSubtitle: null,
    frozenYoungestBound: null,
    frozenMemberBounds: [],
    frozenSectionNumber: null,
    capturedEnrollmentIds: [ENROLLMENT_1, ENROLLMENT_2],
    capturedRegistrationIds: [REGISTRATION_1, REGISTRATION_2],
  };
}

function heatView(
  heatNumber: number,
): ClassCompetitionView['stages'][number]['heats'][number] {
  return {
    heatNumber,
    slots: [
      {
        position: 1,
        registrationId: REGISTRATION_1,
        firstName: 'Иван',
        lastName: 'Петров',
        startNumber: START_NUMBER_1,
        registrationStatus: 'CONFIRMED',
        timeMilliseconds: null,
        resultStatus: null,
        laps: [],
      },
      {
        position: 2,
        registrationId: REGISTRATION_2,
        firstName: 'Пётр',
        lastName: 'Сидоров',
        startNumber: START_NUMBER_2,
        registrationStatus: 'CONFIRMED',
        timeMilliseconds: null,
        resultStatus: null,
        laps: [],
      },
    ],
  };
}

/**
 * One multi-stage race as the CMS façade reports it: a pending stage without
 * heats, a seeded stage with three heats and a completed stage (FR-17, FR-50).
 */
function raceView(): ClassCompetitionView {
  return {
    id: RACE_ID,
    eventId: EVENT_ID,
    startId: START_ID,
    formatId: FORMAT_ID,
    gender: 'M',
    sectionId: 'CATEGORY',
    sectionKind: 'CATEGORY',
    title: 'Кубок',
    subtitle: null,
    targetGroupIds: [],
    targetWholeCategory: false,
    capturedEnrollmentIds: [ENROLLMENT_1, ENROLLMENT_2],
    youngestBound: null,
    status: 'IN_PROGRESS',
    stages: [
      {
        stageId: STAGE_PENDING,
        kind: 'QUALIFICATION',
        label: 'Квалификация',
        status: 'PENDING',
        sourceStageId: null,
        qualifierStatus: null,
        heats: [],
        entries: [],
      },
      {
        stageId: STAGE_SEEDED,
        kind: 'SEMI_FINAL',
        label: 'Круг 1',
        status: 'SEEDED',
        sourceStageId: null,
        qualifierStatus: null,
        heats: [heatView(1), heatView(2), heatView(3)],
        entries: [],
      },
      {
        stageId: STAGE_DONE,
        kind: 'FINAL',
        label: 'Финал',
        status: 'COMPLETED',
        sourceStageId: null,
        qualifierStatus: null,
        heats: [heatView(1)],
        entries: [],
      },
    ],
    classification: [],
  };
}

/* -------------------------------------------------------------------------- */
/* In-memory repository                                                        */
/* -------------------------------------------------------------------------- */

type StoredAudit = { attemptId: string; row: TimingAuditRow };

type RepositorySnapshot = {
  attempts: TimingAttemptRow[];
  participants: Map<string, TimingParticipantRow[]>;
  marks: TimingMarkRow[];
  epochs: TimingClockEpochRow[];
  receipts: TimingReceiptRow[];
  audits: StoredAudit[];
  results: TimingPublishedResultRow[];
  heatTimes: TimingHeatTimeRow[];
  captureLock: TimingCaptureLockRow | null;
};

/**
 * The only persistence stand-in of this suite. Every method mirrors the
 * repository signature the service calls; `withTransaction` snapshots the store
 * so a refused write leaves no row behind, like a rolled-back transaction.
 */
class InMemoryTimingRepository {
  events: TimingEventRow[] = [];
  starts = new Map<string, TimingStartRow[]>();
  formats: TimingFormatRow[] = [];
  enrollments: TimingEnrollmentRow[] = [];
  ageCategories: never[] = [];
  ageSections: never[] = [];
  races: TimingClassCompetitionRow[] = [];
  attempts: TimingAttemptRow[] = [];
  participants = new Map<string, TimingParticipantRow[]>();
  marks: TimingMarkRow[] = [];
  epochs: TimingClockEpochRow[] = [];
  receipts: TimingReceiptRow[] = [];
  audits: StoredAudit[] = [];
  results: TimingPublishedResultRow[] = [];
  heatTimes: TimingHeatTimeRow[] = [];
  captureLock: TimingCaptureLockRow | null = null;
  authentikUserIds = new Map<string, string>();

  /** Holds the event-wide capture lock for one workstation, like a take route. */
  takeLock(workstationInstanceId: string, heldByUserId: string): void {
    const now = this.now();
    this.captureLock = {
      eventId: EVENT_ID,
      workstationInstanceId,
      lockToken: `lock-${workstationInstanceId}`,
      heldByUserId,
      acquiredAt: now,
      lastSeenAt: now,
    };
  }

  async withTransaction<T>(run: (tx: TimingTx) => Promise<T>): Promise<T> {
    const snapshot = this.snapshot();
    try {
      return await run(TRANSACTION);
    } catch (error) {
      this.restore(snapshot);
      throw error;
    }
  }

  lockCategory(): Promise<void> {
    return Promise.resolve();
  }

  findEvent(eventId: string): Promise<TimingEventRow | null> {
    return Promise.resolve(
      this.events.find((event) => event.id === eventId) ?? null,
    );
  }

  findUserIdByAuthentikId(authentikId: string): Promise<string | null> {
    return Promise.resolve(this.authentikUserIds.get(authentikId) ?? null);
  }

  listFormats(): Promise<TimingFormatRow[]> {
    return Promise.resolve([...this.formats]);
  }

  isCategoryFinished(): Promise<boolean> {
    return Promise.resolve(false);
  }

  listStarts(eventId: string): Promise<TimingStartRow[]> {
    return Promise.resolve([...(this.starts.get(eventId) ?? [])]);
  }

  listEnrollmentRows(eventId: string): Promise<TimingEnrollmentRow[]> {
    return Promise.resolve(
      this.enrollments.filter((row) => row.eventId === eventId),
    );
  }

  listEnrollmentsForRegistrations(
    eventId: string,
    startId: string,
    registrationIds: readonly string[],
  ): Promise<TimingHeatRosterEnrollmentRow[]> {
    const wanted = new Set(registrationIds);
    return Promise.resolve(
      this.enrollments
        .filter(
          (row) =>
            row.eventId === eventId &&
            row.startId === startId &&
            row.enrollmentStatus === 'REGISTERED' &&
            wanted.has(row.registrationId),
        )
        .map((row) => ({
          enrollmentId: row.enrollmentId,
          registrationId: row.registrationId,
          startNumber: row.startNumber,
          enrollmentStatus: row.enrollmentStatus,
          registrationStatus: row.registrationStatus,
        })),
    );
  }

  listAgeCategories(): Promise<never[]> {
    return Promise.resolve([...this.ageCategories]);
  }

  listLegacyAgeSections(): Promise<never[]> {
    return Promise.resolve([...this.ageSections]);
  }

  listClassCompetitions(): Promise<TimingClassCompetitionRow[]> {
    return Promise.resolve([...this.races]);
  }

  findAttemptsForCategory(
    eventId: string,
    startId: string,
    formatId: number,
    gender: string,
  ): Promise<TimingAttemptRow[]> {
    return Promise.resolve(
      this.attempts
        .filter(
          (attempt) =>
            attempt.eventId === eventId &&
            attempt.startId === startId &&
            attempt.formatId === formatId &&
            attempt.gender === gender &&
            attempt.attemptKind === 'CATEGORY',
        )
        .sort((left, right) => right.attemptNumber - left.attemptNumber),
    );
  }

  findHeatAttempts(
    classCompetitionId: string,
    stageId: string,
    heatNumber: number,
  ): Promise<TimingAttemptRow[]> {
    return Promise.resolve(
      this.attempts
        .filter(
          (attempt) =>
            attempt.attemptKind === 'HEAT' &&
            attempt.classCompetitionId === classCompetitionId &&
            attempt.stageId === stageId &&
            attempt.heatNumber === heatNumber,
        )
        .sort((left, right) => right.attemptNumber - left.attemptNumber),
    );
  }

  findRunningHeatAttempt(
    classCompetitionId: string,
    stageId: string,
    heatNumber: number,
  ): Promise<TimingAttemptRow | null> {
    return Promise.resolve(
      this.attempts.find(
        (attempt) =>
          attempt.attemptKind === 'HEAT' &&
          attempt.classCompetitionId === classCompetitionId &&
          attempt.stageId === stageId &&
          attempt.heatNumber === heatNumber &&
          attempt.status === 'RUNNING',
      ) ?? null,
    );
  }

  findAttemptsForRace(
    eventId: string,
    classCompetitionId: string,
  ): Promise<TimingAttemptRow[]> {
    return Promise.resolve(
      this.attempts
        .filter(
          (attempt) =>
            attempt.eventId === eventId &&
            attempt.attemptKind === 'HEAT' &&
            attempt.classCompetitionId === classCompetitionId,
        )
        .sort((left, right) => {
          if (left.stageId !== right.stageId) {
            return (left.stageId ?? '') < (right.stageId ?? '') ? -1 : 1;
          }
          if (left.heatNumber !== right.heatNumber) {
            return (left.heatNumber ?? 0) - (right.heatNumber ?? 0);
          }
          return right.attemptNumber - left.attemptNumber;
        }),
    );
  }

  findAttempt(attemptId: string): Promise<TimingAttemptRow | null> {
    return Promise.resolve(
      this.attempts.find((attempt) => attempt.id === attemptId) ?? null,
    );
  }

  findLatestAttemptNumber(
    _tx: TimingTx,
    eventId: string,
    startId: string,
    formatId: number,
    gender: string,
  ): Promise<number> {
    const numbers = this.attempts
      .filter(
        (attempt) =>
          attempt.eventId === eventId &&
          attempt.startId === startId &&
          attempt.formatId === formatId &&
          attempt.gender === gender &&
          attempt.attemptKind === 'CATEGORY',
      )
      .map((attempt) => attempt.attemptNumber);
    return Promise.resolve(numbers.length === 0 ? 0 : Math.max(...numbers));
  }

  createAttempt(
    _tx: TimingTx,
    input: CreateAttemptInput,
  ): Promise<TimingAttemptRow> {
    const now = this.now();
    const attempt: TimingAttemptRow = {
      id: randomUUID(),
      eventId: input.eventId,
      startId: input.startId,
      formatId: input.formatId,
      gender: input.gender,
      attemptNumber: input.attemptNumber,
      attemptKind: input.attemptKind ?? 'CATEGORY',
      classCompetitionId: input.classCompetitionId ?? null,
      stageId: input.stageId ?? null,
      heatNumber: input.heatNumber ?? null,
      status: 'RUNNING',
      officialStartedAt: input.officialStartedAt,
      clientStartedAt: input.clientStartedAt,
      startedByUserId: input.startedByUserId,
      closedAt: null,
      closedByUserId: null,
      closureReport: null,
      participantCount: input.participants.length,
      createdAt: now,
      updatedAt: now,
    };
    this.attempts.push(attempt);
    this.participants.set(
      attempt.id,
      input.participants.map((participant) => ({
        enrollmentId: participant.enrollmentId,
        registrationId: participant.registrationId,
        startNumber: participant.startNumber,
        sectionId: participant.sectionId,
        requiredLaps: participant.requiredLaps,
        initialOutcome: participant.initialOutcome,
        excludedReason: participant.excludedReason ?? null,
      })),
    );
    return Promise.resolve(attempt);
  }

  updateAttemptStatus(
    _tx: TimingTx,
    attemptId: string,
    input: UpdateAttemptStatusInput,
  ): Promise<TimingAttemptRow> {
    const index = this.attempts.findIndex(
      (attempt) => attempt.id === attemptId,
    );
    if (index < 0) {
      return Promise.reject(new Error(`Attempt ${attemptId} is not stored.`));
    }
    const updated: TimingAttemptRow = {
      ...this.attempts[index],
      status: input.status,
      closedAt: input.closedAt,
      closedByUserId: input.closedByUserId,
      closureReport: input.closureReport,
      updatedAt: this.now(),
    };
    this.attempts[index] = updated;
    return Promise.resolve(updated);
  }

  listParticipants(attemptId: string): Promise<TimingParticipantRow[]> {
    return Promise.resolve([...(this.participants.get(attemptId) ?? [])]);
  }

  findParticipant(
    attemptId: string,
    enrollmentId: string,
  ): Promise<TimingParticipantRow | null> {
    return Promise.resolve(
      (this.participants.get(attemptId) ?? []).find(
        (participant) => participant.enrollmentId === enrollmentId,
      ) ?? null,
    );
  }

  findParticipantByStartNumber(
    attemptId: string,
    startNumber: number,
  ): Promise<TimingParticipantRow | null> {
    return Promise.resolve(
      (this.participants.get(attemptId) ?? []).find(
        (participant) => participant.startNumber === startNumber,
      ) ?? null,
    );
  }

  listParticipantRoster(
    attemptId: string,
  ): Promise<TimingParticipantRosterRow[]> {
    return Promise.resolve(
      (this.participants.get(attemptId) ?? []).map((participant) => {
        const enrollment = this.enrollments.find(
          (row) => row.enrollmentId === participant.enrollmentId,
        );
        return {
          ...participant,
          firstName: enrollment?.firstName ?? null,
          lastName: enrollment?.lastName ?? null,
        };
      }),
    );
  }

  listMarks(attemptId: string): Promise<TimingMarkRow[]> {
    return Promise.resolve(
      this.marks
        .filter((mark) => mark.attemptId === attemptId)
        .sort((left, right) => {
          const instant =
            left.officialAt.getTime() - right.officialAt.getTime();
          if (instant !== 0) return instant;
          return left.id < right.id ? -1 : 1;
        }),
    );
  }

  findMark(markId: string): Promise<TimingMarkRow | null> {
    return Promise.resolve(
      this.marks.find((mark) => mark.id === markId) ?? null,
    );
  }

  listPendingFinishes(attemptId: string): Promise<TimingMarkRow[]> {
    return Promise.resolve(
      this.marks.filter(
        (mark) =>
          mark.attemptId === attemptId &&
          mark.kind === 'PENDING_FINISH' &&
          mark.status === 'PENDING',
      ),
    );
  }

  listQueuedEventSplits(): Promise<TimingEventSplitRow[]> {
    return Promise.resolve([]);
  }

  listAnonymousSplits(eventId: string): Promise<TimingAnonymousSplitRow[]> {
    const rows: TimingAnonymousSplitRow[] = [];
    for (const mark of this.marks) {
      if (mark.kind !== 'ANONYMOUS_SPLIT') continue;
      // The repository query the queue and the closure gate read returns the
      // pending splits of the event only (AD-17).
      if (mark.status !== 'PENDING') continue;
      const attempt = this.attempts.find(
        (candidate) => candidate.id === mark.attemptId,
      );
      if (attempt === undefined || attempt.eventId !== eventId) continue;
      rows.push({
        splitId: mark.id,
        attemptId: attempt.id,
        attemptKind: attempt.attemptKind,
        attemptStatus: attempt.status,
        eventId: attempt.eventId,
        startId: attempt.startId,
        formatId: attempt.formatId,
        gender: attempt.gender,
        classCompetitionId: attempt.classCompetitionId,
        stageId: attempt.stageId,
        heatNumber: attempt.heatNumber,
        officialStartedAt: attempt.officialStartedAt,
        clockEpochId: mark.clockEpochId,
        capturedAt: mark.officialAt,
        officialElapsedMs: mark.officialElapsedMs,
        status: mark.status,
      });
    }
    return Promise.resolve(
      rows.sort((left, right) => {
        const instant = left.capturedAt.getTime() - right.capturedAt.getTime();
        if (instant !== 0) return instant;
        return left.splitId < right.splitId ? -1 : 1;
      }),
    );
  }

  createAnonymousSplit(
    tx: TimingTx,
    input: CreateAnonymousSplitInput,
  ): Promise<TimingMarkRow> {
    return this.createMark(tx, {
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
  }

  assignAnonymousSplit(
    tx: TimingTx,
    splitId: string,
    input: AssignAnonymousSplitInput,
  ): Promise<TimingMarkRow> {
    return this.updateMark(tx, splitId, {
      enrollmentId: input.enrollmentId,
      registrationId: input.registrationId,
      startNumber: input.startNumber,
      kind: 'PASS',
      status: 'BOUND',
      deviceSequence: input.deviceSequence,
    });
  }

  cancelAnonymousSplit(tx: TimingTx, splitId: string): Promise<TimingMarkRow> {
    return this.updateMark(tx, splitId, { status: 'CANCELLED' });
  }

  createMark(_tx: TimingTx, input: CreateMarkInput): Promise<TimingMarkRow> {
    const now = this.now();
    const mark: TimingMarkRow = {
      id: randomUUID(),
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
      createdAt: now,
      updatedAt: now,
    };
    this.marks.push(mark);
    return Promise.resolve(mark);
  }

  updateMark(
    _tx: TimingTx,
    markId: string,
    input: UpdateMarkInput,
  ): Promise<TimingMarkRow> {
    const index = this.marks.findIndex((mark) => mark.id === markId);
    if (index < 0) {
      return Promise.reject(new Error(`Mark ${markId} is not stored.`));
    }
    const next: TimingMarkRow = { ...this.marks[index], updatedAt: this.now() };
    if (input.enrollmentId !== undefined) {
      next.enrollmentId = input.enrollmentId;
    }
    if (input.registrationId !== undefined) {
      next.registrationId = input.registrationId;
    }
    if (input.startNumber !== undefined) {
      next.startNumber = input.startNumber;
    }
    if (input.kind !== undefined) {
      next.kind = input.kind;
    }
    if (input.lapNumber !== undefined) {
      next.lapNumber = input.lapNumber;
    }
    if (input.status !== undefined) {
      next.status = input.status;
    }
    if (input.officialAt !== undefined) {
      next.officialAt = input.officialAt;
    }
    if (input.officialElapsedMs !== undefined) {
      next.officialElapsedMs = input.officialElapsedMs;
    }
    if (input.deviceSequence !== undefined) {
      next.deviceSequence = input.deviceSequence;
    }
    this.marks[index] = next;
    return Promise.resolve(next);
  }

  createClockEpoch(
    _tx: TimingTx,
    input: CreateClockEpochInput,
  ): Promise<TimingClockEpochRow> {
    const epoch: TimingClockEpochRow = {
      id: randomUUID(),
      attemptId: input.attemptId,
      workstationInstanceId: input.workstationInstanceId,
      officialElapsedAnchorMs: input.officialElapsedAnchorMs,
      openedAt: input.openedAt ?? this.now(),
      closedAt: null,
      openedByUserId: input.openedByUserId,
    };
    this.epochs.push(epoch);
    return Promise.resolve(epoch);
  }

  closeOpenEpochs(
    _tx: TimingTx,
    attemptId: string,
    workstationInstanceId?: string,
  ): Promise<number> {
    let closed = 0;
    const closedAt = this.now();
    this.epochs = this.epochs.map((epoch) => {
      if (
        epoch.attemptId !== attemptId ||
        epoch.closedAt !== null ||
        (workstationInstanceId !== undefined &&
          epoch.workstationInstanceId !== workstationInstanceId)
      ) {
        return epoch;
      }
      closed += 1;
      return { ...epoch, closedAt };
    });
    return Promise.resolve(closed);
  }

  findOpenEpoch(
    attemptId: string,
    workstationInstanceId: string,
  ): Promise<TimingClockEpochRow | null> {
    return Promise.resolve(
      this.epochs.find(
        (epoch) =>
          epoch.attemptId === attemptId &&
          epoch.workstationInstanceId === workstationInstanceId &&
          epoch.closedAt === null,
      ) ?? null,
    );
  }

  getCaptureLock(eventId: string): Promise<TimingCaptureLockRow | null> {
    const lock = this.captureLock;
    return Promise.resolve(
      lock !== null && lock.eventId === eventId ? lock : null,
    );
  }

  releaseCaptureLock(
    _tx: TimingTx,
    input: ReleaseCaptureLockInput,
  ): Promise<TimingCaptureLockRow | null> {
    const lock = this.captureLock;
    if (
      lock === null ||
      lock.eventId !== input.eventId ||
      lock.lockToken !== input.lockToken
    ) {
      return Promise.resolve(null);
    }
    this.captureLock = null;
    return Promise.resolve(lock);
  }

  createReceipt(
    _tx: TimingTx,
    input: CreateReceiptInput,
  ): Promise<TimingReceiptRow> {
    const receipt: TimingReceiptRow = {
      attemptId: input.attemptId,
      workstationInstanceId: input.workstationInstanceId,
      deviceSequence: input.deviceSequence,
      status: input.status,
      reason: input.reason,
      createdAt: this.now(),
    };
    this.receipts.push(receipt);
    return Promise.resolve(receipt);
  }

  createRejectedReceipt(
    tx: TimingTx,
    input: CreateRejectedReceiptInput,
  ): Promise<TimingReceiptRow> {
    return this.createReceipt(tx, {
      attemptId: input.attemptId,
      workstationInstanceId: input.workstationInstanceId,
      deviceSequence: input.deviceSequence,
      status: 'REJECTED',
      reason: input.reason,
    });
  }

  findReceipt(
    _tx: TimingTx,
    attemptId: string,
    workstationInstanceId: string,
    deviceSequence: number,
  ): Promise<TimingReceiptRow | null> {
    return Promise.resolve(
      this.receipts.find(
        (receipt) =>
          receipt.attemptId === attemptId &&
          receipt.workstationInstanceId === workstationInstanceId &&
          receipt.deviceSequence === deviceSequence,
      ) ?? null,
    );
  }

  listAttemptReceipts(attemptId: string): Promise<TimingReceiptRow[]> {
    return Promise.resolve(
      this.receipts.filter((receipt) => receipt.attemptId === attemptId),
    );
  }

  insertAudit(_tx: TimingTx, input: InsertAuditInput): Promise<TimingAuditRow> {
    const row: TimingAuditRow = {
      auditId: randomUUID(),
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      oldValues: input.oldValues as unknown as Record<string, unknown> | null,
      newValues: input.newValues as unknown as Record<string, unknown> | null,
      reason: input.reason,
      createdAt: this.now(),
    };
    this.audits.push({ attemptId: input.attemptId, row });
    return Promise.resolve(row);
  }

  listAudit(attemptId: string): Promise<TimingAuditRow[]> {
    return Promise.resolve(
      this.audits
        .filter((audit) => audit.attemptId === attemptId)
        .map((audit) => audit.row),
    );
  }

  findResultByEnrollment(
    enrollmentId: string,
  ): Promise<TimingResultRow | null> {
    return Promise.resolve(
      this.results.find((row) => row.enrollmentId === enrollmentId) ?? null,
    );
  }

  listPublishedResults(attemptId: string): Promise<TimingPublishedResultRow[]> {
    return Promise.resolve(
      this.results.filter((row) => row.timingSessionId === attemptId),
    );
  }

  publishResult(
    _tx: TimingTx,
    input: PublishResultInput,
  ): Promise<TimingResultRow> {
    const now = this.now();
    const existing = this.results.find(
      (row) => row.enrollmentId === input.enrollmentId,
    );
    if (existing !== undefined) {
      existing.outcome = input.outcome;
      existing.timeMilliseconds = input.timeMilliseconds;
      existing.place = null;
      existing.timingSessionId = input.timingSessionId;
      existing.updatedAt = now;
      return Promise.resolve(existing);
    }
    const created: TimingPublishedResultRow = {
      id: randomUUID(),
      enrollmentId: input.enrollmentId,
      registrationId: input.registrationId,
      outcome: input.outcome,
      timeMilliseconds: input.timeMilliseconds,
      place: null,
      recordedAt: now,
      updatedAt: now,
      timingSessionId: input.timingSessionId,
      laps: [],
    };
    this.results.push(created);
    return Promise.resolve(created);
  }

  replaceResultSplits(
    _tx: TimingTx,
    resultId: string,
    splits: ReadonlyArray<{
      lapNumber: number;
      lapTimeMs: number;
      cumulativeMs: number;
    }>,
  ): Promise<void> {
    const result = this.results.find((row) => row.id === resultId);
    if (result !== undefined) {
      result.laps = [...splits];
    }
    return Promise.resolve();
  }

  listHeatTimesForHeat(
    classCompetitionId: string,
    stageId: string,
    heatNumber: number,
  ): Promise<TimingHeatTimeRow[]> {
    return Promise.resolve(
      this.heatTimes
        .filter(
          (row) =>
            row.classCompetitionId === classCompetitionId &&
            row.stageId === stageId &&
            row.heatNumber === heatNumber,
        )
        .sort((left, right) =>
          left.registrationId < right.registrationId ? -1 : 1,
        ),
    );
  }

  createHeatTime(
    _tx: TimingTx,
    input: CreateHeatTimeInput,
  ): Promise<TimingHeatTimeRow> {
    const row: TimingHeatTimeRow = {
      id: randomUUID(),
      classCompetitionId: input.classCompetitionId,
      stageId: input.stageId,
      heatNumber: input.heatNumber,
      registrationId: input.registrationId,
      timeMilliseconds: input.timeMilliseconds,
      status: 'OK',
    };
    this.heatTimes.push(row);
    return Promise.resolve(row);
  }

  listEnrollmentStatuses(
    enrollmentIds: readonly string[],
  ): Promise<Map<string, 'REGISTERED'>> {
    return Promise.resolve(
      new Map(
        this.enrollments
          .filter((row) => enrollmentIds.includes(row.enrollmentId))
          .map((row) => [row.enrollmentId, 'REGISTERED'] as const),
      ),
    );
  }

  existsStartNumber(eventId: string, startNumber: number): Promise<boolean> {
    return Promise.resolve(
      this.enrollments.some(
        (row) =>
          row.eventId === eventId &&
          row.enrollmentStatus === 'REGISTERED' &&
          row.startNumber === startNumber,
      ),
    );
  }

  private snapshot(): RepositorySnapshot {
    return {
      attempts: [...this.attempts],
      participants: new Map(this.participants),
      marks: [...this.marks],
      epochs: [...this.epochs],
      receipts: [...this.receipts],
      audits: [...this.audits],
      results: [...this.results],
      heatTimes: [...this.heatTimes],
      captureLock: this.captureLock,
    };
  }

  private restore(snapshot: RepositorySnapshot): void {
    this.attempts = snapshot.attempts;
    this.participants = snapshot.participants;
    this.marks = snapshot.marks;
    this.epochs = snapshot.epochs;
    this.receipts = snapshot.receipts;
    this.audits = snapshot.audits;
    this.results = snapshot.results;
    this.heatTimes = snapshot.heatTimes;
    this.captureLock = snapshot.captureLock;
  }

  private now(): Date {
    return new Date();
  }
}

/* -------------------------------------------------------------------------- */
/* Roles and harness                                                           */
/* -------------------------------------------------------------------------- */

/** The real `RolesService` contract over a fixed user table (401/403 only). */
class TestRolesService {
  constructor(
    private readonly rolesByUser: Readonly<Record<string, readonly RoleCode[]>>,
  ) {}

  assertHasAnyRole(
    authentikId: string | undefined,
    requiredCodes: readonly RoleCode[],
  ): Promise<void> {
    if (authentikId === undefined) {
      return Promise.reject(
        new UnauthorizedException(
          'Not authenticated. Start with GET /auth/login.',
        ),
      );
    }
    const codes = this.rolesByUser[authentikId] ?? [];
    if (!requiredCodes.some((code) => codes.includes(code))) {
      return Promise.reject(new ForbiddenException('Insufficient role.'));
    }
    return Promise.resolve();
  }
}

type Harness = {
  server: Server;
  repository: InMemoryTimingRepository;
};

type SessionRequest = {
  headers?: Record<string, string | string[] | undefined>;
  session?: { userSub: string };
};

const openApps: INestApplication[] = [];

function seedRepository(repository: InMemoryTimingRepository): void {
  repository.events.push({
    id: EVENT_ID,
    status: 'IN_PROGRESS',
    eventDate: new Date('2026-11-13T07:00:00.000Z'),
  });
  repository.starts.set(EVENT_ID, [startRow()]);
  repository.formats.push({ id: FORMAT_ID, sortOrder: 1 });
  repository.authentikUserIds.set(REFEREE, REFEREE_USER_ID);
  repository.authentikUserIds.set(ADMIN, ADMIN_USER_ID);
  repository.authentikUserIds.set(ORGANIZER, ORGANIZER_USER_ID);
  repository.enrollments.push(
    enrollmentRow({
      enrollmentId: ENROLLMENT_1,
      registrationId: REGISTRATION_1,
      startNumber: START_NUMBER_1,
      firstName: 'Иван',
      lastName: 'Петров',
    }),
    enrollmentRow({
      enrollmentId: ENROLLMENT_2,
      registrationId: REGISTRATION_2,
      startNumber: START_NUMBER_2,
      firstName: 'Пётр',
      lastName: 'Сидоров',
    }),
    enrollmentRow({
      enrollmentId: ENROLLMENT_3,
      registrationId: REGISTRATION_3,
      startNumber: START_NUMBER_3,
      firstName: 'Сергей',
      lastName: 'Кузнецов',
    }),
  );
  repository.races.push(classCompetitionRow());
  repository.takeLock(WORKSTATION, REFEREE_USER_ID);
}

/** The session of one request comes from the `x-test-user` header. */
function applySession(
  req: SessionRequest,
  _res: unknown,
  next: () => void,
): void {
  const raw = req.headers?.['x-test-user'];
  const user = Array.isArray(raw) ? raw[0] : raw;
  if (user !== undefined) {
    req.session = { userSub: user };
  }
  next();
}

async function createHarness(): Promise<Harness> {
  const repository = new InMemoryTimingRepository();
  seedRepository(repository);
  const raceViews = [raceView()];
  const moduleRef = await Test.createTestingModule({
    controllers: [TimingController],
    providers: [
      TimingService,
      AnonymousSplitService,
      TimingExceptionFilter,
      SessionAuthGuard,
      RolesGuard,
      { provide: TimingRepository, useValue: repository },
      { provide: RolesService, useValue: new TestRolesService(ROLES_BY_USER) },
      {
        provide: ClassCompetitionsService,
        useValue: { list: () => Promise.resolve(raceViews) },
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.use(applySession);
  await app.init();
  openApps.push(app);
  return { server: app.getHttpServer() as Server, repository };
}

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

/* -------------------------------------------------------------------------- */
/* HTTP helpers                                                                */
/* -------------------------------------------------------------------------- */

function post(
  server: Server,
  path: string,
  user: string = REFEREE,
): request.Test {
  return request(server).post(path).set('x-test-user', user);
}

function get(
  server: Server,
  path: string,
  user: string = REFEREE,
): request.Test {
  return request(server).get(path).set('x-test-user', user);
}

function expectRefusal(
  response: SupertestResponse,
  status: number,
  code: TimingErrorCode,
): TimingErrorBody {
  expect(response.status).toBe(status);
  const body = response.body as TimingErrorBody;
  expect(body.statusCode).toBe(status);
  expect(body.code).toBe(code);
  return body;
}

async function getSurface(server: Server): Promise<TimingSurfaceView> {
  const response = await get(server, BASE_PATH);
  expect(response.status).toBe(200);
  return response.body as TimingSurfaceView;
}

async function startSeededHeat(
  server: Server,
  heatNumber: number,
  user: string = REFEREE,
): Promise<StartTimingAttemptResult> {
  const response = await post(server, `${BASE_PATH}/heat-attempts`, user).send(
    heatRequest(heatNumber),
  );
  expect(response.status).toBe(201);
  return response.body as StartTimingAttemptResult;
}

async function captureAnonymousSplit(
  server: Server,
  attempt: StartTimingAttemptResult,
  deviceSequence: number,
  elapsedMs: number,
  idempotencyKey?: string,
): Promise<TimingPassView> {
  const pending = post(server, `${BASE_PATH}/passes`);
  if (idempotencyKey !== undefined) {
    pending.set('Idempotency-Key', idempotencyKey);
  }
  const response = await pending.send({
    attemptId: attempt.attempt.attemptId,
    kind: 'ANONYMOUS_SPLIT',
    clockEpochId: attempt.epoch.epochId,
    workstationInstanceId: WORKSTATION,
    deviceSequence,
    clientCapturedAt: isoAt(elapsedMs),
    clientElapsedMs: elapsedMs,
  });
  expect(response.status).toBe(201);
  return response.body as TimingPassView;
}

async function captureTilePass(
  server: Server,
  attempt: StartTimingAttemptResult,
  enrollmentId: string,
  deviceSequence: number,
  elapsedMs: number,
): Promise<SupertestResponse> {
  return post(server, `${BASE_PATH}/passes`).send({
    attemptId: attempt.attempt.attemptId,
    kind: 'TILE',
    enrollmentId,
    clockEpochId: attempt.epoch.epochId,
    workstationInstanceId: WORKSTATION,
    deviceSequence,
    clientCapturedAt: isoAt(elapsedMs),
    clientElapsedMs: elapsedMs,
  });
}

/** Captures every participant N times and answers the last used sequence. */
async function captureHeatAtN(
  server: Server,
  attempt: StartTimingAttemptResult,
  enrollmentIds: readonly string[],
  firstSequence: number,
): Promise<number> {
  let sequence = firstSequence - 1;
  for (const enrollmentId of enrollmentIds) {
    for (let lap = 1; lap <= LAP_COUNT; lap += 1) {
      sequence += 1;
      const response = await captureTilePass(
        server,
        attempt,
        enrollmentId,
        sequence,
        sequence * 10_000,
      );
      expect(response.status).toBe(201);
    }
  }
  return sequence;
}

/* -------------------------------------------------------------------------- */
/* Surface and heat start                                                     */
/* -------------------------------------------------------------------------- */

describe('timing API integration: surface and heat start', () => {
  it('serves the anonymous queue and the stage/heat blocks on GET', async () => {
    const { server } = await createHarness();

    const surface = await getSurface(server);

    expect(surface.eventId).toBe(EVENT_ID);
    expect(surface.captureWorkstationInstanceId).toBe(WORKSTATION);
    expect(surface.anonymousSplits).toEqual([]);

    const groups = surface.stageGroups ?? [];
    expect(groups.map((group) => [group.stageId, group.stageState])).toEqual([
      [STAGE_PENDING, 'PENDING'],
      [STAGE_SEEDED, 'SEEDED'],
      [STAGE_DONE, 'COMPLETED'],
    ]);
    expect(groups[0].blockReason).not.toBeNull();
    expect(groups[0].heatBlockKeys).toEqual([]);
    const seededKeys = [1, 2, 3].map((heat) =>
      heatBlockKey(STAGE_SEEDED, heat),
    );
    expect(groups[1].heatBlockKeys).toEqual(seededKeys);
    expect(groups[1].blockReason).toBeNull();

    const heatBlocks = surface.categories.filter(
      (block) => block.kind === 'HEAT',
    );
    expect(heatBlocks.map((block) => block.blockKey)).toEqual([
      ...seededKeys,
      heatBlockKey(STAGE_DONE, 1),
    ]);
    expect(heatBlocks.map((block) => block.heatNumber)).toEqual([1, 2, 3, 1]);
    expect(heatBlocks.map((block) => block.lapCount)).toEqual([
      LAP_COUNT,
      LAP_COUNT,
      LAP_COUNT,
      LAP_COUNT,
    ]);
    expect(
      heatBlocks
        .filter((block) => block.stageId === STAGE_SEEDED)
        .map((block) => block.startControlEnabled),
    ).toEqual([true, true, true]);
    const closedBlock = heatBlocks.find(
      (block) => block.stageId === STAGE_DONE,
    );
    expect(closedBlock?.startControlEnabled).toBe(false);
    expect(closedBlock?.blockReason).not.toBeNull();

    // FR-34: the category block keeps its race-section rows as excluded.
    const categoryBlock = surface.categories[0];
    expect(categoryBlock.kind).toBeUndefined();
    expect(
      categoryBlock.participants.map((tile) => [
        tile.startNumber,
        tile.excludedReason,
      ]),
    ).toEqual([
      [START_NUMBER_1, 'RACE_SECTION'],
      [START_NUMBER_2, 'RACE_SECTION'],
      [START_NUMBER_3, null],
    ]);
  });

  it('starts one heat with 201, its heat block and a fresh epoch', async () => {
    const { server, repository } = await createHarness();

    const result = await startSeededHeat(server, 1);

    expect(result.attempt).toMatchObject({
      kind: 'HEAT',
      blockKey: heatBlockKey(STAGE_SEEDED, 1),
      classCompetitionId: RACE_ID,
      stageId: STAGE_SEEDED,
      stageLabel: 'Круг 1',
      stageState: 'SEEDED',
      heatNumber: 1,
      heatLabel: 'Заезд 1',
      state: 'RUNNING',
      lapCount: LAP_COUNT,
      startId: START_ID,
      formatId: FORMAT_ID,
      gender: 'M',
      startControlEnabled: false,
    });
    expect(result.attempt.participants.map((tile) => tile.startNumber)).toEqual(
      [START_NUMBER_1, START_NUMBER_2],
    );
    expect(result.epoch.attemptId).toBe(result.attempt.attemptId);
    expect(result.epoch.officialElapsedAnchorMs).toBe(0);
    expect(typeof result.epoch.epochId).toBe('string');

    const attempt = repository.attempts[0];
    expect(attempt).toMatchObject({
      id: result.attempt.attemptId,
      eventId: EVENT_ID,
      attemptKind: 'HEAT',
      classCompetitionId: RACE_ID,
      stageId: STAGE_SEEDED,
      heatNumber: 1,
      startId: START_ID,
      formatId: FORMAT_ID,
      status: 'RUNNING',
    });
    expect(repository.participants.get(attempt.id)).toHaveLength(2);
    expect(
      (repository.participants.get(attempt.id) ?? []).map(
        (participant) => participant.requiredLaps,
      ),
    ).toEqual([LAP_COUNT, LAP_COUNT]);
    expect(repository.audits.map((audit) => audit.row.action)).toEqual([
      'START',
    ]);
  });

  it('refuses a heat start for an organizer and for a workstation without capture', async () => {
    const { server, repository } = await createHarness();

    const organizer = await post(
      server,
      `${BASE_PATH}/heat-attempts`,
      ORGANIZER,
    ).send(heatRequest(1));
    expect(organizer.status).toBe(403);
    expect(repository.attempts).toHaveLength(0);

    const stranger = await post(server, `${BASE_PATH}/heat-attempts`).send({
      ...heatRequest(1),
      workstationInstanceId: OTHER_WORKSTATION,
    });
    expectRefusal(stranger, 409, TimingErrorCode.CAPTURE_NOT_HELD);
    expect(repository.attempts).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Anonymous split queue                                                      */
/* -------------------------------------------------------------------------- */

describe('timing API integration: anonymous split queue', () => {
  it('queues an Enter split on POST passes and shows it on the surface', async () => {
    const { server, repository } = await createHarness();
    const heat = await startSeededHeat(server, 1);

    const split = await captureAnonymousSplit(
      server,
      heat,
      1,
      5_000,
      'split-key-1',
    );

    expect(split).toMatchObject({
      attemptId: heat.attempt.attemptId,
      enrollmentId: null,
      lapNumber: null,
      status: 'PENDING',
      officialElapsedMs: 5_000,
      rawCapturedAt: isoAt(5_000),
    });

    const surface = await getSurface(server);
    expect(surface.anonymousSplits).toHaveLength(1);
    const queued = surface.anonymousSplits?.[0] as TimingAnonymousSplitView;
    expect(queued).toMatchObject({
      splitId: split.passId,
      attemptId: heat.attempt.attemptId,
      blockKey: heatBlockKey(STAGE_SEEDED, 1),
      attemptLabel: `Кубок · Этап ${STAGE_SEEDED} · Заезд 1`,
      capturedAt: split.officialAt,
      officialElapsedMs: 5_000,
      status: 'QUEUED',
    });

    // FR-15: a split is not a pass, so no tile count moves.
    const heatBlock = surface.categories.find(
      (block) => block.attemptId === heat.attempt.attemptId,
    );
    expect(heatBlock?.participants.map((tile) => tile.passCount)).toEqual([
      0, 0,
    ]);

    // The header reaches the stored mark, not only the controller.
    const mark = repository.marks.find((row) => row.id === split.passId);
    expect(mark?.kind).toBe('ANONYMOUS_SPLIT');
    expect(mark?.idempotencyKey).toBe('split-key-1');
    expect(mark?.workstationInstanceId).toBe(WORKSTATION);
  });

  it('assigns a queued split on POST splits/:id/assign and drops it from the queue', async () => {
    const { server, repository } = await createHarness();
    const heat = await startSeededHeat(server, 1);
    const split = await captureAnonymousSplit(server, heat, 1, 5_000);

    const response = await post(
      server,
      `${BASE_PATH}/splits/${split.passId}/assign`,
    )
      .set('Idempotency-Key', 'assign-key-1')
      .send({
        startNumber: START_NUMBER_1,
        workstationInstanceId: WORKSTATION,
        deviceSequence: 2,
      });

    expect(response.status).toBe(200);
    const pass = response.body as TimingPassView;
    expect(pass).toEqual({
      passId: split.passId,
      attemptId: heat.attempt.attemptId,
      enrollmentId: ENROLLMENT_1,
      lapNumber: 1,
      rawCapturedAt: split.rawCapturedAt,
      officialAt: split.officialAt,
      officialElapsedMs: 5_000,
      status: 'BOUND',
    });

    const surface = await getSurface(server);
    expect(surface.anonymousSplits).toEqual([]);
    const heatBlock = surface.categories.find(
      (block) => block.attemptId === heat.attempt.attemptId,
    );
    expect(heatBlock?.participants.map((tile) => tile.passCount)).toEqual([
      1, 0,
    ]);

    const mark = repository.marks.find((row) => row.id === split.passId);
    expect(mark).toMatchObject({
      kind: 'PASS',
      status: 'BOUND',
      enrollmentId: ENROLLMENT_1,
      registrationId: REGISTRATION_1,
      startNumber: START_NUMBER_1,
      deviceSequence: 2,
    });
    const audit = repository.audits.find(
      (row) => row.row.action === 'ANONYMOUS_SPLIT_ASSIGN',
    );
    expect(audit?.row.newValues).toMatchObject({
      enrollmentId: ENROLLMENT_1,
      idempotencyKey: 'assign-key-1',
      workstationInstanceId: WORKSTATION,
      deviceSequence: 2,
    });
    expect(
      repository.receipts.find((receipt) => receipt.deviceSequence === 2),
    ).toMatchObject({ status: 'APPLIED', reason: null });
  });

  it('cancels a queued split with a reason and refuses a second or assigned cancel', async () => {
    const { server, repository } = await createHarness();
    const heat = await startSeededHeat(server, 1);
    const split = await captureAnonymousSplit(server, heat, 1, 5_000);

    const response = await post(
      server,
      `${BASE_PATH}/splits/${split.passId}/cancel`,
    ).send({ reason: 'captured by mistake' });

    expect(response.status).toBe(200);
    const retired = response.body as TimingAnonymousSplitView;
    expect(retired).toMatchObject({
      splitId: split.passId,
      attemptId: heat.attempt.attemptId,
      blockKey: heatBlockKey(STAGE_SEEDED, 1),
      capturedAt: split.officialAt,
      officialElapsedMs: 5_000,
      status: 'QUEUED',
    });

    expect((await getSurface(server)).anonymousSplits).toEqual([]);
    const mark = repository.marks.find((row) => row.id === split.passId);
    expect(mark?.status).toBe('CANCELLED');
    const audit = repository.audits.find(
      (row) => row.row.action === 'ANONYMOUS_SPLIT_CANCEL',
    );
    expect(audit?.row.reason).toBe('captured by mistake');
    expect(audit?.row.newValues).toMatchObject({ status: 'CANCELLED' });

    const again = await post(
      server,
      `${BASE_PATH}/splits/${split.passId}/cancel`,
    ).send({ reason: 'captured by mistake' });
    expectRefusal(again, 409, TimingErrorCode.INVALID_STATE);

    // An assigned entry is a bound pass now, not an anonymous split, so the
    // cancel route no longer addresses it.
    const queued = await captureAnonymousSplit(server, heat, 2, 6_000);
    const assigned = await post(
      server,
      `${BASE_PATH}/splits/${queued.passId}/assign`,
    ).send({
      enrollmentId: ENROLLMENT_2,
      workstationInstanceId: WORKSTATION,
      deviceSequence: 3,
    });
    expect(assigned.status).toBe(200);

    const assignedCancel = await post(
      server,
      `${BASE_PATH}/splits/${queued.passId}/cancel`,
    ).send({ reason: 'captured by mistake' });
    expectRefusal(assignedCancel, 404, TimingErrorCode.NOT_FOUND);
    expect(
      repository.marks.find((row) => row.id === queued.passId)?.status,
    ).toBe('BOUND');
  });

  it('blocks closure with PENDING_REMAINS while a split is queued', async () => {
    const { server, repository } = await createHarness();
    const heat = await startSeededHeat(server, 1);
    const lastSequence = await captureHeatAtN(
      server,
      heat,
      [ENROLLMENT_1, ENROLLMENT_2],
      1,
    );
    const split = await captureAnonymousSplit(
      server,
      heat,
      lastSequence + 1,
      70_000,
    );

    const blocked = await post(
      server,
      `${BASE_PATH}/attempts/${heat.attempt.attemptId}/complete`,
    ).send({
      workstationInstanceId: WORKSTATION,
      lastIssuedSequence: lastSequence + 1,
    });
    const body = expectRefusal(blocked, 409, TimingErrorCode.PENDING_REMAINS);
    expect(
      (body.details as { anonymousSplitIds: string[] }).anonymousSplitIds,
    ).toEqual([split.passId]);
    expect(repository.attempts[0].status).toBe('RUNNING');
    expect(repository.heatTimes).toEqual([]);

    // Assignment, cancellation or undo is the only way out of the gate.
    const cancelled = await post(
      server,
      `${BASE_PATH}/splits/${split.passId}/cancel`,
    ).send({ reason: 'wrong instant' });
    expect(cancelled.status).toBe(200);

    const completed = await post(
      server,
      `${BASE_PATH}/attempts/${heat.attempt.attemptId}/complete`,
    ).send({
      workstationInstanceId: WORKSTATION,
      lastIssuedSequence: lastSequence + 1,
    });
    expect(completed.status).toBe(200);
    const record = completed.body as TimingAttemptRecordView;
    expect(record.state).toBe('COMPLETED');
    expect(record.closureReport?.publishedRegistrationIds).toEqual([
      REGISTRATION_1,
      REGISTRATION_2,
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Heat closure and publication                                               */
/* -------------------------------------------------------------------------- */

describe('timing API integration: heat closure', () => {
  it('publishes heat times only on heat complete, with the closure report', async () => {
    const { server, repository } = await createHarness();
    const heat = await startSeededHeat(server, 1);
    const lastSequence = await captureHeatAtN(
      server,
      heat,
      [ENROLLMENT_1, ENROLLMENT_2],
      1,
    );
    const publishResult = jest.spyOn(repository, 'publishResult');
    const replaceResultSplits = jest.spyOn(repository, 'replaceResultSplits');

    const response = await post(
      server,
      `${BASE_PATH}/attempts/${heat.attempt.attemptId}/complete`,
    ).send({
      workstationInstanceId: WORKSTATION,
      lastIssuedSequence: lastSequence,
    });

    expect(response.status).toBe(200);
    const record = response.body as TimingAttemptRecordView;
    expect(record.state).toBe('COMPLETED');
    expect(record.officialStartedAt).not.toBeNull();
    expect(record.passes).toHaveLength(6);
    expect(record.passes.map((pass) => pass.lapNumber)).toEqual([
      1, 2, 3, 1, 2, 3,
    ]);
    expect(record.closureReport).toEqual({
      publishedEnrollmentIds: [],
      unpublishedEnrollmentIds: [ENROLLMENT_1, ENROLLMENT_2],
      conflictEnrollmentIds: [],
      publishedRegistrationIds: [REGISTRATION_1, REGISTRATION_2],
      conflictRegistrationIds: [],
    });
    // FR-27: a heat writes no ordinary result and no timing split.
    expect(record.publishedResults).toEqual([]);
    expect(repository.results).toEqual([]);
    expect(publishResult).not.toHaveBeenCalled();
    expect(replaceResultSplits).not.toHaveBeenCalled();

    // FR-25, FR-57: one total + OK per participant, no per-lap heat row.
    expect(repository.heatTimes).toHaveLength(2);
    expect(repository.heatTimes.map((row) => row.registrationId)).toEqual([
      REGISTRATION_1,
      REGISTRATION_2,
    ]);
    expect(repository.heatTimes[0]).toMatchObject({
      classCompetitionId: RACE_ID,
      stageId: STAGE_SEEDED,
      heatNumber: 1,
      timeMilliseconds: 3 * 10_000,
      status: 'OK',
    });
    expect(repository.heatTimes[1]).toMatchObject({
      classCompetitionId: RACE_ID,
      stageId: STAGE_SEEDED,
      heatNumber: 1,
      timeMilliseconds: 6 * 10_000,
      status: 'OK',
    });
    for (const heatTime of repository.heatTimes) {
      expect(typeof heatTime.id).toBe('string');
    }
    expect(repository.attempts[0]).toMatchObject({
      status: 'COMPLETED',
      closedByUserId: REFEREE_USER_ID,
    });
    expect(repository.audits.map((audit) => audit.row.action)).toContain(
      'COMPLETE',
    );
    // The closure keeps the event-wide capture hold for the next category.
    expect(repository.captureLock).not.toBeNull();

    const surface = await getSurface(server);
    const closed = surface.categories.find(
      (block) => block.attemptId === heat.attempt.attemptId,
    );
    expect(closed?.state).toBe('COMPLETED');
    expect(closed?.startControlEnabled).toBe(false);
  });

  it('force-completes and cancels a capture-less heat without publishing', async () => {
    const { server, repository } = await createHarness();
    const forced = await startSeededHeat(server, 2);

    const forceResponse = await post(
      server,
      `${BASE_PATH}/attempts/${forced.attempt.attemptId}/force-complete`,
      ADMIN,
    ).send({ reason: 'no time on the heat' });

    expect(forceResponse.status).toBe(200);
    const forcedRecord = forceResponse.body as TimingAttemptRecordView;
    expect(forcedRecord.state).toBe('INCOMPLETE');
    expect(forcedRecord.closureReport?.publishedRegistrationIds).toEqual([]);
    expect(forcedRecord.closureReport?.unpublishedEnrollmentIds).toEqual([
      ENROLLMENT_1,
      ENROLLMENT_2,
    ]);
    expect(forcedRecord.publishedResults).toEqual([]);
    expect(repository.heatTimes).toEqual([]);
    expect(repository.results).toEqual([]);

    // An administrative closure keeps the hold as well, so a new one is taken
    // only explicitly.
    expect(repository.captureLock).not.toBeNull();
    repository.takeLock(WORKSTATION, REFEREE_USER_ID);

    const cancelled = await startSeededHeat(server, 3);
    const cancelResponse = await post(
      server,
      `${BASE_PATH}/attempts/${cancelled.attempt.attemptId}/cancel`,
      ADMIN,
    ).send({ reason: 'heat restarted' });

    expect(cancelResponse.status).toBe(200);
    const cancelledRecord = cancelResponse.body as TimingAttemptRecordView;
    expect(cancelledRecord.state).toBe('CANCELLED');
    expect(cancelledRecord.closureReport?.publishedRegistrationIds).toEqual([]);
    expect(repository.heatTimes).toEqual([]);
    expect(repository.results).toEqual([]);

    // A cancelled heat frees the heat, so it can be timed again (E-21).
    repository.takeLock(WORKSTATION, REFEREE_USER_ID);
    const restarted = await startSeededHeat(server, 3);
    expect(restarted.attempt.attemptId).not.toBe(cancelled.attempt.attemptId);
    expect(
      repository.attempts.filter(
        (attempt) => attempt.heatNumber === 3 && attempt.attemptKind === 'HEAT',
      ),
    ).toHaveLength(2);
  });

  it('closes past a refused capture because the refusal writes a REJECTED receipt', async () => {
    const { server, repository } = await createHarness();
    const heat = await startSeededHeat(server, 1);

    const first = await captureTilePass(server, heat, ENROLLMENT_1, 1, 10_000);
    expect(first.status).toBe(201);

    // A refused capture below the attempt's later high-water mark: without its
    // REJECTED receipt this sequence would read as an unconfirmed mutation.
    const refused = await captureTilePass(
      server,
      heat,
      ENROLLMENT_3,
      2,
      20_000,
    );
    expectRefusal(refused, 404, TimingErrorCode.NOT_FOUND);
    expect(
      repository.receipts.find((receipt) => receipt.deviceSequence === 2),
    ).toMatchObject({ status: 'REJECTED', reason: 'NOT_FOUND' });
    expect(repository.marks).toHaveLength(1);

    let sequence = 2;
    for (let lap = 2; lap <= LAP_COUNT; lap += 1) {
      sequence += 1;
      const pass = await captureTilePass(
        server,
        heat,
        ENROLLMENT_1,
        sequence,
        sequence * 10_000,
      );
      expect(pass.status).toBe(201);
    }
    for (let lap = 1; lap <= LAP_COUNT; lap += 1) {
      sequence += 1;
      const pass = await captureTilePass(
        server,
        heat,
        ENROLLMENT_2,
        sequence,
        sequence * 10_000,
      );
      expect(pass.status).toBe(201);
    }
    expect(sequence).toBe(7);

    const completed = await post(
      server,
      `${BASE_PATH}/attempts/${heat.attempt.attemptId}/complete`,
    ).send({
      workstationInstanceId: WORKSTATION,
      lastIssuedSequence: sequence,
    });
    expect(completed.status).toBe(200);
    expect((completed.body as TimingAttemptRecordView).state).toBe('COMPLETED');
    expect(repository.heatTimes).toHaveLength(2);
  });

  it('closes past a refused assignment because the refusal writes a REJECTED receipt', async () => {
    const { server, repository } = await createHarness();
    const heat = await startSeededHeat(server, 1);

    const first = await captureTilePass(server, heat, ENROLLMENT_1, 1, 10_000);
    expect(first.status).toBe(201);
    const split = await captureAnonymousSplit(server, heat, 2, 20_000);

    const refused = await post(
      server,
      `${BASE_PATH}/splits/${split.passId}/assign`,
    ).send({
      startNumber: 999,
      workstationInstanceId: WORKSTATION,
      deviceSequence: 3,
    });
    const body = expectRefusal(refused, 400, TimingErrorCode.NUMBER_UNKNOWN);
    expect(body.details).toEqual({ startNumber: 999 });
    expect(
      repository.receipts.find((receipt) => receipt.deviceSequence === 3),
    ).toMatchObject({ status: 'REJECTED', reason: 'NUMBER_UNKNOWN' });
    // The entry stays queued at the same position.
    expect(
      repository.marks.find((row) => row.id === split.passId)?.status,
    ).toBe('PENDING');
    expect((await getSurface(server)).anonymousSplits).toHaveLength(1);

    const cancelled = await post(
      server,
      `${BASE_PATH}/splits/${split.passId}/cancel`,
    ).send({ reason: 'unknown number' });
    expect(cancelled.status).toBe(200);

    let sequence = 3;
    for (let lap = 2; lap <= LAP_COUNT; lap += 1) {
      sequence += 1;
      const pass = await captureTilePass(
        server,
        heat,
        ENROLLMENT_1,
        sequence,
        sequence * 10_000,
      );
      expect(pass.status).toBe(201);
    }
    for (let lap = 1; lap <= LAP_COUNT; lap += 1) {
      sequence += 1;
      const pass = await captureTilePass(
        server,
        heat,
        ENROLLMENT_2,
        sequence,
        sequence * 10_000,
      );
      expect(pass.status).toBe(201);
    }
    expect(sequence).toBe(8);

    const completed = await post(
      server,
      `${BASE_PATH}/attempts/${heat.attempt.attemptId}/complete`,
    ).send({
      workstationInstanceId: WORKSTATION,
      lastIssuedSequence: sequence,
    });
    expect(completed.status).toBe(200);
    expect((completed.body as TimingAttemptRecordView).state).toBe('COMPLETED');
    expect(repository.heatTimes).toHaveLength(2);
  });

  it('still refuses closure when a real sequence has no receipt at all', async () => {
    const { server, repository } = await createHarness();
    const heat = await startSeededHeat(server, 1);
    const sequence = await captureHeatAtN(
      server,
      heat,
      [ENROLLMENT_1, ENROLLMENT_2],
      1,
    );
    // Negative control: a mutation whose receipt never landed stays a gap, so
    // the closure gate is not weakened by the rejected-receipt path above.
    repository.receipts = [];

    const blocked = await post(
      server,
      `${BASE_PATH}/attempts/${heat.attempt.attemptId}/complete`,
    ).send({
      workstationInstanceId: WORKSTATION,
      lastIssuedSequence: sequence,
    });
    const body = expectRefusal(
      blocked,
      409,
      TimingErrorCode.UNCONFIRMED_MUTATIONS,
    );
    expect(
      (body.details as { missingSequences: number[] }).missingSequences,
    ).toEqual([1, 2, 3, 4, 5, 6]);
    expect(repository.attempts[0].status).toBe('RUNNING');
    expect(repository.heatTimes).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Concurrency and authorization                                              */
/* -------------------------------------------------------------------------- */

describe('timing API integration: concurrency and authorization', () => {
  it('runs a heat attempt beside a category attempt of the same race', async () => {
    const { server } = await createHarness();

    const heat = await startSeededHeat(server, 1);

    const categoryResponse = await post(server, `${BASE_PATH}/attempts`).send({
      startId: START_ID,
      formatId: FORMAT_ID,
      gender: 'M',
      workstationInstanceId: WORKSTATION,
      clientStartedAt: CLIENT_STARTED_AT,
    });
    expect(categoryResponse.status).toBe(201);
    const category = categoryResponse.body as StartTimingAttemptResult;
    expect(category.attempt.attemptId).not.toBe(heat.attempt.attemptId);
    expect(category.attempt.kind).toBeUndefined();
    expect(category.attempt.state).toBe('RUNNING');

    const surface = await getSurface(server);
    const heatBlock = surface.categories.find(
      (block) => block.attemptId === heat.attempt.attemptId,
    );
    const categoryBlock = surface.categories.find(
      (block) => block.attemptId === category.attempt.attemptId,
    );
    expect(heatBlock?.kind).toBe('HEAT');
    expect(heatBlock?.state).toBe('RUNNING');
    expect(categoryBlock?.kind).toBeUndefined();
    expect(categoryBlock?.state).toBe('RUNNING');

    // Both attempts keep an independent clock, sequence and target.
    const inHeat = await captureTilePass(server, heat, ENROLLMENT_1, 1, 10_000);
    expect(inHeat.status).toBe(201);
    expect((inHeat.body as TimingPassView).attemptId).toBe(
      heat.attempt.attemptId,
    );
    const inCategory = await captureTilePass(
      server,
      category,
      ENROLLMENT_3,
      1,
      10_000,
    );
    expect(inCategory.status).toBe(201);
    expect((inCategory.body as TimingPassView).attemptId).toBe(
      category.attempt.attemptId,
    );
  });

  it('keeps the routes for a referee and an administrator and refuses an organizer', async () => {
    const { server, repository } = await createHarness();

    expect((await request(server).get(BASE_PATH)).status).toBe(401);
    expect((await get(server, BASE_PATH, REFEREE)).status).toBe(200);
    expect((await get(server, BASE_PATH, ADMIN)).status).toBe(200);

    const organizer = await post(
      server,
      `${BASE_PATH}/heat-attempts`,
      ORGANIZER,
    ).send(heatRequest(1));
    expect(organizer.status).toBe(403);
    expect(repository.attempts).toHaveLength(0);

    const heat = await startSeededHeat(server, 1, REFEREE);

    // Force-completion is administrator-only, so a referee is refused there.
    const refereeForce = await post(
      server,
      `${BASE_PATH}/attempts/${heat.attempt.attemptId}/force-complete`,
      REFEREE,
    ).send({ reason: 'no time on the heat' });
    expect(refereeForce.status).toBe(403);

    const adminForce = await post(
      server,
      `${BASE_PATH}/attempts/${heat.attempt.attemptId}/force-complete`,
      ADMIN,
    ).send({ reason: 'no time on the heat' });
    expect(adminForce.status).toBe(200);
    expect((adminForce.body as TimingAttemptRecordView).state).toBe(
      'INCOMPLETE',
    );

    repository.takeLock(WORKSTATION, ADMIN_USER_ID);
    const adminHeat = await startSeededHeat(server, 2, ADMIN);
    expect(adminHeat.attempt.heatNumber).toBe(2);
  });
});
