import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { RolesService } from '../auth/roles.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { UsersService } from '../users/users.service';

@Controller('personal')
export class PersonalController {
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
  ) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  async getPersonal(@Req() req: Request) {
    const userFromSession = req.session?.user;
    const sub = req.session?.userSub;
    const userFromStore = sub ? await this.usersService.findBySub(sub) : null;
    const roles = sub ? await this.rolesService.findCodesByAuthentikId(sub) : [];
    const fallbackName =
      [userFromStore?.firstName, userFromStore?.lastName]
        .filter((part) => Boolean(part))
        .join(' ')
        .trim() || null;
    const displayName = userFromSession?.name ?? fallbackName;

    return {
      authenticated: true,
      user: {
        sub: sub ?? userFromSession?.sub ?? null,
        username: userFromSession?.username ?? userFromStore?.userName ?? null,
        email: userFromSession?.email ?? userFromStore?.email ?? null,
        name: displayName,
      },
      roles,
      profile: userFromStore,
    };
  }
}
