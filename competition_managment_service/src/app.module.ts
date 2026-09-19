import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CompetitionModule } from './http/competition.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), CompetitionModule],
})
export class AppModule {}
