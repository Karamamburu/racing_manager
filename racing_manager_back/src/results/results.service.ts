import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ADMIN_ROLE_CODES } from '../auth/role-codes';
import { RolesService } from '../auth/roles.service';
import {
  PAST_COMPLETED_EVENT_LOCKED_MESSAGE,
  isPastCompletedEvent,
} from '../events/event-status';
import { PrismaService } from '../prisma/prisma.service';
import {
  categoryIsFinished,
  CATEGORY_FINISHED_MESSAGE,
} from '../events/category-finish';
import {
  categoriesFromStoredRows,
  convertLegacySections,
  resolveControlYear,
} from '../events/age-groups';
import {
  currentPlacement,
  racePlacementForRow,
} from '../class-competitions/race-scope';
import { isRecordableRegistrationStatus } from '../registrations/registration-status';
import {
  parseUpsertResultBody,
  type ParsedUpsertResult,
  type ResultOutcomeCode,
} from './parse-upsert-result';
import { logEvent } from '../logging/log-event';
import type { Prisma } from '../../generated/prisma';

/**
 * One published timing split returned with a manual result write.
 *
 * A manual write clears the stored splits, so this list is empty for every
 * result the route writes; the field stays additive beside the existing keys.
 */
export type ResultLapSplit = {
  lapNumber: number;
  lapTimeMs: number;
  cumulativeMs: number;
};

export type ResultResponse = {
  id: string;
  enrollmentId: string;
  registrationId: string;
  outcome: ResultOutcomeCode;
  timeMilliseconds: number | null;
  recordedAt: string;
  updatedAt: string;
  laps?: ResultLapSplit[];
};

type EventForResult = {
  id: string;
  status: string;
  eventDate: Date;
};

type RegistrationForResult = {
  id: string;
  startNumber: number | null;
  gender: string;
  status: string;
};

type StoredResult = {
  id: string;
  enrollmentId: string | null;
  registrationId: string;
  recordedAt: Date;
  updatedAt: Date;
  splits: ResultLapSplit[];
};

