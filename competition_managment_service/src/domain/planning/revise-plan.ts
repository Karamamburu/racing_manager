import { DomainError, ErrorCodes } from '../errors';
import { CompetitionFormat, StageSpec } from '../types';
import { findStage, validateFormat } from '../validate-format';
import { expectedFieldByStage } from './expected-field';
import { explainPlan } from './explain-plan';
import { AddStageOp, ProposedPlan, RevisePlanInput } from './types';

function cloneFormat(format: CompetitionFormat): CompetitionFormat {
  return JSON.parse(JSON.stringify(format)) as CompetitionFormat;
}

function removalTarget(stage: StageSpec): { successorId: string; sideStageIds: string[] } {
  if (stage.advancement.type !== 'ROUTES') {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      `Cannot remove terminal stage "${stage.id}" without a successor.`,
      'removeStageIds',
    );
  }
  const destinations = [...new Set(stage.advancement.routes.map((route) => route.toStageId))];
  if (destinations.length === 0) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      `Cannot remove terminal stage "${stage.id}" without a successor.`,
      'removeStageIds',
    );
  }
  if (destinations.length === 1) {
    return { successorId: destinations[0], sideStageIds: [] };
  }
  const primary =
    stage.advancement.routes.find((route) => route.cut.type === 'FIRST_HALF')?.toStageId ??
    destinations[0];
  return {
    successorId: primary,
    sideStageIds: destinations.filter((id) => id !== primary),
  };
}

function raiseHeatSize(stage: StageSpec, incoming: number): void {
  if (stage.heats.type !== 'HEATS' || incoming < 1) {
    return;
  }
  const heatCount =
    stage.heats.heatCount ?? (stage.kind === 'SEMIFINAL' ? 2 : 1);
  const needed = Math.ceil(incoming / heatCount);
  const current = stage.heats.heatSize ?? 1;
  stage.heats.heatSize = Math.max(current, needed);
  if (stage.heats.heatCount == null && stage.kind === 'SEMIFINAL') {
    stage.heats.heatCount = 2;
  }
}

function dropInboundRoutes(format: CompetitionFormat, removedId: string): void {
  for (const stage of format.stages) {
    if (stage.advancement.type !== 'ROUTES') continue;
    const routes = stage.advancement.routes.filter((route) => route.toStageId !== removedId);
    stage.advancement =
      routes.length === 0 ? { type: 'NONE' } : { type: 'ROUTES', routes };
  }
}

function rewireRemoved(format: CompetitionFormat, removedId: string, successorId: string): void {
  for (const stage of format.stages) {
    if (stage.advancement.type !== 'ROUTES') {
      continue;
    }
    for (const route of stage.advancement.routes) {
      if (route.toStageId === removedId) {
        route.toStageId = successorId;
      }
    }
  }
}

function prependStage(format: CompetitionFormat, stage: StageSpec): void {
  if (format.stages.some((item) => item.id === stage.id)) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      `Duplicate stage id "${stage.id}".`,
      'addStages.stage.id',
    );
  }

  const inserted: StageSpec = JSON.parse(JSON.stringify(stage)) as StageSpec;
  const former = format.stages[0];
  if (!former) {
    format.stages.push(inserted);
    return;
  }

  if (inserted.advancement.type === 'NONE') {
    inserted.advancement = {
      type: 'ROUTES',
      routes: [{ cut: { type: 'TOP_N', n: 1 }, toStageId: former.id }],
    };
  } else if (inserted.advancement.routes.length === 1) {
    inserted.advancement = {
      type: 'ROUTES',
      routes: [
        {
          ...inserted.advancement.routes[0],
          toStageId: former.id,
        },
      ],
    };
  } else {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      `Prepended stage "${inserted.id}" must advance through a single route.`,
      'addStages.stage.advancement',
    );
  }

  format.stages.unshift(inserted);
}

