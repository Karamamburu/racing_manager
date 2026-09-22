import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { advanceStage } from '../domain/advance-stage';
import { buildStartLists } from '../domain/build-start-lists';
import { assignManualHeats } from '../domain/seeding/manual';
import { DomainError, ErrorCodes } from '../domain/errors';
import { normalizeParticipants } from '../domain/participants';
import {
  AddStageOp,
  PatchHeatsOp,
  attachProposedTail,
  explainPlan,
  proposePlan,
  revisePlan,
} from '../domain/planning';
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
  preferredHeatSize?: number;
  maxHeatSize?: number;
  includePrologue?: boolean;
  includeFinalB?: boolean;
};

export type UpdatePlanInput = {
  format?: CompetitionFormat;
  removeStageIds?: string[];
  addStages?: AddStageOp[];
  patchHeats?: PatchHeatsOp[];
  preferredHeatSize?: number;
  maxHeatSize?: number;
  includePrologue?: boolean;
  includeFinalB?: boolean;
};

@Injectable()
export class CompetitionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateCompetitionInput) {
    const participants = normalizeParticipants(input.participants);
    const resolved = await this.resolveFormat(input, participants.length);
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

  async getPlan(id: string) {
    const competition = await this.load(id);
    const format = toFormat(competition.formatSnapshot);
    return explainPlan(format, {
      participantCount: this.planFieldSize(competition),
      includePrologue: format.stages.some((stage) => stage.kind === 'PROLOGUE'),
      includeFinalB: format.stages.some((stage) => stage.kind === 'FINAL_B'),
    });
  }

  async getStageProposal(competitionId: string, stageId: string) {
    const competition = await this.load(competitionId);
    this.assertMutable(competition);
    const format = toFormat(competition.formatSnapshot);
    const stageRun = this.requireStageRun(competition, stageId);
    if (stageRun.status !== 'SEEDED') {
      throw new DomainError(
        ErrorCodes.STAGE_NOT_READY,
        `Stage "${stageId}" must be SEEDED with results to propose the remaining grid.`,
        'stageId',
      );
    }
    if (!this.allResultsRecorded(stageRun)) {
      throw new DomainError(
        ErrorCodes.STAGE_NOT_READY,
        'All heat results must be recorded before proposing the remaining grid.',
        'heatResults',
      );
    }
    const okCount = this.countOkFinishers(stageRun);
    if (okCount < 1) {
      throw new DomainError(
        ErrorCodes.STAGE_NOT_READY,
        'At least one OK finisher is required to propose the remaining grid.',
        'heatResults',
      );
    }

    const lockedStageIds = new Set(
      competition.stageRuns
        .filter((run) => run.status === 'SEEDED' || run.status === 'COMPLETED')
        .map((run) => run.stageId),
    );
    const tail = proposePlan({
      participantCount: okCount,
      includePrologue: false,
    });
    const suggested = attachProposedTail(
      format,
      lockedStageIds,
      stageId,
      tail.format,
      okCount,
    );
    const plan = explainPlan(suggested, {
      participantCount: this.entriesForStage(competition, stageId).length,
      includePrologue: suggested.stages.some((stage) => stage.kind === 'PROLOGUE'),
      includeFinalB: suggested.stages.some((stage) => stage.kind === 'FINAL_B'),
    });
    return {
      fromStageId: stageId,
      participantCount: okCount,
      ...plan,
    };
  }

