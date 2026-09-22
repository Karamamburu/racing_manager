import { Module } from '@nestjs/common';
import { CompetitionsService } from '../persistence/competitions.service';
import { CompetitionController } from './competition.controller';
import { CompetitionService } from './competition.service';
import { CompetitionsController } from './competitions.controller';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController, CompetitionController, CompetitionsController],
  providers: [CompetitionService, CompetitionsService],
})
export class CompetitionModule {}
