import { Module } from '@nestjs/common';
import { TimingAttemptsReadRepository } from './timing-attempts-read.repository';
import { TimingAttemptsReadService } from './timing-attempts-read.service';

/**
 * The read-only timing guards (AD-21). `ClassCompetitionsModule` and
 * `EventsModule` import this module instead of `TimingModule`, which keeps the
 * import graph acyclic. `PrismaModule` is global, so the repository gets
 * `PrismaService` without an import.
 */
@Module({
  providers: [TimingAttemptsReadService, TimingAttemptsReadRepository],
  exports: [TimingAttemptsReadService],
})
export class TimingAttemptsReadModule {}
