import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { AnonymousSplitService } from './anonymous-split.service';
import {
  AssignAnonymousSplitDto,
  BindPendingFinishDto,
  CancelAnonymousSplitDto,
  CancelPendingFinishDto,
  CancelTimingAttemptDto,
  CancelTimingPassDto,
  CaptureTimingPassDto,
  CompleteTimingAttemptDto,
  CorrectOfficialTimeDto,
  ForceCompleteTimingAttemptDto,
  ForceReleaseCaptureDto,
  OpenClockEpochDto,
  QuickUndoTimingPassDto,
  QuickUndoTimingSplitDto,
  RebindTimingPassDto,
  StartHeatAttemptDto,
  StartTimingAttemptDto,
  TakeCaptureDto,
  TransferCaptureDto,
} from './timing.dto';
import { TimingExceptionFilter } from './timing.exception.filter';
import { TimingService } from './timing.service';
import { timingValidationExceptionFactory } from './timing.validation';
import type {
  ClockEpochView,
  StartTimingAttemptResult,
  TimingAnonymousSplitView,
  TimingAttemptRecordView,
  TimingAttemptRef,
  TimingCaptureView,
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
const uuidPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () =>
    new BadRequestException('Некорректный идентификатор в адресе запроса.'),
});

@Controller('events/:eventId/timing')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(...TIMING_OPERATE_ROLE_CODES)
@UseFilters(TimingExceptionFilter)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: timingValidationExceptionFactory,
  }),
)
export class TimingController {
  constructor(
    private readonly timingService: TimingService,
    private readonly anonymousSplitService: AnonymousSplitService,
  ) {}

  @Get()
  getSurface(
    @Req() req: Request,
    @Param('eventId', uuidPipe) eventId: string,
  ): Promise<TimingSurfaceView> {
    return this.timingService.getSurface(req.session?.userSub, eventId);
  }

  @Get('attempts/:attemptId')
  getAttemptRecord(
    @Req() req: Request,
    @Param('eventId', uuidPipe) eventId: string,
    @Param('attemptId', uuidPipe)
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
    @Param('eventId', uuidPipe) eventId: string,
    @Body() dto: StartTimingAttemptDto,
  ): Promise<StartTimingAttemptResult> {
    return this.timingService.startAttempt(req.session?.userSub, eventId, dto);
  }

  /**
   * `POST /events/:eventId/timing/heat-attempts`: the Start press of one heat of
   * a seeded stage. A heat attempt is a timing attempt of its own; the response
   * carries its block and its clock epoch.
   */
  @Post('heat-attempts')
  @HttpCode(HttpStatus.CREATED)
  startHeatAttempt(
    @Req() req: Request,
    @Param('eventId', uuidPipe) eventId: string,
    @Body() dto: StartHeatAttemptDto,
  ): Promise<StartTimingAttemptResult> {
    return this.timingService.startHeatAttempt(
      req.session?.userSub,
      eventId,
      dto,
    );
  }

