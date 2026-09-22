import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ADMIN_ROLE_CODES } from '../auth/role-codes';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ClassCompetitionsService } from './class-competitions.service';

const eventIdPipe = new ParseUUIDPipe({ version: '4' });
const classIdPipe = new ParseUUIDPipe({ version: '4' });

@Controller('events/:eventId/class-competitions')
export class ClassCompetitionsController {
  constructor(private readonly classCompetitions: ClassCompetitionsService) {}

  @Get()
  list(@Param('eventId', eventIdPipe) eventId: string) {
    return this.classCompetitions.list(eventId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  create(
    @Req() req: Request,
    @Param('eventId', eventIdPipe) eventId: string,
    @Body() body: unknown,
  ) {
    return this.classCompetitions.create(req.session?.userSub, eventId, body);
  }

  @Patch(':id/plan')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  updatePlan(
    @Req() req: Request,
    @Param('eventId', eventIdPipe) eventId: string,
    @Param('id', classIdPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.classCompetitions.updatePlan(req.session?.userSub, eventId, id, body);
  }

  @Post(':id/stages/:stageId/start-lists')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  seedStage(
    @Req() req: Request,
    @Param('eventId', eventIdPipe) eventId: string,
    @Param('id', classIdPipe) id: string,
    @Param('stageId') stageId: string,
  ) {
    return this.classCompetitions.seedStage(req.session?.userSub, eventId, id, stageId);
  }

  @Put(':id/stages/:stageId/heats')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  reassignHeats(
    @Req() req: Request,
    @Param('eventId', eventIdPipe) eventId: string,
    @Param('id', classIdPipe) id: string,
    @Param('stageId') stageId: string,
    @Body() body: unknown,
  ) {
    return this.classCompetitions.reassignHeats(req.session?.userSub, eventId, id, stageId, body);
  }

  @Patch(':id/stages/:stageId/qualification')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  setStageQualification(
    @Req() req: Request,
    @Param('eventId', eventIdPipe) eventId: string,
    @Param('id', classIdPipe) id: string,
    @Param('stageId') stageId: string,
    @Body() body: unknown,
  ) {
    return this.classCompetitions.setStageQualification(
      req.session?.userSub,
      eventId,
      id,
      stageId,
      body,
    );
  }

  @Put(':id/stages/:stageId/heat-times')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(...ADMIN_ROLE_CODES)
  recordHeatTimes(
    @Req() req: Request,
    @Param('eventId', eventIdPipe) eventId: string,
    @Param('id', classIdPipe) id: string,
    @Param('stageId') stageId: string,
    @Body() body: unknown,
  ) {
    return this.classCompetitions.recordHeatTimes(
      req.session?.userSub,
      eventId,
      id,
      stageId,
      body,
    );
  }
}
