import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TimingAttemptsReadModule } from '../timing/timing-attempts-read.module';
import { ClassCompetitionsController } from './class-competitions.controller';
import { ClassCompetitionsService } from './class-competitions.service';
import { CmsClient } from './cms.client';

/**
 * The multi-stage race façade. `TimingAttemptsReadModule` supplies the
 * read-only guards of AD-21 without importing `TimingModule`, which would be a
 * cycle because the timing module imports this one for the heat roster.
 * `ClassCompetitionsService` is exported so a heat start can read the race view
 * from the timing side.
 */
@Module({
  imports: [AuthModule, TimingAttemptsReadModule],
  controllers: [ClassCompetitionsController],
  providers: [ClassCompetitionsService, CmsClient],
  exports: [ClassCompetitionsService],
})
export class ClassCompetitionsModule {}
