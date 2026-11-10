import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { StoredAgeSection } from './age-groups';

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
}
