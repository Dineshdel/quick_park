import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

/** Append-only record of admin decisions and money movements. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(actorId: string | null, action: string, entity: string, entityId: string | null, meta?: Prisma.InputJsonValue, tx?: Prisma.TransactionClient) {
    return (tx ?? this.prisma).auditLog.create({ data: { actorId, action, entity, entityId, meta } });
  }
}