  @Post('attempts/:attemptId/clock-epochs')
  @HttpCode(HttpStatus.CREATED)
  openClockEpoch(
    @Req() req: Request,
    @Param('eventId', uuidPipe) eventId: string,
    @Param('attemptId', uuidPipe)
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
    @Param('eventId', uuidPipe) eventId: string,
    @Body() dto: CaptureTimingPassDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<TimingPassView | TimingAnonymousSplitView> {
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
    @Param('eventId', uuidPipe) eventId: string,
    @Param('pendingFinishId', uuidPipe)
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
    @Param('eventId', uuidPipe) eventId: string,
    @Param('pendingFinishId', uuidPipe)
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
   * `POST /events/:eventId/timing/splits/:splitId/assign`: bind one queued
   * anonymous split to a participant of its own attempt. This is a capture
   * mutation, so the workstation must hold capture; a repeated
   * `Idempotency-Key` is replayed by the global interceptor.
   */
  @Post('splits/:splitId/assign')
  @HttpCode(HttpStatus.OK)
  assignSplit(
    @Req() req: Request,
    @Param('eventId', uuidPipe) eventId: string,
    @Param('splitId', uuidPipe) splitId: string,
    @Body() dto: AssignAnonymousSplitDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<TimingPassView> {
    return this.anonymousSplitService.assign(
      req.session?.userSub,
      eventId,
      splitId,
      dto,
      idempotencyKey,
    );
  }

  /**
   * `POST /events/:eventId/timing/splits/:splitId/cancel`: a referee or
   * administrator retires one unassigned split with a reason. Cancellation is a
   * record correction, so it needs no capture hold; the class-level timing
   * roles already separate a referee from an administrator where the product
   * does.
   */
  @Post('splits/:splitId/cancel')
  @HttpCode(HttpStatus.OK)
  cancelSplit(
    @Req() req: Request,
    @Param('eventId', uuidPipe) eventId: string,
    @Param('splitId', uuidPipe) splitId: string,
    @Body() dto: CancelAnonymousSplitDto,
  ): Promise<TimingAnonymousSplitView> {
    return this.anonymousSplitService.cancel(
      req.session?.userSub,
      eventId,
      splitId,
      dto,
    );
  }

  /**
   * `POST /events/:eventId/timing/splits/:splitId/undo`: withdraw the
   * workstation's newest block-free capture. Event-scoped, no reason.
   */
  @Post('splits/:splitId/undo')
  @HttpCode(HttpStatus.OK)
  undoSplit(
    @Req() req: Request,
    @Param('eventId', uuidPipe) eventId: string,
    @Param('splitId', uuidPipe) splitId: string,
    @Body() dto: QuickUndoTimingSplitDto,
  ): Promise<TimingAnonymousSplitView> {
    return this.anonymousSplitService.undoSplit(
      req.session?.userSub,
      eventId,
      splitId,
      dto,
    );
  }

  /**
   * `PATCH /events/:eventId/timing/passes/:passId/official-time`: an
   * administrator moves one official start or pass instant with a reason. The
   * response is a pass view for a pass target and the attempt reference for a
   * start target.
   */
  @Patch('passes/:passId/official-time')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleCode.ADMINISTRATOR)
  correctOfficialTime(
    @Req() req: Request,
    @Param('eventId', uuidPipe) eventId: string,
    @Param('passId', uuidPipe) passId: string,
    @Body() dto: CorrectOfficialTimeDto,
  ): Promise<TimingPassView | TimingAttemptRef> {
    return this.timingService.correctOfficialTime(
      req.session?.userSub,
      eventId,
      passId,
      dto,
    );
  }

  /**
   * `POST /events/:eventId/timing/passes/:passId/cancel`: an administrator
   * soft-cancels one bound pass with a reason.
   */
  @Post('passes/:passId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleCode.ADMINISTRATOR)
  cancelPass(
    @Req() req: Request,
    @Param('eventId', uuidPipe) eventId: string,
    @Param('passId', uuidPipe) passId: string,
    @Body() dto: CancelTimingPassDto,
  ): Promise<TimingPassView> {
    return this.timingService.cancelPass(
      req.session?.userSub,
      eventId,
      passId,
      dto,
    );
  }

  /**
   * `POST /events/:eventId/timing/passes/:passId/rebind`: an administrator
   * moves one bound pass to another frozen participant of the same attempt.
   */
  @Post('passes/:passId/rebind')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleCode.ADMINISTRATOR)
  rebindPass(
    @Req() req: Request,
    @Param('eventId', uuidPipe) eventId: string,
    @Param('passId', uuidPipe) passId: string,
    @Body() dto: RebindTimingPassDto,
  ): Promise<TimingPassView> {
    return this.timingService.rebindPass(
      req.session?.userSub,
      eventId,
      passId,
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
    @Param('eventId', uuidPipe) eventId: string,
    @Param('attemptId', uuidPipe)
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

  /**
   * `POST /events/:eventId/timing/attempts/:attemptId/complete`: the capture
   * workstation closes a running attempt as `COMPLETED` and publishes every
   * eligible result with its splits.
   */
  @Post('attempts/:attemptId/complete')
  @HttpCode(HttpStatus.OK)
  completeAttempt(
    @Req() req: Request,
    @Param('eventId', uuidPipe) eventId: string,
    @Param('attemptId', uuidPipe)
    attemptId: string,
    @Body() dto: CompleteTimingAttemptDto,
  ): Promise<TimingAttemptRecordView> {
    return this.timingService.completeAttempt(
      req.session?.userSub,
      eventId,
      attemptId,
      dto,
    );
  }

  /**
   * `POST /events/:eventId/timing/attempts/:attemptId/force-complete`: an
   * administrator closes a running attempt as `INCOMPLETE` with a reason. The
   * method-level role overrides the class-level timing roles.
   */
  @Post('attempts/:attemptId/force-complete')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleCode.ADMINISTRATOR)
  forceCompleteAttempt(
    @Req() req: Request,
    @Param('eventId', uuidPipe) eventId: string,
    @Param('attemptId', uuidPipe)
    attemptId: string,
    @Body() dto: ForceCompleteTimingAttemptDto,
  ): Promise<TimingAttemptRecordView> {
    return this.timingService.forceCompleteAttempt(
      req.session?.userSub,
      eventId,
      attemptId,
      dto,
    );
  }

  /**
   * `POST /events/:eventId/timing/capture/take`: an authorized operator claims
   * the one event-wide capture hold explicitly. Nobody takes it silently.
   */
  @Post('capture/take')
  @HttpCode(HttpStatus.OK)
  takeCapture(
    @Req() req: Request,
    @Param('eventId', uuidPipe) eventId: string,
    @Body() dto: TakeCaptureDto,
  ): Promise<TimingCaptureView> {
    return this.timingService.takeCapture(req.session?.userSub, eventId, dto);
  }

  /**
   * `POST /events/:eventId/timing/capture/transfer`: the capture holder hands
   * the hold to another workstation after its captures are confirmed.
   */
  @Post('capture/transfer')
  @HttpCode(HttpStatus.OK)
  transferCapture(
    @Req() req: Request,
    @Param('eventId', uuidPipe) eventId: string,
    @Body() dto: TransferCaptureDto,
  ): Promise<TimingCaptureView> {
    return this.timingService.transferCapture(
      req.session?.userSub,
      eventId,
      dto,
    );
  }

  /**
   * `POST /events/:eventId/timing/capture/force-release`: an administrator ends
   * a hold whose workstation may be lost. The method-level role overrides the
   * class-level timing roles, so a referee is refused.
   */
  @Post('capture/force-release')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleCode.ADMINISTRATOR)
  forceReleaseCapture(
    @Req() req: Request,
    @Param('eventId', uuidPipe) eventId: string,
    @Body() dto: ForceReleaseCaptureDto,
  ): Promise<TimingCaptureView> {
    return this.timingService.forceReleaseCapture(
      req.session?.userSub,
      eventId,
      dto,
    );
  }

  /**
   * `POST /events/:eventId/timing/attempts/:attemptId/cancel`: an administrator
   * closes a running attempt as `CANCELLED` with a reason and publishes nothing.
   */
  @Post('attempts/:attemptId/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(RoleCode.ADMINISTRATOR)
  cancelAttempt(
    @Req() req: Request,
    @Param('eventId', uuidPipe) eventId: string,
    @Param('attemptId', uuidPipe)
    attemptId: string,
    @Body() dto: CancelTimingAttemptDto,
  ): Promise<TimingAttemptRecordView> {
    return this.timingService.cancelAttempt(
      req.session?.userSub,
      eventId,
      attemptId,
      dto,
    );
  }
}
