import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { MainService } from './main.service';

@Controller()
export class MainController {
  constructor(private readonly mainService: MainService) {}

  @Get()
  getMainPage(@Req() req: Request) {
    return this.mainService.getMainPageData({
      userSub: req.session?.userSub,
      sessionUser: req.session?.user,
    });
  }

  @Get('stats')
  getStats() {
    return this.mainService.getStats();
  }
}
