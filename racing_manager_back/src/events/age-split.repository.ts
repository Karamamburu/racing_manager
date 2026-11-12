import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AgeCategory, StoredAgeSection } from './age-groups';
import {
  AgeSplitCategoryNotFoundError,
  CATEGORY_NOT_FOUND_MESSAGE,
} from './age-split.errors';

/**
 * Only a violated foreign key means the parent protocol category vanished; a
 * duplicate save tripping a unique index (P2002) must propagate so concurrent
 * saves resolve as the last complete one (E-05), not as a 400.
 */
const FOREIGN_KEY_FAILURE_CODE = 'P2003';

function isForeignKeyFailure(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === FOREIGN_KEY_FAILURE_CODE
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
    // The lock binds this read to the replacement that follows in the same
    // transaction: a concurrent detach of the start or of the format waits
    // here, and a detach that already committed yields no row. Either way the
    // save cannot insert a configuration for a vanished protocol category
    // (W-04), which an unlocked read would allow.
    const rows = await db.$queryRaw<{ start_id: string }[]>(Prisma.sql`
      SELECT sf.start_id
      FROM start_formats sf
      JOIN starts s ON s.id = sf.start_id
      WHERE s.id = ${startId}::uuid
        AND s.event_id = ${eventId}::uuid
        AND sf.format_id = ${formatId}
      FOR UPDATE OF sf
    `);
    return rows.length > 0;
  }

  async hasClassCompetition(
    eventId: string,
    startId: string,
    formatId: number,
    gender: string,
  ): Promise<boolean> {
    if (gender !== 'M' && gender !== 'F') return false;
    const bracket = await this.prisma.classCompetition.findFirst({
      where: { eventId, startId, formatId, gender },
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
      // A start/format detached or deleted between the locked read and this
      // write makes the insert violate its foreign key; that is the same
      // rejection as W-04.
      if (isForeignKeyFailure(error)) {
        throw new AgeSplitCategoryNotFoundError(CATEGORY_NOT_FOUND_MESSAGE);
      }
      throw error;
    }
  }
}
