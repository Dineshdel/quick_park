import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { exitSchema, scanSchema, walkInSchema } from '@qp/validation';
import { type z } from 'zod';
import { type AuthUser } from '../../shared/auth/auth.types';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { ApiZodBody, ZodBody } from '../../shared/http/decorators/zod.decorators';
import { Limits } from '../../shared/http/throttle/limits';
import { AccessService } from './access.service';

@ApiTags('access (gate)')
@ApiBearerAuth()
@Roles('PARKING_OWNER')
@Controller('access')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Throttle({ default: Limits.scan })
  @HttpCode(HttpStatus.OK)
  @Post('scan')
  @ApiZodBody(scanSchema)
  scan(@CurrentUser() u: AuthUser, @ZodBody(scanSchema) body: z.output<typeof scanSchema>) {
    return this.access.scan(u.id, body);
  }

  @Post('walk-in')
  @ApiZodBody(walkInSchema)
  walkIn(@CurrentUser() u: AuthUser, @ZodBody(walkInSchema) body: z.output<typeof walkInSchema>) {
    return this.access.walkIn(u.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('sessions/:id/exit')
  @ApiZodBody(exitSchema)
  exit(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @ZodBody(exitSchema) body: z.output<typeof exitSchema>) {
    return this.access.exit(u.id, id, body.paymentMethod);
  }

  @Get('sessions')
  sessions(@CurrentUser() u: AuthUser, @Query('locationId', new ParseUUIDPipe()) locationId: string, @Query('open') open?: string) {
    return this.access.sessions(u.id, locationId, open !== 'false');
  }
}
