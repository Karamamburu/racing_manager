import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TimingController } from './timing.controller';
import { TimingExceptionFilter } from './timing.exception.filter';
import { TimingRepository } from './timing.repository';
import { TimingService } from './timing.service';

/**
 * MANUAL-TIMING module: the surface, the Start press and the attempt record.
 *
 * `AuthModule` supplies `RolesService`, `SessionAuthGuard` and `RolesGuard`;
 * `PrismaModule` is global, so `TimingRepository` gets `PrismaService` without
 * an import. The exception filter is a provider so `@UseFilters` can resolve it.
 * Capture, corrections and closure providers arrive with their own waves.
 */
@Module({
  imports: [AuthModule],
  controllers: [TimingController],
  providers: [TimingService, TimingRepository, TimingExceptionFilter],
})
export class TimingModule {}
