import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

const SESSION_COOKIE = 'connect.sid';

export function hasConnectSidCookie(cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.split(';').some((part) => {
    const trimmed = part.trim();
    const separator = trimmed.indexOf('=');
    if (separator <= 0) return false;
    const name = trimmed.slice(0, separator);
    const value = trimmed.slice(separator + 1).trim();
    return name === SESSION_COOKIE && value.length > 0;
  });
}

@Injectable()
export class ConnectSidGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!hasConnectSidCookie(request.headers.cookie)) {
      throw new UnauthorizedException(
        'Not authenticated. Start with GET /auth/login.',
      );
    }
    return true;
  }
}
