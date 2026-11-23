import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { blockSchema, capacitySchema, locationCreateSchema, locationUpdateSchema, pricingSchema } from '@qp/validation';
import { type z } from 'zod';
import { type AuthUser } from '../../shared/auth/auth.types';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { MAX_UPLOAD_BYTES, type UploadedFile as File } from '../../shared/files/storage.service';
import { ApiZodBody, ZodBody } from '../../shared/http/decorators/zod.decorators';
import { OwnerLocationsService } from './owner-locations.service';

const Id = (name = 'id') => Param(name, new ParseUUIDPipe());

@ApiTags('owner: places')
@ApiBearerAuth()
@Roles('PARKING_OWNER')
@Controller('owner/locations')
export class OwnerLocationsController {
  constructor(private readonly locations: OwnerLocationsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.locations.list(u.id);
  }

  @Post()
  @ApiZodBody(locationCreateSchema)
  create(@CurrentUser() u: AuthUser, @ZodBody(locationCreateSchema) body: z.output<typeof locationCreateSchema>) {
    return this.locations.create(u.id, body);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Id() id: string) {
    return this.locations.get(u.id, id);
  }

  @Patch(':id')
  @ApiZodBody(locationUpdateSchema)
  update(@CurrentUser() u: AuthUser, @Id() id: string, @ZodBody(locationUpdateSchema) body: z.output<typeof locationUpdateSchema>) {
    return this.locations.update(u.id, id, body);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(@CurrentUser() u: AuthUser, @Id() id: string) {
    return this.locations.submit(u.id, id);
  }

  @Post(':id/photos')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  addPhoto(@CurrentUser() u: AuthUser, @Id() id: string, @UploadedFile() file: File | undefined, @Body() _b: unknown) {
    return this.locations.addPhoto(u.id, id, file);
  }

  @Delete(':id/photos/:photoId')
  deletePhoto(@CurrentUser() u: AuthUser, @Id() id: string, @Id('photoId') photoId: string) {
    return this.locations.deletePhoto(u.id, id, photoId);
  }

  @Put(':id/capacity')
  @ApiZodBody(capacitySchema)
  capacity(@CurrentUser() u: AuthUser, @Id() id: string, @ZodBody(capacitySchema) body: z.output<typeof capacitySchema>) {
    return this.locations.setCapacity(u.id, id, body);
  }

  @Put(':id/pricing')
  @ApiZodBody(pricingSchema)
  pricing(@CurrentUser() u: AuthUser, @Id() id: string, @ZodBody(pricingSchema) body: z.output<typeof pricingSchema>) {
    return this.locations.setPricing(u.id, id, body);
  }

  @Post(':id/blocks')
  @ApiZodBody(blockSchema)
  addBlock(@CurrentUser() u: AuthUser, @Id() id: string, @ZodBody(blockSchema) body: z.output<typeof blockSchema>) {
    return this.locations.addBlock(u.id, id, body);
  }

  @Delete(':id/blocks/:blockId')
  deleteBlock(@CurrentUser() u: AuthUser, @Id() id: string, @Id('blockId') blockId: string) {
    return this.locations.deleteBlock(u.id, id, blockId);
  }
}
