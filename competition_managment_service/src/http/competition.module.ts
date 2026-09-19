import { Module } from '@nestjs/common';
import { CompetitionController } from './competition.controller';
import { CompetitionService } from './competition.service';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController, CompetitionController],
  providers: [CompetitionService],
})
export class CompetitionModule {}
