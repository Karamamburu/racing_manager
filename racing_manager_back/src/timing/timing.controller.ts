import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { TIMING_OPERATE_ROLE_CODES } from '../auth/role-codes';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { OpenClockEpochDto, StartTimingAttemptDto } from './timing.dto';
import { TimingService } from './timing.service';
import type {
  ClockEpochView,
  StartTimingAttemptResult,
  TimingAttemptRecordView,
  TimingSurfaceView,
} from './timing.views';

/**
 * MANUAL-TIMING routes of one event, all guarded by the timing operator roles.
 *
 * The controller only parses the boundary and calls the service. The domain
 * error filter that maps `TimingDomainError` to an HTTP status arrives with the
 * module wiring; these handlers add no catch of their own.
 */
@Controller('events/:eventId/timing')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...TIMING_OPERATE_ROLE_CODES)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class TimingController {
  constructor(private readonly timingService: TimingService) {}

  @Get()
  getSurface(
    @Req() req: Request,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
  ): Promise<TimingSurfaceView> {
    return this.timingService.getSurface(req.session?.userSub, eventId);
  }

  @Get('attempts/:attemptId')
  getAttemptRecord(
    @Req() req: Request,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Param('attemptId', new ParseUUIDPipe({ version: '4' }))
    attemptId: string,
  ): Promise<TimingAttemptRecordView> {
    return this.timingService.getAttemptRecord(
      req.session?.userSub,
      eventId,
      attemptId,
    );
  }

  @Post('attempts')
  @HttpCode(HttpStatus.CREATED)
  startAttempt(
    @Req() req: Request,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Body() dto: StartTimingAttemptDto,
  ): Promise<StartTimingAttemptResult> {
    return this.timingService.startAttempt(req.session?.userSub, eventId, dto);
  }

  @Post('attempts/:attemptId/clock-epochs')
  @HttpCode(HttpStatus.CREATED)
  openClockEpoch(
    @Req() req: Request,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Param('attemptId', new ParseUUIDPipe({ version: '4' }))
    attemptId: string,
    @Body() dto: OpenClockEpochDto,
  ): Promise<ClockEpochView> {
    return this.timingService.openClockEpoch(
      req.session?.userSub,
      eventId,
      attemptId,
      dto,
    );
  }
}
