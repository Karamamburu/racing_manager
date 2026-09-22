import { parseFormat } from '../http/parse-format';
import { validateFormat } from '../domain/validate-format';
import {
  CompetitionFormat,
  Heat,
  HeatResult,
  Participant,
  RankedEntry,
  RESULT_STATUSES,
  ResultStatus,
  StartLists,
} from '../domain/types';

export type ParticipantRow = {
  externalId: string;
  seed: number;
  meta?: unknown;
};

export type StoredHeatResult = {
  status: string;
  place: number | null;
};

export type StoredHeatSlot = {
  position: number;
  participant: ParticipantRow;
  result: StoredHeatResult | null;
};

export type StoredHeat = {
  heatNumber: number;
  slots: StoredHeatSlot[];
};

export function toFormat(value: unknown, path = 'format'): CompetitionFormat {
  const format = parseFormat(value, path);
  validateFormat(format, path);
  return format;
}

export function toDomainParticipant(row: ParticipantRow): Participant {
  const participant: Participant = {
    id: row.externalId,
    seed: row.seed,
  };
  if (row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)) {
    participant.meta = row.meta as Record<string, unknown>;
  }
  return participant;
}

export function toDomainParticipants(rows: ParticipantRow[]): Participant[] {
  return rows.map(toDomainParticipant);
}

export function toHeatResults(heats: StoredHeat[]): HeatResult[] {
  return heats.map((heat) => ({
    heatNumber: heat.heatNumber,
    results: heat.slots
      .filter((slot) => slot.result != null)
      .map((slot) => {
        const result = slot.result as StoredHeatResult;
        return {
          participantId: slot.participant.externalId,
          status: toResultStatus(result.status),
          ...(result.place != null ? { place: result.place } : {}),
        };
      }),
  }));
}

export function toStartLists(stageId: string, heats: StoredHeat[]): StartLists {
  return {
    stageId,
    heats: heats.map(
      (heat): Heat => ({
        heatNumber: heat.heatNumber,
        slots: heat.slots.map((slot) => ({
          position: slot.position,
          participant: toDomainParticipant(slot.participant),
        })),
      }),
    ),
  };
}

export function rankingToResponse(entry: RankedEntry) {
  return {
    participantId: entry.participant.id,
    seed: entry.participant.seed,
    rank: entry.rank,
    heatNumber: entry.heatNumber,
    status: entry.status,
    place: entry.place,
  };
}

function toResultStatus(value: string): ResultStatus {
  if ((RESULT_STATUSES as readonly string[]).includes(value)) {
    return value as ResultStatus;
  }
  return 'NQ';
}

type CompetitionView = {
  id: string;
  name: string | null;
  status: string;
  formatSnapshot: unknown;
  createdAt: Date;
  updatedAt: Date;
  participants: ParticipantRow[];
  stageRuns: Array<{
    stageId: string;
    status: string;
    heats: StoredHeat[];
    rankings: Array<{
      rank: number;
      heatNumber: number;
      status: string;
      place: number | null;
      participant: ParticipantRow;
    }>;
  }>;
  stageEntries: Array<{
    stageId: string;
    seed: number;
    eliminated: boolean;
    participant: ParticipantRow;
  }>;
};

export function toCompetitionResponse(row: CompetitionView) {
  const format = toFormat(row.formatSnapshot, 'formatSnapshot');
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    format,
    participants: toDomainParticipants(row.participants),
    stages: row.stageRuns.map((run) => ({
      stageId: run.stageId,
      status: run.status,
      entries: row.stageEntries
        .filter((entry) => entry.stageId === run.stageId)
        .map((entry) => ({
          participantId: entry.participant.externalId,
          seed: entry.seed,
          eliminated: entry.eliminated,
        })),
      heats: run.heats.map((heat) => ({
        heatNumber: heat.heatNumber,
        slots: heat.slots.map((slot) => ({
          position: slot.position,
          participantId: slot.participant.externalId,
          result: slot.result
            ? {
                status: toResultStatus(slot.result.status),
                place: slot.result.place,
              }
            : null,
        })),
      })),
      ranking: run.rankings.map((entry) => ({
        participantId: entry.participant.externalId,
        rank: entry.rank,
        heatNumber: entry.heatNumber,
        status: toResultStatus(entry.status),
        place: entry.place,
      })),
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
