import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ADMIN_ROLE_CODES } from '../auth/role-codes';
import { RolesService } from '../auth/roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { isRecordableRegistrationStatus } from '../registrations/registration-status';
import { parseUpsertResultBody } from './parse-upsert-result';

export type ResultLapResponse = {
  lapNumber: number;
  timeMilliseconds: number;
};

export type ResultResponse = {
  id: string;
  registrationId: string;
  timeMilliseconds: number;
  recordedAt: string;
  updatedAt: string;
  laps: ResultLapResponse[];
};

type StoredResult = {
  id: string;
  registrationId: string;
  timeMilliseconds: number;
  recordedAt: Date;
  updatedAt: Date;
  laps?: {
    timeMilliseconds: number;
    eventLap: { lapNumber: number };
  }[];
};

type EventForResult = {
  id: string;
  status: string;
  laps: { id: string; lapNumber: number }[];
};

type RegistrationForResult = {
  id: string;
  eventId: string;
  startNumber: number | null;
  status: string;
};

@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
  ) {}

  async upsert(
    authentikId: string | undefined,
    eventId: string,
    registrationId: string,
    body: unknown,
  ): Promise<ResultResponse> {
    await this.rolesService.assertHasAnyRole(authentikId, ADMIN_ROLE_CODES);
    const parsed = parseUpsertResultBody(body);
    const event = await this.requireRecordableEvent(eventId);

    const registration = await this.prisma.registration.findFirst({
      where: { id: registrationId, eventId },
      select: {
        id: true,
        eventId: true,
        startNumber: true,
        status: true,
      },
    });
    if (!registration) {
      throw new NotFoundException('Registration not found.');
    }
    this.assertRecordableRegistration(registration);

    if (event.laps.length > 0) {
      if (parsed.mode !== 'laps') {
        throw new BadRequestException(
          'This event records results by lap. Send laps instead of timeMilliseconds.',
        );
      }
      return this.upsertLapTimes(registration.id, event.laps, parsed.laps);
    }

    if (parsed.mode !== 'total') {
      throw new BadRequestException(
        'This event has no laps. Send timeMilliseconds.',
      );
    }

    const saved = await this.prisma.result.upsert({
      where: { registrationId: registration.id },
      create: {
        registrationId: registration.id,
        timeMilliseconds: parsed.timeMilliseconds,
      },
      update: { timeMilliseconds: parsed.timeMilliseconds },
    });

    return this.toResponse(saved, []);
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

  private async requireRecordableEvent(eventId: string): Promise<EventForResult> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        status: true,
        laps: {
          select: { id: true, lapNumber: true },
          orderBy: { lapNumber: 'asc' },
        },
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
    return event;
  }

  private async upsertLapTimes(
    registrationId: string,
    eventLaps: { id: string; lapNumber: number }[],
    incoming: { lapNumber: number; timeMilliseconds: number }[],
  ): Promise<ResultResponse> {
    const lapsByNumber = new Map(
      eventLaps.map((lap) => [lap.lapNumber, lap]),
    );
    for (const lap of incoming) {
      if (!lapsByNumber.has(lap.lapNumber)) {
        throw new BadRequestException(
          `lapNumber ${lap.lapNumber} does not belong to this event.`,
        );
      }
    }

    const saved = await this.prisma.$transaction(async (tx) => {
      let result = await tx.result.findUnique({
        where: { registrationId },
      });
      const firstTime = incoming[0]?.timeMilliseconds;
      if (!result) {
        if (firstTime == null) {
          throw new BadRequestException('laps must be a non-empty array.');
        }
        result = await tx.result.create({
          data: {
            registrationId,
            timeMilliseconds: firstTime,
          },
        });
      }

      for (const lap of incoming) {
        const eventLap = lapsByNumber.get(lap.lapNumber);
        if (!eventLap) continue;
        await tx.resultLap.upsert({
          where: {
            resultId_eventLapId: {
              resultId: result.id,
              eventLapId: eventLap.id,
            },
          },
          create: {
            resultId: result.id,
            eventLapId: eventLap.id,
            timeMilliseconds: lap.timeMilliseconds,
          },
          update: { timeMilliseconds: lap.timeMilliseconds },
        });
      }

      const storedLaps = await tx.resultLap.findMany({
        where: { resultId: result.id },
        select: {
          timeMilliseconds: true,
          eventLap: { select: { lapNumber: true } },
        },
      });
      const total = storedLaps.reduce(
        (sum, lap) => sum + lap.timeMilliseconds,
        0,
      );
      if (total <= 0) {
        throw new BadRequestException(
          'timeMilliseconds must be an integer greater than 0.',
        );
      }
      if (total > 24 * 60 * 60 * 1000) {
        throw new BadRequestException(
          'timeMilliseconds must be at most 24 hours.',
        );
      }

      const updated = await tx.result.update({
        where: { id: result.id },
        data: { timeMilliseconds: total },
      });

      return { ...updated, laps: storedLaps };
    });

    return this.toResponse(
      saved,
      (saved.laps ?? [])
        .map((lap) => ({
          lapNumber: lap.eventLap.lapNumber,
          timeMilliseconds: lap.timeMilliseconds,
        }))
        .sort((a, b) => a.lapNumber - b.lapNumber),
    );
  }

  private toResponse(
    row: StoredResult,
    laps: ResultLapResponse[],
  ): ResultResponse {
    return {
      id: row.id,
      registrationId: row.registrationId,
      timeMilliseconds: row.timeMilliseconds,
      recordedAt: row.recordedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      laps,
    };
  }
}
