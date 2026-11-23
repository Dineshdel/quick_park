import { randomBytes } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MAX_VEHICLES_PER_USER, VEHICLE_QR_PREFIX, type VehicleDto, type VehicleQrDto } from '@qp/types';
import { type vehicleCreateSchema, type vehicleUpdateSchema } from '@qp/validation';
import QRCode from 'qrcode';
import { type z } from 'zod';
import { PrismaService } from '../../shared/database/prisma.service';
import { AppException, Errors } from '../../shared/http/app-exception';

/** 128-bit URL-safe token: short enough for a low-density, easy-to-scan sticker QR. */
const newQrToken = () => randomBytes(16).toString('base64url');

const select = {
  id: true,
  plateNumber: true,
  photoUrl: true,
  createdAt: true,
  qrToken: true,
  vehicleType: { select: { id: true, code: true, name: true, icon: true } },
} satisfies Prisma.VehicleSelect;
type Row = Prisma.VehicleGetPayload<{ select: typeof select }>;

const toDto = ({ qrToken: _qr, createdAt, ...v }: Row): VehicleDto => ({ ...v, createdAt: createdAt.toISOString() });

const duplicate = () => Errors.conflict('DUPLICATE', 'You have already added a vehicle with this number plate');

/** A customer's own vehicles. Every query is scoped by userId, so other users' vehicles are simply "not found". */
@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<VehicleDto[]> {
    const rows = await this.prisma.vehicle.findMany({
      where: { userId, deletedAt: null },
      select,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDto);
  }

  async get(userId: string, id: string): Promise<VehicleDto> {
    return toDto(await this.find(userId, id));
  }

  async create(userId: string, input: z.output<typeof vehicleCreateSchema>): Promise<VehicleDto> {
    await this.assertActiveType(input.vehicleTypeId);
    const count = await this.prisma.vehicle.count({ where: { userId, deletedAt: null } });
    if (count >= MAX_VEHICLES_PER_USER) {
      throw new AppException(HttpStatus.CONFLICT, 'VEHICLE_LIMIT', `You can add up to ${MAX_VEHICLES_PER_USER} vehicles`);
    }
    try {
      const row = await this.prisma.vehicle.create({ data: { ...input, userId, qrToken: newQrToken() }, select });
      return toDto(row);
    } catch (e) {
      throw isUniqueViolation(e) ? duplicate() : e;
    }
  }

  async update(userId: string, id: string, input: z.output<typeof vehicleUpdateSchema>): Promise<VehicleDto> {
    await this.find(userId, id);
    if (input.vehicleTypeId) await this.assertActiveType(input.vehicleTypeId);
    try {
      return toDto(await this.prisma.vehicle.update({ where: { id }, data: input, select }));
    } catch (e) {
      throw isUniqueViolation(e) ? duplicate() : e;
    }
  }

  /** Soft delete: the row stays for booking history, the sticker stops working. */
  async remove(userId: string, id: string): Promise<void> {
    await this.find(userId, id);
    await this.prisma.vehicle.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async qr(userId: string, id: string): Promise<VehicleQrDto> {
    return this.toQr(await this.find(userId, id));
  }

  /** New token for a lost or copied sticker; the old sticker stops working immediately. */
  async rotateQr(userId: string, id: string): Promise<VehicleQrDto> {
    await this.find(userId, id);
    return this.toQr(await this.prisma.vehicle.update({ where: { id }, data: { qrToken: newQrToken() }, select }));
  }

  // ---------- helpers ----------

  private async find(userId: string, id: string): Promise<Row> {
    const row = await this.prisma.vehicle.findFirst({ where: { id, userId, deletedAt: null }, select });
    if (!row) throw Errors.notFound('Vehicle');
    return row;
  }

  private async assertActiveType(vehicleTypeId: string) {
    const type = await this.prisma.vehicleType.findUnique({ where: { id: vehicleTypeId }, select: { isActive: true } });
    if (!type?.isActive) {
      throw Errors.badRequest('VEHICLE_TYPE_INVALID', 'Choose a valid vehicle type', [
        { path: 'vehicleTypeId', message: 'Choose a valid vehicle type' },
      ]);
    }
  }

  private async toQr(row: Row): Promise<VehicleQrDto> {
    const payload = `${VEHICLE_QR_PREFIX}${row.qrToken}`;
    const svg = await QRCode.toString(payload, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
    return { vehicleId: row.id, plateNumber: row.plateNumber, vehicleTypeName: row.vehicleType.name, payload, svg };
  }
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
