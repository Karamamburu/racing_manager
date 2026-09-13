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
import { ADMIN_ROLE_CODES, RoleCode } from '../auth/role-codes';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { EventsService } from './events.service';

@Controller('admin/events')
@UseGuards(SessionAuthGuard, RolesGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(...ADMIN_ROLE_CODES)
  create(@Req() req: Request, @Body() body: unknown) {
    return this.eventsService.create(req.session?.userSub, body);
  }

  @Patch(':id')
  @Roles(RoleCode.ADMINISTRATOR)
  update(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    return this.eventsService.update(req.session?.userSub, id, body);
  }

  @Patch(':id/status')
  @Roles(...ADMIN_ROLE_CODES)
  updateStatus(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    return this.eventsService.updateStatus(req.session?.userSub, id, body);
  }

  @Post(':id/cancel')
  @Roles(RoleCode.ADMINISTRATOR)
  cancel(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.eventsService.cancel(req.session?.userSub, id);
  }
}
