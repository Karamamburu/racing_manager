import { BadRequestException } from '@nestjs/common';
import { CmsStageSpec } from './cms.types';

export const ADDABLE_STAGE_KINDS = ['PROLOGUE', 'EIGHTHFINAL', 'QUARTERFINAL'] as const;

export type AddableStageKind = (typeof ADDABLE_STAGE_KINDS)[number];

const PREFERRED_HEAT_SIZE = 6;

const STAGE_IDS: Record<AddableStageKind, string> = {
  PROLOGUE: 'prologue',
  EIGHTHFINAL: 'eighth',
  QUARTERFINAL: 'qf',
};

export type AddStageOp = {
  afterStageId: string | null;
  stage: CmsStageSpec;
};

export function buildAddStageOp(
  kind: AddableStageKind,
  stages: CmsStageSpec[],
  participantCount: number,
): AddStageOp {
  const id = STAGE_IDS[kind];
  if (stages.some((stage) => stage.id === id)) {
    throw new BadRequestException('Этот этап уже есть в сетке.');
  }
  const field = Math.max(1, participantCount);

  if (kind === 'PROLOGUE') {
    const nextId = stages[0]?.id;
    if (!nextId) {
      throw new BadRequestException('В сетке нет этапа, в который можно перейти из пролога.');
    }
    return { afterStageId: null, stage: prologueStage(nextId, field) };
  }

  const ids = new Set(stages.map((stage) => stage.id));
  const afterStageId =
    kind === 'EIGHTHFINAL'
      ? ids.has('prologue')
        ? 'prologue'
        : null
      : ids.has('eighth')
        ? 'eighth'
        : ids.has('prologue')
          ? 'prologue'
          : null;
  const nextId = afterStageId ? singleSuccessor(stages, afterStageId) : stages[0]?.id;
  if (!nextId) {
    throw new BadRequestException('В сетке нет этапа, перед которым можно вставить новый.');
  }
  return { afterStageId, stage: knockoutStage(kind, nextId, field) };
}

function singleSuccessor(stages: CmsStageSpec[], stageId: string): string {
  const stage = stages.find((item) => item.id === stageId);
  if (!stage || stage.advancement.type !== 'ROUTES' || stage.advancement.routes.length !== 1) {
    throw new BadRequestException('Этап ведёт сразу в несколько следующих, его нельзя сдвинуть автоматически.');
  }
  return stage.advancement.routes[0].toStageId;
}

function prologueStage(nextStageId: string, participantCount: number): CmsStageSpec {
  return {
    id: 'prologue',
    kind: 'PROLOGUE',
    label: 'Prologue',
    heats: { type: 'NONE' },
    ranking: { type: 'BY_PLACE' },
    advancement: {
      type: 'ROUTES',
      routes: [{ cut: { type: 'TOP_N', n: participantCount }, toStageId: nextStageId }],
    },
  };
}

function knockoutStage(
  kind: 'EIGHTHFINAL' | 'QUARTERFINAL',
  nextStageId: string,
  participantCount: number,
): CmsStageSpec {
  return {
    id: STAGE_IDS[kind],
    kind,
    label: kind === 'EIGHTHFINAL' ? '1/8 final' : '1/4 final',
    heats: {
      type: 'HEATS',
      heatCount: Math.max(1, Math.ceil(participantCount / PREFERRED_HEAT_SIZE)),
      heatSize: PREFERRED_HEAT_SIZE,
      remainder: 'BALANCED',
      seeding: { type: 'SNAKE' },
    },
    ranking: { type: 'BY_PLACE' },
    advancement: {
      type: 'ROUTES',
      routes: [
        {
          cut: { type: 'TOP_FRACTION', numerator: 1, denominator: 2 },
          toStageId: nextStageId,
        },
      ],
    },
  };
}
