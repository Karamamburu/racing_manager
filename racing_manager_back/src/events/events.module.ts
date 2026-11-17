import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TimingAttemptsReadModule } from '../timing/timing-attempts-read.module';
import { UsersModule } from '../users/users.module';
import { AgeSplitController } from './age-split.controller';
import { AgeSplitRepository } from './age-split.repository';
import { AgeSplitService } from './age-split.service';
import { EventStatusSyncService } from './event-status-sync.service';
import { EventsCatalogController } from './events-catalog.controller';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { ParticipationFormatsController } from './participation-formats.controller';

/**
 * The events module. `TimingAttemptsReadModule` supplies the read-only finish
 * guard of AD-21; importing `TimingModule` here would be a cycle because the
 * timing module imports this one for the heat roster.
 */
@Module({
  imports: [AuthModule, UsersModule, TimingAttemptsReadModule],
  controllers: [
    EventsController,
    EventsCatalogController,
    ParticipationFormatsController,
    AgeSplitController,
  ],
  providers: [
    EventsService,
    EventStatusSyncService,
    AgeSplitService,
    AgeSplitRepository,
  ],
  exports: [EventsService, EventStatusSyncService],
})
export class EventsModule {}
