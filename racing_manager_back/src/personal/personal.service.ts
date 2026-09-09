import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { SessionUser } from '../auth/session';
import { RolesService } from '../auth/roles.service';
import { UsersService, type AppUser } from '../users/users.service';
import { parseUpdatePersonalBody } from './parse-update-personal';

export type PersonalProfile = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  userName: string | null;
  email: string | null;
  gender: string | null;
  city: string | null;
  district: string | null;
  team: string | null;
  birthDate: string | null;
};

export type PersonalResponse = {
  authenticated: true;
  user: {
    sub: string | null;
    username: string | null;
    email: string | null;
    name: string | null;
  };
  roles: string[];
  profile: PersonalProfile | null;
};

@Injectable()
export class PersonalService {
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
  ) {}

  async getPersonal(
    authentikId: string | undefined,
    sessionUser?: SessionUser,
  ): Promise<PersonalResponse> {
    const sub = this.requireAuthentikId(authentikId);
    const userFromStore = await this.usersService.findBySub(sub);
    const roles = await this.rolesService.findCodesByAuthentikId(sub);
    return this.toResponse(sub, sessionUser, userFromStore, roles);
  }

  async updateOwnPersonal(
    authentikId: string | undefined,
    sessionUser: SessionUser | undefined,
    body: unknown,
  ): Promise<PersonalResponse> {
    const sub = this.requireAuthentikId(authentikId);
    const parsed = parseUpdatePersonalBody(body);
    const updated = await this.usersService.updateOwnProfile(sub, parsed);
    const roles = await this.rolesService.findCodesByAuthentikId(sub);
    return this.toResponse(sub, sessionUser, updated, roles);
  }

  private requireAuthentikId(authentikId: string | undefined): string {
    if (!authentikId) {
      throw new UnauthorizedException(
        'Not authenticated. Start with GET /auth/login.',
      );
    }
    return authentikId;
  }

  private toResponse(
    sub: string,
    sessionUser: SessionUser | undefined,
    userFromStore: AppUser | null,
    roles: string[],
  ): PersonalResponse {
    const profileName =
      [userFromStore?.firstName, userFromStore?.lastName]
        .filter((part) => Boolean(part))
        .join(' ')
        .trim() || null;
    const displayName = profileName ?? sessionUser?.name ?? null;

    return {
      authenticated: true,
      user: {
        sub,
        username: sessionUser?.username ?? userFromStore?.userName ?? null,
        email: sessionUser?.email ?? userFromStore?.email ?? null,
        name: displayName,
      },
      roles,
      profile: userFromStore ? this.toProfile(userFromStore) : null,
    };
  }

  private toProfile(user: AppUser): PersonalProfile {
    return {
      id: user.id,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      userName: user.userName ?? null,
      email: user.email ?? null,
      gender: user.gender ?? null,
      city: user.city ?? null,
      district: user.district ?? null,
      team: user.team ?? null,
      birthDate: user.birthDate ?? null,
    };
  }
}
