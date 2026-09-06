import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ADMIN_ROLE_CODES } from '../auth/role-codes';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { RegistrationsService } from './registrations.service';

@Controller('events/:eventId/registrations')
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Req() req: Request,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Body() body: unknown,
  ) {
    return this.registrationsService.create(req.session?.userSub, eventId, body);
  }

  @Post('cancel')
  @UseGuards(SessionAuthGuard)
  cancel(
    @Req() req: Request,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
  ) {
    return this.registrationsService.cancelOwn(req.session?.userSub, eventId);
  }

  @Patch(':registrationId')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  update(
    @Req() req: Request,
    @Param('eventId', new ParseUUIDPipe({ version: '4' })) eventId: string,
    @Param('registrationId', new ParseUUIDPipe({ version: '4' }))
    registrationId: string,
    @Body() body: unknown,
  ) {
    return this.registrationsService.update(
      req.session?.userSub,
      eventId,
      registrationId,
      body,
    );
  }
}
