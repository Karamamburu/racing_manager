import { BadRequestException } from '@nestjs/common';
import { isAgeGroupId, isAgePresetId } from './age-groups';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PRESET_ALL_GROUPS = 'PRESET_ALL_GROUPS';

const REQUEST_PRESET_IDS: readonly string[] = [
  'PRESET_JUNIOR_UNDER_24',
  'PRESET_MASTERS_41_PLUS',
  PRESET_ALL_GROUPS,
];

export type ParsedAgeSplitSelection = {
  kind: 'BASE_GROUP' | 'PRESET';
  id: string;
};

export type ParsedSetAgeSplit = {
  gender: 'M' | 'F';
  startId: string;
  formatId: number;
  enabled: boolean;
  selections: ParsedAgeSplitSelection[];
};

function parseSelection(
  value: unknown,
  index: number,
): ParsedAgeSplitSelection {
  const field = `selections[${index}]`;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${field} должен быть объектом.`);
  }
  const raw = value as { kind?: unknown; id?: unknown };
  if (raw.kind !== 'BASE_GROUP' && raw.kind !== 'PRESET') {
    throw new BadRequestException(
      `${field}.kind должен быть BASE_GROUP или PRESET.`,
    );
  }
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new BadRequestException(`${field}.id обязателен.`);
  }
  if (raw.kind === 'BASE_GROUP') {
    if (!isAgeGroupId(raw.id)) {
      throw new BadRequestException(
        `${field}.id содержит неизвестную возрастную группу.`,
      );
    }
    return { kind: raw.kind, id: raw.id };
  }
  if (!isAgePresetId(raw.id) && !REQUEST_PRESET_IDS.includes(raw.id)) {
    throw new BadRequestException(`${field}.id содержит неизвестный пресет.`);
  }
  return { kind: raw.kind, id: raw.id };
}

function parseSelections(value: unknown): ParsedAgeSplitSelection[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('selections должен быть массивом.');
  }

  const selections: ParsedAgeSplitSelection[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const selection = parseSelection(value[index], index);
    const key = `${selection.kind}:${selection.id}`;
    if (seen.has(key)) {
      throw new BadRequestException(`Секция ${selection.id} указана дважды.`);
    }
    seen.add(key);
    selections.push(selection);
  }
  return selections;
}

export function parseSetAgeSplitBody(body: unknown): ParsedSetAgeSplit {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Тело запроса должно быть объектом.');
  }
  const raw = body as {
    gender?: unknown;
    startId?: unknown;
    formatId?: unknown;
    enabled?: unknown;
    selections?: unknown;
  };

  if (raw.gender !== 'M' && raw.gender !== 'F') {
    throw new BadRequestException('gender должен быть M или F.');
  }
  if (typeof raw.startId !== 'string' || !UUID.test(raw.startId)) {
    throw new BadRequestException('startId должен быть UUID.');
  }
  if (
    typeof raw.formatId !== 'number' ||
    !Number.isInteger(raw.formatId) ||
    raw.formatId < 1
  ) {
    throw new BadRequestException(
      'formatId должен быть целым числом не меньше 1.',
    );
  }
  if (typeof raw.enabled !== 'boolean') {
    throw new BadRequestException('enabled должен быть булевым значением.');
  }

  const selections = parseSelections(raw.selections);
  if (!raw.enabled && selections.length > 0) {
    throw new BadRequestException(
      'При выключенном делении selections должен быть пустым.',
    );
  }
  if (raw.enabled && selections.length === 0) {
    throw new BadRequestException(
      'При включённом делении нужна хотя бы одна секция.',
    );
  }

  return {
    gender: raw.gender,
    startId: raw.startId,
    formatId: raw.formatId,
    enabled: raw.enabled,
    selections,
  };
}
