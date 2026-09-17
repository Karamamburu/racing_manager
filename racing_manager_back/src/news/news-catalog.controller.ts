import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { NewsService } from './news.service';

@Controller('news')
export class NewsCatalogController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  list(@Query('trackId') trackId?: string) {
    return this.newsService.list(trackId);
  }

  @Get(':id')
  getById(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.newsService.findById(id);
  }
}
