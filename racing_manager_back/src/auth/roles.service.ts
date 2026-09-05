import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ADMIN_ROLE_CODES, type RoleCode } from './role-codes';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findCodesByAuthentikId(authentikId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { authentikId },
      select: {
        userRoles: {
          select: {
            role: {
              select: { code: true },
            },
          },
        },
      },
    });

    if (!user) return [];

    return user.userRoles.map((row) => row.role.code);
  }

  async userHasAnyRole(
    authentikId: string,
    requiredCodes: readonly string[],
  ): Promise<boolean> {
    if (requiredCodes.length === 0) return true;

    const codes = await this.findCodesByAuthentikId(authentikId);
    return requiredCodes.some((code) => codes.includes(code));
  }

  /**
   * Call at the start of a service method that requires roles.
   * Missing session identity → 401. Wrong role → 403.
   */
  async assertHasAnyRole(
    authentikId: string | undefined,
    requiredCodes: readonly RoleCode[],
  ): Promise<void> {
    if (!authentikId) {
      throw new UnauthorizedException(
        'Not authenticated. Start with GET /auth/login.',
      );
    }

    const allowed = await this.userHasAnyRole(authentikId, requiredCodes);
    if (!allowed) {
      throw new ForbiddenException('Insufficient role.');
    }
  }

  async assertAdminAccess(authentikId: string | undefined): Promise<void> {
    await this.assertHasAnyRole(authentikId, ADMIN_ROLE_CODES);
  }
}
