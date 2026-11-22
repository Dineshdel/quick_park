import { Module } from '@nestjs/common';
import { AcceptInviteController } from './accept-invite.controller';
import { AdminInviteService } from './admin-invite.service';
import { AdminController } from './admin.controller';

/** Everything only the Super Admin uses. See README.md in this folder. */
@Module({
  controllers: [AdminController, AcceptInviteController],
  providers: [AdminInviteService],
})
export class AdminModule {}
