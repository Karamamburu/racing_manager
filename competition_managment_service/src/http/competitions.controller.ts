import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CompetitionsService } from '../persistence/competitions.service';
import {
  parseCreateCompetitionBody,
  parseSeedStageBody,
  parseStageResultsBody,
} from './parse-competition-bodies';

@Controller('v1/competitions')
export class CompetitionsController {
  constructor(private readonly competitions: CompetitionsService) {}

  @Post()
  create(@Body() body: unknown) {
    return this.competitions.create(parseCreateCompetitionBody(body));
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.competitions.getById(id);
  }

  @Post(':id/stages/:stageId/start-lists')
  seed(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @Body() body: unknown,
  ) {
    const parsed = parseSeedStageBody(body);
    return this.competitions.seedStage(id, stageId, parsed.manualHeats);
  }

  @Put(':id/stages/:stageId/results')
  results(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @Body() body: unknown,
  ) {
    const parsed = parseStageResultsBody(body);
    return this.competitions.recordResults(id, stageId, parsed.heatResults);
  }

  @Post(':id/stages/:stageId/advance')
  advance(@Param('id') id: string, @Param('stageId') stageId: string) {
    return this.competitions.advanceStage(id, stageId);
  }
}
