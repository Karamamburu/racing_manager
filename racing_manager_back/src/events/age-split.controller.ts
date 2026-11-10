import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ADMIN_ROLE_CODES } from '../auth/role-codes';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { AgeSplitService } from './age-split.service';

@Controller('admin/events')
@UseGuards(SessionAuthGuard, RolesGuard)
export class AgeSplitController {
  constructor(private readonly ageSplitService: AgeSplitService) {}

  @Put(':id/categories/age-split')
  @HttpCode(HttpStatus.OK)
  @Roles(...ADMIN_ROLE_CODES)
  setSplit(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    return this.ageSplitService.setSplit(id, body);
  }
}
