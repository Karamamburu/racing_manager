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
import { isRecordableRegistrationStatus } from '../registrations/registration-status';
import {
  parseUpsertResultBody,
  type ParsedUpsertResult,
  type ResultOutcomeCode,
} from './parse-upsert-result';
import { logEvent } from '../logging/log-event';
import type { Prisma } from '../../generated/prisma';

export type ResultResponse = {
  id: string;
  enrollmentId: string;
  registrationId: string;
  outcome: ResultOutcomeCode;
  timeMilliseconds: number | null;
  recordedAt: string;
  updatedAt: string;
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
    await this.requireRecordableEvent(eventId);

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

    const bracket = await this.prisma.classCompetition.findFirst({
      where: {
        eventId,
        gender: enrollment.registration.gender,
        formatId: enrollment.formatId,
      },
      select: { id: true },
    });
    if (bracket) {
      throw new BadRequestException(
        'Это многоэтапная гонка. Время записывается в заезд, а не общим результатом.',
      );
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

  private async writeEnrollmentResult(
    tx: Prisma.TransactionClient,
    input: {
      enrollmentId: string;
      registrationId: string;
      outcome: ResultOutcomeCode;
      timeMilliseconds: number | null;
    },
  ): Promise<void> {
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
      return;
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
      return;
    }

    await tx.$executeRaw`
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
    `;
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
    };
  }
}
