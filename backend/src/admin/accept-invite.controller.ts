import { Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { acceptInviteSchema, type AcceptInviteInput } from '@qp/validation';
import { type Response } from 'express';
import { type RequestContext } from '../shared/auth/auth.types';
import { ReqContext } from '../shared/auth/decorators/current-user.decorator';
import { Public } from '../shared/auth/decorators/public.decorator';
import { RefreshCookieService } from '../shared/auth/refresh-cookie.service';
import { ApiZodBody, ZodBody } from '../shared/http/decorators/zod.decorators';
import { Limits } from '../shared/http/throttle/limits';
import { AdminInviteService } from './admin-invite.service';

/** Public: an invited admin opens the emailed link and sets name + password (POST /api/v1/auth/accept-invite). */
@ApiTags('auth')
@Controller('auth')
export class AcceptInviteController {
  constructor(
    private readonly invites: AdminInviteService,
    private readonly cookie: RefreshCookieService,
  ) {}

  @Public()
  @Throttle({ default: Limits.sensitive })
  @HttpCode(HttpStatus.OK)
  @Post('accept-invite')
  @ApiZodBody(acceptInviteSchema)
  async accept(
    @ZodBody(acceptInviteSchema) body: AcceptInviteInput,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cookie.respond(res, await this.invites.accept(body, ctx));
  }
}
