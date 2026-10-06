import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './roles.guard';
import { RolesService } from './roles.service';
import { ConnectSidGuard } from './connect-sid.guard';
import { SessionAuthGuard } from './session-auth.guard';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [AuthService, RolesService, RolesGuard, SessionAuthGuard, ConnectSidGuard],
  exports: [AuthService, RolesService, RolesGuard, SessionAuthGuard, ConnectSidGuard],
})
export class AuthModule {}
