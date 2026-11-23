import { Module } from '@nestjs/common';
import { AccessController } from './access/access.controller';
import { AccessService } from './access/access.service';
import { OwnerBookingsController } from './bookings/owner-bookings.controller';
import { OwnerBookingsService } from './bookings/owner-bookings.service';
import { OwnerLocationsController } from './locations/owner-locations.controller';
import { OwnerLocationsService } from './locations/owner-locations.service';
import { OwnerContext } from './owner-context.service';
import { OwnerProfileController } from './profile/owner-profile.controller';
import { OwnerProfileService } from './profile/owner-profile.service';

/** Everything only the Parking Owner uses. See README.md in this folder. */
@Module({
  controllers: [OwnerProfileController, OwnerLocationsController, OwnerBookingsController, AccessController],
  providers: [OwnerContext, OwnerProfileService, OwnerLocationsService, OwnerBookingsService, AccessService],
})
export class ParkingOwnerModule {}
