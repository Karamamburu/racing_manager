import {
  Body,
  Controller,
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

@Controller('events/:eventId/registrations/:registrationId/result')
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Put()
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  upsert(
    @Req() req: Request,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Param('registrationId', new ParseUUIDPipe({ version: '4' }))
    registrationId: string,
    @Body() body: unknown,
  ) {
    return this.resultsService.upsert(
      req.session?.userSub,
      eventId,
      registrationId,
      body,
    );
  }
}
