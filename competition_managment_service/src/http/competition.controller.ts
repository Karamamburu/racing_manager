import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CompetitionService } from './competition.service';
import {
  parseAdvanceBody,
  parseFormatBody,
  parseStartListsBody,
} from './parse-bodies';

@Controller('v1')
export class CompetitionController {
  constructor(private readonly competition: CompetitionService) {}

  @Get('presets')
  listPresets() {
    return this.competition.listPresets();
  }

  @Get('presets/:id')
  getPreset(@Param('id') id: string) {
    return this.competition.getPreset(id);
  }

  @Post('formats/validate')
  validate(@Body() body: unknown) {
    const { format } = parseFormatBody(body);
    return this.competition.validate(format);
  }

  @Post('stages/start-lists')
  startLists(@Body() body: unknown) {
    return this.competition.startLists(parseStartListsBody(body));
  }

  @Post('stages/advance')
  advance(@Body() body: unknown) {
    return this.competition.advance(parseAdvanceBody(body));
  }
}
