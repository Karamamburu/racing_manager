import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClassCompetitionStatus, ClassHeatResultStatus, Prisma } from '../../generated/prisma';
import { ADMIN_ROLE_CODES } from '../auth/role-codes';
import { RolesService } from '../auth/roles.service';
import {
  PAST_COMPLETED_EVENT_LOCKED_MESSAGE,
  isPastCompletedEvent,
} from '../events/event-status';
import { PrismaService } from '../prisma/prisma.service';
import { ACTIVE_REGISTRATION_STATUSES } from '../registrations/registration-status';
import { classifyBracket, lastOkTimes } from './classify-bracket';
import { CmsClient } from './cms.client';
import { CmsCompetition, CmsStageSpec } from './cms.types';
import {
  ParsedHeatTimes,
  parseCreateClassCompetitionBody,
  parseHeatAssignmentBody,
  parseHeatTimesBody,
  parsePlanChangeBody,
} from './parse-class-competition';
import { buildAddStageOp } from './stage-templates';

type StoredEvent = {
  id: string;
  name: string;
  status: string;
  eventDate: Date;
  registrationClose: Date | null;
};

type StoredRegistration = {
  id: string;
  firstName: string;
  lastName: string;
  startNumber: number | null;
  gender: string;
  formatId: number | null;
};

type StoredHeatTime = {
  stageId: string;
  heatNumber: number;
  registrationId: string;
  timeMilliseconds: number | null;
  status: ClassHeatResultStatus;
};

type StoredClassCompetition = {
  id: string;
  eventId: string;
  formatId: number | null;
  gender: string;
  cmsCompetitionId: string;
  status: ClassCompetitionStatus;
  event: StoredEvent;
  heatTimes: StoredHeatTime[];
};

const classCompetitionInclude = {
  event: {
    select: {
      id: true,
      name: true,
      status: true,
      eventDate: true,
      registrationClose: true,
    },
  },
  heatTimes: {
    select: {
      stageId: true,
      heatNumber: true,
      registrationId: true,
      timeMilliseconds: true,
      status: true,
    },
  },
} satisfies Prisma.ClassCompetitionInclude;

export type ClassCompetitionView = {
  id: string;
  eventId: string;
  formatId: number | null;
  gender: string;
  status: ClassCompetitionStatus;
  stages: Array<{
    stageId: string;
    kind: string;
    label: string | null;
    status: string;
    heats: Array<{
      heatNumber: number;
      slots: Array<{
        position: number;
        registrationId: string;
        firstName: string;
        lastName: string;
        startNumber: number | null;
        timeMilliseconds: number | null;
        resultStatus: string | null;
      }>;
    }>;
    entries: Array<{
      registrationId: string;
      firstName: string;
      lastName: string;
      startNumber: number | null;
      seed: number;
      eliminated: boolean;
    }>;
  }>;
  classification: Array<{
    registrationId: string;
    place: number;
    timeMilliseconds: number | null;
  }>;
};

