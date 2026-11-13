import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { RoleCode } from '../auth/role-codes';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { SetRefereeRoleDto } from '../timing/timing.dto';
import type { UserRolesView } from '../timing/timing.views';
import { RefereeRoleService } from './referee-role.service';

/**
 * The administrator-only REFEREE grant route.
 *
 * The controller parses the boundary — session identity, a v4 user id and a
 * boolean `enabled` — and makes one service call. The role itself is a global
 * product role, so the path names a user, never an event.
 */
@Controller('admin/users')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(RoleCode.ADMINISTRATOR)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class RefereeRoleController {
  constructor(private readonly refereeRoleService: RefereeRoleService) {}

  @Patch(':userId/referee-role')
  @HttpCode(HttpStatus.OK)
  setRefereeRole(
    @Req() req: Request,
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() dto: SetRefereeRoleDto,
  ): Promise<UserRolesView> {
    return this.refereeRoleService.setReferee(
      req.session?.userSub,
      userId,
      dto,
    );
  }
}
