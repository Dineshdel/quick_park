import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { availabilitySchema, calendarSchema, quoteSchema, searchSchema } from '@qp/validation';
import { type z } from 'zod';
import { AvailabilityService } from '../availability/availability.service';
import { Public } from '../auth/decorators/public.decorator';
import { ApiZodBody, ApiZodQuery, ZodBody, ZodQuery } from '../http/decorators/zod.decorators';
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
  async calendar(@Param('id', new ParseUUIDPipe()) id: string, @ZodQuery(calendarSchema) q: z.output<typeof calendarSchema>) {
    await this.search.assertActive(id);
    return this.availability.calendar(id, q.vehicleType, q.month);
  }

  @Get(':id/availability')
  async free(@Param('id', new ParseUUIDPipe()) id: string, @ZodQuery(availabilitySchema) q: z.output<typeof availabilitySchema>) {
    await this.search.assertActive(id);
    return { free: await this.availability.free(id, q.vehicleType, q.start, q.end), live: await this.availability.live(id, q.vehicleType) };
  }

  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.search.bySlug(slug);
  }
}
