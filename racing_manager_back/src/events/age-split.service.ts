import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  categorySectionId,
  categorySubtitle,
  categoryTitle,
  normalizeAgeCategories,
} from './age-groups';
import { AgeSplitKey, AgeSplitRepository } from './age-split.repository';
import { parseSetAgeCategoriesBody } from './parse-set-age-split';

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

export type AgeCategoryRef = {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  groupIds: string[];
};

export type AgeCategoriesRef = {
  startId: string;
  formatId: number;
  gender: 'M' | 'F';
  enabled: boolean;
  categories: AgeCategoryRef[];
};

export const CATEGORY_NOT_FOUND_MESSAGE =
  'Категория не найдена на этом мероприятии.';

export const EMPTY_AGE_CATEGORIES_MESSAGE =
  'Нужна хотя бы одна возрастная категория с группой.';

@Injectable()
export class AgeSplitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: AgeSplitRepository,
  ) {}

  async setSplit(eventId: string, body: unknown): Promise<AgeCategoriesRef> {
    const parsed = parseSetAgeCategoriesBody(body);
    const key: AgeSplitKey = {
      eventId,
      startId: parsed.startId,
      formatId: parsed.formatId,
      gender: parsed.gender,
    };

    if (!parsed.enabled) {
      await this.prisma.$transaction((tx) =>
        this.repository.replaceCategories(tx, key, []),
      );
      return {
        startId: key.startId,
        formatId: key.formatId,
        gender: key.gender,
        enabled: false,
        categories: [],
      };
    }

    const categories = normalizeAgeCategories(parsed.categories);
    if (categories.length === 0) {
      throw new BadRequestException(EMPTY_AGE_CATEGORIES_MESSAGE);
    }

    const categoryExists = await this.repository.categoryExists(
      eventId,
      key.startId,
      key.formatId,
    );
    if (!categoryExists) {
      throw new BadRequestException(CATEGORY_NOT_FOUND_MESSAGE);
    }

    await this.prisma.$transaction((tx) =>
      this.repository.replaceCategories(tx, key, categories),
    );

    return {
      startId: key.startId,
      formatId: key.formatId,
      gender: key.gender,
      enabled: true,
      categories: categories.map((category) => ({
        id: categorySectionId(category.number),
        number: category.number,
        title: categoryTitle(category.number),
        subtitle: categorySubtitle(category.groupIds),
        groupIds: [...category.groupIds],
      })),
    };
  }
}
