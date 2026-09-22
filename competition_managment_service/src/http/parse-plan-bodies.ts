import { DomainError, ErrorCodes } from '../domain/errors';
import { AddStageOp, PatchHeatsOp } from '../domain/planning';
import { isRecord, readArray, readBoolean, readInteger, readObject, readString } from './parse-helpers';
import { parseFormat, parseStage } from './parse-format';

function parsePlannerOptions(body: Record<string, unknown>) {
  const preferredHeatSize = readInteger(body.preferredHeatSize, 'preferredHeatSize', false);
  const maxHeatSize = readInteger(body.maxHeatSize, 'maxHeatSize', false);
  const includePrologue = readBoolean(body.includePrologue, 'includePrologue', false);
  const includeFinalB = readBoolean(body.includeFinalB, 'includeFinalB', false);
  return { preferredHeatSize, maxHeatSize, includePrologue, includeFinalB };
}

export function parseProposeBody(body: unknown) {
  if (!isRecord(body)) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'Request body must be a JSON object.',
    );
  }
  const participantCount = readInteger(body.participantCount, 'participantCount');
  return {
    participantCount: participantCount as number,
    ...parsePlannerOptions(body),
  };
}

function parseRemoveStageIds(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readArray(value, 'removeStageIds').map((item, index) => {
    const id = readString(item, `removeStageIds[${index}]`);
    return id as string;
  });
}

function parseAddStages(value: unknown): AddStageOp[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readArray(value, 'addStages').map((item, index) => {
    const path = `addStages[${index}]`;
    const raw = readObject(item, path);
    return {
      afterStageId:
        raw.afterStageId === null
          ? null
          : (readString(raw.afterStageId, `${path}.afterStageId`) as string),
      stage: parseStage(raw.stage, `${path}.stage`),
    };
  });
}

function parsePatchHeats(value: unknown): PatchHeatsOp[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readArray(value, 'patchHeats').map((item, index) => {
    const path = `patchHeats[${index}]`;
    const raw = readObject(item, path);
    return {
      stageId: readString(raw.stageId, `${path}.stageId`) as string,
      heatCount: readInteger(raw.heatCount, `${path}.heatCount`, false),
      heatSize: readInteger(raw.heatSize, `${path}.heatSize`, false),
    };
  });
}

export function parseReviseBody(body: unknown) {
  if (!isRecord(body)) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'Request body must be a JSON object.',
    );
  }
  const participantCount = readInteger(body.participantCount, 'participantCount');
  return {
    format: parseFormat(body.format, 'format'),
    participantCount: participantCount as number,
    removeStageIds: parseRemoveStageIds(body.removeStageIds),
    addStages: parseAddStages(body.addStages),
    patchHeats: parsePatchHeats(body.patchHeats),
    ...parsePlannerOptions(body),
  };
}

export function parsePutPlanBody(body: unknown) {
  if (!isRecord(body)) {
    throw new DomainError(
      ErrorCodes.COMPETITION_INVALID,
      'Request body must be a JSON object.',
    );
  }
  const format = body.format === undefined ? undefined : parseFormat(body.format, 'format');
  const removeStageIds = parseRemoveStageIds(body.removeStageIds);
  const addStages = parseAddStages(body.addStages);
  const patchHeats = parsePatchHeats(body.patchHeats);
  if (
    format === undefined &&
    (removeStageIds === undefined || removeStageIds.length === 0) &&
    (addStages === undefined || addStages.length === 0) &&
    (patchHeats === undefined || patchHeats.length === 0)
  ) {
    throw new DomainError(
      ErrorCodes.COMPETITION_INVALID,
      'Provide format, removeStageIds, addStages, or patchHeats.',
    );
  }
  return {
    format,
    removeStageIds,
    addStages,
    patchHeats,
    ...parsePlannerOptions(body),
  };
}

export function parseCreatePlannerOptions(body: Record<string, unknown>) {
  return parsePlannerOptions(body);
}
