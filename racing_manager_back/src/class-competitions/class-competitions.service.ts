import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClassCompetitionStatus,
  ClassHeatResultStatus,
  Prisma,
  RegistrationStatus,
} from '../../generated/prisma';
import { ADMIN_ROLE_CODES } from '../auth/role-codes';
import { RolesService } from '../auth/roles.service';
import {
  PAST_COMPLETED_EVENT_LOCKED_MESSAGE,
  isPastCompletedEvent,
} from '../events/event-status';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACTIVE_REGISTRATION_STATUSES,
  RegistrationStatusCode,
} from '../registrations/registration-status';
import { competitionPlaces } from '../ranking/competition-places';
import { categoryIsFinished } from '../events/category-finish';
import { classifyBracket, lastOkTimes } from './classify-bracket';
import { CmsClient } from './cms.client';
import { outcomeForHeat } from './qualify-heat';
import { CmsCompetition, CmsStageSpec } from './cms.types';
import {
  ParsedHeatTimes,
  parseCreateClassCompetitionBody,
  parseHeatAssignmentBody,
  parseHeatTimesBody,
  parsePlanChangeBody,
  parseStageQualificationBody,
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
  status: string;
};

type StoredHeatTime = {
  stageId: string;
  heatNumber: number;
  registrationId: string;
  timeMilliseconds: number | null;
  status: ClassHeatResultStatus;
  qualificationStatus: RegistrationStatus | null;
  laps: Array<{
    timeMilliseconds: number;
    eventLap: { lapNumber: number };
  }>;
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
      qualificationStatus: true,
      laps: {
        select: {
          timeMilliseconds: true,
          eventLap: { select: { lapNumber: true } },
        },
      },
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
    sourceStageId: string | null;
    qualifierStatus: 'QQ' | 'NQ' | null;
    heats: Array<{
      heatNumber: number;
      slots: Array<{
        position: number;
        registrationId: string;
        firstName: string;
        lastName: string;
        startNumber: number | null;
        registrationStatus: string;
        timeMilliseconds: number | null;
        resultStatus: string | null;
        laps: Array<{ lapNumber: number; timeMilliseconds: number }>;
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
      views.push(await this.present(row, cms, registrations));
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
    const protocolResults = await this.prisma.result.count({
      where: {
        registration: {
          eventId,
          gender: parsed.gender,
          formatId: parsed.formatId,
        },
      },
    });
    if (protocolResults > 0) {
      throw new ConflictException(
        'В этой категории уже есть результаты в итоговом протоколе.',
      );
    }
    if (await categoryIsFinished(this.prisma, eventId, parsed.formatId, parsed.gender)) {
      throw new ConflictException('Гонка в этой категории уже завершена.');
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
      return this.present(created, cms, registrations);
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
    return this.present(await this.reload(row.id), next, await this.loadRegistrations(eventId));
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
    const cms = await this.cms.getCompetition(row.cmsCompetitionId);
    const registrations = await this.loadRegistrations(eventId);
    const frozen = await this.freezeMissingQualifications(row, cms, registrations);
    const target = cms.stages.find((item) => item.stageId === stageId);
    if (target && target.status === 'PENDING' && target.entries.length === 0) {
      const source = sourceOfStage(cms.format.stages, stageId);
      const qualified = this.qualifiedFromPreviousStage(frozen, cms, stageId);
      if (qualified.length === 0) {
        throw new BadRequestException(
          source?.qualifierStatus === 'NQ'
            ? 'Нет участников со статусом NQ. Финал B разыгрывают проигравшие полуфинал.'
            : 'Нет участников со статусом QQ. Сначала отметьте, кто проходит в следующий этап.',
        );
      }
      await this.cms.setStageField(row.cmsCompetitionId, stageId, qualified);
    }
    const next = await this.cms.seedStage(row.cmsCompetitionId, stageId);
    await this.persistOutcome(row.id, next);
    return this.present(await this.reload(row.id), next, registrations);
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
    return this.present(await this.reload(row.id), next, await this.loadRegistrations(eventId));
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
    const eventLaps = await this.prisma.eventLap.findMany({
      where: { eventId },
      select: { id: true, lapNumber: true },
      orderBy: { lapNumber: 'asc' },
    });
    await this.upsertHeatTimes(row.id, stageId, parsed, eventLaps);

    if (!parsed.commit) {
      return this.present(
        await this.reload(row.id),
        current,
        await this.loadRegistrations(eventId),
      );
    }
    if (stage.heats.some((heat) => heat.slots.length === 0)) {
      throw new BadRequestException('Пустой заезд нужно удалить или заполнить участниками.');
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
      const places = competitionPlaces(finished, (item) => item.timeMilliseconds ?? 0);
      const placeById = new Map(
        finished.map((item, index) => [item.registrationId, places[index]]),
      );
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
    const terminal = isTerminalStage(current.format.stages.find((item) => item.id === stageId));
    await this.assignQualification(row.id, stage, byRegistration, startNumbers, terminal);
    const completed = await this.cms.completeStage(row.cmsCompetitionId, stageId);
    await this.persistOutcome(row.id, completed);
    return this.present(
      await this.reload(row.id),
      completed,
      await this.loadRegistrations(eventId),
    );
  }

  async setStageQualification(
    authentikId: string | undefined,
    eventId: string,
    classCompetitionId: string,
    stageId: string,
    body: unknown,
  ): Promise<ClassCompetitionView> {
    await this.rolesService.assertHasAnyRole(authentikId, ADMIN_ROLE_CODES);
    const parsed = parseStageQualificationBody(body);
    const row = await this.requireOwned(eventId, classCompetitionId);
    this.assertMutableEvent(row.event);
    const cms = await this.cms.getCompetition(row.cmsCompetitionId);
    const stage = cms.stages.find((item) => item.stageId === stageId);
    if (!stage || stage.status !== 'COMPLETED') {
      throw new BadRequestException('Статус этапа можно менять только после его фиксации.');
    }
    const heatTime = row.heatTimes.find(
      (item) => item.stageId === stageId && item.registrationId === parsed.registrationId,
    );
    if (!heatTime) {
      throw new NotFoundException('Участник не выступал на этом этапе.');
    }
    const spec = cms.format.stages.find((item) => item.id === stageId);
    if (
      isTerminalStage(spec) &&
      (parsed.status === RegistrationStatusCode.QQ || parsed.status === RegistrationStatusCode.NQ)
    ) {
      throw new BadRequestException('В финале гонка завершается, статусы QQ и NQ не ставятся.');
    }
    await this.prisma.classHeatTime.updateMany({
      where: {
        classCompetitionId: row.id,
        stageId,
        registrationId: parsed.registrationId,
      },
      data: { qualificationStatus: parsed.status },
    });
    if (!appearedOnLaterStage(cms, stageId, parsed.registrationId)) {
      await this.prisma.registration.update({
        where: { id: parsed.registrationId },
        data: { status: parsed.status },
      });
    }
    return this.present(
      await this.reload(row.id),
      cms,
      await this.loadRegistrations(eventId),
    );
  }

  private async assignQualification(
    classCompetitionId: string,
    stage: CmsCompetition['stages'][number],
    byRegistration: Map<string, { status: string; timeMilliseconds: number | null }>,
    startNumbers: Map<string, number | null>,
    terminal = false,
  ) {
    const updates: Array<{ registrationId: string; status: RegistrationStatusCode }> = [];
    for (const heat of stage.heats) {
      const slots = heat.slots.map((slot) => {
        const stored = byRegistration.get(slot.participantId);
        return {
          registrationId: slot.participantId,
          status: stored?.status ?? 'DNS',
          timeMilliseconds: stored?.timeMilliseconds ?? null,
          startNumber: startNumbers.get(slot.participantId) ?? null,
        };
      });
      for (const [registrationId, status] of outcomeForHeat(slots, terminal)) {
        updates.push({ registrationId, status });
      }
    }
    await this.prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.classHeatTime.updateMany({
          where: {
            classCompetitionId,
            stageId: stage.stageId,
            registrationId: update.registrationId,
          },
          data: { qualificationStatus: update.status },
        });
        await tx.registration.update({
          where: { id: update.registrationId },
          data: { status: update.status },
        });
      }
    });
  }

  private qualifiedFromPreviousStage(
    row: StoredClassCompetition,
    cms: CmsCompetition,
    stageId: string,
  ): string[] {
    const source = sourceOfStage(cms.format.stages, stageId);
    if (!source) return [];
    const previous = cms.stages.find((stage) => stage.stageId === source.sourceStageId);
    if (!previous || previous.status !== 'COMPLETED') return [];
    const ids = row.heatTimes
      .filter(
        (item) =>
          item.stageId === source.sourceStageId &&
          item.qualificationStatus === source.qualifierStatus,
      )
      .map((item) => item.registrationId);
    return [...new Set(ids)];
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
    eventLaps: { id: string; lapNumber: number }[],
  ) {
    const lapByNumber = new Map(eventLaps.map((lap) => [lap.lapNumber, lap]));
    await this.prisma.$transaction(async (tx) => {
      for (const entry of parsed.entries) {
        if (eventLaps.length > 0 && entry.status === 'OK' && entry.lapNumber == null) {
          throw new BadRequestException(
            'Это мероприятие учитывает время по кругам. Укажите номер круга.',
          );
        }
        if (eventLaps.length === 0 && entry.lapNumber != null) {
          throw new BadRequestException('У мероприятия нет кругов. Укажите общее время.');
        }
        const heatTime = await tx.classHeatTime.upsert({
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
            timeMilliseconds: entry.lapNumber == null ? entry.timeMilliseconds : null,
          },
          update:
            entry.lapNumber == null
              ? { status: entry.status, timeMilliseconds: entry.timeMilliseconds }
              : { status: 'OK' },
        });
        if (entry.status !== 'OK') {
          await tx.classHeatLapTime.deleteMany({ where: { classHeatTimeId: heatTime.id } });
          continue;
        }
        if (entry.lapNumber == null || entry.timeMilliseconds == null) continue;
        const eventLap = lapByNumber.get(entry.lapNumber);
        if (!eventLap) {
          throw new BadRequestException(
            `Круг ${entry.lapNumber} не заявлен на этом мероприятии.`,
          );
        }
        await tx.classHeatLapTime.upsert({
          where: {
            classHeatTimeId_eventLapId: {
              classHeatTimeId: heatTime.id,
              eventLapId: eventLap.id,
            },
          },
          create: {
            classHeatTimeId: heatTime.id,
            eventLapId: eventLap.id,
            timeMilliseconds: entry.timeMilliseconds,
          },
          update: { timeMilliseconds: entry.timeMilliseconds },
        });
        const stored = await tx.classHeatLapTime.findMany({
          where: { classHeatTimeId: heatTime.id },
          select: { timeMilliseconds: true, eventLap: { select: { lapNumber: true } } },
        });
        const byLap = new Map(stored.map((lap) => [lap.eventLap.lapNumber, lap.timeMilliseconds]));
        const complete = eventLaps.every((lap) => byLap.has(lap.lapNumber));
        const total = complete
          ? eventLaps.reduce((sum, lap) => sum + (byLap.get(lap.lapNumber) ?? 0), 0)
          : null;
        await tx.classHeatTime.update({
          where: { id: heatTime.id },
          data: { status: 'OK', timeMilliseconds: total },
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
      include: { laps: true },
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
            qualificationStatus: previous.qualificationStatus,
            laps: previous.laps,
          },
        ];
      }),
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.classHeatTime.deleteMany({ where: { classCompetitionId, stageId } });
      for (const row of next) {
        const created = await tx.classHeatTime.create({
          data: {
            classCompetitionId: row.classCompetitionId,
            stageId: row.stageId,
            heatNumber: row.heatNumber,
            registrationId: row.registrationId,
            status: row.status,
            timeMilliseconds: row.timeMilliseconds,
            qualificationStatus: row.qualificationStatus,
          },
        });
        if (row.laps.length > 0) {
          await tx.classHeatLapTime.createMany({
            data: row.laps.map((lap) => ({
              classHeatTimeId: created.id,
              eventLapId: lap.eventLapId,
              timeMilliseconds: lap.timeMilliseconds,
            })),
          });
        }
      }
    });
  }

  private async persistOutcome(id: string, cms: CmsCompetition) {
    const times = await this.prisma.classHeatTime.findMany({ where: { classCompetitionId: id } });
    const timeByRegistration = lastOkTimes(cms, times);
    const places = cms.status === 'DONE' ? classifyBracket(cms, timeByRegistration) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.classCompetition.update({
        where: { id },
        data: { status: cms.status },
      });
      if (!places) return;
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
    const places =
      cms.status === 'DONE' ? classifyBracket(cms, timeByRegistration) : new Map<string, number>();

    return {
      id: row.id,
      eventId: row.eventId,
      formatId: row.formatId,
      gender: row.gender,
      status: cms.status,
      stages: orderFinals(cms.format.stages).map((spec) => {
        const source = sourceOfStage(cms.format.stages, spec.id);
        return {
          ...this.toStage(spec, runs.get(spec.id), people, times),
          sourceStageId: source?.sourceStageId ?? null,
          qualifierStatus: source?.qualifierStatus ?? null,
        };
      }),
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
  ): Omit<ClassCompetitionView['stages'][number], 'sourceStageId' | 'qualifierStatus'> {
    const person = (registrationId: string) => {
      const registration = people.get(registrationId);
      return {
        registrationId,
        firstName: registration?.firstName ?? '',
        lastName: registration?.lastName ?? '',
        startNumber: registration?.startNumber ?? null,
        registrationStatus: registration?.status ?? RegistrationStatusCode.REGISTERED,
      };
    };
    const stageStatus = (registrationId: string, stored: StoredHeatTime | undefined) =>
      stored?.qualificationStatus ??
      person(registrationId).registrationStatus;
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
            registrationStatus: stageStatus(slot.participantId, stored),
            position: slot.position,
            timeMilliseconds: stored?.timeMilliseconds ?? null,
            resultStatus:
              stored == null || (stored.status === 'OK' && stored.timeMilliseconds == null)
                ? null
                : stored.status,
            laps: (stored?.laps ?? []).map((lap) => ({
              lapNumber: lap.eventLap.lapNumber,
              timeMilliseconds: lap.timeMilliseconds,
            })),
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

  private async present(
    row: StoredClassCompetition,
    cms: CmsCompetition,
    registrations: StoredRegistration[],
  ): Promise<ClassCompetitionView> {
    const frozen = await this.freezeMissingQualifications(row, cms, registrations);
    return this.toView(frozen, cms, registrations);
  }

  private async freezeMissingQualifications(
    row: StoredClassCompetition,
    cms: CmsCompetition,
    registrations: StoredRegistration[],
  ): Promise<StoredClassCompetition> {
    const startNumbers = new Map(registrations.map((item) => [item.id, item.startNumber]));
    const registrationStatus = new Map(registrations.map((item) => [item.id, item.status]));
    const heatTimes = row.heatTimes.map((item) => ({ ...item }));
    const updates: Array<{
      stageId: string;
      registrationId: string;
      status: RegistrationStatus;
    }> = [];
    const clearQualification: Array<{ stageId: string; registrationId: string }> = [];
    const confirmRegistrations = new Set<string>();

    for (const run of cms.stages) {
      if (run.status !== 'COMPLETED') continue;
      const spec = cms.format.stages.find((item) => item.id === run.stageId);
      const terminal = isTerminalStage(spec);
      const stageTimes = heatTimes.filter((item) => item.stageId === run.stageId);
      if (terminal) {
        for (const item of stageTimes) {
          if (
            item.qualificationStatus !== RegistrationStatus.QQ &&
            item.qualificationStatus !== RegistrationStatus.NQ
          ) {
            continue;
          }
          item.qualificationStatus = RegistrationStatus.CONFIRMED;
          clearQualification.push({ stageId: run.stageId, registrationId: item.registrationId });
          const current = registrationStatus.get(item.registrationId);
          if (
            (current === RegistrationStatusCode.QQ || current === RegistrationStatusCode.NQ) &&
            !appearedOnLaterStage(cms, run.stageId, item.registrationId)
          ) {
            confirmRegistrations.add(item.registrationId);
          }
        }
      }
      if (stageTimes.every((item) => item.qualificationStatus != null)) continue;
      const byHeat = new Map<number, StoredHeatTime[]>();
      for (const item of stageTimes) {
        const group = byHeat.get(item.heatNumber) ?? [];
        group.push(item);
        byHeat.set(item.heatNumber, group);
      }
      const assigned = new Map<string, RegistrationStatusCode>();
      for (const group of byHeat.values()) {
        for (const [registrationId, status] of outcomeForHeat(
          group.map((item) => ({
            registrationId: item.registrationId,
            status: item.status,
            timeMilliseconds: item.timeMilliseconds,
            startNumber: startNumbers.get(item.registrationId) ?? null,
          })),
          terminal,
        )) {
          assigned.set(registrationId, status);
        }
      }
      for (const item of stageTimes) {
        if (item.qualificationStatus != null) continue;
        const computed = assigned.get(item.registrationId);
        if (!computed) continue;
        const current = registrationStatus.get(item.registrationId);
        const keepCurrent =
          !terminal &&
          !appearedOnLaterStage(cms, run.stageId, item.registrationId) &&
          isStageOutcomeStatus(current);
        const status = keepCurrent ? (current as RegistrationStatus) : computed;
        item.qualificationStatus = status;
        updates.push({ stageId: run.stageId, registrationId: item.registrationId, status });
        if (
          terminal &&
          status === RegistrationStatusCode.CONFIRMED &&
          (current === RegistrationStatusCode.QQ || current === RegistrationStatusCode.NQ) &&
          !appearedOnLaterStage(cms, run.stageId, item.registrationId)
        ) {
          confirmRegistrations.add(item.registrationId);
        }
      }
    }

    if (updates.length > 0 || clearQualification.length > 0 || confirmRegistrations.size > 0) {
      await this.prisma.$transaction(async (tx) => {
        for (const update of updates) {
          await tx.classHeatTime.updateMany({
            where: {
              classCompetitionId: row.id,
              stageId: update.stageId,
              registrationId: update.registrationId,
              qualificationStatus: null,
            },
            data: { qualificationStatus: update.status },
          });
        }
        for (const update of clearQualification) {
          await tx.classHeatTime.updateMany({
            where: {
              classCompetitionId: row.id,
              stageId: update.stageId,
              registrationId: update.registrationId,
              qualificationStatus: { in: [RegistrationStatus.QQ, RegistrationStatus.NQ] },
            },
            data: { qualificationStatus: RegistrationStatus.CONFIRMED },
          });
        }
        for (const registrationId of confirmRegistrations) {
          await tx.registration.updateMany({
            where: {
              id: registrationId,
              status: { in: [RegistrationStatus.QQ, RegistrationStatus.NQ] },
            },
            data: { status: RegistrationStatus.CONFIRMED },
          });
        }
      });
    }
    return { ...row, heatTimes };
  }
}

function orderFinals(stages: CmsStageSpec[]): CmsStageSpec[] {
  const next = [...stages];
  const finalB = next.findIndex((stage) => stage.kind === 'FINAL_B' || stage.id === 'final_b');
  const finalA = next.findIndex((stage) => stage.kind === 'FINAL_A' || stage.id === 'final_a');
  if (finalB < 0 || finalA < 0 || finalB < finalA) return next;
  const [consolation] = next.splice(finalB, 1);
  const finalAIndex = next.findIndex((stage) => stage.kind === 'FINAL_A' || stage.id === 'final_a');
  next.splice(finalAIndex, 0, consolation);
  return next;
}

const STAGE_OUTCOME_STATUSES = new Set<string>([
  RegistrationStatusCode.QQ,
  RegistrationStatusCode.NQ,
  RegistrationStatusCode.DNS,
  RegistrationStatusCode.DNF,
  RegistrationStatusCode.DSQ,
]);

function isTerminalStage(stage: CmsStageSpec | undefined): boolean {
  if (!stage) return false;
  return stage.kind === 'FINAL' || stage.kind === 'FINAL_A' || stage.kind === 'FINAL_B';
}

function isStageOutcomeStatus(status: string | undefined): boolean {
  return status != null && STAGE_OUTCOME_STATUSES.has(status);
}

function appearedOnLaterStage(
  cms: CmsCompetition,
  stageId: string,
  registrationId: string,
): boolean {
  const index = cms.format.stages.findIndex((stage) => stage.id === stageId);
  if (index < 0) return false;
  const laterIds = new Set(cms.format.stages.slice(index + 1).map((stage) => stage.id));
  return cms.stages.some((stage) => {
    if (!laterIds.has(stage.stageId) || stage.status === 'PENDING') return false;
    const inHeat = stage.heats.some((heat) =>
      heat.slots.some((slot) => slot.participantId === registrationId),
    );
    const inField = stage.entries.some((entry) => entry.participantId === registrationId);
    return inHeat || inField;
  });
}

function sourceOfStage(
  stages: CmsStageSpec[],
  stageId: string,
): { sourceStageId: string; qualifierStatus: 'QQ' | 'NQ' } | null {
  for (const stage of stages) {
    if (stage.advancement.type !== 'ROUTES') continue;
    for (const route of stage.advancement.routes) {
      if (route.toStageId !== stageId) continue;
      const qualifierStatus = route.cut.type === 'SECOND_HALF' || stageId === 'final_b' ? 'NQ' : 'QQ';
      return { sourceStageId: stage.id, qualifierStatus };
    }
  }
  return null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}
