import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { PersonalController } from './personal.controller';

@Module({
  imports: [UsersModule, AuthModule],
  controllers: [PersonalController],
})
export class PersonalModule {}
