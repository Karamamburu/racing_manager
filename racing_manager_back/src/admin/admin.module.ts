import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { RefereeRoleController } from './referee-role.controller';
import { RefereeRoleRepository } from './referee-role.repository';
import { RefereeRoleService } from './referee-role.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminController, RefereeRoleController],
  providers: [RefereeRoleService, RefereeRoleRepository],
})
export class AdminModule {}
