import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClassCompetitionsModule } from '../class-competitions/class-competitions.module';
import { AnonymousSplitService } from './anonymous-split.service';
import { TimingAttemptsReadModule } from './timing-attempts-read.module';
import { TimingController } from './timing.controller';
import { TimingExceptionFilter } from './timing.exception.filter';
import { TimingRepository } from './timing.repository';
import { TimingService } from './timing.service';

/**
 * MANUAL-TIMING module: the surface, the Start press, the attempt record, the
 * anonymous split queue and every capture-side route.
 *
 * `AuthModule` supplies `RolesService`, `SessionAuthGuard` and `RolesGuard`;
 * `ClassCompetitionsModule` supplies the race/stage/heat read a heat start and
 * the surface blocks need; `TimingAttemptsReadModule` is the shared read-only
 * guard module (AD-21), imported here so the timing side and the class
 * competitions side name the same import graph. `PrismaModule` is global, so
 * `TimingRepository` gets `PrismaService` without an import. The exception
 * filter is a provider so `@UseFilters` can resolve it.
 */
@Module({
  imports: [AuthModule, TimingAttemptsReadModule, ClassCompetitionsModule],
  controllers: [TimingController],
  providers: [
    TimingService,
    TimingRepository,
    AnonymousSplitService,
    TimingExceptionFilter,
  ],
})
export class TimingModule {}
