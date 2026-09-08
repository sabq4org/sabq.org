import { sql, type SQL, getTableColumns } from 'drizzle-orm';
import { articles } from '@shared/schema';
import { MEANINGFUL_FIELDS } from './editorialDates';

/** Server-owned timestamp and JSON merge are evaluated in the same UPDATE. */
export function buildEditorialMetadataUpdate(patch: Record<string, unknown>, at = new Date()): SQL | undefined {
  const columns = getTableColumns(articles);
  const comparisons: SQL[] = [];
  for (const key of MEANINGFUL_FIELDS) {
    if (!(key in patch) || patch[key] === undefined || !(key in columns)) continue;
    const column = columns[key as keyof typeof columns];
    const value = patch[key];
    comparisons.push(column.dataType === 'json'
      ? sql`${column} IS DISTINCT FROM ${value === null ? null : JSON.stringify(value)}::jsonb`
      : sql`${column} IS DISTINCT FROM ${value}`);
  }
  if (!comparisons.length && !Object.prototype.hasOwnProperty.call(patch, 'seoMetadata')) return undefined;
  const incoming = patch.seoMetadata && typeof patch.seoMetadata === 'object' && !Array.isArray(patch.seoMetadata)
    ? { ...(patch.seoMetadata as Record<string, unknown>) } : {};
  delete incoming.editorialModifiedAt;
  const merged = sql`COALESCE(${articles.seoMetadata}, '{}'::jsonb) || ${JSON.stringify(incoming)}::jsonb`;
  if (!comparisons.length) return merged;
  return sql`${merged} || CASE WHEN (${sql.join(comparisons, sql` OR `)})
    THEN jsonb_build_object('editorialModifiedAt', ${at.toISOString()}::text)
    ELSE '{}'::jsonb END`;
}