@Injectable()
export class ClassCompetitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: RolesService,
    private readonly cms: CmsClient,
  ) {}

  async list(eventId: string): Promise<ClassCompetitionView[]> {
    await this.requireEvent(eventId);
    const rows = await this.prisma.classCompetition.findMany({
      where: { eventId },
      include: classCompetitionInclude,
      orderBy: [{ formatId: 'asc' }, { gender: 'asc' }],
    });
    const registrations = await this.loadRegistrations(eventId);
    const views: ClassCompetitionView[] = [];
    for (const row of rows) {
      const cms = await this.cms.getCompetition(row.cmsCompetitionId);
      views.push(this.toView(row, cms, registrations));
    }
    return views;
  }

  async create(
    authentikId: string | undefined,
    eventId: string,
    body: unknown,
  ): Promise<ClassCompetitionView> {
    await this.rolesService.assertHasAnyRole(authentikId, ADMIN_ROLE_CODES);
    const parsed = parseCreateClassCompetitionBody(body);
    const event = await this.requireEvent(eventId);
    this.assertMutableEvent(event);
    this.assertRegistrationClosed(event);
    this.assertFormatBelongs(event, parsed.formatId);

    const registrations = await this.loadRegistrations(eventId);
    const starters = registrations.filter(
      (registration) =>
        registration.gender === parsed.gender &&
        registration.formatId === parsed.formatId &&
        (ACTIVE_REGISTRATION_STATUSES as readonly string[]).includes(
          registration.status ?? '',
        ),
    );
    if (starters.some((registration) => registration.startNumber == null)) {
      throw new BadRequestException(
        'Перед формированием сетки выдайте стартовый номер каждому участнику.',
      );
    }
    if (starters.length === 0) {
      throw new BadRequestException('В этой категории нет участников для сетки.');
    }

    const existing = await this.prisma.classCompetition.findFirst({
      where: { eventId, gender: parsed.gender, formatId: parsed.formatId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Для этой категории многоэтапная гонка уже создана.');
    }

    const formatName = event.eventFormats.find((item) => item.formatId === parsed.formatId);
    const cms = await this.cms.createCompetition({
      name: [event.name, formatName?.format.name, parsed.gender].filter(Boolean).join(' · '),
      participants: starters.map((registration) => ({
        id: registration.id,
        seed: registration.startNumber as number,
      })),
    });

    try {
      const created = await this.prisma.classCompetition.create({
        data: {
          eventId,
          formatId: parsed.formatId,
          gender: parsed.gender,
          cmsCompetitionId: cms.id,
          status: cms.status,
        },
        include: classCompetitionInclude,
      });
      return this.toView(created, cms, registrations);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Для этой категории многоэтапная гонка уже создана.');
      }
      throw error;
    }
  }

  async updatePlan(
    authentikId: string | undefined,
    eventId: string,
    classCompetitionId: string,
    body: unknown,
  ): Promise<ClassCompetitionView> {
    await this.rolesService.assertHasAnyRole(authentikId, ADMIN_ROLE_CODES);
    const parsed = parsePlanChangeBody(body);
    const row = await this.requireOwned(eventId, classCompetitionId);
    this.assertMutableEvent(row.event);
    const current = await this.cms.getCompetition(row.cmsCompetitionId);
    const next = await this.cms.updatePlan(
      row.cmsCompetitionId,
      'removeStageIds' in parsed
        ? { removeStageIds: parsed.removeStageIds }
        : {
            addStages: [
              buildAddStageOp(parsed.addStage, current.format.stages, current.participants.length),
            ],
          },
    );
    await this.persistOutcome(row.id, next);
    return this.toView(await this.reload(row.id), next, await this.loadRegistrations(eventId));
  }

  async seedStage(
    authentikId: string | undefined,
    eventId: string,
    classCompetitionId: string,
    stageId: string,
  ): Promise<ClassCompetitionView> {
    await this.rolesService.assertHasAnyRole(authentikId, ADMIN_ROLE_CODES);
    const row = await this.requireOwned(eventId, classCompetitionId);
    this.assertMutableEvent(row.event);
    const next = await this.cms.seedStage(row.cmsCompetitionId, stageId);
    await this.persistOutcome(row.id, next);
    return this.toView(await this.reload(row.id), next, await this.loadRegistrations(eventId));
  }

  async reassignHeats(
    authentikId: string | undefined,
    eventId: string,
    classCompetitionId: string,
    stageId: string,
    body: unknown,
  ): Promise<ClassCompetitionView> {
    await this.rolesService.assertHasAnyRole(authentikId, ADMIN_ROLE_CODES);
    const parsed = parseHeatAssignmentBody(body);
    const row = await this.requireOwned(eventId, classCompetitionId);
    this.assertMutableEvent(row.event);
    const next = await this.cms.reassignHeats(
      row.cmsCompetitionId,
      stageId,
      parsed.heats.map((heat) => ({
        heatNumber: heat.heatNumber,
        participantIds: heat.registrationIds,
      })),
    );
    await this.moveHeatTimes(row.id, stageId, parsed.heats);
    await this.persistOutcome(row.id, next);
    return this.toView(await this.reload(row.id), next, await this.loadRegistrations(eventId));
  }

  async recordHeatTimes(
    authentikId: string | undefined,
    eventId: string,
    classCompetitionId: string,
    stageId: string,
    body: unknown,
  ): Promise<ClassCompetitionView> {
    await this.rolesService.assertHasAnyRole(authentikId, ADMIN_ROLE_CODES);
    const parsed = parseHeatTimesBody(body);
    const row = await this.requireOwned(eventId, classCompetitionId);
    this.assertMutableEvent(row.event);
    const current = await this.cms.getCompetition(row.cmsCompetitionId);
    const stage = current.stages.find((item) => item.stageId === stageId);
    if (!stage || stage.status !== 'SEEDED') {
      throw new BadRequestException('Время можно записать только после формирования заездов.');
    }
    const heatByRegistration = new Map<string, number>();
    for (const heat of stage.heats) {
      for (const slot of heat.slots) {
        heatByRegistration.set(slot.participantId, heat.heatNumber);
      }
    }
    this.assertEntriesMatchHeats(parsed, heatByRegistration);
    await this.upsertHeatTimes(row.id, stageId, parsed);

    if (!parsed.commit) {
      return this.toView(
        await this.reload(row.id),
        current,
        await this.loadRegistrations(eventId),
      );
    }

    const stored = await this.prisma.classHeatTime.findMany({
      where: { classCompetitionId: row.id, stageId },
    });
    const byRegistration = new Map(stored.map((item) => [item.registrationId, item]));
    for (const [registrationId, heatNumber] of heatByRegistration) {
      const item = byRegistration.get(registrationId);
      if (!item || item.heatNumber !== heatNumber || (item.status === 'OK' && item.timeMilliseconds == null)) {
        throw new BadRequestException(
          'Перед фиксацией этапа укажите время или статус DNS, DNF, DSQ каждому участнику.',
        );
      }
    }

    const registrations = await this.loadRegistrations(eventId);
    const startNumbers = new Map(registrations.map((item) => [item.id, item.startNumber]));
    const heatResults = stage.heats.map((heat) => {
      const finished = heat.slots
        .map((slot) => byRegistration.get(slot.participantId))
        .filter((item): item is NonNullable<typeof item> => item != null && item.status === 'OK')
        .sort((a, b) => {
          const byTime = (a.timeMilliseconds ?? 0) - (b.timeMilliseconds ?? 0);
          if (byTime !== 0) return byTime;
          return (
            (startNumbers.get(a.registrationId) ?? Number.POSITIVE_INFINITY) -
            (startNumbers.get(b.registrationId) ?? Number.POSITIVE_INFINITY)
          );
        });
      const placeById = new Map(finished.map((item, index) => [item.registrationId, index + 1]));
      return {
        heatNumber: heat.heatNumber,
        results: heat.slots.map((slot) => {
          const item = byRegistration.get(slot.participantId);
          const status = item?.status ?? 'DNS';
          return {
            participantId: slot.participantId,
            status,
            ...(status === 'OK' ? { place: placeById.get(slot.participantId) } : {}),
          };
        }),
      };
    });

    await this.cms.recordResults(row.cmsCompetitionId, stageId, heatResults);
    const advanced = await this.cms.advanceStage(row.cmsCompetitionId, stageId);
    await this.persistOutcome(row.id, advanced);
    return this.toView(await this.reload(row.id), advanced, registrations);
  }

  private assertEntriesMatchHeats(
    parsed: ParsedHeatTimes,
    heatByRegistration: Map<string, number>,
  ) {
    for (const entry of parsed.entries) {
      const heatNumber = heatByRegistration.get(entry.registrationId);
      if (heatNumber == null || heatNumber !== entry.heatNumber) {
        throw new BadRequestException('Участник не состоит в указанном заезде.');
      }
    }
  }

  private async upsertHeatTimes(
    classCompetitionId: string,
    stageId: string,
    parsed: ParsedHeatTimes,
  ) {
    await this.prisma.$transaction(async (tx) => {
      for (const entry of parsed.entries) {
        await tx.classHeatTime.upsert({
          where: {
            classCompetitionId_stageId_heatNumber_registrationId: {
              classCompetitionId,
              stageId,
              heatNumber: entry.heatNumber,
              registrationId: entry.registrationId,
            },
          },
          create: {
            classCompetitionId,
            stageId,
            heatNumber: entry.heatNumber,
            registrationId: entry.registrationId,
            status: entry.status,
            timeMilliseconds: entry.timeMilliseconds,
          },
          update: {
            status: entry.status,
            timeMilliseconds: entry.timeMilliseconds,
          },
        });
      }
    });
  }

  private async moveHeatTimes(
    classCompetitionId: string,
    stageId: string,
    heats: Array<{ heatNumber: number; registrationIds: string[] }>,
  ) {
    const existing = await this.prisma.classHeatTime.findMany({
      where: { classCompetitionId, stageId },
    });
    const byRegistration = new Map(existing.map((row) => [row.registrationId, row]));
    const next = heats.flatMap((heat) =>
      heat.registrationIds.flatMap((registrationId) => {
        const previous = byRegistration.get(registrationId);
        if (!previous) return [];
        return [
          {
            classCompetitionId,
            stageId,
            heatNumber: heat.heatNumber,
            registrationId,
            status: previous.status,
            timeMilliseconds: previous.timeMilliseconds,
          },
        ];
      }),
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.classHeatTime.deleteMany({ where: { classCompetitionId, stageId } });
      if (next.length > 0) {
        await tx.classHeatTime.createMany({ data: next });
      }
    });
  }

  private async persistOutcome(id: string, cms: CmsCompetition) {
    const places = cms.status === 'DONE' ? classifyBracket(cms) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.classCompetition.update({
        where: { id },
        data: { status: cms.status },
      });
      if (!places) return;
      const times = await tx.classHeatTime.findMany({ where: { classCompetitionId: id } });
      const timeByRegistration = lastOkTimes(cms, times);
      for (const [registrationId, place] of places) {
        const timeMilliseconds = timeByRegistration.get(registrationId);
        if (timeMilliseconds == null) continue;
        await tx.result.upsert({
          where: { registrationId },
          create: { registrationId, timeMilliseconds, place },
          update: { timeMilliseconds, place },
        });
      }
    });
  }

  private async requireEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        eventFormats: { include: { format: { select: { name: true } } } },
      },
    });
    if (!event) throw new NotFoundException('Event not found.');
    return event;
  }

  private async requireOwned(eventId: string, classCompetitionId: string) {
    const row = await this.prisma.classCompetition.findFirst({
      where: { id: classCompetitionId, eventId },
      include: classCompetitionInclude,
    });
    if (!row) throw new NotFoundException('Multi-stage race not found.');
    return row;
  }

  private async reload(id: string) {
    const row = await this.prisma.classCompetition.findUnique({
      where: { id },
      include: classCompetitionInclude,
    });
    if (!row) throw new NotFoundException('Multi-stage race not found.');
    return row;
  }

  private async loadRegistrations(eventId: string) {
    return this.prisma.registration.findMany({
      where: { eventId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        startNumber: true,
        gender: true,
        formatId: true,
        status: true,
      },
    });
  }

  private assertMutableEvent(event: StoredEvent) {
    if (event.status === 'CANCELLED') {
      throw new BadRequestException('Нельзя собрать сетку для отменённого мероприятия.');
    }
    if (isPastCompletedEvent(event.status, event.eventDate)) {
      throw new BadRequestException(PAST_COMPLETED_EVENT_LOCKED_MESSAGE);
    }
  }

  private assertRegistrationClosed(event: StoredEvent) {
    const closesAt = event.registrationClose
      ? Math.min(event.registrationClose.getTime(), event.eventDate.getTime())
      : event.eventDate.getTime();
    if (Date.now() <= closesAt) {
      throw new BadRequestException('Регистрация ещё не закрыта.');
    }
  }

  private assertFormatBelongs(
    event: { eventFormats: Array<{ formatId: number }> },
    formatId: number | null,
  ) {
    if (event.eventFormats.length === 0) {
      if (formatId != null) {
        throw new BadRequestException('У мероприятия нет форматов участия.');
      }
      return;
    }
    if (formatId == null || !event.eventFormats.some((item) => item.formatId === formatId)) {
      throw new BadRequestException('Такой формат не заявлен на этом мероприятии.');
    }
  }

  private toView(
    row: StoredClassCompetition,
    cms: CmsCompetition,
    registrations: StoredRegistration[],
  ): ClassCompetitionView {
    const people = new Map(registrations.map((registration) => [registration.id, registration]));
    const times = new Map(
      row.heatTimes.map((item) => [
        `${item.stageId}:${item.heatNumber}:${item.registrationId}`,
        item,
      ]),
    );
    const runs = new Map(cms.stages.map((stage) => [stage.stageId, stage]));
    const timeByRegistration = lastOkTimes(cms, row.heatTimes);
    const places = cms.status === 'DONE' ? classifyBracket(cms) : new Map<string, number>();

    return {
      id: row.id,
      eventId: row.eventId,
      formatId: row.formatId,
      gender: row.gender,
      status: cms.status,
      stages: cms.format.stages.map((spec) => this.toStage(spec, runs.get(spec.id), people, times)),
      classification: [...places.entries()]
        .map(([registrationId, place]) => ({
          registrationId,
          place,
          timeMilliseconds: timeByRegistration.get(registrationId) ?? null,
        }))
        .sort((a, b) => a.place - b.place),
    };
  }

  private toStage(
    spec: CmsStageSpec,
    run: CmsCompetition['stages'][number] | undefined,
    people: Map<string, StoredRegistration>,
    times: Map<string, StoredHeatTime>,
  ): ClassCompetitionView['stages'][number] {
    const person = (registrationId: string) => {
      const registration = people.get(registrationId);
      return {
        registrationId,
        firstName: registration?.firstName ?? '',
        lastName: registration?.lastName ?? '',
        startNumber: registration?.startNumber ?? null,
      };
    };
    return {
      stageId: spec.id,
      kind: spec.kind,
      label: spec.label ?? null,
      status: run?.status ?? 'PENDING',
      heats: (run?.heats ?? []).map((heat) => ({
        heatNumber: heat.heatNumber,
        slots: heat.slots.map((slot) => {
          const stored = times.get(`${spec.id}:${heat.heatNumber}:${slot.participantId}`);
          return {
            ...person(slot.participantId),
            position: slot.position,
            timeMilliseconds: stored?.timeMilliseconds ?? null,
            resultStatus: stored?.status ?? null,
          };
        }),
      })),
      entries: (run?.entries ?? []).map((entry) => ({
        ...person(entry.participantId),
        seed: entry.seed,
        eliminated: entry.eliminated,
      })),
    };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}
