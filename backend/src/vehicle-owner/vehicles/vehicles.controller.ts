import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { vehicleCreateSchema, vehicleUpdateSchema } from '@qp/validation';
import { type z } from 'zod';
import { type AuthUser } from '../../shared/auth/auth.types';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { ApiZodBody, ZodBody } from '../../shared/http/decorators/zod.decorators';
import { VehiclesService } from './vehicles.service';

const Id = () => Param('id', new ParseUUIDPipe());

/** The signed-in customer's vehicles: /api/v1/vehicles */
@ApiTags('vehicles')
@ApiBearerAuth()
@Roles('VEHICLE_OWNER')
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.vehicles.list(user.id);
  }

  @Post()
  @ApiZodBody(vehicleCreateSchema)
  create(@CurrentUser() user: AuthUser, @ZodBody(vehicleCreateSchema) body: z.output<typeof vehicleCreateSchema>) {
    return this.vehicles.create(user.id, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.vehicles.get(user.id, id);
  }

  @Patch(':id')
  @ApiZodBody(vehicleUpdateSchema)
  update(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @ZodBody(vehicleUpdateSchema) body: z.output<typeof vehicleUpdateSchema>,
  ) {
    return this.vehicles.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.vehicles.remove(user.id, id);
  }

  /** QR code for the printable sticker. */
  @Get(':id/qr')
  qr(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.vehicles.qr(user.id, id);
  }

  @Post(':id/qr/rotate')
  @HttpCode(HttpStatus.OK)
  rotateQr(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.vehicles.rotateQr(user.id, id);
  }
}
