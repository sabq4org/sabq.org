import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { buildEditorialMetadataUpdate } from '../../server/utils/editorialDatesSql';
const dialect = new PgDialect();
describe('atomic editorial date SQL', () => {
  it('compares persisted values in UPDATE and merges current JSON instead of an earlier snapshot', () => {
    const query = dialect.sqlToQuery(buildEditorialMetadataUpdate({ title:'عنوان', seo:{metaTitle:'عنوان'}, seoMetadata:{editorialModifiedAt:'forged',version:2} },new Date('2026-09-08T00:00:00Z'))!);
    expect(query.sql).toContain('"articles"."title" IS DISTINCT FROM');
    expect(query.sql).toContain('"articles"."seo" IS DISTINCT FROM');
    expect(query.sql).toContain('COALESCE("articles"."seo_metadata"');
    expect(query.sql).toContain('CASE WHEN');
    expect(query.params).not.toContain('forged');
    expect(query.params).toContain('{"version":2}');
  });
  it('preserves a prior editorial date for metadata-only writes and does not mutate input', () => {
    const patch = {seoMetadata:{editorialModifiedAt:'forged',version:3}};
    const q = dialect.sqlToQuery(buildEditorialMetadataUpdate(patch)!);
    expect(q.sql).not.toContain('jsonb_build_object');
    expect(q.params).toEqual(['{"version":3}']);
    expect(patch.seoMetadata.editorialModifiedAt).toBe('forged');
  });
  it('keeps maintenance-only updates on the existing path', () => {
    expect(buildEditorialMetadataUpdate({views:5,displayOrder:10,updatedAt:new Date()})).toBeUndefined();
  });
});
