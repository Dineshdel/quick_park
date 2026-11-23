import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/database/prisma.service';
import { AppException, Errors } from '../shared/http/app-exception';

/** Resolves the signed-in user's owner row and enforces place ownership (other owners' places are 404). */
@Injectable()
export class OwnerContext {
  constructor(private readonly prisma: PrismaService) {}

  async owner(userId: string) {
    const o = await this.prisma.owner.findUnique({ where: { userId } });
    if (!o) throw new AppException(HttpStatus.FORBIDDEN, 'OWNER_PROFILE_REQUIRED', 'Fill in your business profile first');
    return o;
  }

  async location(userId: string, locationId: string) {
    const o = await this.owner(userId);
    const l = await this.prisma.parkingLocation.findFirst({ where: { id: locationId, ownerId: o.id } });
    if (!l) throw Errors.notFound('Parking place');
    return { owner: o, location: l };
  }
}