@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
  ) {}

  async upsert(
    authentikId: string | undefined,
    eventId: string,
    enrollmentId: string,
    body: unknown,
  ): Promise<ResultResponse> {
    await this.rolesService.assertHasAnyRole(authentikId, ADMIN_ROLE_CODES);
    const parsed = parseUpsertResultBody(body);
    const event = await this.requireRecordableEvent(eventId);

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { id: enrollmentId, eventId },
      select: {
        id: true,
        registrationId: true,
        startId: true,
        formatId: true,
        status: true,
        registration: {
          select: {
            id: true,
            startNumber: true,
            gender: true,
            birthYear: true,
            status: true,
          },
        },
      },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found.');
    }
    if (enrollment.status === 'WITHDRAWN') {
      throw new BadRequestException(
        'Cannot record a result for a withdrawn enrollment.',
      );
    }

    const bracket = await this.prisma.classCompetition.findMany({
      where: {
        eventId,
        startId: enrollment.startId,
        formatId: enrollment.formatId,
        gender: enrollment.registration.gender,
      },
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
    });
    if (bracket.length > 0) {
      const categoryRows = await this.prisma.ageSplitCategory.findMany({
        where: {
          eventId,
          startId: enrollment.startId,
          formatId: enrollment.formatId,
          gender: enrollment.registration.gender,
        },
        select: { categoryNumber: true, groupId: true },
        orderBy: [{ categoryNumber: 'asc' }, { groupId: 'asc' }],
      });
      const legacyRows =
        categoryRows.length > 0
          ? []
          : await this.prisma.ageSplitSection.findMany({
              where: {
                eventId,
                startId: enrollment.startId,
                formatId: enrollment.formatId,
                gender: enrollment.registration.gender,
              },
              select: { sectionId: true, sectionKind: true, sortOrder: true },
              orderBy: { sortOrder: 'asc' },
            });
      const categories =
        categoryRows.length > 0
          ? categoriesFromStoredRows(categoryRows)
          : convertLegacySections(legacyRows);
      const placement = currentPlacement(
        enrollment.registration.birthYear,
        resolveControlYear(event.eventDate),
        categories,
      );
      const displayed = racePlacementForRow(bracket, {
        enrollmentId: enrollment.id,
        registrationId: enrollment.registrationId,
        placement,
      });
      if (displayed) {
        throw new BadRequestException(
          'Это многоэтапная гонка. Время записывается в заезд, а не общим результатом.',
        );
      }
    }
    if (
      await categoryIsFinished(
        this.prisma,
        eventId,
        enrollment.formatId,
        enrollment.registration.gender,
        enrollment.startId,
      )
    ) {
      throw new BadRequestException(CATEGORY_FINISHED_MESSAGE);
    }
    this.assertRecordableRegistration(enrollment.registration);

    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM enrollments WHERE id = ${enrollment.id}::uuid FOR UPDATE`;
      const current = await tx.enrollment.findFirst({
        where: { id: enrollment.id },
        select: { status: true },
      });
      if (!current) {
        throw new NotFoundException('Enrollment not found.');
      }
      if (current.status === 'WITHDRAWN') {
        throw new BadRequestException(
          'Cannot record a result for a withdrawn enrollment.',
        );
      }

      await this.writeEnrollmentResult(tx, {
        enrollmentId: enrollment.id,
        registrationId: enrollment.registrationId,
        outcome: parsed.outcome,
        timeMilliseconds: parsed.timeMilliseconds,
      });

      const row = await tx.result.findUnique({
        where: { enrollmentId: enrollment.id },
        select: {
          id: true,
          enrollmentId: true,
          registrationId: true,
          recordedAt: true,
          updatedAt: true,
          splits: {
            select: {
              lapNumber: true,
              lapTimeMs: true,
              cumulativeMs: true,
            },
            orderBy: { lapNumber: 'asc' },
          },
        },
      });
      if (!row) {
        throw new Error('Enrollment result upsert did not persist.');
      }
      return row;
    });

    logEvent(this.logger, {
      event: 'result.upserted',
      eventId,
      enrollmentId: enrollment.id,
      registrationId: enrollment.registrationId,
      outcome: parsed.outcome,
      userSub: authentikId,
    });
    return this.toResponse(saved, enrollment.id, parsed);
  }

  /**
   * Writes the enrollment's authoritative result and clears its timing splits.
   *
   * A manual entry owns the total, not the split detail, so every written or
   * adopted result loses its stale `result_splits` rows in the same
   * transaction (AD-4). The three paths mirror the existing upsert semantics:
   * the enrollment's own row, a legacy registration-only row adopted for the
   * enrollment, or a new row.
   */
  private async writeEnrollmentResult(
    tx: Prisma.TransactionClient,
    input: {
      enrollmentId: string;
      registrationId: string;
      outcome: ResultOutcomeCode;
      timeMilliseconds: number | null;
    },
  ): Promise<void> {
    const resultId = await this.upsertResultRow(tx, input);
    await tx.$executeRaw`
      DELETE FROM result_splits WHERE result_id = ${resultId}::uuid
    `;
  }

  private async upsertResultRow(
    tx: Prisma.TransactionClient,
    input: {
      enrollmentId: string;
      registrationId: string;
      outcome: ResultOutcomeCode;
      timeMilliseconds: number | null;
    },
  ): Promise<string> {
    const existing = await tx.result.findUnique({
      where: { enrollmentId: input.enrollmentId },
      select: { id: true },
    });
    if (existing) {
      await tx.$executeRaw`
        UPDATE results SET
          outcome = ${input.outcome}::result_outcome,
          time_milliseconds = ${input.timeMilliseconds},
          place = NULL,
          updated_at = now()
        WHERE id = ${existing.id}::uuid
      `;
      return existing.id;
    }

    const legacy = await tx.result.findFirst({
      where: {
        registrationId: input.registrationId,
        enrollmentId: null,
      },
      select: { id: true },
    });
    if (legacy) {
      await tx.$executeRaw`
        UPDATE results SET
          enrollment_id = ${input.enrollmentId}::uuid,
          outcome = ${input.outcome}::result_outcome,
          time_milliseconds = ${input.timeMilliseconds},
          place = NULL,
          updated_at = now()
        WHERE id = ${legacy.id}::uuid
      `;
      return legacy.id;
    }

    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO results (
        registration_id,
        enrollment_id,
        outcome,
        time_milliseconds,
        place
      )
      VALUES (
        ${input.registrationId}::uuid,
        ${input.enrollmentId}::uuid,
        ${input.outcome}::result_outcome,
        ${input.timeMilliseconds},
        NULL
      )
      RETURNING id
    `;
    const created = inserted[0];
    if (!created) {
      throw new Error('New result row was not inserted.');
    }
    return created.id;
  }

  private assertRecordableRegistration(registration: RegistrationForResult) {
    if (!isRecordableRegistrationStatus(registration.status)) {
      throw new BadRequestException(
        'Only a confirmed or racing registration can receive a result.',
      );
    }
    if (registration.startNumber == null) {
      throw new BadRequestException(
        'A start number must be assigned before recording a result.',
      );
    }
  }

  private async requireRecordableEvent(
    eventId: string,
  ): Promise<EventForResult> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        status: true,
        eventDate: true,
      },
    });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
    if (event.status === 'CANCELLED') {
      throw new BadRequestException(
        'Cannot record results for a cancelled event.',
      );
    }
    if (isPastCompletedEvent(event.status, event.eventDate)) {
      throw new BadRequestException(PAST_COMPLETED_EVENT_LOCKED_MESSAGE);
    }
    return event;
  }

  private toResponse(
    row: StoredResult,
    enrollmentId: string,
    parsed: ParsedUpsertResult,
  ): ResultResponse {
    return {
      id: row.id,
      enrollmentId,
      registrationId: row.registrationId,
      outcome: parsed.outcome,
      timeMilliseconds: parsed.timeMilliseconds,
      recordedAt: row.recordedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      laps: row.splits.map((split) => ({
        lapNumber: split.lapNumber,
        lapTimeMs: split.lapTimeMs,
        cumulativeMs: split.cumulativeMs,
      })),
    };
  }
}
