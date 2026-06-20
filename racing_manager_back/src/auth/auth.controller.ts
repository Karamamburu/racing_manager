import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Session } from 'express-session';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

    return res.json({
      ok: true,
      user: result.user,
      registrationStatus: result.registrationStatus,
      message: 'Login successful.',
    });
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
