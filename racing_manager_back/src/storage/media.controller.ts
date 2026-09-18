import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { StorageService } from './storage.service';

@Controller('media')
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Get(':prefix/:year/:month/:filename')
  serve(
    @Param('prefix') prefix: string,
    @Param('year') year: string,
    @Param('month') month: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const key = this.storage.parseMediaKey(
      `${prefix}/${year}/${month}/${filename}`,
    );
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.redirect(302, this.storage.toReadableUrl(key));
  }
}
