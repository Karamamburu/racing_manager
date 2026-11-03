import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { EventsService } from './events.service';

@Controller('events')
export class EventsCatalogController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  list(@Query('from') from?: string, @Query('to') to?: string) {
    return this.eventsService.listRecent(from, to);
  }

  @Get(':id')
  getById(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.eventsService.findById(id, {
      includeRegistrations: Boolean(req.session?.userSub),
    });
  }
}
