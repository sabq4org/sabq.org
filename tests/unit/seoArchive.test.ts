import { describe, expect, it } from 'vitest';
import { archivePage, archiveHref, normalizeSeoPath } from '../../server/utils/seoArchive';
import { buildRobotsTxt } from '../../server/utils/robotsTxt';
import { toRiyadhIso } from '../../server/utils/editorialDates';

describe('public SEO archive URL boundaries', () => {
  it('keeps pagination in canonical/cache identity while dropping tracking', () => {
    expect(normalizeSeoPath('/category/saudi?page=2&utm_source=x')).toBe('/category/saudi?page=2');
    expect(normalizeSeoPath('/en/category/world?page=3&_cb=1')).toBe('/en/category/world?page=3');
    expect(normalizeSeoPath('/author/%D9%83?page=3')).toBe('/author/%D9%83?page=3');
    expect(normalizeSeoPath('/article/test?page=5&utm_source=x')).toBe('/article/test');
    expect(normalizeSeoPath('/category/saudi?page=1')).toBe('/category/saudi');
    expect(archiveHref('/category/x', 2)).toBe('/category/x?page=2');
  });
  it.each(['-1', '0', '1.5', 'NaN', 'Infinity', '10001', '999999999999999999999999'])('rejects invalid or unbounded page %s', value => {
    expect(archivePage(value)).toBeNull();
    expect(normalizeSeoPath(`/category/saudi?page=${value}`)).toBeNull();
  });
  it('accepts omitted and bounded pages', () => {
    expect(archivePage(null)).toBe(1);
    expect(archivePage('10000')).toBe(10000);
    expect(archivePage(['2'])).toBeNull();
  });
  it('does not block _cb in robots.txt so crawlers can follow the 301', () => {
    expect(buildRobotsTxt()).not.toContain('_cb');
  });
  it('formats timestamps with +03:00 Riyadh offset', () => {
    expect(toRiyadhIso('2026-10-21T05:00:00.000Z')).toBe('2026-10-21T08:00:00+03:00');
    expect(toRiyadhIso('2026-10-21T08:00:00+03:00')).toBe('2026-10-21T08:00:00+03:00');
  });
});
