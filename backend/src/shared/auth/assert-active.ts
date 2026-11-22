import { HttpStatus } from '@nestjs/common';
import { type User } from '@prisma/client';
import { AppException } from '../http/app-exception';

/** Suspended accounts may not start a session. */
export function assertActive(user: Pick<User, 'status'>) {
  if (user.status !== 'ACTIVE') {
    throw new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_SUSPENDED', 'This account is suspended');
  }
}
