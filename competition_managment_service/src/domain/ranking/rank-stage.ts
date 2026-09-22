import { DomainError, ErrorCodes } from '../errors';
import {
  HeatResult,
  Participant,
  RankedEntry,
  ResultStatus,
} from '../types';

type PreparedResult = {
  participant: Participant;
  heatNumber: number;
  status: ResultStatus;
  place: number | null;
};

function isOk(status: ResultStatus): boolean {
  return status === 'OK';
}

function compareByPlace(a: PreparedResult, b: PreparedResult): number {
  const aOk = isOk(a.status);
  const bOk = isOk(b.status);
  if (aOk !== bOk) {
    return aOk ? -1 : 1;
  }
  if (aOk) {
    const aPlace = a.place;
    const bPlace = b.place;
    if (aPlace != null && bPlace != null && aPlace !== bPlace) {
      return aPlace - bPlace;
    }
    if ((aPlace == null) !== (bPlace == null)) {
      return aPlace != null ? -1 : 1;
    }
  }
  return a.participant.seed - b.participant.seed;
}

export function collectResults(
  participants: Participant[],
  heatResults: HeatResult[],
): PreparedResult[] {
  if (!heatResults.length) {
    throw new DomainError(
      ErrorCodes.RESULT_INVALID,
      'heatResults must contain at least one heat.',
      'heatResults',
    );
  }

  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const seen = new Set<string>();
  const seenHeats = new Set<number>();
  const prepared: PreparedResult[] = [];

  for (let heatIndex = 0; heatIndex < heatResults.length; heatIndex += 1) {
    const heat = heatResults[heatIndex];
    if (!Number.isInteger(heat.heatNumber) || heat.heatNumber < 1) {
      throw new DomainError(
        ErrorCodes.RESULT_INVALID,
        'heatNumber must be an integer >= 1.',
        `heatResults[${heatIndex}].heatNumber`,
      );
    }
    if (seenHeats.has(heat.heatNumber)) {
      throw new DomainError(
        ErrorCodes.RESULT_INVALID,
        `Duplicate heatNumber ${heat.heatNumber}.`,
        `heatResults[${heatIndex}].heatNumber`,
      );
    }
    seenHeats.add(heat.heatNumber);
    if (!heat.results.length) {
      throw new DomainError(
        ErrorCodes.RESULT_INVALID,
        'Each heat must contain at least one result.',
        `heatResults[${heatIndex}].results`,
      );
    }

    for (let resultIndex = 0; resultIndex < heat.results.length; resultIndex += 1) {
      const result = heat.results[resultIndex];
      const resultPath = `heatResults[${heatIndex}].results[${resultIndex}]`;
      const participant = byId.get(result.participantId);
      if (!participant) {
        throw new DomainError(
          ErrorCodes.RESULT_INVALID,
          `Unknown participant id "${result.participantId}".`,
          `${resultPath}.participantId`,
        );
      }
      if (seen.has(result.participantId)) {
        throw new DomainError(
          ErrorCodes.RESULT_INVALID,
          `Duplicate result for participant "${result.participantId}".`,
          `${resultPath}.participantId`,
        );
      }
      seen.add(result.participantId);

      if (result.place != null && (!Number.isInteger(result.place) || result.place < 1)) {
        throw new DomainError(
          ErrorCodes.RESULT_INVALID,
          'place must be an integer >= 1.',
          `${resultPath}.place`,
        );
      }
      if (isOk(result.status) && result.place == null) {
        throw new DomainError(
          ErrorCodes.RESULT_INVALID,
          'place is required when status is OK.',
          `${resultPath}.place`,
        );
      }

      prepared.push({
        participant,
        heatNumber: heat.heatNumber,
        status: result.status,
        place: result.place ?? null,
      });
    }
  }

  const missing = participants.filter((participant) => !seen.has(participant.id));
  if (missing.length) {
    throw new DomainError(
      ErrorCodes.RESULT_INVALID,
      `Missing results for participants: ${missing.map((item) => item.id).join(', ')}.`,
      'heatResults',
    );
  }

  return prepared;
}

export function rankStage(
  participants: Participant[],
  heatResults: HeatResult[],
): RankedEntry[] {
  const prepared = collectResults(participants, heatResults);
  return [...prepared].sort(compareByPlace).map((entry, index) => ({
    participant: entry.participant,
    heatNumber: entry.heatNumber,
    status: entry.status,
    place: entry.place,
    rank: index + 1,
  }));
}

export function isEligible(entry: RankedEntry): boolean {
  return entry.status === 'OK';
}
