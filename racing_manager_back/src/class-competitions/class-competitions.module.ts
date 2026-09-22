import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClassCompetitionsController } from './class-competitions.controller';
import { ClassCompetitionsService } from './class-competitions.service';
import { CmsClient } from './cms.client';

@Module({
  imports: [AuthModule],
  controllers: [ClassCompetitionsController],
  providers: [ClassCompetitionsService, CmsClient],
})
export class ClassCompetitionsModule {}
