import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { RoleCode, TIMING_OPERATE_ROLE_CODES } from '../auth/role-codes';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import {
  BindPendingFinishDto,
  CancelPendingFinishDto,
  CaptureTimingPassDto,
  OpenClockEpochDto,
  QuickUndoTimingPassDto,
  StartTimingAttemptDto,
} from './timing.dto';
import { TimingExceptionFilter } from './timing.exception.filter';
import { TimingService } from './timing.service';
import type {
  ClockEpochView,
  StartTimingAttemptResult,
  TimingAttemptRecordView,
  TimingPassView,
  TimingSurfaceView,
} from './timing.views';

/**
 * MANUAL-TIMING routes of one event, all guarded by the timing operator roles.
 *
 * The controller only parses the boundary and calls the service. Every
 * `TimingDomainError` the service throws becomes the filtered status and body;
 * these handlers add no catch of their own.
 */
@Controller('events/:eventId/timing')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...TIMING_OPERATE_ROLE_CODES)
@UseFilters(TimingExceptionFilter)
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

  /**
   * `POST /events/:eventId/timing/passes`: one number, tile or unbound finish.
   * A repeated `Idempotency-Key` is replayed by the global interceptor, which
   * never reaches this handler; the service stores a fresh key when the header
   * is absent so the mark column is never empty.
   */
  @Post('passes')
  @HttpCode(HttpStatus.CREATED)
  capturePass(
    @Req() req: Request,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Body() dto: CaptureTimingPassDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<TimingPassView> {
    return this.timingService.capturePass(
      req.session?.userSub,
      eventId,
      dto,
      idempotencyKey,
    );
  }

  /**
   * `POST /events/:eventId/timing/pending-finishes/:pendingFinishId/bind`: give
   * one unbound finish a participant of its own attempt.
   */
  @Post('pending-finishes/:pendingFinishId/bind')
  @HttpCode(HttpStatus.OK)
  bindPendingFinish(
    @Req() req: Request,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Param('pendingFinishId', new ParseUUIDPipe({ version: '4' }))
    pendingFinishId: string,
    @Body() dto: BindPendingFinishDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<TimingPassView> {
    return this.timingService.bindPendingFinish(
      req.session?.userSub,
      eventId,
      pendingFinishId,
      dto,
      idempotencyKey,
    );
  }

  /**
   * `POST /events/:eventId/timing/pending-finishes/:pendingFinishId/cancel`: an
   * administrator retires an unbound finish with a reason. The method-level
   * `@Roles` overrides the class-level timing roles, so a referee is refused.
   */
  @Post('pending-finishes/:pendingFinishId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleCode.ADMINISTRATOR)
  cancelPendingFinish(
    @Req() req: Request,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Param('pendingFinishId', new ParseUUIDPipe({ version: '4' }))
    pendingFinishId: string,
    @Body() dto: CancelPendingFinishDto,
  ): Promise<TimingPassView> {
    return this.timingService.cancelPendingFinish(
      req.session?.userSub,
      eventId,
      pendingFinishId,
      dto,
    );
  }

  /**
   * `POST /events/:eventId/timing/attempts/:attemptId/undo`: withdraw the last
   * pass this workstation created in the attempt.
   */
  @Post('attempts/:attemptId/undo')
  @HttpCode(HttpStatus.OK)
  quickUndo(
    @Req() req: Request,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Param('attemptId', new ParseUUIDPipe({ version: '4' }))
    attemptId: string,
    @Body() dto: QuickUndoTimingPassDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<TimingPassView> {
    return this.timingService.quickUndo(
      req.session?.userSub,
      eventId,
      attemptId,
      dto,
      idempotencyKey,
    );
  }
}
