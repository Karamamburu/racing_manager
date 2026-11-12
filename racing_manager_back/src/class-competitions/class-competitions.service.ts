import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
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
import { resolveControlYear } from '../events/age-groups';
import {
  categoriesFromStoredRows,
  convertLegacySections,
} from '../events/age-groups';
import { PrismaService } from '../prisma/prisma.service';
import {
  LISTED_REGISTRATION_STATUSES,
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
import {
  currentPlacement,
  placementKey,
  targetForSection,
  type RaceSectionKind,
  type RaceTarget,
} from './race-scope';
import { logEvent } from '../logging/log-event';

type StoredEvent = {
  id: string;
  name: string;
  status: string;
  eventDate: Date;
  registrationClose: Date | null;
  starts?: Array<{
    id: string;
    sortOrder: number;
    formats: Array<{ formatId: number }>;
  }>;
};

type StoredRegistration = {
  id: string;
  firstName: string;
  lastName: string;
  startNumber: number | null;
  gender: string;
  birthYear: number | null;
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
  startId: string | null;
  formatId: number | null;
  gender: string;
  sectionId: string | null;
  sectionKind: string | null;
  targetKey: string;
  targetGroupIds: string[];
  targetWholeCategory: boolean;
  frozenTitle: string | null;
  frozenSubtitle: string | null;
  frozenYoungestBound: number | null;
  frozenMemberBounds: number[];
  frozenSectionNumber: number | null;
  capturedEnrollmentIds: string[];
  capturedRegistrationIds: string[];
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
  startId: string | null;
  formatId: number | null;
  gender: string;
  sectionId: string;
  sectionKind: RaceSectionKind;
  title: string;
  subtitle: string | null;
  targetGroupIds: string[];
  targetWholeCategory: boolean;
  capturedEnrollmentIds: string[];
  youngestBound: number | null;
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
  private readonly logger = new Logger(ClassCompetitionsService.name);

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

    const start =
      parsed.startId == null
        ? null
        : ((event.starts ?? []).find((item) => item.id === parsed.startId) ??
          null);
    if ((event.starts ?? []).length > 0 && !start) {
      throw new BadRequestException('Старт не принадлежит этому мероприятию.');
    }
    let formatId = parsed.formatId;
    if (start) {
      const formats = start.formats.map((item) => item.formatId);
      if (formatId == null && formats.length === 1) {
        formatId = formats[0];
      }
      if (formatId == null || !formats.includes(formatId)) {
        throw new BadRequestException(
          'Такой формат не заявлен на этом старте.',
        );
      }
    } else {
      this.assertFormatBelongs(event, formatId);
    }

    const controlYear = resolveControlYear(event.eventDate);
    const categories = await this.readAgeCategories(
      eventId,
      start?.id ?? null,
      formatId,
      parsed.gender,
    );
    if (parsed.sectionId === 'CATEGORY' && categories.length > 0) {
      throw new BadRequestException(
        'Сначала выберите возрастную категорию: у категории есть возрастное деление.',
      );
    }
    if (parsed.sectionId !== 'CATEGORY' && categories.length === 0) {
      throw new BadRequestException(
        'У этой категории нет возрастного деления.',
      );
    }
    let target: RaceTarget;
    try {
      target = targetForSection(parsed.sectionId, categories);
    } catch {
      throw new BadRequestException(
        'Такой возрастной категории нет в протоколе.',
      );
    }

    const races = await this.prisma.classCompetition.findMany({
      where: {
        eventId,
        startId: start?.id ?? null,
        formatId,
        gender: parsed.gender,
      },
    });
    if (target.targetWholeCategory) {
      if (races.length > 0) {
        throw new ConflictException(
          'В этой категории уже есть многоэтапная гонка. Удалите её перед созданием общей.',
        );
      }
    } else if (races.some((race) => race.targetWholeCategory)) {
      throw new ConflictException(
        'В этой категории уже идёт общая многоэтапная гонка.',
      );
    }

    const existing = races.find((race) => race.targetKey === target.targetKey);
    if (existing) {
      throw new ConflictException(
        'Для этой категории многоэтапная гонка уже создана.',
      );
    }

    const candidates = await this.loadRaceCandidates(
      eventId,
      start?.id ?? null,
      formatId,
      parsed.gender,
    );
    const capturedEnrollmentIds: string[] = [];
    const capturedRegistrationIds: string[] = [];
    const starters: Array<{
      registrationId: string;
      startNumber: number;
    }> = [];
    for (const candidate of candidates) {
      const placement = currentPlacement(
        candidate.birthYear,
        controlYear,
        categories,
      );
      const inTarget =
        target.targetWholeCategory ||
        (target.sectionKind === 'NO_BIRTH_YEAR'
          ? placement.noBirthYear
          : placementKey(placement) === target.targetKey);
      if (!inTarget) continue;
      const alreadyCaptured = races.some(
        (race) =>
          (candidate.enrollmentId != null &&
            race.capturedEnrollmentIds.includes(candidate.enrollmentId)) ||
          race.capturedRegistrationIds.includes(candidate.registrationId),
      );
      if (alreadyCaptured) continue;
      if (candidate.startNumber == null) {
        throw new BadRequestException(
          'Перед формированием сетки выдайте стартовый номер каждому участнику.',
        );
      }
      starters.push({
        registrationId: candidate.registrationId,
        startNumber: candidate.startNumber,
      });
      if (candidate.enrollmentId != null) {
        capturedEnrollmentIds.push(candidate.enrollmentId);
      }
      capturedRegistrationIds.push(candidate.registrationId);
    }
    if (starters.length === 0) {
      throw new BadRequestException(
        'В этой категории нет участников для сетки.',
      );
    }
    const uniqueStarters = [
      ...new Map(starters.map((item) => [item.registrationId, item])).values(),
    ].sort((a, b) => a.startNumber - b.startNumber);

    const protocolResults =
      capturedEnrollmentIds.length > 0
        ? await this.prisma.result.count({
            where: { enrollmentId: { in: capturedEnrollmentIds } },
          })
        : await this.prisma.result.count({
            where: { registrationId: { in: capturedRegistrationIds } },
          });
    if (protocolResults > 0) {
      throw new ConflictException(
        'В этой категории уже есть результаты в итоговом протоколе.',
      );
    }
    if (
      await categoryIsFinished(
        this.prisma,
        eventId,
        formatId,
        parsed.gender,
        start?.id ?? null,
      )
    ) {
      throw new ConflictException('Гонка в этой категории уже завершена.');
    }

    const formatName = event.eventFormats.find(
      (item) => item.formatId === formatId,
    );
    const title = target.targetWholeCategory
      ? (formatName?.format.name ?? 'Категория')
      : target.title;
    const subtitle = target.subtitle;
    const cms = await this.cms.createCompetition({
      name: [event.name, formatName?.format.name, title, parsed.gender]
        .filter(Boolean)
        .join(' · '),
      participants: uniqueStarters.map((registration) => ({
        id: registration.registrationId,
        seed: registration.startNumber,
      })),
    });

    try {
      const created = await this.prisma.classCompetition.create({
        data: {
          eventId,
          startId: start?.id ?? null,
          formatId,
          gender: parsed.gender,
          sectionId: target.sectionId,
          sectionKind: target.sectionKind,
          targetKey: target.targetKey,
          targetGroupIds: target.targetGroupIds,
          targetWholeCategory: target.targetWholeCategory,
          frozenTitle: title,
          frozenSubtitle: subtitle,
          frozenYoungestBound: target.youngestBound,
          frozenMemberBounds: target.memberBounds,
          frozenSectionNumber: target.sectionNumber,
          capturedEnrollmentIds,
          capturedRegistrationIds,
          cmsCompetitionId: cms.id,
          status: cms.status,
        },
        include: classCompetitionInclude,
      });
      logEvent(this.logger, {
        event: 'class_competition.created',
        eventId,
        classCompetitionId: created.id,
        cmsCompetitionId: cms.id,
        startId: start?.id ?? null,
        formatId,
        gender: parsed.gender,
        sectionId: target.sectionId,
        userSub: authentikId,
      });
      return this.present(created, cms, await this.loadRegistrations(eventId));
    } catch (error) {
      await this.cms.deleteCompetition(cms.id).catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Для этой категории многоэтапная гонка уже создана.',
        );
      }
      throw error;
    }
  }

  private async readAgeCategories(
    eventId: string,
    startId: string | null,
    formatId: number | null,
    gender: string,
  ) {
    if (startId == null || formatId == null) return [];
    const key = { eventId, startId, formatId, gender: gender as 'M' | 'F' };
    const rows = await this.prisma.ageSplitCategory.findMany({
      where: key,
      select: { categoryNumber: true, groupId: true },
      orderBy: [{ categoryNumber: 'asc' }, { groupId: 'asc' }],
    });
    if (rows.length > 0) return categoriesFromStoredRows(rows);
    const legacy = await this.prisma.ageSplitSection.findMany({
      where: key,
      select: { sectionId: true, sectionKind: true, sortOrder: true },
      orderBy: { sortOrder: 'asc' },
    });
    return legacy.length > 0 ? convertLegacySections(legacy) : [];
  }

  private async loadRaceCandidates(
    eventId: string,
    startId: string | null,
    formatId: number | null,
    gender: 'M' | 'F',
  ): Promise<
    Array<{
      enrollmentId: string | null;
      registrationId: string;
      birthYear: number | null;
      startNumber: number | null;
    }>
  > {
    if (startId == null) {
      const registrations = await this.prisma.registration.findMany({
        where: {
          eventId,
          gender,
          ...(formatId == null ? { formatId: null } : { formatId }),
          status: { in: [...LISTED_REGISTRATION_STATUSES] },
        },
        select: { id: true, birthYear: true, startNumber: true },
      });
      return registrations.map((row) => ({
        enrollmentId: null,
        registrationId: row.id,
        birthYear: row.birthYear,
        startNumber: row.startNumber,
      }));
    }
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        eventId,
        startId,
        ...(formatId == null ? {} : { formatId }),
        status: 'REGISTERED',
        registration: {
          gender,
          status: { in: [...LISTED_REGISTRATION_STATUSES] },
        },
      },
      select: {
        id: true,
        registrationId: true,
        registration: { select: { birthYear: true, startNumber: true } },
      },
    });
    return enrollments.map((row) => ({
      enrollmentId: row.id,
      registrationId: row.registrationId,
      birthYear: row.registration.birthYear,
      startNumber: row.registration.startNumber,
    }));
  }

  private async ensureCapturedSnapshot(
    row: StoredClassCompetition,
    cms: CmsCompetition,
  ): Promise<StoredClassCompetition> {
    if (
      row.capturedEnrollmentIds.length > 0 ||
      row.capturedRegistrationIds.length > 0
    ) {
      return row;
    }
    const registrationIds = cms.participants.map(
      (participant) => participant.id,
    );
    let enrollmentIds: string[] = [];
    if (
      row.startId != null &&
      row.formatId != null &&
      registrationIds.length > 0
    ) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          eventId: row.eventId,
          startId: row.startId,
          formatId: row.formatId,
          registrationId: { in: registrationIds },
        },
        select: { id: true },
      });
      enrollmentIds = enrollments.map((item) => item.id);
    }
    if (registrationIds.length === 0 && enrollmentIds.length === 0) {
      return row;
    }
    const updated = await this.prisma.classCompetition.update({
      where: { id: row.id },
      data: {
        capturedRegistrationIds: registrationIds,
        capturedEnrollmentIds: enrollmentIds,
      },
    });
    return { ...row, ...updated };
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
              buildAddStageOp(
                parsed.addStage,
                current.format.stages,
                current.participants.length,
              ),
            ],
          },
    );
    await this.persistOutcome(row.id, next);
    logEvent(this.logger, {
      event: 'class_competition.plan_updated',
      eventId,
      classCompetitionId,
      cmsCompetitionId: row.cmsCompetitionId,
      userSub: authentikId,
    });
    return this.present(
      await this.reload(row.id),
      next,
      await this.loadRegistrations(eventId),
    );
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
    const frozen = await this.freezeMissingQualifications(
      row,
      cms,
      registrations,
    );
    const target = cms.stages.find((item) => item.stageId === stageId);
    if (target && target.status === 'PENDING' && target.entries.length === 0) {
      const source = sourceOfStage(cms.format.stages, stageId);
      const qualified = this.qualifiedFromPreviousStage(frozen, cms, stageId);
      const field = fieldForSeeding(
        source,
        qualified,
        cms.participants.map((participant) => participant.id),
      );
      if (field.length === 0) {
        throw new BadRequestException(
          source?.qualifierStatus === 'NQ'
            ? 'Нет участников со статусом NQ. Финал B разыгрывают проигравшие полуфинал.'
            : 'Нет участников для формирования заезда.',
        );
      }
      await this.cms.setStageField(row.cmsCompetitionId, stageId, field);
    }
    const next = await this.cms.seedStage(row.cmsCompetitionId, stageId);
    await this.persistOutcome(row.id, next);
    logEvent(this.logger, {
      event: 'class_competition.stage_seeded',
      eventId,
      classCompetitionId,
      cmsCompetitionId: row.cmsCompetitionId,
      stageId,
      userSub: authentikId,
    });
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
    logEvent(this.logger, {
      event: 'class_competition.heats_updated',
      eventId,
      classCompetitionId,
      cmsCompetitionId: row.cmsCompetitionId,
      stageId,
      heatCount: parsed.heats.length,
      userSub: authentikId,
    });
    return this.present(
      await this.reload(row.id),
      next,
      await this.loadRegistrations(eventId),
    );
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
    let current = await this.cms.getCompetition(row.cmsCompetitionId);
    let stage = current.stages.find((item) => item.stageId === stageId);
    if (!stage) {
      throw new BadRequestException('Этап не найден.');
    }
    if (stage.status === 'PENDING' && stage.heats.length === 0) {
      // A standalone final (for example, a judge removed every earlier stage)
      // is run as a mass start: seed the stage with every participant on the
      // first time entry instead of demanding a manual heat draw.
      const source = sourceOfStage(current.format.stages, stageId);
      const qualified = this.qualifiedFromPreviousStage(row, current, stageId);
      const field = fieldForSeeding(
        source,
        qualified,
        current.participants.map((participant) => participant.id),
      );
      if (field.length === 0) {
        throw new BadRequestException(
          source?.qualifierStatus === 'NQ'
            ? 'Нет участников со статусом NQ. Финал B разыгрывают проигравшие полуфинал.'
            : 'Нет участников для формирования заезда.',
        );
      }
      await this.cms.setStageField(row.cmsCompetitionId, stageId, field);
      current = await this.cms.seedStage(row.cmsCompetitionId, stageId);
      stage = current.stages.find((item) => item.stageId === stageId);
    }
    if (!stage || stage.status !== 'SEEDED') {
      throw new BadRequestException(
        'Время можно записать только после формирования заездов.',
      );
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
      throw new BadRequestException(
        'Пустой заезд нужно удалить или заполнить участниками.',
      );
    }

    const stored = await this.prisma.classHeatTime.findMany({
      where: { classCompetitionId: row.id, stageId },
    });
    const byRegistration = new Map(
      stored.map((item) => [item.registrationId, item]),
    );
    for (const [registrationId, heatNumber] of heatByRegistration) {
      const item = byRegistration.get(registrationId);
      if (
        !item ||
        item.heatNumber !== heatNumber ||
        (item.status === 'OK' && item.timeMilliseconds == null)
      ) {
        throw new BadRequestException(
          'Перед фиксацией этапа укажите время или статус DNS, DNF, DSQ каждому участнику.',
        );
      }
    }

    const registrations = await this.loadRegistrations(eventId);
    const startNumbers = new Map(
      registrations.map((item) => [item.id, item.startNumber]),
    );
    const heatResults = stage.heats.map((heat) => {
      const finished = heat.slots
        .map((slot) => byRegistration.get(slot.participantId))
        .filter(
          (item): item is NonNullable<typeof item> =>
            item != null && item.status === 'OK',
        )
        .sort((a, b) => {
          const byTime = (a.timeMilliseconds ?? 0) - (b.timeMilliseconds ?? 0);
          if (byTime !== 0) return byTime;
          return (
            (startNumbers.get(a.registrationId) ?? Number.POSITIVE_INFINITY) -
            (startNumbers.get(b.registrationId) ?? Number.POSITIVE_INFINITY)
          );
        });
      const places = competitionPlaces(
        finished,
        (item) => item.timeMilliseconds ?? 0,
      );
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
            ...(status === 'OK'
              ? { place: placeById.get(slot.participantId) }
              : {}),
          };
        }),
      };
    });

    await this.cms.recordResults(row.cmsCompetitionId, stageId, heatResults);
    const terminal = isTerminalStage(
      current.format.stages.find((item) => item.id === stageId),
    );
    await this.assignQualification(
      row.id,
      stage,
      byRegistration,
      startNumbers,
      terminal,
      row.startId == null,
    );
    const completed = await this.cms.completeStage(
      row.cmsCompetitionId,
      stageId,
    );
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
      throw new BadRequestException(
        'Статус этапа можно менять только после его фиксации.',
      );
    }
    const heatTime = row.heatTimes.find(
      (item) =>
        item.stageId === stageId &&
        item.registrationId === parsed.registrationId,
    );
    if (!heatTime) {
      throw new NotFoundException('Участник не выступал на этом этапе.');
    }
    const spec = cms.format.stages.find((item) => item.id === stageId);
    if (
      isTerminalStage(spec) &&
      (parsed.status === RegistrationStatusCode.QQ ||
        parsed.status === RegistrationStatusCode.NQ)
    ) {
      throw new BadRequestException(
        'В финале гонка завершается, статусы QQ и NQ не ставятся.',
      );
    }
    await this.prisma.classHeatTime.updateMany({
      where: {
        classCompetitionId: row.id,
        stageId,
        registrationId: parsed.registrationId,
      },
      data: { qualificationStatus: parsed.status },
    });
    if (
      row.startId == null &&
      !appearedOnLaterStage(cms, stageId, parsed.registrationId)
    ) {
      await this.prisma.registration.update({
        where: { id: parsed.registrationId },
        data: { status: parsed.status },
      });
    }
    logEvent(this.logger, {
      event: 'class_competition.qualification_updated',
      eventId,
      classCompetitionId,
      stageId,
      registrationId: parsed.registrationId,
      qualificationStatus: parsed.status,
      userSub: authentikId,
    });
    return this.present(
      await this.reload(row.id),
      cms,
      await this.loadRegistrations(eventId),
    );
  }

  private async assignQualification(
    classCompetitionId: string,
    stage: CmsCompetition['stages'][number],
    byRegistration: Map<
      string,
      { status: string; timeMilliseconds: number | null }
    >,
    startNumbers: Map<string, number | null>,
    terminal = false,
    updateRegistration = true,
  ) {
    const updates: Array<{
      registrationId: string;
      status: RegistrationStatusCode;
    }> = [];
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
        if (updateRegistration) {
          await tx.registration.update({
            where: { id: update.registrationId },
            data: { status: update.status },
          });
        }
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
    const previous = cms.stages.find(
      (stage) => stage.stageId === source.sourceStageId,
    );
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
        throw new BadRequestException(
          'Участник не состоит в указанном заезде.',
        );
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
        if (
          eventLaps.length > 0 &&
          entry.status === 'OK' &&
          entry.lapNumber == null
        ) {
          throw new BadRequestException(
            'Это мероприятие учитывает время по кругам. Укажите номер круга.',
          );
        }
        if (eventLaps.length === 0 && entry.lapNumber != null) {
          throw new BadRequestException(
            'У мероприятия нет кругов. Укажите общее время.',
          );
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
            timeMilliseconds:
              entry.lapNumber == null ? entry.timeMilliseconds : null,
          },
          update:
            entry.lapNumber == null
              ? {
                  status: entry.status,
                  timeMilliseconds: entry.timeMilliseconds,
                }
              : { status: 'OK' },
        });
        if (entry.status !== 'OK') {
          await tx.classHeatLapTime.deleteMany({
            where: { classHeatTimeId: heatTime.id },
          });
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
          select: {
            timeMilliseconds: true,
            eventLap: { select: { lapNumber: true } },
          },
        });
        const byLap = new Map(
          stored.map((lap) => [lap.eventLap.lapNumber, lap.timeMilliseconds]),
        );
        const complete = eventLaps.every((lap) => byLap.has(lap.lapNumber));
        const total = complete
          ? eventLaps.reduce(
              (sum, lap) => sum + (byLap.get(lap.lapNumber) ?? 0),
              0,
            )
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
    const byRegistration = new Map(
      existing.map((row) => [row.registrationId, row]),
    );
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
      await tx.classHeatTime.deleteMany({
        where: { classCompetitionId, stageId },
      });
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
    const row = await this.prisma.classCompetition.findUnique({
      where: { id },
      select: { eventId: true, startId: true, formatId: true },
    });
    const times = await this.prisma.classHeatTime.findMany({
      where: { classCompetitionId: id },
    });
    const timeByRegistration = lastOkTimes(cms, times);
    const places =
      cms.status === 'DONE' ? classifyBracket(cms, timeByRegistration) : null;
    const enrollmentByRegistration = new Map<string, string>();
    if (places && row?.startId != null && row.formatId != null) {
      const enrollments = await this.prisma.enrollment.findMany({
        where: {
          eventId: row.eventId,
          startId: row.startId,
          formatId: row.formatId,
          registrationId: { in: [...places.keys()] },
        },
        select: { id: true, registrationId: true },
      });
      for (const enrollment of enrollments) {
        enrollmentByRegistration.set(enrollment.registrationId, enrollment.id);
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.classCompetition.update({
        where: { id },
        data: { status: cms.status },
      });
      if (!places) return;
      for (const [registrationId, place] of places) {
        const timeMilliseconds = timeByRegistration.get(registrationId);
        if (timeMilliseconds == null) continue;
        const enrollmentId =
          enrollmentByRegistration.get(registrationId) ?? null;
        const existing = enrollmentId
          ? await tx.result.findUnique({ where: { enrollmentId } })
          : await tx.result.findFirst({
              where: { registrationId, enrollmentId: null },
            });
        if (existing) {
          await tx.result.update({
            where: { id: existing.id },
            data: { timeMilliseconds, place },
          });
        } else {
          await tx.result.create({
            data: {
              registrationId,
              enrollmentId,
              timeMilliseconds,
              place,
            },
          });
        }
      }
    });
  }

  private async requireEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        eventFormats: { include: { format: { select: { name: true } } } },
        starts: {
          select: {
            id: true,
            sortOrder: true,
            formats: { select: { formatId: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
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
        birthYear: true,
        formatId: true,
        status: true,
      },
    });
  }

  private assertMutableEvent(event: StoredEvent) {
    if (event.status === 'CANCELLED') {
      throw new BadRequestException(
        'Нельзя собрать сетку для отменённого мероприятия.',
      );
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
    if (
      formatId == null ||
      !event.eventFormats.some((item) => item.formatId === formatId)
    ) {
      throw new BadRequestException(
        'Такой формат не заявлен на этом мероприятии.',
      );
    }
  }

  private toView(
    row: StoredClassCompetition,
    cms: CmsCompetition,
    registrations: StoredRegistration[],
  ): ClassCompetitionView {
    const people = new Map(
      registrations.map((registration) => [registration.id, registration]),
    );
    const times = new Map(
      row.heatTimes.map((item) => [
        `${item.stageId}:${item.heatNumber}:${item.registrationId}`,
        item,
      ]),
    );
    const runs = new Map(cms.stages.map((stage) => [stage.stageId, stage]));
    const timeByRegistration = lastOkTimes(cms, row.heatTimes);
    const places =
      cms.status === 'DONE'
        ? classifyBracket(cms, timeByRegistration)
        : new Map<string, number>();

    return {
      id: row.id,
      eventId: row.eventId,
      startId: row.startId,
      formatId: row.formatId,
      gender: row.gender,
      sectionId: row.sectionId ?? 'CATEGORY',
      sectionKind: (row.sectionKind as RaceSectionKind | null) ?? 'CATEGORY',
      title: row.frozenTitle ?? '',
      subtitle: row.frozenSubtitle,
      targetGroupIds: row.targetGroupIds,
      targetWholeCategory: row.targetWholeCategory,
      capturedEnrollmentIds: row.capturedEnrollmentIds,
      youngestBound: row.frozenYoungestBound,
      status: cms.status,
      stages: orderFinals(cms.format.stages).map((spec) => {
        const source = sourceOfStage(cms.format.stages, spec.id);
        return {
          ...this.toStage(
            spec,
            runs.get(spec.id),
            people,
            times,
            row.startId == null,
          ),
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
    useRegistrationStatus: boolean,
  ): Omit<
    ClassCompetitionView['stages'][number],
    'sourceStageId' | 'qualifierStatus'
  > {
    const person = (registrationId: string) => {
      const registration = people.get(registrationId);
      return {
        registrationId,
        firstName: registration?.firstName ?? '',
        lastName: registration?.lastName ?? '',
        startNumber: registration?.startNumber ?? null,
        registrationStatus: useRegistrationStatus
          ? (registration?.status ?? RegistrationStatusCode.REGISTERED)
          : RegistrationStatusCode.REGISTERED,
      };
    };
    const stageStatus = (
      registrationId: string,
      stored: StoredHeatTime | undefined,
    ) =>
      stored?.qualificationStatus ?? person(registrationId).registrationStatus;
    return {
      stageId: spec.id,
      kind: spec.kind,
      label: spec.label ?? null,
      status: run?.status ?? 'PENDING',
      heats: (run?.heats ?? []).map((heat) => ({
        heatNumber: heat.heatNumber,
        slots: heat.slots.map((slot) => {
          const stored = times.get(
            `${spec.id}:${heat.heatNumber}:${slot.participantId}`,
          );
          return {
            ...person(slot.participantId),
            registrationStatus: stageStatus(slot.participantId, stored),
            position: slot.position,
            timeMilliseconds: stored?.timeMilliseconds ?? null,
            resultStatus:
              stored == null ||
              (stored.status === 'OK' && stored.timeMilliseconds == null)
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
    const snapshot = await this.ensureCapturedSnapshot(row, cms);
    const frozen = await this.freezeMissingQualifications(
      snapshot,
      cms,
      registrations,
    );
    return this.toView(frozen, cms, registrations);
  }

  private async freezeMissingQualifications(
    row: StoredClassCompetition,
    cms: CmsCompetition,
    registrations: StoredRegistration[],
  ): Promise<StoredClassCompetition> {
    const startNumbers = new Map(
      registrations.map((item) => [item.id, item.startNumber]),
    );
    const registrationStatus = new Map(
      registrations.map((item) => [item.id, item.status]),
    );
    const scoped = row.startId != null;
    const heatTimes = row.heatTimes.map((item) => ({ ...item }));
    const updates: Array<{
      stageId: string;
      registrationId: string;
      status: RegistrationStatus;
    }> = [];
    const clearQualification: Array<{
      stageId: string;
      registrationId: string;
    }> = [];
    const finishRegistrations = new Set<string>();

    for (const run of cms.stages) {
      if (run.status !== 'COMPLETED') continue;
      const spec = cms.format.stages.find((item) => item.id === run.stageId);
      const terminal = isTerminalStage(spec);
      const stageTimes = heatTimes.filter(
        (item) => item.stageId === run.stageId,
      );
      if (terminal) {
        for (const item of stageTimes) {
          const closedAsQualifier =
            item.qualificationStatus === RegistrationStatus.QQ ||
            item.qualificationStatus === RegistrationStatus.NQ;
          const closedAsConfirmed =
            item.qualificationStatus === RegistrationStatus.CONFIRMED;
          if (!closedAsQualifier && !closedAsConfirmed) continue;
          item.qualificationStatus = RegistrationStatus.FINISHED;
          clearQualification.push({
            stageId: run.stageId,
            registrationId: item.registrationId,
          });
          const current = scoped
            ? RegistrationStatusCode.REGISTERED
            : registrationStatus.get(item.registrationId);
          if (
            !scoped &&
            (current === RegistrationStatusCode.QQ ||
              current === RegistrationStatusCode.NQ ||
              current === RegistrationStatusCode.CONFIRMED) &&
            !appearedOnLaterStage(cms, run.stageId, item.registrationId)
          ) {
            finishRegistrations.add(item.registrationId);
          }
        }
      }
      if (stageTimes.every((item) => item.qualificationStatus != null))
        continue;
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
        const current = scoped
          ? RegistrationStatusCode.REGISTERED
          : registrationStatus.get(item.registrationId);
        const keepCurrent =
          !scoped &&
          !terminal &&
          !appearedOnLaterStage(cms, run.stageId, item.registrationId) &&
          isStageOutcomeStatus(current);
        const status = keepCurrent ? (current as RegistrationStatus) : computed;
        item.qualificationStatus = status;
        updates.push({
          stageId: run.stageId,
          registrationId: item.registrationId,
          status,
        });
        if (
          !scoped &&
          terminal &&
          status === RegistrationStatusCode.FINISHED &&
          (current === RegistrationStatusCode.QQ ||
            current === RegistrationStatusCode.NQ ||
            current === RegistrationStatusCode.CONFIRMED) &&
          !appearedOnLaterStage(cms, run.stageId, item.registrationId)
        ) {
          finishRegistrations.add(item.registrationId);
        }
      }
    }

    if (
      updates.length > 0 ||
      clearQualification.length > 0 ||
      finishRegistrations.size > 0
    ) {
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
              qualificationStatus: {
                in: [
                  RegistrationStatus.QQ,
                  RegistrationStatus.NQ,
                  RegistrationStatus.CONFIRMED,
                ],
              },
            },
            data: { qualificationStatus: RegistrationStatus.FINISHED },
          });
        }
        for (const registrationId of scoped ? [] : finishRegistrations) {
          await tx.registration.updateMany({
            where: {
              id: registrationId,
              status: {
                in: [
                  RegistrationStatus.QQ,
                  RegistrationStatus.NQ,
                  RegistrationStatus.CONFIRMED,
                ],
              },
            },
            data: { status: RegistrationStatus.FINISHED },
          });
        }
      });
    }
    return { ...row, heatTimes };
  }
}

function orderFinals(stages: CmsStageSpec[]): CmsStageSpec[] {
  const next = [...stages];
  const finalB = next.findIndex(
    (stage) => stage.kind === 'FINAL_B' || stage.id === 'final_b',
  );
  const finalA = next.findIndex(
    (stage) => stage.kind === 'FINAL_A' || stage.id === 'final_a',
  );
  if (finalB < 0 || finalA < 0 || finalB < finalA) return next;
  const [consolation] = next.splice(finalB, 1);
  const finalAIndex = next.findIndex(
    (stage) => stage.kind === 'FINAL_A' || stage.id === 'final_a',
  );
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
  return (
    stage.kind === 'FINAL' ||
    stage.kind === 'FINAL_A' ||
    stage.kind === 'FINAL_B'
  );
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
  const laterIds = new Set(
    cms.format.stages.slice(index + 1).map((stage) => stage.id),
  );
  return cms.stages.some((stage) => {
    if (!laterIds.has(stage.stageId) || stage.status === 'PENDING')
      return false;
    const inHeat = stage.heats.some((heat) =>
      heat.slots.some((slot) => slot.participantId === registrationId),
    );
    const inField = stage.entries.some(
      (entry) => entry.participantId === registrationId,
    );
    return inHeat || inField;
  });
}

export function fieldForSeeding(
  source: { sourceStageId: string; qualifierStatus: 'QQ' | 'NQ' } | null,
  qualified: string[],
  participants: string[],
): string[] {
  return source ? qualified : [...new Set(participants)];
}

function sourceOfStage(
  stages: CmsStageSpec[],
  stageId: string,
): { sourceStageId: string; qualifierStatus: 'QQ' | 'NQ' } | null {
  for (const stage of stages) {
    if (stage.advancement.type !== 'ROUTES') continue;
    for (const route of stage.advancement.routes) {
      if (route.toStageId !== stageId) continue;
      const qualifierStatus =
        route.cut.type === 'SECOND_HALF' || stageId === 'final_b' ? 'NQ' : 'QQ';
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
