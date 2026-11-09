import { ArgumentMetadata, BadRequestException, PipeTransform, applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import type { ZodTypeAny, z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/** Validates and transforms input with a zod schema. Errors are returned as 400 with field details. */
export class ZodPipe<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T | (() => T)) {}

  transform(value: unknown, _meta: ArgumentMetadata): z.infer<T> {
    const schema = typeof this.schema === 'function' ? (this.schema as () => T)() : this.schema;
    const result = schema.safeParse(value ?? {});
    if (!result.success) {
      throw new BadRequestException({
        message: result.error.issues[0]?.message ?? 'Input tidak valid',
        details: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}

function jsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const s = zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

/** Documents a zod body schema in Swagger. */
export function ApiZodBody(schema: ZodTypeAny) {
  return ApiBody({ schema: jsonSchema(schema) as never });
}

/** Documents zod query parameters in Swagger. */
export function ApiZodQuery(schema: ZodTypeAny) {
  const s = jsonSchema(schema) as { properties?: Record<string, Record<string, unknown>>; required?: string[] };
  const props = s.properties ?? {};
  return applyDecorators(
    ...Object.entries(props).map(([name, prop]) =>
      ApiQuery({ name, required: (s.required ?? []).includes(name) && prop.default === undefined, schema: prop as never }),
    ),
  );
}
