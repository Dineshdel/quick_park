import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  cancellationPolicyCreateSchema,
  cancellationPolicyUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  platformSettingsUpdateSchema,
  vehicleTypeCreateSchema,
  vehicleTypeUpdateSchema,
} from '@qp/validation';
import { type z } from 'zod';
import { type AuthUser } from '../../shared/auth/auth.types';
import { CurrentUser } from '../../shared/auth/decorators/current-user.decorator';
import { Roles } from '../../shared/auth/decorators/roles.decorator';
import { ApiZodBody, ZodBody } from '../../shared/http/decorators/zod.decorators';
import { MastersService } from '../../shared/masters/masters.service';
import { AdminMastersService } from './admin-masters.service';

const Id = () => Param('id', new ParseUUIDPipe());
type Out<S extends z.ZodType> = z.output<S>;

/** Master data: /api/v1/admin/{vehicle-types,categories,cancellation-policies,settings} */
@ApiTags('admin: masters')
@ApiBearerAuth()
@Roles('SUPER_ADMIN')
@Controller('admin')
export class AdminMastersController {
  constructor(
    private readonly admin: AdminMastersService,
    private readonly masters: MastersService,
  ) {}

  // ---------- vehicle types ----------

  @Get('vehicle-types')
  listVehicleTypes() {
    return this.admin.listVehicleTypes();
  }

  @Post('vehicle-types')
  @ApiZodBody(vehicleTypeCreateSchema)
  createVehicleType(@ZodBody(vehicleTypeCreateSchema) body: Out<typeof vehicleTypeCreateSchema>) {
    return this.admin.createVehicleType(body);
  }

  @Patch('vehicle-types/:id')
  @ApiZodBody(vehicleTypeUpdateSchema)
  updateVehicleType(@Id() id: string, @ZodBody(vehicleTypeUpdateSchema) body: Out<typeof vehicleTypeUpdateSchema>) {
    return this.admin.updateVehicleType(id, body);
  }

  @Delete('vehicle-types/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteVehicleType(@Id() id: string) {
    return this.admin.deleteVehicleType(id);
  }

  // ---------- categories ----------

  @Get('categories')
  listCategories() {
    return this.admin.listCategories();
  }

  @Post('categories')
  @ApiZodBody(categoryCreateSchema)
  createCategory(@ZodBody(categoryCreateSchema) body: Out<typeof categoryCreateSchema>) {
    return this.admin.createCategory(body);
  }

  @Patch('categories/:id')
  @ApiZodBody(categoryUpdateSchema)
  updateCategory(@Id() id: string, @ZodBody(categoryUpdateSchema) body: Out<typeof categoryUpdateSchema>) {
    return this.admin.updateCategory(id, body);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCategory(@Id() id: string) {
    return this.admin.deleteCategory(id);
  }

  // ---------- cancellation policies ----------

  @Get('cancellation-policies')
  listPolicies() {
    return this.admin.listPolicies();
  }

  @Post('cancellation-policies')
  @ApiZodBody(cancellationPolicyCreateSchema)
  createPolicy(@ZodBody(cancellationPolicyCreateSchema) body: Out<typeof cancellationPolicyCreateSchema>) {
    return this.admin.createPolicy(body);
  }

  @Patch('cancellation-policies/:id')
  @ApiZodBody(cancellationPolicyUpdateSchema)
  updatePolicy(
    @Id() id: string,
    @ZodBody(cancellationPolicyUpdateSchema) body: Out<typeof cancellationPolicyUpdateSchema>,
  ) {
    return this.admin.updatePolicy(id, body);
  }

  @Delete('cancellation-policies/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePolicy(@Id() id: string) {
    return this.admin.deletePolicy(id);
  }

  // ---------- platform settings ----------

  @Get('settings')
  settings() {
    return this.masters.settings();
  }

  @Patch('settings')
  @ApiZodBody(platformSettingsUpdateSchema)
  updateSettings(
    @ZodBody(platformSettingsUpdateSchema) body: Out<typeof platformSettingsUpdateSchema>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admin.updateSettings(body, user.id);
  }
}
