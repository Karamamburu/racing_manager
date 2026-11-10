import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { AgeCategory, StoredAgeSection } from './age-groups';

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
    eventId: string,
    startId: string,
    formatId: number,
  ): Promise<boolean> {
    const start = await this.prisma.start.findFirst({
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
  }
}
