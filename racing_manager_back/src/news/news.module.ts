import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { TracksModule } from '../tracks/tracks.module';
import { UsersModule } from '../users/users.module';
import { NewsCatalogController } from './news-catalog.controller';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';

@Module({
  imports: [AuthModule, UsersModule, TracksModule, StorageModule],
  controllers: [NewsController, NewsCatalogController],
  providers: [NewsService],
})
export class NewsModule {}
