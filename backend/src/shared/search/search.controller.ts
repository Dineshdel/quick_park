import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { type SlotAvailabilityDto } from '@qp/types';
import { availabilitySchema, calendarSchema, quoteSchema, searchSchema } from '@qp/validation';
import { type z } from 'zod';
import { AvailabilityService } from '../availability/availability.service';
import { Public } from '../auth/decorators/public.decorator';
import { ApiZodBody, ApiZodQuery, ZodBody, ZodQuery } from '../http/decorators/zod.decorators';
import { PrismaService } from '../database/prisma.service';
import { Errors } from '../http/app-exception';
import { QuoteService } from '../pricing/quote.service';
import { SearchService } from './search.service';

/** Public: anyone can search, view a place, see its calendar and get a price quote. */
@ApiTags('parkings')
@Public()
@Controller('parkings')
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly availability: AvailabilityService,
    private readonly quotes: QuoteService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('search')
  @ApiZodQuery(searchSchema)
  find(@ZodQuery(searchSchema) q: z.output<typeof searchSchema>) {
    return this.search.search(q);
  }

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(quoteSchema)
  quote(@ZodBody(quoteSchema) body: z.output<typeof quoteSchema>) {
    return this.quotes.quote(body);
  }

  @Get('by-id/:id')
  byId(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.search.byId(id);
  }

  @Get(':id/calendar')
  @ApiZodQuery(calendarSchema)
  async calendar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @ZodQuery(calendarSchema) q: z.output<typeof calendarSchema>,
  ) {
    await this.search.assertActive(id);
    return this.availability.calendar(id, q.vehicleType, q.month);
  }

  @Get(':id/availability')
  async free(
    @Param('id', new ParseUUIDPipe()) id: string,
    @ZodQuery(availabilitySchema) q: z.output<typeof availabilitySchema>,
  ) {
    await this.search.assertActive(id);
    await this.assertZone(id, q.zone);
    return {
      free: await this.availability.free(
        id,
        q.vehicleType,
        q.start,
        q.end,
        undefined,
        undefined,
        q.zone,
      ),
      live: await this.availability.live(id, q.vehicleType),
      zones: await this.availability.zones(id, q.vehicleType, q.start, q.end),
    };
  }

  /** Named slots on one floor for a window: which ones are free to pick. */
  @Get(':id/slots')
  async slots(
    @Param('id', new ParseUUIDPipe()) id: string,
    @ZodQuery(availabilitySchema) q: z.output<typeof availabilitySchema>,
  ): Promise<{ slots: SlotAvailabilityDto[] }> {
    await this.search.assertActive(id);
    if (!q.zone) return { slots: [] };
    await this.assertZone(id, q.zone);
    const zoneFree = await this.availability.free(
      id,
      q.vehicleType,
      q.start,
      q.end,
      undefined,
      undefined,
      q.zone,
    );
    const states = await this.availability.slotStates(q.zone, q.vehicleType, q.start, q.end);
    return {
      slots: states
        .filter((s) => s.isOnline)
        .map((s) => ({ id: s.id, label: s.label, free: s.free && zoneFree > 0 })),
    };
  }

  /** A floor id from the query must belong to this place. */
  private async assertZone(locationId: string, zoneId?: string) {
    if (!zoneId) return;
    const zone = await this.prisma.parkingZone.findFirst({ where: { id: zoneId, locationId }, select: { id: true } });
    if (!zone) throw Errors.badRequest('VALIDATION_FAILED', 'Unknown floor for this place', [{ path: 'zone', message: 'Choose a floor of this place' }]);
  }

  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.search.bySlug(slug);
  }
}
