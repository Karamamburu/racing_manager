import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { CompetitionModule } from './http/competition.module';
import { PrismaModule } from './persistence/prisma.module';
import { buildPinoParams } from './logging/pino.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot(buildPinoParams('competition_managment_service')),
    PrismaModule,
    CompetitionModule,
  ],
})
export class AppModule {}
