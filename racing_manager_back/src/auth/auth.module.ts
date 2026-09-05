import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './roles.guard';
import { RolesService } from './roles.service';
import { SessionAuthGuard } from './session-auth.guard';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, RolesService, RolesGuard, SessionAuthGuard],
  exports: [AuthService, RolesService, RolesGuard, SessionAuthGuard],
})
export class AuthModule {}
