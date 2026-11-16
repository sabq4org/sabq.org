/**
 * en_categories uses status "active" (schema default; /api/en/categories
 * returns only those), while the Arabic table uses "visible". The English
 * reader pages filtered on "visible" copied from Arabic, so /en/categories
 * and the Moment-by-Moment category filter rendered empty.
 */
export function isPublicEnCategoryStatus(status: unknown): boolean {
  return status === "active" || status === "visible";
}
