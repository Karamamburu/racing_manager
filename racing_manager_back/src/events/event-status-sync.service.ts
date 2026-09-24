import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AUTO_EVENT_STATUSES,
  EventStatusCode,
  dueEventStatus,
} from './event-status';
import { freezeEventPlaces } from './freeze-event-places';

const SYNC_INTERVAL_MS = 60_000;

@Injectable()
export class EventStatusSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventStatusSyncService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private syncing = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.syncDueStatuses();
    this.timer = setInterval(() => {
      void this.syncDueStatuses();
    }, SYNC_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async syncDueStatuses(): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const open = await this.prisma.event.findMany({
        where: { status: { in: [...AUTO_EVENT_STATUSES] } },
        select: { id: true, status: true, eventDate: true },
      });

      const now = new Date();
      const doneIds: string[] = [];
      const inProgressIds: string[] = [];

      for (const event of open) {
        const due = dueEventStatus(event.eventDate, now);
        if (due === EventStatusCode.DONE) {
          doneIds.push(event.id);
        } else if (
          due === EventStatusCode.IN_PROGRESS &&
          event.status === EventStatusCode.PLANNED
        ) {
          inProgressIds.push(event.id);
        }
      }

      const blocking =
        doneIds.length === 0
          ? []
          : await this.prisma.classCompetition.findMany({
              where: { eventId: { in: doneIds }, status: { not: 'DONE' } },
              select: { eventId: true },
            });
      const blockedEventIds = new Set(blocking.map((row) => row.eventId));
      const readyIds = doneIds.filter((id) => !blockedEventIds.has(id));

      if (readyIds.length > 0) {
        for (const id of readyIds) {
          await this.prisma.$transaction(async (tx) => {
            await tx.event.update({
              where: { id },
              data: { status: EventStatusCode.DONE },
            });
            await freezeEventPlaces(tx, id);
          });
        }
        this.logger.log({
          event: 'event.status_auto_synced',
          toStatus: EventStatusCode.DONE,
          eventIds: readyIds,
          count: readyIds.length,
        });
      }
      if (inProgressIds.length > 0) {
        await this.prisma.event.updateMany({
          where: { id: { in: inProgressIds } },
          data: { status: EventStatusCode.IN_PROGRESS },
        });
        this.logger.log({
          event: 'event.status_auto_synced',
          toStatus: EventStatusCode.IN_PROGRESS,
          eventIds: inProgressIds,
          count: inProgressIds.length,
        });
      }
    } catch (error) {
      this.logger.error('Failed to sync event statuses', error);
    } finally {
      this.syncing = false;
    }
  }
}
