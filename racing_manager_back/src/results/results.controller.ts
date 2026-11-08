import {
  Body,
  Controller,
  GoneException,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ADMIN_ROLE_CODES } from '../auth/role-codes';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ResultsService } from './results.service';

@Controller('events/:eventId')
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Put('enrollments/:enrollmentId/result')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  upsert(
    @Req() req: Request,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Param('enrollmentId', new ParseUUIDPipe({ version: '4' }))
    enrollmentId: string,
    @Body() body: unknown,
  ) {
    return this.resultsService.upsert(
      req.session?.userSub,
      eventId,
      enrollmentId,
      body,
    );
  }

  @Put('registrations/:registrationId/result')
  @HttpCode(HttpStatus.GONE)
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  retiredRegistrationResult() {
    throw new GoneException(
      'Registration-scoped result writes are retired. Use PUT /events/:eventId/enrollments/:enrollmentId/result.',
    );
  }
}
