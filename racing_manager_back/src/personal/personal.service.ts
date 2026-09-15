import {
  Injectable,
  ServiceUnavailableException,
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
import type { ConsentRequestMeta } from './consent-request-meta';
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
    requestMeta: ConsentRequestMeta,
  ): Promise<PersonalResponse> {
    const sub = this.requireAuthentikId(authentikId);
    const parsed = parseUpdatePersonalBody(body);
    const updated = await this.saveProfileWithConsent(sub, parsed, requestMeta);
    const [roles, stats] = await Promise.all([
      this.rolesService.findCodesByAuthentikId(sub),
      this.getStats(updated.id),
    ]);
    return this.toResponse(sub, sessionUser, updated, roles, stats);
  }

  private async saveProfileWithConsent(
    authentikId: string,
    parsed: ReturnType<typeof parseUpdatePersonalBody>,
    requestMeta: ConsentRequestMeta,
  ): Promise<AppUser> {
    const document = await this.prisma.personalConsentDocument.findFirst({
      where: { type: 'PERSONAL_DATA_CONSENT' },
      orderBy: { publishedAt: 'desc' },
    });
    if (!document) {
      throw new ServiceUnavailableException(
        'Personal data consent document is not published.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { authentikId },
      });
      if (!existing) {
        throw new UnauthorizedException(
          'Not authenticated. Start with GET /auth/login.',
        );
      }

      const user = await tx.user.update({
        where: { authentikId },
        data: {
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          gender: parsed.gender,
          birthDate: parsed.birthDate,
          city: parsed.city,
          district: parsed.district,
          team: parsed.team,
        },
      });

      await tx.personalConsentEvent.create({
        data: {
          documentId: document.id,
          userId: user.id,
          action: 'GRANTED',
          source: 'PROFILE_UPDATE',
          userFirstName: parsed.firstName,
          userLastName: parsed.lastName,
          userBirthDate: parsed.birthDate,
          ip: requestMeta.ip,
          userAgent: requestMeta.userAgent,
        },
      });

      return user;
    });

    return this.usersService.toAppUser(updated);
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
    const finishEventIds = [
      ...new Set(
        own.filter(isCompleteStatsResult).map((row) => row.eventId),
      ),
    ];
    const competitorRows = finishEventIds.length
      ? await this.prisma.registration.findMany({
          where: {
            eventId: { in: finishEventIds },
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
  result: { timeMilliseconds: number; _count: { laps: number } } | null;
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
        }
      : null,
  };
}
