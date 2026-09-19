import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { advanceStage } from '../domain/advance-stage';
import { buildStartLists } from '../domain/build-start-lists';
import { DomainError, ErrorCodes } from '../domain/errors';
import { normalizeParticipants } from '../domain/participants';
import { validateFormat } from '../domain/validate-format';
import {
  AdvancementRoute,
  CompetitionFormat,
  HeatResult,
  ManualHeatAssignment,
  Participant,
  StartLists,
} from '../domain/types';
import { getPreset } from '../presets';
import { advancePersistencePlan } from './advance-plan';
import {
  toCompetitionResponse,
  toDomainParticipants,
  toFormat,
  toHeatResults,
} from './mappers';
import { PrismaService } from './prisma.service';
import { sourceStageIds } from './stage-graph';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const competitionInclude = {
  participants: { orderBy: { seed: 'asc' as const } },
  stageRuns: {
    orderBy: { stageId: 'asc' as const },
    include: {
      heats: {
        orderBy: { heatNumber: 'asc' as const },
        include: {
          slots: {
            orderBy: { position: 'asc' as const },
            include: { participant: true, result: true },
          },
        },
      },
      rankings: {
        orderBy: { rank: 'asc' as const },
        include: { participant: true },
      },
    },
  },
  stageEntries: {
    include: { participant: true },
    orderBy: [{ stageId: 'asc' as const }, { seed: 'asc' as const }],
  },
} satisfies Prisma.CompetitionInclude;

type LoadedCompetition = Prisma.CompetitionGetPayload<{
  include: typeof competitionInclude;
}>;

export type CreateCompetitionInput = {
  name?: string;
  presetId?: string;
  format?: CompetitionFormat;
  participants: Participant[];
};

@Injectable()
export class CompetitionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateCompetitionInput) {
    const participants = normalizeParticipants(input.participants);
    const resolved = await this.resolveFormat(input.presetId, input.format);
    const sources = sourceStageIds(resolved.format);
    if (sources.length === 0) {
      throw new DomainError(
        ErrorCodes.FORMAT_INVALID,
        'Format must have at least one source stage.',
        'format.stages',
      );
    }

    const created = await this.prisma.competition.create({
      data: {
        name: input.name ?? null,
        formatId: resolved.formatId ?? null,
        formatSnapshot: resolved.format as Prisma.InputJsonValue,
        participants: {
          create: participants.map((participant) => ({
            externalId: participant.id,
            seed: participant.seed,
            meta: participant.meta as Prisma.InputJsonValue | undefined,
          })),
        },
        stageRuns: {
          create: resolved.format.stages.map((stage) => ({
            stageId: stage.id,
          })),
        },
      },
      include: { participants: true },
    });

    const bySeed = new Map(
      created.participants.map((row) => [row.seed, row.id]),
    );
    await this.prisma.stageEntry.createMany({
      data: sources.flatMap((stageId) =>
        participants.map((participant) => ({
          competitionId: created.id,
          stageId,
          participantId: bySeed.get(participant.seed) as string,
          seed: participant.seed,
        })),
      ),
    });

