import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CompetitionsService } from '../persistence/competitions.service';
import {
  parseCreateCompetitionBody,
  parsePersistedAdvanceBody,
  parseReassignHeatsBody,
  parseSeedStageBody,
  parseStageResultsBody,
} from './parse-competition-bodies';
import { parsePutPlanBody } from './parse-plan-bodies';

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

  @Get(':id/plan')
  getPlan(@Param('id') id: string) {
    return this.competitions.getPlan(id);
  }

  @Put(':id/plan')
  putPlan(@Param('id') id: string, @Body() body: unknown) {
    return this.competitions.updatePlan(id, parsePutPlanBody(body));
  }

  @Get(':id/stages/:stageId/proposal')
  proposal(@Param('id') id: string, @Param('stageId') stageId: string) {
    return this.competitions.getStageProposal(id, stageId);
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

  @Put(':id/stages/:stageId/heats')
  reassignHeats(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @Body() body: unknown,
  ) {
    const parsed = parseReassignHeatsBody(body);
    return this.competitions.reassignHeats(id, stageId, parsed.heats);
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
  advance(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @Body() body: unknown,
  ) {
    const parsed = parsePersistedAdvanceBody(body);
    return this.competitions.advanceStage(id, stageId, parsed.routes);
  }
}
