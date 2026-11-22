import { HttpStatus, Injectable } from '@nestjs/common';
import { type EmailTokenType, type Prisma } from '@prisma/client';
import { AppException } from '../http/app-exception';
import { PrismaService } from '../database/prisma.service';
import { addMs, hashToken, randomToken } from './token.util';

/** Single-use, expiring tokens delivered by email (verify, reset, admin invite). Stored hashed. */
@Injectable()
export class EmailTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a new token and invalidates any earlier unused ones of the same type. */
  async create(userId: string, type: EmailTokenType, ttlMs: number, tx: Prisma.TransactionClient = this.prisma) {
    const token = randomToken();
    await tx.emailToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
    await tx.emailToken.create({ data: { userId, type, tokenHash: hashToken(token), expiresAt: addMs(ttlMs) } });
    return token;
  }

  /** Atomically marks the token used and returns its userId, or throws INVALID_TOKEN. */
  async consume(token: string, type: EmailTokenType, tx: Prisma.TransactionClient = this.prisma): Promise<string> {
    const row = await tx.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
    const now = new Date();
    if (row && row.type === type && !row.usedAt && row.expiresAt > now) {
      const { count } = await tx.emailToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
      if (count === 1) return row.userId;
    }
    throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_TOKEN', 'This link is invalid or has expired');
  }
}
