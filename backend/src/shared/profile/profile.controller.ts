import { Controller, Get, Patch, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  changePasswordSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type UpdateProfileInput,
} from '@qp/validation';
import { type Response } from 'express';
import { type AuthUser, type RequestContext } from '../auth/auth.types';
import { CurrentUser, ReqContext } from '../auth/decorators/current-user.decorator';
import { AllowNoRole } from '../auth/decorators/roles.decorator';
import { RefreshCookieService } from '../auth/refresh-cookie.service';
import { ApiZodBody, ZodBody } from '../http/decorators/zod.decorators';
import { ProfileService } from './profile.service';

@ApiTags('profile')
@ApiBearerAuth()
@AllowNoRole()
@Controller('me')
export class ProfileController {
  constructor(
    private readonly profile: ProfileService,
    private readonly cookie: RefreshCookieService,
  ) {}

  @Get()
  me(@CurrentUser() user: AuthUser) {
    return this.profile.getMe(user.id);
  }

  @Patch()
  @ApiZodBody(updateProfileSchema)
  update(@CurrentUser() user: AuthUser, @ZodBody(updateProfileSchema) body: UpdateProfileInput) {
    return this.profile.updateMe(user.id, body);
  }

  @Patch('password')
  @ApiZodBody(changePasswordSchema)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @ZodBody(changePasswordSchema) body: ChangePasswordInput,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cookie.respond(res, await this.profile.changePassword(user.id, body, ctx));
  }
}
