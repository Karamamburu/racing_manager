import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AgeCategory, StoredAgeSection } from './age-groups';
import {
  AgeSplitCategoryNotFoundError,
  CATEGORY_NOT_FOUND_MESSAGE,
} from './age-split.errors';

/** Constraint and value failures a concurrent protocol-category change can cause. */
const CONSTRAINT_FAILURE_CODES: ReadonlySet<string> = new Set([
  'P2000',
  'P2002',
  'P2003',
  'P2004',
]);

function isConstraintFailure(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    CONSTRAINT_FAILURE_CODES.has(error.code)
  );
}

export type AgeSplitDb = Prisma.TransactionClient | PrismaService;

export type AgeSplitRow = {
  startId: string;
  formatId: number;
  gender: string;
  sectionId: string;
  sectionKind: 'BASE_GROUP' | 'PRESET';
  sortOrder: number;
};

export type AgeSplitKey = {
  eventId: string;
  startId: string;
  formatId: number;
  gender: 'M' | 'F';
};

export type StoredAgeCategoryDbRow = {
  startId: string;
  formatId: number;
  gender: string;
  categoryNumber: number;
  groupId: string;
};

@Injectable()
export class AgeSplitRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEvent(eventId: string): Promise<AgeSplitRow[]> {
    const rows = await this.prisma.ageSplitSection.findMany({
      where: { eventId },
      select: {
        startId: true,
        formatId: true,
        gender: true,
        sectionId: true,
        sectionKind: true,
        sortOrder: true,
      },
      orderBy: [
        { startId: 'asc' },
        { formatId: 'asc' },
        { gender: 'asc' },
        { sortOrder: 'asc' },
      ],
    });
    return rows.map((row) => ({
      startId: row.startId,
      formatId: row.formatId,
      gender: row.gender,
      sectionId: row.sectionId,
      sectionKind: row.sectionKind,
      sortOrder: row.sortOrder,
    }));
  }

  async categoryExists(
    db: AgeSplitDb,
    eventId: string,
    startId: string,
    formatId: number,
  ): Promise<boolean> {
    const start = await db.start.findFirst({
      where: { id: startId, eventId, formats: { some: { formatId } } },
      select: { id: true },
    });
    return start !== null;
  }

  async hasClassCompetition(
    eventId: string,
    formatId: number,
    gender: string,
  ): Promise<boolean> {
    if (gender !== 'M' && gender !== 'F') return false;
    const bracket = await this.prisma.classCompetition.findFirst({
      where: { eventId, formatId, gender },
      select: { id: true },
    });
    return bracket !== null;
  }

  async replace(
    db: AgeSplitDb,
    key: AgeSplitKey,
    sections: readonly StoredAgeSection[],
  ): Promise<void> {
    await db.ageSplitSection.deleteMany({ where: key });
    if (sections.length === 0) return;
    await db.ageSplitSection.createMany({
      data: sections.map((section) => ({
        ...key,
        sectionId: section.sectionId,
        sectionKind: section.sectionKind,
        sortOrder: section.sortOrder,
      })),
    });
  }

  async findCategories(eventId: string): Promise<StoredAgeCategoryDbRow[]> {
    const rows = await this.prisma.ageSplitCategory.findMany({
      where: { eventId },
      select: {
        startId: true,
        formatId: true,
        gender: true,
        categoryNumber: true,
        groupId: true,
      },
      orderBy: [
        { startId: 'asc' },
        { formatId: 'asc' },
        { gender: 'asc' },
        { categoryNumber: 'asc' },
        { groupId: 'asc' },
      ],
    });
    return rows.map((row) => ({
      startId: row.startId,
      formatId: row.formatId,
      gender: row.gender,
      categoryNumber: row.categoryNumber,
      groupId: row.groupId,
    }));
  }

  async replaceCategories(
    db: AgeSplitDb,
    key: AgeSplitKey,
    categories: readonly AgeCategory[],
  ): Promise<void> {
    try {
      await db.ageSplitCategory.deleteMany({ where: key });
      await db.ageSplitSection.deleteMany({ where: key });
      const rows = categories.flatMap((category) =>
        category.groupIds.map((groupId) => ({
          ...key,
          categoryNumber: category.number,
          groupId,
        })),
      );
      if (rows.length === 0) return;
      await db.ageSplitCategory.createMany({ data: rows });
    } catch (error) {
      // A start/format detached or deleted between the read and this write makes
      // the insert violate its foreign key; that is the same rejection as W-04.
      if (isConstraintFailure(error)) {
        throw new AgeSplitCategoryNotFoundError(CATEGORY_NOT_FOUND_MESSAGE);
      }
      throw error;
    }
  }
}
