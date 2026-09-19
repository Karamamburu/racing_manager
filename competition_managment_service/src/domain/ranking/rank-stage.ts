import { DomainError, ErrorCodes } from '../errors';
import {
  HeatResult,
  Participant,
  RankedEntry,
  RankingRule,
  ResultStatus,
} from '../types';

type PreparedResult = {
  participant: Participant;
  heatNumber: number;
  status: ResultStatus;
  timeMilliseconds: number | null;
  placeInHeat: number | null;
};

function isOk(status: ResultStatus): boolean {
  return status === 'OK';
}

function compareByTime(a: PreparedResult, b: PreparedResult): number {
  const aOk = isOk(a.status);
  const bOk = isOk(b.status);
  if (aOk !== bOk) {
    return aOk ? -1 : 1;
  }
  if (aOk) {
    const aHasTime = a.timeMilliseconds != null;
    const bHasTime = b.timeMilliseconds != null;
    if (aHasTime && bHasTime && a.timeMilliseconds !== b.timeMilliseconds) {
      return (a.timeMilliseconds as number) - (b.timeMilliseconds as number);
    }
    if (aHasTime !== bHasTime) {
      return aHasTime ? -1 : 1;
    }
  }
  return a.participant.seed - b.participant.seed;
}

function compareByHeatPlaceThenTime(a: PreparedResult, b: PreparedResult): number {
  const aOk = isOk(a.status);
  const bOk = isOk(b.status);
  if (aOk !== bOk) {
    return aOk ? -1 : 1;
  }
  if (aOk) {
    const aHasPlace = a.placeInHeat != null;
    const bHasPlace = b.placeInHeat != null;
    if (aHasPlace && bHasPlace && a.placeInHeat !== b.placeInHeat) {
      return (a.placeInHeat as number) - (b.placeInHeat as number);
    }
    if (aHasPlace !== bHasPlace) {
      return aHasPlace ? -1 : 1;
    }
    const aHasTime = a.timeMilliseconds != null;
    const bHasTime = b.timeMilliseconds != null;
    if (aHasTime && bHasTime && a.timeMilliseconds !== b.timeMilliseconds) {
      return (a.timeMilliseconds as number) - (b.timeMilliseconds as number);
    }
    if (aHasTime !== bHasTime) {
      return aHasTime ? -1 : 1;
    }
  }
  return a.participant.seed - b.participant.seed;
}

function derivePlaces(entries: PreparedResult[]): void {
  const byHeat = new Map<number, PreparedResult[]>();
  for (const entry of entries) {
    const bucket = byHeat.get(entry.heatNumber) ?? [];
    bucket.push(entry);
    byHeat.set(entry.heatNumber, bucket);
  }

  for (const heatEntries of byHeat.values()) {
    const okEntries = heatEntries.filter((entry) => isOk(entry.status));
    const missingPlace = okEntries.some((entry) => entry.placeInHeat == null);
    const providedPlace = okEntries.some((entry) => entry.placeInHeat != null);
    if (providedPlace && missingPlace) {
      throw new DomainError(
        ErrorCodes.RESULT_INVALID,
        'placeInHeat must be provided for every OK result in a heat, or omitted for all of them.',
        'heatResults',
      );
    }
    if (!missingPlace) {
      continue;
    }
    const ordered = [...okEntries].sort(compareByTime);
    ordered.forEach((entry, index) => {
      entry.placeInHeat = index + 1;
    });
  }
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

      if (result.timeMilliseconds != null) {
        if (!Number.isInteger(result.timeMilliseconds) || result.timeMilliseconds <= 0) {
          throw new DomainError(
            ErrorCodes.RESULT_INVALID,
            'timeMilliseconds must be an integer > 0.',
            `${resultPath}.timeMilliseconds`,
          );
        }
      }
      if (result.placeInHeat != null) {
        if (!Number.isInteger(result.placeInHeat) || result.placeInHeat < 1) {
          throw new DomainError(
            ErrorCodes.RESULT_INVALID,
            'placeInHeat must be an integer >= 1.',
            `${resultPath}.placeInHeat`,
          );
        }
      }

      prepared.push({
        participant,
        heatNumber: heat.heatNumber,
        status: result.status,
        timeMilliseconds: result.timeMilliseconds ?? null,
        placeInHeat: result.placeInHeat ?? null,
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
  ranking: RankingRule,
): RankedEntry[] {
  const prepared = collectResults(participants, heatResults);
  derivePlaces(prepared);
  const compare =
    ranking.type === 'BY_HEAT_PLACE_THEN_TIME'
      ? compareByHeatPlaceThenTime
      : compareByTime;
  const ordered = [...prepared].sort(compare);
  return ordered.map((entry, index) => ({
    participant: entry.participant,
    heatNumber: entry.heatNumber,
    status: entry.status,
    timeMilliseconds: entry.timeMilliseconds,
    placeInHeat: entry.placeInHeat,
    rank: index + 1,
  }));
}

export function isEligible(entry: RankedEntry): boolean {
  return entry.status === 'OK';
}
