/**
 * insertEnArticleSchema (drizzle-zod) types timestamps as z.date(), but the
 * English editor sends ISO strings. PATCH validated before converting, so
 * scheduling an existing English article failed with "Invalid data".
 */
export function coerceEnArticleDates<T extends Record<string, unknown>>(body: T): T {
  const out: Record<string, unknown> = { ...body };
  for (const field of ["publishedAt", "scheduledAt"]) {
    const value = out[field];
    if (typeof value === "string" && value) out[field] = new Date(value);
  }
  return out as T;
}
