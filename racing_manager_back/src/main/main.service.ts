import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../auth/session';
import { UsersService } from '../users/users.service';

@Injectable()
export class MainService {
  constructor(private readonly usersService: UsersService) {}

  async getMainPageData(params: {
    userSub?: string;
    sessionUser?: SessionUser;
  }) {
    const { userSub, sessionUser } = params;
    const userFromStore = userSub
      ? await this.usersService.findBySub(userSub)
      : null;

    const firstName = userFromStore?.firstName ?? null;
    const lastName = userFromStore?.lastName ?? null;
    const fullNameFromStore =
      [userFromStore?.firstName, userFromStore?.lastName]
        .filter((part) => Boolean(part))
        .join(' ')
        .trim() || null;

    return {
      page: {
        title: 'Racing Manager',
        message: 'Main page stub',
      },
      authenticated: Boolean(userSub),
      user: userSub
        ? {
            sub: userSub,
            username: sessionUser?.username ?? userFromStore?.userName ?? null,
            email: sessionUser?.email ?? userFromStore?.email ?? null,
            firstName,
            lastName,
            name: sessionUser?.name ?? fullNameFromStore,
          }
        : null,
    };
  }
}
