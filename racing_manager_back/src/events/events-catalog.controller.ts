import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('events')
export class EventsCatalogController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  list(@Query('from') from?: string, @Query('to') to?: string) {
    return this.eventsService.listRecent(from, to);
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.eventsService.findById(id);
  }
}
