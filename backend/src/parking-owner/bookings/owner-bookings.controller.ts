import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BookingStatus } from '@qp/types';
import { dateRangeSchema } from '@qp/validation';
import { type z } from 'zod';
import { type AuthUser } from '../../shared/auth/auth.types';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { ZodQuery } from '../../shared/http/decorators/zod.decorators';
import { OwnerBookingsService } from './owner-bookings.service';

@ApiTags('owner: bookings & earnings')
@ApiBearerAuth()
@Roles('PARKING_OWNER')
@Controller('owner')
export class OwnerBookingsController {
  constructor(private readonly svc: OwnerBookingsService) {}

  @Get('bookings')
  bookings(@CurrentUser() u: AuthUser, @Query('locationId') locationId?: string, @Query('date') date?: string, @Query('status') status?: string) {
    const st = status && status in BookingStatus ? (status as BookingStatus) : undefined;
    const loc = locationId && /^[0-9a-f-]{36}$/.test(locationId) ? locationId : undefined;
    return this.svc.bookings(u.id, { locationId: loc, date, status: st });
  }

  @Get('locations/:id/occupancy')
  occupancy(@CurrentUser() u: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.svc.occupancy(u.id, id);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() u: AuthUser) {
    return this.svc.dashboard(u.id);
  }

  @Get('earnings')
  earnings(@CurrentUser() u: AuthUser, @ZodQuery(dateRangeSchema) q: z.output<typeof dateRangeSchema>) {
    return this.svc.earnings(u.id, q.from, q.to);
  }

  @Get('payouts')
  payouts(@CurrentUser() u: AuthUser) {
    return this.svc.payouts(u.id);
  }
}
