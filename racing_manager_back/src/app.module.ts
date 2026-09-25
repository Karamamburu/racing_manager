import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AdminModule } from './admin/admin.module';
import { ClassCompetitionsModule } from './class-competitions/class-competitions.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { NewsModule } from './news/news.module';
import { PersonalModule } from './personal/personal.module';
import { PrismaModule } from './prisma/prisma.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { ResultsModule } from './results/results.module';
import { StorageModule } from './storage/storage.module';
import { TracksModule } from './tracks/tracks.module';
import { UsersModule } from './users/users.module';
import { MainModule } from './main/main.module';
import { HealthModule } from './health/health.module';
import { buildPinoParams } from './logging/pino.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot(buildPinoParams('racing_manager_back')),
    PrismaModule,
    StorageModule,
    UsersModule,
    AuthModule,
    PersonalModule,
    AdminModule,
    EventsModule,
    ClassCompetitionsModule,
    TracksModule,
    NewsModule,
    RegistrationsModule,
    ResultsModule,
    MainModule,
    HealthModule,
  ],
})
export class AppModule {}
