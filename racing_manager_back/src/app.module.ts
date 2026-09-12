import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { PersonalModule } from './personal/personal.module';
import { PrismaModule } from './prisma/prisma.module';
import { RegistrationsModule } from './registrations/registrations.module';
import { ResultsModule } from './results/results.module';
import { UsersModule } from './users/users.module';
import { MainModule } from './main/main.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    PersonalModule,
    AdminModule,
    EventsModule,
    RegistrationsModule,
    ResultsModule,
    MainModule,
  ],
})
export class AppModule {}
