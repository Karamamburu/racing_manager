import { Controller, Get, UseGuards } from '@nestjs/common';
import { ADMIN_ROLE_CODES } from '../auth/role-codes';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';

@Controller('admin')
@UseGuards(SessionAuthGuard, RolesGuard)
export class AdminController {
  @Get('ping')
  @Roles(...ADMIN_ROLE_CODES)
  ping() {
    return { ok: true };
  }
}
