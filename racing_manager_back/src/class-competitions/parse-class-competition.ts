import { BadRequestException } from '@nestjs/common';
import {
  isManageableRegistrationStatus,
  type RegistrationStatusCode,
} from '../registrations/registration-status';
import { ADDABLE_STAGE_KINDS, AddableStageKind } from './stage-templates';

const HEAT_STATUSES = ['OK', 'DNS', 'DNF', 'DSQ'] as const;

export type HeatTimeStatus = (typeof HEAT_STATUSES)[number];

export type ParsedCreateClassCompetition = {
  formatId: number | null;
  gender: 'M' | 'F';
};

export type ParsedPlanChange =
  | { removeStageIds: string[] }
  | { addStage: AddableStageKind };

export type ParsedHeatAssignment = {
  heats: Array<{ heatNumber: number; registrationIds: string[] }>;
};

export type ParsedHeatTimeEntry = {
  registrationId: string;
  heatNumber: number;
  status: HeatTimeStatus;
  timeMilliseconds: number | null;
  lapNumber: number | null;
};

export type ParsedHeatTimes = {
  commit: boolean;
  entries: ParsedHeatTimeEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseOptionalLapNumber(value: unknown, index: number): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new BadRequestException(`entries[${index}].lapNumber must be a positive integer.`);
  }
  return value;
}

export function parseCreateClassCompetitionBody(body: unknown): ParsedCreateClassCompetition {
  if (!isRecord(body)) {
    throw new BadRequestException('Request body must be a JSON object.');
  }
  const gender = body.gender;
  if (gender !== 'M' && gender !== 'F') {
    throw new BadRequestException('gender must be M or F.');
  }
  if (body.formatId == null) {
    return { formatId: null, gender };
  }
  if (typeof body.formatId !== 'number' || !Number.isInteger(body.formatId) || body.formatId < 1) {
    throw new BadRequestException('formatId must be a positive integer.');
  }
  return { formatId: body.formatId, gender };
}

export function parsePlanChangeBody(body: unknown): ParsedPlanChange {
  if (!isRecord(body)) {
    throw new BadRequestException('Request body must be a JSON object.');
  }
  const hasRemove = body.removeStageIds !== undefined;
  const hasAdd = body.addStage !== undefined;
  if (hasRemove === hasAdd) {
    throw new BadRequestException('Send either removeStageIds or addStage.');
  }
  if (hasRemove) {
    if (!Array.isArray(body.removeStageIds) || body.removeStageIds.length === 0) {
      throw new BadRequestException('removeStageIds must be a non-empty array.');
    }
    const removeStageIds = body.removeStageIds.map((item, index) => {
      if (typeof item !== 'string' || !item.trim()) {
        throw new BadRequestException(`removeStageIds[${index}] must be a non-empty string.`);
      }
      return item.trim();
    });
    return { removeStageIds };
  }
  if (
    typeof body.addStage !== 'string' ||
    !(ADDABLE_STAGE_KINDS as readonly string[]).includes(body.addStage)
  ) {
    throw new BadRequestException('addStage must be PROLOGUE, EIGHTHFINAL, QUARTERFINAL, or SEMIFINAL.');
  }
  return { addStage: body.addStage as AddableStageKind };
}

export function parseHeatAssignmentBody(body: unknown): ParsedHeatAssignment {
  if (!isRecord(body) || !Array.isArray(body.heats) || body.heats.length === 0) {
    throw new BadRequestException('heats must be a non-empty array.');
  }
  const heats = body.heats.map((item, index) => {
    if (!isRecord(item)) {
      throw new BadRequestException(`heats[${index}] must be an object.`);
    }
    if (typeof item.heatNumber !== 'number' || !Number.isInteger(item.heatNumber) || item.heatNumber < 1) {
      throw new BadRequestException(`heats[${index}].heatNumber must be an integer >= 1.`);
    }
    if (!Array.isArray(item.registrationIds)) {
      throw new BadRequestException(`heats[${index}].registrationIds must be an array.`);
    }
    const registrationIds = item.registrationIds.map((id, idIndex) => {
      if (typeof id !== 'string' || !id.trim()) {
        throw new BadRequestException(
          `heats[${index}].registrationIds[${idIndex}] must be a non-empty string.`,
        );
      }
      return id;
    });
    return { heatNumber: item.heatNumber, registrationIds };
  });
  return { heats };
}

