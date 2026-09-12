import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Session } from 'express-session';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { RolesService } from './roles.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
  ) {}

  @Get('session')
  async session(@Req() req: Request) {
    const userSub = req.session?.userSub;
    if (!userSub) {
      return { authenticated: false, userId: null, roles: [] };
    }

    const [user, roles] = await Promise.all([
      this.usersService.findBySub(userSub),
      this.rolesService.findCodesByAuthentikId(userSub),
    ]);

    return {
      authenticated: true,
      userId: user?.id ?? null,
      roles,
    };
  }

  @Get('login')
  login(@Req() req: Request, @Res() res: Response) {
    const url = this.authService.getAuthorizationUrl(req);
    return res.redirect(url);
  }

  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response) {
    const appHost = process.env.APP_HOST ?? 'http://localhost:4000';
    const fullUrl = `${appHost}${req.url}`;
    const result = await this.authService.handleCallback(req, fullUrl);
    const postLoginRedirectUrl =
      process.env.POST_LOGIN_REDIRECT_URI ?? 'http://localhost:5173/cabinet';
    const redirectUrl = new URL(postLoginRedirectUrl);
    redirectUrl.searchParams.set('auth', 'success');
    redirectUrl.searchParams.set(
      'registrationStatus',
      result.registrationStatus,
    );

    return res.redirect(redirectUrl.toString());
  }

  @Get('logout')
  logout(@Req() req: Request, @Res() res: Response) {
    const url = this.authService.getEndSessionUrl(req);

    const session = req.session as Session | undefined;
    session?.destroy(() => undefined);
    res.clearCookie('connect.sid');

    if (url) return res.redirect(url);
    return res.status(204).send();
  }
}
