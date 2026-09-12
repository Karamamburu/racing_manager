import { Controller, Get, Query } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('participation-formats')
export class ParticipationFormatsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  list(@Query('sport') sport?: string) {
    return this.eventsService.listFormats(sport);
  }
}