function insertStage(format: CompetitionFormat, op: AddStageOp): void {
  if (op.afterStageId == null) {
    prependStage(format, op.stage);
    return;
  }

  const after = findStage(format, op.afterStageId, 'addStages.afterStageId');
  if (format.stages.some((stage) => stage.id === op.stage.id)) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      `Duplicate stage id "${op.stage.id}".`,
      'addStages.stage.id',
    );
  }

  const inserted: StageSpec = JSON.parse(JSON.stringify(op.stage)) as StageSpec;
  if (after.advancement.type === 'ROUTES') {
    const previous = after.advancement;
    after.advancement = {
      type: 'ROUTES',
      routes: previous.routes.map((route) => ({
        ...route,
        toStageId: inserted.id,
      })),
    };
    if (inserted.advancement.type === 'NONE') {
      inserted.advancement = previous;
    }
  } else {
    after.advancement = {
      type: 'ROUTES',
      routes: [{ cut: { type: 'TOP_N', n: 1 }, toStageId: inserted.id }],
    };
  }

  const index = format.stages.findIndex((stage) => stage.id === after.id);
  format.stages.splice(index + 1, 0, inserted);
}

export function revisePlan(input: RevisePlanInput): ProposedPlan {
  const format = cloneFormat(input.format);
  const removeStageIds = input.removeStageIds ?? [];
  const addStages = input.addStages ?? [];
  const patchHeats = input.patchHeats ?? [];

  if (removeStageIds.length === 0 && addStages.length === 0 && patchHeats.length === 0) {
    validateFormat(format);
    return explainPlan(format, input);
  }

  const expected = expectedFieldByStage(format, input.participantCount);
  const successorByRemoved = new Map<string, string>();
  const droppedTerminals: string[] = [];
  const sideStageIds: string[] = [];
  for (const stageId of removeStageIds) {
    const removed = findStage(format, stageId, 'removeStageIds');
    if (removed.advancement.type === 'NONE') {
      droppedTerminals.push(stageId);
      continue;
    }
    const target = removalTarget(removed);
    successorByRemoved.set(stageId, target.successorId);
    sideStageIds.push(...target.sideStageIds);
    const successor = findStage(format, target.successorId, 'removeStageIds');
    raiseHeatSize(successor, expected.get(stageId) ?? 0);
  }

  for (const [stageId, successorId] of successorByRemoved) {
    rewireRemoved(format, stageId, successorId);
  }
  for (const stageId of droppedTerminals) {
    dropInboundRoutes(format, stageId);
  }
  if (removeStageIds.length > 0) {
    const drop = new Set(removeStageIds);
    format.stages = format.stages.filter((stage) => !drop.has(stage.id));
  }
  if (sideStageIds.length > 0) {
    const referenced = new Set<string>();
    for (const stage of format.stages) {
      if (stage.advancement.type !== 'ROUTES') continue;
      for (const route of stage.advancement.routes) referenced.add(route.toStageId);
    }
    const orphans = new Set(sideStageIds.filter((id) => !referenced.has(id)));
    format.stages = format.stages.filter((stage) => !orphans.has(stage.id));
  }

  for (const op of addStages) {
    insertStage(format, op);
  }

  for (const patch of patchHeats) {
    const stage = findStage(format, patch.stageId, 'patchHeats.stageId');
    if (stage.heats.type !== 'HEATS') {
      throw new DomainError(
        ErrorCodes.FORMAT_INVALID,
        `Cannot patch heats on stage "${patch.stageId}" with layout NONE.`,
        'patchHeats',
      );
    }
    if (patch.heatCount == null && patch.heatSize == null) {
      throw new DomainError(
        ErrorCodes.FORMAT_INVALID,
        'patchHeats requires heatCount and/or heatSize.',
        'patchHeats',
      );
    }
    if (patch.heatCount != null) {
      stage.heats.heatCount = patch.heatCount;
    }
    if (patch.heatSize != null) {
      stage.heats.heatSize = patch.heatSize;
    }
  }

  validateFormat(format);
  return explainPlan(format, input);
}