export function parseHeatTimesBody(body: unknown): ParsedHeatTimes {
  if (!isRecord(body)) {
    throw new BadRequestException('Request body must be a JSON object.');
  }
  if (body.commit !== undefined && typeof body.commit !== 'boolean') {
    throw new BadRequestException('commit must be a boolean.');
  }
  if (!Array.isArray(body.entries)) {
    throw new BadRequestException('entries must be an array.');
  }
  const entries = body.entries.map((item, index) => {
    if (!isRecord(item)) {
      throw new BadRequestException(`entries[${index}] must be an object.`);
    }
    if (typeof item.registrationId !== 'string' || !item.registrationId.trim()) {
      throw new BadRequestException(`entries[${index}].registrationId is required.`);
    }
    if (typeof item.heatNumber !== 'number' || !Number.isInteger(item.heatNumber) || item.heatNumber < 1) {
      throw new BadRequestException(`entries[${index}].heatNumber must be an integer >= 1.`);
    }
    const lapNumber = parseOptionalLapNumber(item.lapNumber, index);
    const statusRaw = item.status;
    if (lapNumber != null && statusRaw != null && statusRaw !== 'OK') {
      throw new BadRequestException(`entries[${index}] cannot combine lapNumber with status ${String(statusRaw)}.`);
    }
    if (lapNumber == null && (typeof statusRaw !== 'string' || !(HEAT_STATUSES as readonly string[]).includes(statusRaw))) {
      throw new BadRequestException(`entries[${index}].status must be OK, DNS, DNF, or DSQ.`);
    }
    const status = (lapNumber != null ? 'OK' : statusRaw) as HeatTimeStatus;
    let timeMilliseconds: number | null = null;
    if (item.timeMilliseconds != null) {
      if (
        typeof item.timeMilliseconds !== 'number' ||
        !Number.isInteger(item.timeMilliseconds) ||
        item.timeMilliseconds <= 0
      ) {
        throw new BadRequestException(
          `entries[${index}].timeMilliseconds must be a positive integer.`,
        );
      }
      timeMilliseconds = item.timeMilliseconds;
    }
    if (lapNumber != null && timeMilliseconds == null) {
      throw new BadRequestException(`entries[${index}] needs timeMilliseconds for the lap.`);
    }
    if (status === 'OK' && lapNumber == null && timeMilliseconds == null) {
      throw new BadRequestException(`entries[${index}] needs timeMilliseconds when status is OK.`);
    }
    return {
      registrationId: item.registrationId,
      heatNumber: item.heatNumber,
      status,
      timeMilliseconds: status === 'OK' ? timeMilliseconds : null,
      lapNumber: status === 'OK' ? lapNumber : null,
    };
  });
  return { commit: body.commit === true, entries };
}

export function parseStageQualificationBody(body: unknown): {
  registrationId: string;
  status: RegistrationStatusCode;
} {
  if (!isRecord(body)) {
    throw new BadRequestException('Request body must be a JSON object.');
  }
  const registrationId = body.registrationId;
  if (typeof registrationId !== 'string' || !registrationId.trim()) {
    throw new BadRequestException('registrationId is required.');
  }
  const status = body.status;
  if (typeof status !== 'string' || !status.trim()) {
    throw new BadRequestException('status is required.');
  }
  const normalized = status.trim().toUpperCase();
  if (!isManageableRegistrationStatus(normalized)) {
    throw new BadRequestException(
      'status must be REGISTERED, CONFIRMED, DNS, DNF, QQ, NQ, DSQ or CANCELLED.',
    );
  }
  return { registrationId: registrationId.trim(), status: normalized };
}
