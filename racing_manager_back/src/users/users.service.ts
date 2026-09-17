import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConsentRequestMeta } from '../auth/consent-request-meta';
import { PrismaService } from '../prisma/prisma.service';

export type OwnProfileUpdate = {
  firstName: string;
  lastName: string;
  gender: 'M' | 'F' | null;
  birthDate: Date | null;
  city: string | null;
  district: string | null;
  team: string | null;
};

export type AppUser = {
  id: string;
  authentikId: string;
  userName: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  gender?: 'M' | 'F';
  birthDate?: string;
  city?: string;
  district?: string;
  team?: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async registerFromOidcProfile(profile: {
    sub: string;
    username?: string;
    email?: string;
    name?: string;
    consentGranted?: boolean;
    requestMeta?: ConsentRequestMeta;
  }): Promise<{ user: AppUser; isNew: boolean }> {
    const existing = await this.prisma.user.findUnique({
      where: { authentikId: profile.sub },
    });

    const firstName = this.extractFirstName(profile.name);
    const lastName = this.extractLastName(profile.name);
    const userName = this.resolveUserName(profile.username, profile.email);

    if (existing) {
      const dbUser = await this.prisma.user.update({
        where: { authentikId: profile.sub },
        data: {
          userName,
          email: profile.email,
          ...(existing.firstName ? {} : { firstName }),
          ...(existing.lastName ? {} : { lastName }),
        },
      });
      return { user: this.toAppUser(dbUser), isNew: false };
    }

    const dbUser = await this.createUserWithRegistrationConsent({
      authentikId: profile.sub,
      userName,
      email: profile.email,
      firstName,
      lastName,
      consentGranted: Boolean(profile.consentGranted),
      requestMeta: profile.requestMeta,
    });

    return { user: this.toAppUser(dbUser), isNew: true };
  }

  async upsertFromOidcProfile(profile: {
    sub: string;
    username?: string;
    email?: string;
    name?: string;
  }): Promise<AppUser> {
    const { user } = await this.registerFromOidcProfile(profile);
    return user;
  }

  private async createUserWithRegistrationConsent(input: {
    authentikId: string;
    userName: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    consentGranted: boolean;
    requestMeta?: ConsentRequestMeta;
  }) {
    const document = input.consentGranted
      ? await this.prisma.personalConsentDocument.findFirst({
          where: { type: 'PERSONAL_DATA_CONSENT' },
          orderBy: { publishedAt: 'desc' },
        })
      : null;
    if (input.consentGranted && !document) {
      throw new ServiceUnavailableException(
        'Personal data consent document is not published.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          authentikId: input.authentikId,
          userName: input.userName,
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
        },
      });

      if (document) {
        await tx.personalConsentEvent.create({
          data: {
            documentId: document.id,
            userId: user.id,
            action: 'GRANTED',
            source: 'REGISTRATION',
            userFirstName: input.firstName ?? '',
            userLastName: input.lastName ?? '',
            userBirthDate: null,
            ip: input.requestMeta?.ip ?? null,
            userAgent: input.requestMeta?.userAgent ?? null,
          },
        });
      }

      return user;
    });
  }

  async findBySub(sub: string): Promise<AppUser | null> {
    const dbUser = await this.prisma.user.findUnique({
      where: { authentikId: sub },
    });
    return dbUser ? this.toAppUser(dbUser) : null;
  }

  async count(): Promise<number> {
    return this.prisma.user.count();
  }

  async updateOwnProfile(
    authentikId: string,
    data: OwnProfileUpdate,
  ): Promise<AppUser> {
    const existing = await this.prisma.user.findUnique({
      where: { authentikId },
    });
    if (!existing) {
      throw new UnauthorizedException(
        'Not authenticated. Start with GET /auth/login.',
      );
    }

    const updated = await this.prisma.user.update({
      where: { authentikId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        gender: data.gender,
        birthDate: data.birthDate,
        city: data.city,
        district: data.district,
        team: data.team,
      },
    });
    return this.toAppUser(updated);
  }

  toAppUser(dbUser: {
    id: string;
    authentikId: string;
    userName: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    gender?: 'M' | 'F' | null;
    birthDate?: Date | null;
    city?: string | null;
    district?: string | null;
    team?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): AppUser {
    return {
      id: dbUser.id,
      authentikId: dbUser.authentikId,
      userName: dbUser.userName,
      email: dbUser.email ?? undefined,
      firstName: dbUser.firstName ?? undefined,
      lastName: dbUser.lastName ?? undefined,
      gender: dbUser.gender ?? undefined,
      birthDate: dbUser.birthDate?.toISOString().slice(0, 10) ?? undefined,
      city: dbUser.city ?? undefined,
      district: dbUser.district ?? undefined,
      team: dbUser.team ?? undefined,
      createdAt: dbUser.createdAt.toISOString(),
      updatedAt: dbUser.updatedAt.toISOString(),
    };
  }

  private extractFirstName(fullName?: string): string | undefined {
    if (!fullName) return undefined;
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    return parts.length > 0 ? parts[0] : undefined;
  }

  private extractLastName(fullName?: string): string | undefined {
    if (!fullName) return undefined;
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return undefined;
    return parts.slice(1).join(' ');
  }

  private resolveUserName(usernameFromClaims?: string, email?: string): string {
    const normalizedClaim = usernameFromClaims?.trim();
    if (normalizedClaim) return normalizedClaim;

    const emailLocalPart = email?.split('@')[0]?.trim();
    if (emailLocalPart) return emailLocalPart;

    throw new Error(
      'OIDC profile does not include username (preferred_username) or email.',
    );
  }
}
