/** Public archive pages have one canonical query parameter and bounded offsets. */
export const SEO_ARCHIVE_PAGE_SIZE = 30;
export const SEO_ARCHIVE_MAX_PAGE = 10_000;

export function archivePage(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return 1;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= SEO_ARCHIVE_MAX_PAGE ? page : null;
}

export function archiveHref(path: string, page: number): string {
  return page === 1 ? path : `${path}?page=${page}`;
}

export function normalizeSeoPath(raw: string): string | null {
  const path = raw.replace(/[?#].*$/, '');
  if (!/^\/(category|author)\/[^/]+\/?$/.test(path)) return path;
  const page = archivePage(new URL(raw, 'https://sabq.org').searchParams.get('page'));
  return page === null ? null : archiveHref(path, page);
}
