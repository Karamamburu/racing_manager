import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { readConsentRequestMeta } from './consent-request-meta';
import { PersonalService } from './personal.service';

@Controller('personal')
@UseGuards(SessionAuthGuard)
export class PersonalController {
  constructor(private readonly personalService: PersonalService) {}

  @Get()
  getPersonal(@Req() req: Request) {
    return this.personalService.getPersonal(
      req.session?.userSub,
      req.session?.user,
    );
  }

  @Patch()
  async updatePersonal(@Req() req: Request, @Body() body: unknown) {
    const result = await this.personalService.updateOwnPersonal(
      req.session?.userSub,
      req.session?.user,
      body,
      readConsentRequestMeta(req),
    );

    if (req.session?.user && result.user.name) {
      req.session.user.name = result.user.name;
    }

    return result;
  }
}
