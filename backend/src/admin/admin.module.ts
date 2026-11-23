import { Module } from '@nestjs/common';
import { MastersModule } from '../shared/masters/masters.module';
import { AcceptInviteController } from './accept-invite.controller';
import { AdminInviteService } from './admin-invite.service';
import { AdminController } from './admin.controller';
import { AdminMastersController } from './masters/admin-masters.controller';
import { AdminMastersService } from './masters/admin-masters.service';
import { AdminOpsController } from './ops/admin-ops.controller';
import { AdminOpsService } from './ops/admin-ops.service';

/** Everything only the Super Admin uses. See README.md in this folder. */
@Module({
  imports: [MastersModule],
  controllers: [AdminController, AcceptInviteController, AdminMastersController, AdminOpsController],
  providers: [AdminInviteService, AdminMastersService, AdminOpsService],
})
export class AdminModule {}
