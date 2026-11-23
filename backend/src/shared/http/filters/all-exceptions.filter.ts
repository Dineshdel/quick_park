import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import { type ApiErrorBody, type ErrorCode } from '@qp/types';
import { type Response } from 'express';
import { AppException } from '../app-exception';

const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'RATE_LIMITED',
};

/** Renders every error as `{ error: { code, message, details? } }`. Never leaks internals on 5xx. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toResponse(exception);
    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
      Sentry.captureException(exception); // no-op unless SENTRY_DSN is set
    }
    res.status(status).json(body);
  }

  private toResponse(e: unknown): { status: number; body: ApiErrorBody } {
    if (e instanceof AppException) {
      return { status: e.getStatus(), body: { error: { code: e.code, message: e.message, details: e.details } } };
    }
    if (e instanceof ThrottlerException) {
      return { status: 429, body: { error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' } } };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      return {
        status,
        body: { error: { code: STATUS_CODES[status] ?? (status >= 500 ? 'INTERNAL' : 'VALIDATION_FAILED'), message: e.message } },
      };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return { status: 409, body: { error: { code: 'CONFLICT', message: 'Duplicate value' } } };
      if (e.code === 'P2025') return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Resource not found' } } };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { error: { code: 'INTERNAL', message: 'Something went wrong' } },
    };
  }
}
