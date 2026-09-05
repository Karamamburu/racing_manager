import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ADMIN_ROLE_CODES } from '../auth/role-codes';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { EventsService } from './events.service';

@Controller('admin/events')
@UseGuards(SessionAuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @Roles(...ADMIN_ROLE_CODES)
  create(@Req() req: Request, @Body() body: unknown) {
    return this.eventsService.create(req.session?.userSub, body);
  }
}
