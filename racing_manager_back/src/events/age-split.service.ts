import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  categorySectionId,
  categorySubtitle,
  categoryTitle,
  normalizeAgeCategories,
} from './age-groups';
import {
  AgeSplitCategoryNotFoundError,
  CATEGORY_NOT_FOUND_MESSAGE,
  EMPTY_AGE_CATEGORIES_MESSAGE,
  EmptyAgeCategoriesError,
} from './age-split.errors';
import { AgeSplitKey, AgeSplitRepository } from './age-split.repository';
import { parseSetAgeCategoriesBody } from './parse-set-age-split';

export { CATEGORY_NOT_FOUND_MESSAGE, EMPTY_AGE_CATEGORIES_MESSAGE };

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

    const categories = parsed.enabled
      ? normalizeAgeCategories(parsed.categories)
      : [];
    if (parsed.enabled && categories.length === 0) {
      throw new EmptyAgeCategoriesError(EMPTY_AGE_CATEGORIES_MESSAGE);
    }

    // The existence read and the row replacement share one transaction, so a
    // concurrent detach or start deletion cannot slip between read and write
    // (W-04). The filter maps the raised domain error to 400.
    await this.prisma.$transaction(async (tx) => {
      const categoryExists = await this.repository.categoryExists(
        tx,
        eventId,
        key.startId,
        key.formatId,
      );
      if (!categoryExists) {
        throw new AgeSplitCategoryNotFoundError(CATEGORY_NOT_FOUND_MESSAGE);
      }
      await this.repository.replaceCategories(tx, key, categories);
    });

    if (!parsed.enabled) {
      return {
        startId: key.startId,
        formatId: key.formatId,
        gender: key.gender,
        enabled: false,
        categories: [],
      };
    }

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
