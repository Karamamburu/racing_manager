import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { PersonalController } from './personal.controller';
import { SessionAuthGuard } from './session-auth.guard';

@Module({
  imports: [UsersModule],
  controllers: [PersonalController],
  providers: [SessionAuthGuard],
})
export class PersonalModule {}
