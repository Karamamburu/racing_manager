import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CompetitionModule } from './http/competition.module';
import { PrismaModule } from './persistence/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CompetitionModule,
  ],
})
export class AppModule {}