  async updatePlan(competitionId: string, input: UpdatePlanInput) {
    const competition = await this.load(competitionId);
    this.assertMutable(competition);
    const current = toFormat(competition.formatSnapshot);
    const participantCount = this.planFieldSize(competition);
    const hasMutations =
      (input.removeStageIds?.length ?? 0) > 0 ||
      (input.addStages?.length ?? 0) > 0 ||
      (input.patchHeats?.length ?? 0) > 0;

    let nextFormat: CompetitionFormat;
    if (hasMutations) {
      nextFormat = revisePlan({
        format: input.format ?? current,
        participantCount,
        removeStageIds: input.removeStageIds,
        addStages: input.addStages,
        patchHeats: input.patchHeats,
        preferredHeatSize: input.preferredHeatSize,
        maxHeatSize: input.maxHeatSize,
        includePrologue: input.includePrologue,
        includeFinalB: input.includeFinalB,
      }).format;
    } else {
      const format = input.format as CompetitionFormat;
      validateFormat(format);
      nextFormat = format;
    }

    this.assertPlanReplaceAllowed(competition, current, nextFormat);
    const started = competition.stageRuns.some((run) => run.status !== 'PENDING');
    if (started) {
      await this.syncRemainingStageRuns(competition, nextFormat);
    } else {
      await this.replaceDraftFormat(competition, nextFormat);
    }
    return this.getById(competition.id);
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

  async reassignHeats(
    competitionId: string,
    stageId: string,
    heats: ManualHeatAssignment[],
  ) {
    const competition = await this.load(competitionId);
    this.assertMutable(competition);
    const stageRun = this.requireStageRun(competition, stageId);
    if (stageRun.status !== 'SEEDED') {
      throw new DomainError(
        ErrorCodes.STAGE_NOT_READY,
        `Stage "${stageId}" must be SEEDED to reassign heats.`,
        'stageId',
      );
    }
    const hasResults = stageRun.heats.some((heat) =>
      heat.slots.some((slot) => slot.result != null),
    );
    if (hasResults) {
      throw new DomainError(
        ErrorCodes.STAGE_NOT_READY,
        `Stage "${stageId}" already has results and cannot be reassigned.`,
        'heatResults',
      );
    }

    const entries = this.entriesForStage(competition, stageId);
    const startLists: StartLists = {
      stageId,
      heats: assignManualHeats(
        toDomainParticipants(entries.map((entry) => entry.participant)),
        heats,
        undefined,
        { allowEmpty: true },
      ),
    };
    const byExternal = this.participantIds(competition);

    await this.prisma.$transaction(async (tx) => {
      await this.replaceHeats(tx, stageRun.id, startLists, byExternal);
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
    input: CreateCompetitionInput,
    participantCount: number,
  ): Promise<{ format: CompetitionFormat; formatId?: string }> {
    if (input.format) {
      validateFormat(input.format);
      return { format: input.format };
    }
    if (!input.presetId) {
      return {
        format: proposePlan({
          participantCount,
          preferredHeatSize: input.preferredHeatSize,
          maxHeatSize: input.maxHeatSize,
          includePrologue: input.includePrologue,
          includeFinalB: input.includeFinalB,
        }).format,
      };
    }
    const coded = getPreset(input.presetId);
    const stored = await this.prisma.formatRecord.findUnique({
      where: { key: input.presetId },
    });
    if (coded) {
      return { format: coded.format, formatId: stored?.id };
    }
    if (stored) {
      return { format: toFormat(stored.format), formatId: stored.id };
    }
    throw new DomainError(
      ErrorCodes.PRESET_NOT_FOUND,
      `Preset "${input.presetId}" was not found.`,
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

  private planFieldSize(competition: LoadedCompetition): number {
    const seeded = competition.stageRuns.filter((run) => run.status === 'SEEDED');
    if (seeded.length === 1 && this.allResultsRecorded(seeded[0])) {
      const ok = this.countOkFinishers(seeded[0]);
      if (ok > 0) {
        return ok;
      }
    }
    return competition.participants.length;
  }

  private allResultsRecorded(
    stageRun: LoadedCompetition['stageRuns'][number],
  ): boolean {
    return (
      stageRun.heats.length > 0 &&
      stageRun.heats.every((heat) => heat.slots.every((slot) => slot.result != null))
    );
  }

  private countOkFinishers(stageRun: LoadedCompetition['stageRuns'][number]): number {
    return stageRun.heats.reduce(
      (sum, heat) =>
        sum +
        heat.slots.filter(
          (slot) => slot.result?.status === 'OK' && slot.result.place != null,
        ).length,
      0,
    );
  }

  private assertPlanReplaceAllowed(
    competition: LoadedCompetition,
    current: CompetitionFormat,
    nextFormat: CompetitionFormat,
  ): void {
    const nextById = new Map(nextFormat.stages.map((stage) => [stage.id, stage]));
    const currentById = new Map(current.stages.map((stage) => [stage.id, stage]));
    const started = competition.stageRuns.some((run) => run.status !== 'PENDING');
    if (!started) {
      return;
    }

    for (const run of competition.stageRuns) {
      const nextStage = nextById.get(run.stageId);
      if (run.status === 'SEEDED' || run.status === 'COMPLETED') {
        if (!nextStage) {
          throw new DomainError(
            ErrorCodes.COMPETITION_INVALID,
            `Cannot remove ${run.status} stage "${run.stageId}".`,
            'format.stages',
          );
        }
        const currentStage = currentById.get(run.stageId);
        if (
          currentStage &&
          JSON.stringify(currentStage.heats) !== JSON.stringify(nextStage.heats)
        ) {
          throw new DomainError(
            ErrorCodes.COMPETITION_INVALID,
            `Cannot change heats of ${run.status} stage "${run.stageId}".`,
            'format.stages',
          );
        }
        if (
          run.status === 'COMPLETED' &&
          currentStage &&
          JSON.stringify(currentStage.advancement) !==
            JSON.stringify(nextStage.advancement)
        ) {
          throw new DomainError(
            ErrorCodes.COMPETITION_INVALID,
            `Cannot change COMPLETED stage "${run.stageId}".`,
            'format.stages',
          );
        }
      }
    }

    for (const stage of current.stages) {
      if (nextById.has(stage.id)) {
        continue;
      }
      const run = competition.stageRuns.find((item) => item.stageId === stage.id);
      if (run && run.status !== 'PENDING') {
        throw new DomainError(
          ErrorCodes.COMPETITION_INVALID,
          `Cannot remove ${run.status} stage "${stage.id}".`,
          'format.stages',
        );
      }
      const hasEntries = competition.stageEntries.some(
        (entry) => entry.stageId === stage.id,
      );
      if (hasEntries) {
        throw new DomainError(
          ErrorCodes.COMPETITION_INVALID,
          `Cannot remove stage "${stage.id}" that already has participants.`,
          'format.stages',
        );
      }
      if (run && run.heats.length > 0) {
        throw new DomainError(
          ErrorCodes.COMPETITION_INVALID,
          `Cannot remove stage "${stage.id}" that already has heats.`,
          'format.stages',
        );
      }
    }
  }

  private async replaceDraftFormat(
    competition: LoadedCompetition,
    nextFormat: CompetitionFormat,
  ): Promise<void> {
    const sources = sourceStageIds(nextFormat);
    await this.prisma.$transaction(async (tx) => {
      await tx.stageEntry.deleteMany({ where: { competitionId: competition.id } });
      await tx.stageRun.deleteMany({ where: { competitionId: competition.id } });
      await tx.competition.update({
        where: { id: competition.id },
        data: { formatSnapshot: nextFormat as Prisma.InputJsonValue },
      });
      await tx.stageRun.createMany({
        data: nextFormat.stages.map((stage) => ({
          competitionId: competition.id,
          stageId: stage.id,
        })),
      });
      await tx.stageEntry.createMany({
        data: sources.flatMap((stageId) =>
          competition.participants.map((participant) => ({
            competitionId: competition.id,
            stageId,
            participantId: participant.id,
            seed: participant.seed,
          })),
        ),
      });
    });
  }

  private async syncRemainingStageRuns(
    competition: LoadedCompetition,
    nextFormat: CompetitionFormat,
  ): Promise<void> {
    const nextIds = new Set(nextFormat.stages.map((stage) => stage.id));
    const existingIds = new Set(competition.stageRuns.map((run) => run.stageId));

    await this.prisma.$transaction(async (tx) => {
      for (const run of competition.stageRuns) {
        if (nextIds.has(run.stageId)) {
          continue;
        }
        await tx.stageRun.delete({ where: { id: run.id } });
      }
      for (const stage of nextFormat.stages) {
        if (existingIds.has(stage.id)) {
          continue;
        }
        await tx.stageRun.create({
          data: {
            competitionId: competition.id,
            stageId: stage.id,
          },
        });
      }
      await tx.competition.update({
        where: { id: competition.id },
        data: { formatSnapshot: nextFormat as Prisma.InputJsonValue },
      });
    });
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
