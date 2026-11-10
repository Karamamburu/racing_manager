import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AGE_GROUPS,
  AGE_PRESETS,
  isAgeGroupId,
  isAgePresetId,
  orderSections,
  sectionTitle,
  type AgePresetId,
  type StoredAgeSection,
} from './age-groups';
import { AgeSplitKey, AgeSplitRepository } from './age-split.repository';
import {
  PRESET_ALL_GROUPS,
  ParsedAgeSplitSelection,
  parseSetAgeSplitBody,
} from './parse-set-age-split';

export type AgeSectionRef = {
  id: string;
  kind: 'BASE_GROUP' | 'PRESET';
  title: string;
};

export type AgeSplitRef = {
  startId: string;
  formatId: number;
  gender: 'M' | 'F';
  enabled: boolean;
  sections: AgeSectionRef[];
};

export const CATEGORY_NOT_FOUND_MESSAGE =
  'Категория не найдена на этом мероприятии.';

function isRequestAllGroups(selection: ParsedAgeSplitSelection): boolean {
  return selection.kind === 'PRESET' && selection.id === PRESET_ALL_GROUPS;
}

function isStoredPreset(
  selection: ParsedAgeSplitSelection,
): selection is ParsedAgeSplitSelection & { id: AgePresetId } {
  return selection.kind === 'PRESET' && isAgePresetId(selection.id);
}

function presetGroupIds(presetId: AgePresetId): readonly string[] {
  const preset = AGE_PRESETS.find((candidate) => candidate.id === presetId);
  return preset ? preset.groupIds : [];
}

/**
 * Turns a request selection set into the stored section set: a preset absorbs
 * its member base groups, `PRESET_ALL_GROUPS` replaces everything with the nine
 * base groups, and the result is ordered by youngest age bound with a
 * contiguous `sortOrder` so the unique category index always holds.
 */
export function normalizeAgeSplitSections(
  selections: readonly ParsedAgeSplitSelection[],
): StoredAgeSection[] {
  if (selections.some(isRequestAllGroups)) {
    return AGE_GROUPS.map((group, index) => ({
      sectionId: group.id,
      sectionKind: 'BASE_GROUP' as const,
      sortOrder: index,
    }));
  }

  const presets = selections.filter(isStoredPreset);
  const coveredGroups = new Set<string>();
  for (const preset of presets) {
    for (const groupId of presetGroupIds(preset.id)) {
      coveredGroups.add(groupId);
    }
  }

  const sections: StoredAgeSection[] = [];
  for (const preset of presets) {
    sections.push({
      sectionId: preset.id,
      sectionKind: 'PRESET',
      sortOrder: sections.length,
    });
  }
  for (const selection of selections) {
    if (selection.kind !== 'BASE_GROUP') continue;
    if (!isAgeGroupId(selection.id)) continue;
    if (coveredGroups.has(selection.id)) continue;
    sections.push({
      sectionId: selection.id,
      sectionKind: 'BASE_GROUP',
      sortOrder: sections.length,
    });
  }

  return orderSections(sections).map((section, index) => ({
    ...section,
    sortOrder: index,
  }));
}

@Injectable()
export class AgeSplitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: AgeSplitRepository,
  ) {}

  async setSplit(eventId: string, body: unknown): Promise<AgeSplitRef> {
    const parsed = parseSetAgeSplitBody(body);
    const key: AgeSplitKey = {
      eventId,
      startId: parsed.startId,
      formatId: parsed.formatId,
      gender: parsed.gender,
    };

    if (!parsed.enabled) {
      await this.prisma.$transaction((tx) =>
        this.repository.replace(tx, key, []),
      );
      return {
        startId: key.startId,
        formatId: key.formatId,
        gender: key.gender,
        enabled: false,
        sections: [],
      };
    }

    const categoryExists = await this.repository.categoryExists(
      eventId,
      key.startId,
      key.formatId,
    );
    if (!categoryExists) {
      throw new BadRequestException(CATEGORY_NOT_FOUND_MESSAGE);
    }

    const sections = normalizeAgeSplitSections(parsed.sections);
    await this.prisma.$transaction((tx) =>
      this.repository.replace(tx, key, sections),
    );

    return {
      startId: key.startId,
      formatId: key.formatId,
      gender: key.gender,
      enabled: true,
      sections: sections.map((section) => ({
        id: section.sectionId,
        kind: section.sectionKind,
        title: sectionTitle(section, key.gender),
      })),
    };
  }
}
