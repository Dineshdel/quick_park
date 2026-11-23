import { Module } from '@nestjs/common';
import { BookingsController } from './bookings/bookings.controller';
import { BookingsService } from './bookings/bookings.service';
import { VehiclesController } from './vehicles/vehicles.controller';
import { VehiclesService } from './vehicles/vehicles.service';

/** Everything only the Vehicle Owner uses. Features are added here module by module (see README.md). */
@Module({
  controllers: [VehiclesController, BookingsController],
  providers: [VehiclesService, BookingsService],
  exports: [BookingsService],
})
export class VehicleOwnerModule {}
