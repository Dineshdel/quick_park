import { applyDecorators, Body, Query } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { type SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

const toOpenApi = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as SchemaObject;

/** Parameter decorator: validated request body. Pair with @ApiZodBody(schema) for Swagger. */
export const ZodBody = (schema: z.ZodType) => Body(new ZodValidationPipe(schema));
/** Parameter decorator: validated query string. */
export const ZodQuery = (schema: z.ZodType) => Query(new ZodValidationPipe(schema));

/** Method decorator: documents a zod request body in OpenAPI. */
export const ApiZodBody = (schema: z.ZodType) => applyDecorators(ApiBody({ schema: toOpenApi(schema) }));

/** Method decorator: documents each top-level field of a zod object as a query parameter. */
export const ApiZodQuery = (schema: z.ZodObject) =>
  applyDecorators(
    ...Object.entries(toOpenApi(schema).properties ?? {}).map(([name, s]) =>
      ApiQuery({ name, required: false, schema: s as SchemaObject }),
    ),
  );
