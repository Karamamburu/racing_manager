import { DomainError, ErrorCodes } from '../domain/errors';
import {
  HeatResult,
  ManualHeatAssignment,
  Participant,
  ParticipantResult,
} from '../domain/types';
import { parseFormat, parseResultStatus } from './parse-format';
import {
  isRecord,
  readArray,
  readInteger,
  readMeta,
  readObject,
  readString,
} from './parse-helpers';

export function parseParticipants(value: unknown, path = 'participants'): Participant[] {
  const items = readArray(value, path);
  return items.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const raw = readObject(item, itemPath);
    const participant: Participant = {
      id: readString(raw.id, `${itemPath}.id`) as string,
      seed: readInteger(raw.seed, `${itemPath}.seed`) as number,
    };
    const meta = readMeta(raw.meta, `${itemPath}.meta`);
    if (meta) {
      participant.meta = meta;
    }
    return participant;
  });
}

export function parseManualHeats(
  value: unknown,
  path = 'manualHeats',
): ManualHeatAssignment[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const items = readArray(value, path);
  return items.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const raw = readObject(item, itemPath);
    const idsRaw = readArray(raw.participantIds, `${itemPath}.participantIds`);
    return {
      heatNumber: readInteger(raw.heatNumber, `${itemPath}.heatNumber`) as number,
      participantIds: idsRaw.map((id, idIndex) => {
        const parsed = readString(id, `${itemPath}.participantIds[${idIndex}]`);
        if (!parsed) {
          throw new DomainError(
            ErrorCodes.MANUAL_ASSIGNMENT_INVALID,
            'participantIds must be non-empty strings.',
            `${itemPath}.participantIds[${idIndex}]`,
          );
        }
        return parsed;
      }),
    };
  });
}

function parseParticipantResult(value: unknown, path: string): ParticipantResult {
  const raw = readObject(value, path);
  const result: ParticipantResult = {
    participantId: readString(raw.participantId, `${path}.participantId`) as string,
    status: parseResultStatus(raw.status, `${path}.status`),
  };
  const place = readInteger(raw.place, `${path}.place`, false);
  if (place !== undefined) {
    result.place = place;
  }
  return result;
}

export function parseHeatResults(value: unknown, path = 'heatResults'): HeatResult[] {
  const items = readArray(value, path);
  return items.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const raw = readObject(item, itemPath);
    const resultsRaw = readArray(raw.results, `${itemPath}.results`);
    return {
      heatNumber: readInteger(raw.heatNumber, `${itemPath}.heatNumber`) as number,
      results: resultsRaw.map((result, resultIndex) =>
        parseParticipantResult(result, `${itemPath}.results[${resultIndex}]`),
      ),
    };
  });
}

export function parseFormatBody(body: unknown): { format: ReturnType<typeof parseFormat> } {
  if (!isRecord(body)) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'Request body must be a JSON object.',
    );
  }
  return { format: parseFormat(body.format, 'format') };
}

export function parseStartListsBody(body: unknown) {
  if (!isRecord(body)) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'Request body must be a JSON object.',
    );
  }
  return {
    format: parseFormat(body.format, 'format'),
    stageId: readString(body.stageId, 'stageId') as string,
    participants: parseParticipants(body.participants),
    manualHeats: parseManualHeats(body.manualHeats),
  };
}

export function parseAdvanceBody(body: unknown) {
  if (!isRecord(body)) {
    throw new DomainError(
      ErrorCodes.FORMAT_INVALID,
      'Request body must be a JSON object.',
    );
  }
  return {
    format: parseFormat(body.format, 'format'),
    stageId: readString(body.stageId, 'stageId') as string,
    participants: parseParticipants(body.participants),
    heatResults: parseHeatResults(body.heatResults),
  };
}
