import { HttpStatus, type PipeTransform } from '@nestjs/common';
import { type z } from 'zod';
import { AppException } from '../app-exception';

/** Validates and transforms a request part with a shared zod schema from @qp/validation. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Validation failed', details);
  }
}
