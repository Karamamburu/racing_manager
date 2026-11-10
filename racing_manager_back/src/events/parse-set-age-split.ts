import { BadRequestException } from '@nestjs/common';
import { AgeGroupId, isAgeGroupId, isAgePresetId } from './age-groups';

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
  sections: ParsedAgeSplitSelection[];
};

function parseSelection(
  value: unknown,
  index: number,
): ParsedAgeSplitSelection {
  const field = `sections[${index}]`;
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
    throw new BadRequestException('sections должен быть массивом.');
  }

  const sections: ParsedAgeSplitSelection[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const selection = parseSelection(value[index], index);
    const key = `${selection.kind}:${selection.id}`;
    if (seen.has(key)) {
      throw new BadRequestException(`Секция ${selection.id} указана дважды.`);
    }
    seen.add(key);
    sections.push(selection);
  }
  return sections;
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
    sections?: unknown;
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

  const sections = parseSelections(raw.sections);
  if (!raw.enabled && sections.length > 0) {
    throw new BadRequestException(
      'При выключенном делении sections должен быть пустым.',
    );
  }
  if (raw.enabled && sections.length === 0) {
    throw new BadRequestException(
      'При включённом делении нужна хотя бы одна секция.',
    );
  }

  return {
    gender: raw.gender,
    startId: raw.startId,
    formatId: raw.formatId,
    enabled: raw.enabled,
    sections,
  };
}

// ---------------------------------------------------------------------------
// AGE-CATEGORIES: the write contract replaces `sections[]` with ordered
// `categories[]` of base-group ids. The legacy parser above stays exported for
// the stored rows and callers that have not migrated yet.
// ---------------------------------------------------------------------------

export type ParsedAgeCategory = {
  groupIds: AgeGroupId[];
};

export type ParsedSetAgeCategories = {
  gender: 'M' | 'F';
  startId: string;
  formatId: number;
  enabled: boolean;
  categories: ParsedAgeCategory[];
};

function hasOwnProperty(value: object, key: string): boolean {
  return Object.hasOwn(value, key);
}

function parseCategory(
  value: unknown,
  index: number,
  assigned: Set<string>,
): ParsedAgeCategory {
  const field = `categories[${index}]`;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${field} должен быть объектом.`);
  }
  if (hasOwnProperty(value, 'kind')) {
    throw new BadRequestException(
      `${field} больше не поддерживает kind, используйте groupIds.`,
    );
  }

  const raw = value as { groupIds?: unknown };
  if (!Array.isArray(raw.groupIds)) {
    throw new BadRequestException(`${field}.groupIds должен быть массивом.`);
  }
  const items: unknown[] = raw.groupIds;

  const groupIds: AgeGroupId[] = [];
  const seen = new Set<string>();
  for (let groupIndex = 0; groupIndex < items.length; groupIndex += 1) {
    const candidate = items[groupIndex];
    const groupField = `${field}.groupIds[${groupIndex}]`;
    if (typeof candidate !== 'string' || !isAgeGroupId(candidate)) {
      throw new BadRequestException(
        `${groupField} содержит неизвестную возрастную группу.`,
      );
    }
    if (seen.has(candidate)) {
      throw new BadRequestException(
        `Возрастная группа ${candidate} указана дважды в категории ${index + 1}.`,
      );
    }
    if (assigned.has(candidate)) {
      throw new BadRequestException(
        `Возрастная группа ${candidate} уже входит в другую категорию.`,
      );
    }
    seen.add(candidate);
    assigned.add(candidate);
    groupIds.push(candidate);
  }
  return { groupIds };
}

function parseCategories(value: unknown): ParsedAgeCategory[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('categories должен быть массивом.');
  }

  const assigned = new Set<string>();
  const categories: ParsedAgeCategory[] = [];
  for (let index = 0; index < value.length; index += 1) {
    categories.push(parseCategory(value[index], index, assigned));
  }
  return categories;
}

export function parseSetAgeCategoriesBody(
  body: unknown,
): ParsedSetAgeCategories {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Тело запроса должно быть объектом.');
  }
  const raw = body as {
    gender?: unknown;
    startId?: unknown;
    formatId?: unknown;
    enabled?: unknown;
    sections?: unknown;
    categories?: unknown;
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
  if (hasOwnProperty(raw, 'sections')) {
    throw new BadRequestException(
      'Поле sections больше не поддерживается, используйте categories.',
    );
  }

  const categories = parseCategories(raw.categories);
  if (!raw.enabled && categories.length > 0) {
    throw new BadRequestException(
      'При выключенном делении categories должен быть пустым.',
    );
  }

  return {
    gender: raw.gender,
    startId: raw.startId,
    formatId: raw.formatId,
    enabled: raw.enabled,
    categories,
  };
}
