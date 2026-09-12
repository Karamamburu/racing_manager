import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
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
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
