import { Controller, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { bookingCreateSchema, bookingListSchema, cancelSchema, disputeCreateSchema, extendSchema } from '@qp/validation';
import { type Response } from 'express';
import { type z } from 'zod';
import { type AuthUser } from '../../shared/auth/auth.types';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { Errors } from '../../shared/http/app-exception';
import { ApiZodBody, ApiZodQuery, ZodBody, ZodQuery } from '../../shared/http/decorators/zod.decorators';
import { BookingsService } from './bookings.service';

const Id = () => Param('id', new ParseUUIDPipe());

@ApiTags('bookings')
@ApiBearerAuth()
@Roles('VEHICLE_OWNER')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  /** Holds a slot (PENDING_PAYMENT) until payment. Requires an Idempotency-Key header; retries return the same booking. */
  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiZodBody(bookingCreateSchema)
  async create(
    @CurrentUser() u: AuthUser,
    @Headers('idempotency-key') key: string | undefined,
    @ZodBody(bookingCreateSchema) body: z.output<typeof bookingCreateSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!key || !/^[\w:.-]{8,100}$/.test(key)) {
      throw Errors.badRequest('VALIDATION_FAILED', 'Idempotency-Key header (8–100 characters) is required');
    }
    const r = await this.bookings.create(u.id, { ...body, idempotencyKey: key });
    res.status(r.created ? HttpStatus.CREATED : HttpStatus.OK);
    return r.booking;
  }

  @Get()
  @ApiZodQuery(bookingListSchema)
  list(@CurrentUser() u: AuthUser, @ZodQuery(bookingListSchema) q: z.output<typeof bookingListSchema>) {
    return this.bookings.list(u.id, q.tab);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Id() id: string) {
    return this.bookings.get(u.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(cancelSchema)
  cancel(@CurrentUser() u: AuthUser, @Id() id: string, @ZodBody(cancelSchema) body: z.output<typeof cancelSchema>) {
    return this.bookings.cancel(u.id, id, body.reason);
  }

  /** Creates a follow-on booking (needs its own payment). */
  @Post(':id/extend')
  @ApiZodBody(extendSchema)
  async extend(@CurrentUser() u: AuthUser, @Id() id: string, @ZodBody(extendSchema) body: z.output<typeof extendSchema>, @Res({ passthrough: true }) res: Response) {
    const r = await this.bookings.extend(u.id, id, body.quantity);
    res.status(r.created ? HttpStatus.CREATED : HttpStatus.OK);
    return r.booking;
  }

  @Get(':id/pass')
  pass(@CurrentUser() u: AuthUser, @Id() id: string) {
    return this.bookings.passFor(u.id, id);
  }

  @Get(':id/pass.pdf')
  async passPdf(@CurrentUser() u: AuthUser, @Id() id: string, @Res() res: Response) {
    const { code, pdf } = await this.bookings.passPdf(u.id, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="quick-park-${code}.pdf"`);
    res.send(pdf);
  }

  @Post(':id/disputes')
  @ApiZodBody(disputeCreateSchema)
  dispute(@CurrentUser() u: AuthUser, @Id() id: string, @ZodBody(disputeCreateSchema) body: z.output<typeof disputeCreateSchema>) {
    return this.bookings.raiseDispute(u.id, id, body.reason);
  }

  @Get(':id/disputes')
  disputes(@CurrentUser() u: AuthUser, @Id() id: string) {
    return this.bookings.disputes(u.id, id);
  }
}
