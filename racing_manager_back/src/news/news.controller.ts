import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { RoleCode } from '../auth/role-codes';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { DEFAULT_MAX_UPLOAD_BYTES } from '../storage/storage.config';
import { MulterExceptionFilter } from '../storage/multer-exception.filter';
import { NewsService } from './news.service';
import type { UploadedMediaFile } from './parse-news-media';

@Controller('admin/news')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(RoleCode.ADMINISTRATOR)
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Post('media')
  @HttpCode(HttpStatus.CREATED)
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: memoryStorage(),
      limits: { fileSize: DEFAULT_MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  uploadMedia(
    @Req() req: Request,
    @UploadedFiles() files: UploadedMediaFile[] | undefined,
  ) {
    return this.newsService.uploadMedia(req.session?.userSub, files?.[0]);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: Request, @Body() body: unknown) {
    return this.newsService.create(req.session?.userSub, body);
  }

  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: unknown,
  ) {
    return this.newsService.update(req.session?.userSub, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.newsService.remove(req.session?.userSub, id);
  }
}
