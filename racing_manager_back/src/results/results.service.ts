import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ADMIN_ROLE_CODES } from '../auth/role-codes';
import { RolesService } from '../auth/roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { isActiveRegistrationStatus } from '../registrations/registration-status';
import { parseUpsertResultBody } from './parse-upsert-result';

export type ResultResponse = {
  id: string;
  registrationId: string;
  timeMilliseconds: number;
  recordedAt: string;
  updatedAt: string;
};

type StoredResult = {
  id: string;
  registrationId: string;
  timeMilliseconds: number;
  recordedAt: Date;
  updatedAt: Date;
};

type EventStatusRow = {
  id: string;
  status: string;
};

type RegistrationForResult = {
  id: string;
  eventId: string;
  startNumber: number | null;
  status: string;
};

type ResultsStore = {
  event: {
    findUnique: (args: {
      where: { id: string };
      select: { id: true; status: true };
    }) => Promise<EventStatusRow | null>;
  };
  registration: {
    findFirst: (args: object) => Promise<RegistrationForResult | null>;
  };
  result: {
    upsert: (args: {
      where: { registrationId: string };
      create: { registrationId: string; timeMilliseconds: number };
      update: { timeMilliseconds: number };
    }) => Promise<StoredResult>;
  };
};

@Injectable()
export class ResultsService {
  private readonly store: ResultsStore;

  constructor(
    prisma: PrismaService,
    private readonly rolesService: RolesService,
  ) {
    this.store = prisma as unknown as ResultsStore;
  }

  async upsert(
    authentikId: string | undefined,
    eventId: string,
    registrationId: string,
    body: unknown,
  ): Promise<ResultResponse> {
    await this.rolesService.assertHasAnyRole(authentikId, ADMIN_ROLE_CODES);
    const parsed = parseUpsertResultBody(body);
    await this.requireRecordableEvent(eventId);

    const registration = await this.store.registration.findFirst({
      where: { id: registrationId, eventId },
    });
    if (!registration) {
      throw new NotFoundException('Registration not found.');
    }
    if (!isActiveRegistrationStatus(registration.status)) {
      throw new BadRequestException(
        'Only an active registration can receive a result.',
      );
    }
    if (registration.startNumber == null) {
      throw new BadRequestException(
        'A start number must be assigned before recording a result.',
      );
    }

    const saved = await this.store.result.upsert({
      where: { registrationId: registration.id },
      create: {
        registrationId: registration.id,
        timeMilliseconds: parsed.timeMilliseconds,
      },
      update: { timeMilliseconds: parsed.timeMilliseconds },
    });

    return this.toResponse(saved);
  }

  private async requireRecordableEvent(eventId: string): Promise<EventStatusRow> {
    const event = await this.store.event.findUnique({
      where: { id: eventId },
      select: { id: true, status: true },
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

  private toResponse(row: StoredResult): ResultResponse {
    return {
      id: row.id,
      registrationId: row.registrationId,
      timeMilliseconds: row.timeMilliseconds,
      recordedAt: row.recordedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
