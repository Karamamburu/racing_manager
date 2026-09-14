import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { EventStatusSyncService } from './event-status-sync.service';
import { EventsCatalogController } from './events-catalog.controller';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { ParticipationFormatsController } from './participation-formats.controller';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [
    EventsController,
    EventsCatalogController,
    ParticipationFormatsController,
  ],
  providers: [EventsService, EventStatusSyncService],
  exports: [EventsService, EventStatusSyncService],
})
export class EventsModule {}
