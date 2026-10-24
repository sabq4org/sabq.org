import { z } from "zod";

/**
 * Like `schema.partial()`, but a key the client did not send stays absent.
 * zod 4 runs inner `.default()` / `.prefault()` for missing optional keys, so a plain
 * `.partial()` update schema would overwrite stored values (e.g. reset `status` to "draft").
 */
export function partialWithoutDefaults<T extends z.ZodObject>(schema: T): ReturnType<T["partial"]> {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape as Record<string, z.ZodType>)) {
    shape[key] = stripDefaults(field).optional();
  }
  return schema.extend(shape) as unknown as ReturnType<T["partial"]>;
}

function stripDefaults(field: z.ZodType): z.ZodType {
  if (field instanceof z.ZodDefault || field instanceof z.ZodPrefault) return stripDefaults(field.unwrap() as z.ZodType);
  if (field instanceof z.ZodOptional) return stripDefaults(field.unwrap() as z.ZodType);
  if (field instanceof z.ZodNullable) return stripDefaults(field.unwrap() as z.ZodType).nullable();
  if (field instanceof z.ZodPipe) return z.pipe(stripDefaults(field.in as z.ZodType), field.out as z.ZodType);
  return field;
}
