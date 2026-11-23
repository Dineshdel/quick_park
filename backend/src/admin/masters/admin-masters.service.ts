import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type z } from 'zod';
import {
  type cancellationPolicyCreateSchema,
  type cancellationPolicyUpdateSchema,
  type categoryCreateSchema,
  type categoryUpdateSchema,
  type platformSettingsUpdateSchema,
  type vehicleTypeCreateSchema,
  type vehicleTypeUpdateSchema,
} from '@qp/validation';
import { PrismaService } from '../../shared/database/prisma.service';
import { AppException, Errors } from '../../shared/http/app-exception';
import {
  categorySelect,
  masterOrder,
  toPolicyDto,
  toSettingsDto,
  vehicleTypeSelect,
} from '../../shared/masters/masters.mapper';

type Out<S extends z.ZodType> = z.output<S>;

/** Maps unique-violation / foreign-key / not-found errors to readable API errors. */
async function guard<T>(what: string, field: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') throw Errors.conflict('DUPLICATE', `A ${what} with this ${field} already exists`);
      if (e.code === 'P2003') throw Errors.conflict('IN_USE', `This ${what} is in use. Deactivate it instead.`);
      if (e.code === 'P2025') throw Errors.notFound(capitalise(what));
    }
    throw e;
  }
}
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Super-admin writes for master data. Lists include inactive rows. */
@Injectable()
export class AdminMastersService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- vehicle types ----------

  listVehicleTypes() {
    return this.prisma.vehicleType.findMany({ select: vehicleTypeSelect, orderBy: masterOrder });
  }

  createVehicleType(input: Out<typeof vehicleTypeCreateSchema>) {
    return guard('vehicle type', 'code', () =>
      this.prisma.vehicleType.create({ data: input, select: vehicleTypeSelect }),
    );
  }

  updateVehicleType(id: string, input: Out<typeof vehicleTypeUpdateSchema>) {
    return guard('vehicle type', 'code', () =>
      this.prisma.vehicleType.update({ where: { id }, data: input, select: vehicleTypeSelect }),
    );
  }

  async deleteVehicleType(id: string) {
    await guard('vehicle type', 'code', () => this.prisma.vehicleType.delete({ where: { id } }));
  }

  // ---------- categories ----------

  listCategories() {
    return this.prisma.category.findMany({ select: categorySelect, orderBy: masterOrder });
  }

  createCategory(input: Out<typeof categoryCreateSchema>) {
    return guard('category', 'name', () => this.prisma.category.create({ data: input, select: categorySelect }));
  }

  updateCategory(id: string, input: Out<typeof categoryUpdateSchema>) {
    return guard('category', 'name', () =>
      this.prisma.category.update({ where: { id }, data: input, select: categorySelect }),
    );
  }

  async deleteCategory(id: string) {
    await guard('category', 'name', () => this.prisma.category.delete({ where: { id } }));
  }

  // ---------- cancellation policies ----------

  async listPolicies() {
    const rows = await this.prisma.cancellationPolicy.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
    return rows.map(toPolicyDto);
  }

  async createPolicy(input: Out<typeof cancellationPolicyCreateSchema>) {
    const { rules, ...rest } = input;
    if (rest.isDefault && rest.isActive === false) throw defaultMustBeActive();
    return guard('cancellation policy', 'name', () =>
      this.prisma.$transaction(async (tx) => {
        // The first policy ever created becomes the default automatically.
        const isDefault = rest.isDefault || (await tx.cancellationPolicy.count({ where: { isDefault: true } })) === 0;
        if (isDefault) await tx.cancellationPolicy.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        const row = await tx.cancellationPolicy.create({ data: { ...rest, isDefault, rules } });
        return toPolicyDto(row);
      }),
    );
  }

  async updatePolicy(id: string, input: Out<typeof cancellationPolicyUpdateSchema>) {
    return guard('cancellation policy', 'name', () =>
      this.prisma.$transaction(async (tx) => {
        const current = await tx.cancellationPolicy.findUnique({ where: { id } });
        if (!current) throw Errors.notFound('Cancellation policy');
        // The default can only change by making another policy the default.
        if (current.isDefault && input.isDefault === false) {
          throw locked('Make another policy the default instead');
        }
        const willBeDefault = input.isDefault ?? current.isDefault;
        const willBeActive = input.isActive ?? current.isActive;
        if (willBeDefault && !willBeActive) throw defaultMustBeActive();
        if (input.isDefault && !current.isDefault) {
          await tx.cancellationPolicy.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        }
        const row = await tx.cancellationPolicy.update({ where: { id }, data: input });
        return toPolicyDto(row);
      }),
    );
  }

  async deletePolicy(id: string) {
    const current = await this.prisma.cancellationPolicy.findUnique({ where: { id }, select: { isDefault: true } });
    if (!current) throw Errors.notFound('Cancellation policy');
    if (current.isDefault) throw locked('The default policy cannot be deleted');
    await guard('cancellation policy', 'name', () => this.prisma.cancellationPolicy.delete({ where: { id } }));
  }

  // ---------- platform settings ----------

  async updateSettings(input: Out<typeof platformSettingsUpdateSchema>, adminId: string) {
    const row = await this.prisma.platformSettings.upsert({
      where: { id: 1 },
      create: { id: 1, ...input, updatedById: adminId },
      update: { ...input, updatedById: adminId },
    });
    return toSettingsDto(row);
  }
}

const locked = (message: string) => new AppException(HttpStatus.CONFLICT, 'DEFAULT_POLICY_LOCKED', message);
const defaultMustBeActive = () => locked('The default policy must stay active');
