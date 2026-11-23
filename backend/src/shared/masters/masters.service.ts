import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { categorySelect, masterOrder, toPolicyDto, toSettingsDto, vehicleTypeSelect } from './masters.mapper';

/** Read access to master data, for public pages and for other modules (search, booking, pricing). */
@Injectable()
export class MastersService {
  constructor(private readonly prisma: PrismaService) {}

  activeVehicleTypes() {
    return this.prisma.vehicleType.findMany({ where: { isActive: true }, select: vehicleTypeSelect, orderBy: masterOrder });
  }

  activeCategories() {
    return this.prisma.category.findMany({ where: { isActive: true }, select: categorySelect, orderBy: masterOrder });
  }

  async activePolicies() {
    const rows = await this.prisma.cancellationPolicy.findMany({ where: { isActive: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
    return rows.map(toPolicyDto);
  }

  async defaultPolicy() {
    const p = await this.prisma.cancellationPolicy.findFirst({ where: { isDefault: true } });
    return p && toPolicyDto(p);
  }

  /** The settings row always exists after the migration; upsert covers a wiped database (tests). */
  async settings() {
    const row = await this.prisma.platformSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    return toSettingsDto(row);
  }
}
