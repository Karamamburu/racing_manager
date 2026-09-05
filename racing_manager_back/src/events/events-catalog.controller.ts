import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('events')
export class EventsCatalogController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  list() {
    return this.eventsService.listRecent();
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.eventsService.findById(id);
  }
}
