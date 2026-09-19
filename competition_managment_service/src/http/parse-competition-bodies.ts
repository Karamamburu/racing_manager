import { DomainError, ErrorCodes } from '../domain/errors';
import { isRecord, readString } from './parse-helpers';
import { parseFormat, parseRoutes } from './parse-format';
import {
  parseHeatResults,
  parseManualHeats,
  parseParticipants,
} from './parse-bodies';

export function parseCreateCompetitionBody(body: unknown) {
  if (!isRecord(body)) {
    throw new DomainError(
      ErrorCodes.COMPETITION_INVALID,
      'Request body must be a JSON object.',
    );
  }
  const name = readString(body.name, 'name', false);
  const presetId = readString(body.presetId, 'presetId', false);
  const format = body.format === undefined ? undefined : parseFormat(body.format, 'format');
  return {
    name,
    presetId,
    format,
    participants: parseParticipants(body.participants),
  };
}

export function parseSeedStageBody(body: unknown) {
  if (body === undefined || body === null || body === '') {
    return { manualHeats: undefined };
  }
  if (!isRecord(body)) {
    throw new DomainError(
      ErrorCodes.COMPETITION_INVALID,
      'Request body must be a JSON object.',
    );
  }
  return { manualHeats: parseManualHeats(body.manualHeats) };
}

export function parsePersistedAdvanceBody(body: unknown) {
  if (body === undefined || body === null || body === '') {
    return { routes: undefined };
  }
  if (!isRecord(body)) {
    throw new DomainError(
      ErrorCodes.COMPETITION_INVALID,
      'Request body must be a JSON object.',
    );
  }
  return {
    routes: body.routes === undefined ? undefined : parseRoutes(body.routes, 'routes'),
  };
}

export function parseStageResultsBody(body: unknown) {
  if (!isRecord(body)) {
    throw new DomainError(
      ErrorCodes.RESULT_INVALID,
      'Request body must be a JSON object.',
    );
  }
  return { heatResults: parseHeatResults(body.heatResults) };
}
