import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { SessionUser } from '../auth/session';
import { RolesService } from '../auth/roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { LISTED_REGISTRATION_STATUSES } from '../registrations/registration-status';
import { UsersService, type AppUser } from '../users/users.service';
import {
  computePersonalStats,
  EMPTY_PERSONAL_STATS,
  isCompleteStatsResult,
  type PersonalStats,
  type StatsRegistration,
} from './compute-personal-stats';
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
  stats: PersonalStats;
};

const statsRegistrationSelect = {
  id: true,
  eventId: true,
  formatId: true,
  gender: true,
  startNumber: true,
  status: true,
  event: {
    select: {
      status: true,
      eventDate: true,
      _count: { select: { laps: true } },
    },
  },
  result: {
    select: {
      timeMilliseconds: true,
      place: true,
      _count: { select: { laps: true } },
    },
  },
} as const;

@Injectable()
export class PersonalService {
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly prisma: PrismaService,
  ) {}

  async getPersonal(
    authentikId: string | undefined,
    sessionUser?: SessionUser,
  ): Promise<PersonalResponse> {
    const sub = this.requireAuthentikId(authentikId);
    const userFromStore = await this.usersService.findBySub(sub);
    const [roles, stats] = await Promise.all([
      this.rolesService.findCodesByAuthentikId(sub),
      this.getStats(userFromStore?.id),
    ]);
    return this.toResponse(sub, sessionUser, userFromStore, roles, stats);
  }

  async updateOwnPersonal(
    authentikId: string | undefined,
    sessionUser: SessionUser | undefined,
    body: unknown,
  ): Promise<PersonalResponse> {
    const sub = this.requireAuthentikId(authentikId);
    const parsed = parseUpdatePersonalBody(body);
    const updated = await this.usersService.updateOwnProfile(sub, parsed);
    const [roles, stats] = await Promise.all([
      this.rolesService.findCodesByAuthentikId(sub),
      this.getStats(updated.id),
    ]);
    return this.toResponse(sub, sessionUser, updated, roles, stats);
  }

  private requireAuthentikId(authentikId: string | undefined): string {
    if (!authentikId) {
      throw new UnauthorizedException(
        'Not authenticated. Start with GET /auth/login.',
      );
    }
    return authentikId;
  }

  private async getStats(userId: string | undefined): Promise<PersonalStats> {
    if (!userId) return EMPTY_PERSONAL_STATS;

    const ownRows = await this.prisma.registration.findMany({
      where: {
        userId,
        status: { in: [...LISTED_REGISTRATION_STATUSES] },
      },
      select: statsRegistrationSelect,
    });
    const own = ownRows.map(toStatsRegistration);
    const completeEventIds = [
      ...new Set(own.filter(isCompleteStatsResult).map((row) => row.eventId)),
    ];
    const competitorRows = completeEventIds.length
      ? await this.prisma.registration.findMany({
          where: {
            eventId: { in: completeEventIds },
            status: { in: [...LISTED_REGISTRATION_STATUSES] },
          },
          select: statsRegistrationSelect,
        })
      : [];

    return computePersonalStats(own, competitorRows.map(toStatsRegistration));
  }

  private toResponse(
    sub: string,
    sessionUser: SessionUser | undefined,
    userFromStore: AppUser | null,
    roles: string[],
    stats: PersonalStats,
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
      stats,
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

function toStatsRegistration(row: {
  id: string;
  eventId: string;
  formatId: number | null;
  gender: string;
  startNumber: number | null;
  status: string;
  event: { status: string; eventDate: Date; _count: { laps: number } };
  result: {
    timeMilliseconds: number;
    place: number | null;
    _count: { laps: number };
  } | null;
}): StatsRegistration {
  return {
    id: row.id,
    eventId: row.eventId,
    formatId: row.formatId,
    gender: row.gender,
    startNumber: row.startNumber,
    status: row.status,
    event: {
      status: row.event.status,
      eventDate: row.event.eventDate,
      lapCount: row.event._count.laps,
    },
    result: row.result
      ? {
          timeMilliseconds: row.result.timeMilliseconds,
          lapCount: row.result._count.laps,
          place: row.result.place,
        }
      : null,
  };
}
