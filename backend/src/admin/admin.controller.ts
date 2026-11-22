import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { adminInviteSchema, type AdminInviteInput } from '@qp/validation';
import { Roles } from '../shared/auth/decorators/roles.decorator';
import { ApiZodBody, ZodBody } from '../shared/http/decorators/zod.decorators';
import { Limits } from '../shared/http/throttle/limits';
import { AdminInviteService } from './admin-invite.service';

/** Super-admin-only endpoints: /api/v1/admin/* */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('SUPER_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly invites: AdminInviteService) {}

  @Throttle({ default: Limits.sensitive })
  @HttpCode(HttpStatus.OK)
  @Post('invite')
  @ApiZodBody(adminInviteSchema)
  invite(@ZodBody(adminInviteSchema) body: AdminInviteInput) {
    return this.invites.invite(body.email);
  }
}