    return this.getById(created.id);
  }

  async getById(id: string) {
    const competition = await this.load(id);
    return toCompetitionResponse(competition);
  }

  async seedStage(
    competitionId: string,
    stageId: string,
    manualHeats?: ManualHeatAssignment[],
  ) {
    const competition = await this.load(competitionId);
    this.assertMutable(competition);
    const format = toFormat(competition.formatSnapshot);
    const stageRun = this.requireStageRun(competition, stageId);
    if (stageRun.status !== 'PENDING') {
      throw new DomainError(
        ErrorCodes.STAGE_NOT_READY,
        `Stage "${stageId}" must be PENDING to build start lists.`,
        'stageId',
      );
    }

    const entries = this.entriesForStage(competition, stageId);
    if (entries.length === 0) {
      throw new DomainError(
        ErrorCodes.STAGE_NOT_READY,
        `Stage "${stageId}" has no participants.`,
        'stageId',
      );
    }

    const startLists = buildStartLists({
      format,
      stageId,
      participants: toDomainParticipants(entries.map((entry) => entry.participant)),
      manualHeats,
    });
    const byExternal = this.participantIds(competition);

    await this.prisma.$transaction(async (tx) => {
      await this.replaceHeats(tx, stageRun.id, startLists, byExternal);
      await tx.stageRun.update({
        where: { id: stageRun.id },
        data: { status: 'SEEDED' },
      });
      if (competition.status === 'DRAFT') {
        await tx.competition.update({
          where: { id: competition.id },
          data: { status: 'IN_PROGRESS' },
        });
      }
    });

    return this.getById(competition.id);
  }

  async recordResults(
    competitionId: string,
    stageId: string,
    heatResults: HeatResult[],
  ) {
    const competition = await this.load(competitionId);
    this.assertMutable(competition);
    const stageRun = this.requireStageRun(competition, stageId);
    if (stageRun.status !== 'SEEDED') {
      throw new DomainError(
        ErrorCodes.STAGE_NOT_READY,
        `Stage "${stageId}" must be SEEDED to record results.`,
        'stageId',
      );
    }

    const slotByKey = new Map<string, string>();
    for (const heat of stageRun.heats) {
      for (const slot of heat.slots) {
        slotByKey.set(
          `${heat.heatNumber}:${slot.participant.externalId}`,
          slot.id,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const heat of heatResults) {
        for (const result of heat.results) {
          const slotId = slotByKey.get(`${heat.heatNumber}:${result.participantId}`);
          if (!slotId) {
            throw new DomainError(
              ErrorCodes.RESULT_INVALID,
              `Participant "${result.participantId}" is not in heat ${heat.heatNumber}.`,
              'heatResults',
            );
          }
          await tx.heatResult.upsert({
            where: { heatSlotId: slotId },
            create: {
              heatSlotId: slotId,
              status: result.status,
              place: result.place ?? null,
            },
            update: {
              status: result.status,
              place: result.place ?? null,
            },
          });
        }
      }
    });

    return this.getById(competition.id);
  }

  async advanceStage(
    competitionId: string,
    stageId: string,
    routes?: AdvancementRoute[],
  ) {
    const competition = await this.load(competitionId);
    this.assertMutable(competition);
    const format = toFormat(competition.formatSnapshot);
    const stageRun = this.requireStageRun(competition, stageId);
    if (stageRun.status !== 'SEEDED') {
      throw new DomainError(
        ErrorCodes.STAGE_NOT_READY,
        `Stage "${stageId}" must be SEEDED to advance.`,
        'stageId',
      );
    }

    const missing = stageRun.heats.flatMap((heat) =>
      heat.slots.filter((slot) => slot.result == null),
    );
    if (missing.length > 0) {
      throw new DomainError(
        ErrorCodes.STAGE_NOT_READY,
        'All heat results must be recorded before advancing.',
        'heatResults',
      );
    }

    const entries = this.entriesForStage(competition, stageId);
    const result = advanceStage({
      format,
      stageId,
      participants: toDomainParticipants(entries.map((entry) => entry.participant)),
      heatResults: toHeatResults(stageRun.heats),
      routes,
    });
    const plan = advancePersistencePlan(result);
    const byExternal = this.participantIds(competition);
    const runByStage = new Map(
      competition.stageRuns.map((run) => [run.stageId, run]),
    );

    await this.prisma.$transaction(async (tx) => {
      if (plan.eliminatedIds.length > 0) {
        await tx.stageEntry.updateMany({
          where: {
            competitionId: competition.id,
            stageId,
            participant: { externalId: { in: plan.eliminatedIds } },
          },
          data: { eliminated: true },
        });
      }

      await tx.stageRanking.deleteMany({ where: { stageRunId: stageRun.id } });
      await tx.stageRanking.createMany({
        data: plan.rankings.map((entry) => ({
          stageRunId: stageRun.id,
          participantId: this.requireParticipantId(byExternal, entry.participant.id),
          rank: entry.rank,
          heatNumber: entry.heatNumber,
          status: entry.status,
          place: entry.place,
        })),
      });

      for (const route of plan.routes) {
        const nextRun = runByStage.get(route.toStageId);
        if (!nextRun) {
          throw new DomainError(
            ErrorCodes.STAGE_NOT_FOUND,
            `Stage "${route.toStageId}" is not in the competition.`,
            'advancement',
          );
        }
        await tx.stageEntry.createMany({
          data: route.participants.map((participant) => ({
            competitionId: competition.id,
            stageId: route.toStageId,
            participantId: this.requireParticipantId(byExternal, participant.id),
            seed: participant.seed,
          })),
        });
        if (route.startLists) {
          await this.replaceHeats(tx, nextRun.id, route.startLists, byExternal);
          await tx.stageRun.update({
            where: { id: nextRun.id },
            data: { status: 'SEEDED' },
          });
        }
      }

      await tx.stageRun.update({
        where: { id: stageRun.id },
        data: { status: 'COMPLETED' },
      });

      const statusByStage = new Map(
        competition.stageRuns.map((run) => [run.stageId, run.status]),
      );
      statusByStage.set(stageId, 'COMPLETED');
      const stagesWithPeople = new Set(
        competition.stageEntries.map((entry) => entry.stageId),
      );
      for (const route of plan.routes) {
        if (route.participants.length > 0) {
          stagesWithPeople.add(route.toStageId);
        }
        if (route.startLists) {
          statusByStage.set(route.toStageId, 'SEEDED');
        }
      }
      const stillOpen = [...statusByStage.entries()].some(([id, status]) => {
        if (status === 'SEEDED') {
          return true;
        }
        return status === 'PENDING' && stagesWithPeople.has(id);
      });
      if (!stillOpen) {
        await tx.competition.update({
          where: { id: competition.id },
          data: { status: 'DONE' },
        });
      }
    });

    return this.getById(competition.id);
  }

  private async resolveFormat(
    presetId: string | undefined,
    format: CompetitionFormat | undefined,
  ): Promise<{ format: CompetitionFormat; formatId?: string }> {
    if (format) {
      validateFormat(format);
      return { format };
    }
    if (!presetId) {
      throw new DomainError(
        ErrorCodes.COMPETITION_INVALID,
        'Either presetId or format is required.',
        'presetId',
      );
    }
    const coded = getPreset(presetId);
    const stored = await this.prisma.formatRecord.findUnique({
      where: { key: presetId },
    });
    if (coded) {
      return { format: coded.format, formatId: stored?.id };
    }
    if (stored) {
      return { format: toFormat(stored.format), formatId: stored.id };
    }
    throw new DomainError(
      ErrorCodes.PRESET_NOT_FOUND,
      `Preset "${presetId}" was not found.`,
      'presetId',
    );
  }

  private async load(id: string): Promise<LoadedCompetition> {
    if (!UUID_RE.test(id)) {
      throw new DomainError(
        ErrorCodes.COMPETITION_NOT_FOUND,
        `Competition "${id}" was not found.`,
        'id',
      );
    }
    const competition = await this.prisma.competition.findUnique({
      where: { id },
      include: competitionInclude,
    });
    if (!competition) {
      throw new DomainError(
        ErrorCodes.COMPETITION_NOT_FOUND,
        `Competition "${id}" was not found.`,
        'id',
      );
    }
    return competition;
  }

  private assertMutable(competition: LoadedCompetition): void {
    if (competition.status === 'DONE') {
      throw new DomainError(
        ErrorCodes.COMPETITION_INVALID,
        'Competition is DONE and cannot be changed.',
        'id',
      );
    }
  }

  private requireStageRun(competition: LoadedCompetition, stageId: string) {
    const stageRun = competition.stageRuns.find((run) => run.stageId === stageId);
    if (!stageRun) {
      throw new DomainError(
        ErrorCodes.STAGE_NOT_FOUND,
        `Stage "${stageId}" is not in the competition.`,
        'stageId',
      );
    }
    return stageRun;
  }

  private entriesForStage(competition: LoadedCompetition, stageId: string) {
    return competition.stageEntries.filter((entry) => entry.stageId === stageId);
  }

  private participantIds(competition: LoadedCompetition): Map<string, string> {
    return new Map(
      competition.participants.map((row) => [row.externalId, row.id]),
    );
  }

  private requireParticipantId(byExternal: Map<string, string>, externalId: string): string {
    const id = byExternal.get(externalId);
    if (!id) {
      throw new DomainError(
        ErrorCodes.PARTICIPANT_INVALID,
        `Unknown participant "${externalId}".`,
        'participants',
      );
    }
    return id;
  }

  private async replaceHeats(
    tx: Prisma.TransactionClient,
    stageRunId: string,
    startLists: StartLists,
    byExternal: Map<string, string>,
  ): Promise<void> {
    await tx.heat.deleteMany({ where: { stageRunId } });
    for (const heat of startLists.heats) {
      await tx.heat.create({
        data: {
          stageRunId,
          heatNumber: heat.heatNumber,
          slots: {
            create: heat.slots.map((slot) => ({
              position: slot.position,
              participantId: this.requireParticipantId(byExternal, slot.participant.id),
            })),
          },
        },
      });
    }
  }
}
