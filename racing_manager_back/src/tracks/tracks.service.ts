import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type TrackListItem = {
  id: string;
  name: string;
  locationCity: string | null;
};

@Injectable()
export class TracksService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(): Promise<TrackListItem[]> {
    const rows = await this.prisma.track.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        locationCity: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      locationCity: row.locationCity,
    }));
  }

  async findActiveById(id: string) {
    return this.prisma.track.findFirst({
      where: { id, isActive: true },
    });
  }
}
