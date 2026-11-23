import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { MastersService } from './masters.service';

/** Public master lists used by search filters and forms: only active rows. */
@ApiTags('masters')
@Public()
@Controller()
export class MastersController {
  constructor(private readonly masters: MastersService) {}

  @Get('vehicle-types')
  vehicleTypes() {
    return this.masters.activeVehicleTypes();
  }

  @Get('cancellation-policies')
  policies() {
    return this.masters.activePolicies();
  }

  @Get('categories')
  categories() {
    return this.masters.activeCategories();
  }
}
