import { Controller, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  chooseRoleSchema,
  emailOnlySchema,
  googleLoginSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
  type ChooseRoleInput,
  type EmailOnlyInput,
  type GoogleLoginInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type TokenInput,
} from '@qp/validation';
import { type Request, type Response } from 'express';
import { ApiZodBody, ZodBody } from '../http/decorators/zod.decorators';
import { ThrottleByEmailAndIp } from '../http/throttle/app-throttler.guard';
import { Limits } from '../http/throttle/limits';
import { AuthService } from './auth.service';
import { type AuthUser, type RequestContext } from './auth.types';
import { CurrentUser, ReqContext } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AllowNoRole } from './decorators/roles.decorator';
import { CSRF_HEADER, CsrfHeaderGuard } from './guards/csrf-header.guard';
import { RefreshCookieService } from './refresh-cookie.service';
import { SessionService } from './session.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly cookie: RefreshCookieService,
  ) {}

  @Public()
  @Throttle({ default: Limits.sensitive })
  @Post('register')
  @ApiZodBody(registerSchema)
  register(@ZodBody(registerSchema) body: RegisterInput) {
    return this.auth.register(body);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  @ApiZodBody(tokenSchema)
  verifyEmail(@ZodBody(tokenSchema) body: TokenInput) {
    return this.auth.verifyEmail(body.token);
  }

  @Public()
  @Throttle({ default: Limits.sensitive })
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  @ApiZodBody(emailOnlySchema)
  resendVerification(@ZodBody(emailOnlySchema) body: EmailOnlyInput) {
    return this.auth.resendVerification(body.email);
  }

  @Public()
  @ThrottleByEmailAndIp()
  @Throttle({ default: Limits.login })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  @ApiZodBody(loginSchema)
  async login(
    @ZodBody(loginSchema) body: LoginInput,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cookie.respond(res, await this.auth.login(body, ctx));
  }

  @Public()
  @Throttle({ default: Limits.login })
  @HttpCode(HttpStatus.OK)
  @Post('google')
  @ApiZodBody(googleLoginSchema)
  async google(
    @ZodBody(googleLoginSchema) body: GoogleLoginInput,
    @ReqContext() ctx: RequestContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { needsRole, ...session } = await this.auth.loginWithGoogle(body.idToken, ctx);
    return { ...this.cookie.respond(res, session), needsRole };
  }

  @Public()
  @UseGuards(CsrfHeaderGuard)
  @ApiHeader({ name: CSRF_HEADER, required: true, schema: { enum: ['1'] } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Req() req: Request, @ReqContext() ctx: RequestContext, @Res({ passthrough: true }) res: Response) {
    try {
      return this.cookie.respond(res, await this.sessions.rotate(this.cookie.read(req), ctx));
    } catch (e) {
      this.cookie.clear(res);
      throw e;
    }
  }

  @Public()
  @UseGuards(CsrfHeaderGuard)
  @ApiHeader({ name: CSRF_HEADER, required: true, schema: { enum: ['1'] } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.sessions.revokeByToken(this.cookie.read(req));
    this.cookie.clear(res);
  }

  @Public()
  @Throttle({ default: Limits.sensitive })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  @ApiZodBody(emailOnlySchema)
  forgotPassword(@ZodBody(emailOnlySchema) body: EmailOnlyInput) {
    return this.auth.forgotPassword(body.email);
  }

  @Public()
  @Throttle({ default: Limits.sensitive })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  @ApiZodBody(resetPasswordSchema)
  resetPassword(@ZodBody(resetPasswordSchema) body: ResetPasswordInput) {
    return this.auth.resetPassword(body);
  }

  @ApiBearerAuth()
  @AllowNoRole()
  @HttpCode(HttpStatus.OK)
  @Post('choose-role')
  @ApiZodBody(chooseRoleSchema)
  chooseRole(@CurrentUser() user: AuthUser, @ZodBody(chooseRoleSchema) body: ChooseRoleInput) {
    return this.auth.chooseRole(user.id, body.role);
  }
}
