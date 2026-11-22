import { HttpException, HttpStatus } from '@nestjs/common';
import { type ErrorCode } from '@qp/types';

/** Domain error with a stable machine-readable code; rendered by AllExceptionsFilter. */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message, status);
  }
}

export const Errors = {
  unauthenticated: (message = 'Authentication required') =>
    new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', message),
  forbidden: (message = 'You do not have access to this resource') =>
    new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', message),
  notFound: (what = 'Resource') => new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`),
  conflict: (code: ErrorCode, message: string) => new AppException(HttpStatus.CONFLICT, code, message),
  badRequest: (code: ErrorCode, message: string, details?: unknown) =>
    new AppException(HttpStatus.BAD_REQUEST, code, message, details),
};
