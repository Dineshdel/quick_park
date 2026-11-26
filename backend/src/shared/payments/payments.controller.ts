import { Controller, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { mockPaySchema, paymentOrderSchema } from '@qp/validation';
import { type Request } from 'express';
import { type z } from 'zod';
import { type AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiZodBody, ZodBody } from '../http/decorators/zod.decorators';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @ApiBearerAuth()
  @Roles('VEHICLE_OWNER')
  @Post('order')
  @ApiZodBody(paymentOrderSchema)
  order(@CurrentUser() user: AuthUser, @ZodBody(paymentOrderSchema) body: z.output<typeof paymentOrderSchema>) {
    return this.payments.createOrder(user.id, body.bookingId);
  }

  /** An overstay charge the gate sent to this driver to pay online. */
  @ApiBearerAuth()
  @Roles('VEHICLE_OWNER')
  @Get('gate/:id')
  gateCharge(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.payments.gateCharge(user.id, id);
  }

  /** Development only (PAYMENTS_DRIVER=mock): simulate the checkout result. */
  @ApiBearerAuth()
  @Roles('VEHICLE_OWNER')
  @HttpCode(HttpStatus.OK)
  @Post('mock/pay')
  @ApiZodBody(mockPaySchema)
  mockPay(@CurrentUser() user: AuthUser, @ZodBody(mockPaySchema) body: z.output<typeof mockPaySchema>) {
    return this.payments.mockPay(user.id, body.orderId, body.outcome);
  }

  /** Razorpay webhook: signature-verified, idempotent. The only way a real payment confirms a booking. */
  @ApiExcludeEndpoint()
  @Public()
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('webhook/razorpay')
  webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature?: string,
    @Headers('x-razorpay-event-id') eventId?: string,
  ) {
    return this.payments.handleWebhook(req.rawBody, signature, eventId);
  }
}
