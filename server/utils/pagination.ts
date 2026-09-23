/**
 * Safe pagination parsing for public query params.
 *
 * Why: `Math.min(parseInt(req.query.limit) || 20, 50)` looks capped but is not —
 * `parseInt("-1")` is truthy, `Math.min(-1, 50)` is `-1`, and Postgres treats
 * `LIMIT -1` as "no limit". A reader reported that `/api/v1/articles?limit=-1`
 * returned all ~24k published articles (40 MB) in one request (2026-08-30).
 *
 * Policy (owner decision 2026-08-30):
 *  - limit:  missing/empty/NaN/0 → default; >max → max; negative → 400.
 *  - offset: missing/empty/NaN → 0; negative → 400.
 *  - page:   missing/empty/NaN → default; <1 (when given) → 400.
 *  - HARD_MAX_LIMIT is an absolute ceiling no caller can raise.
 */

/** Absolute ceiling for any list query, regardless of the caller's `max`. */
export const HARD_MAX_LIMIT = 200;

export type PaginationOk = { ok: true; limit: number; offset: number; page: number };
export type PaginationErr = { ok: false; status: 400; message: string; field: "limit" | "offset" | "page" };
export type PaginationResult = PaginationOk | PaginationErr;

function toInt(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(Array.isArray(raw) ? raw[0] : raw).trim();
  if (s === "") return null;
  if (!/^[+-]?\d+$/.test(s)) return Number.NaN;
  return Number.parseInt(s, 10);
}

/** Query-layer guard: clamp any limit into [1, HARD_MAX_LIMIT]. Use right before `.limit()`. */
export function boundedLimit(n: number, fallback = 20): number {
  if (!Number.isFinite(n) || n < 1) return Math.min(fallback, HARD_MAX_LIMIT);
  return Math.min(Math.trunc(n), HARD_MAX_LIMIT);
}

/** Lenient limit: negative/NaN/0 → default, >max → max. Never below 1. */
export function parseLimit(raw: unknown, def: number, max: number): number {
  const n = toInt(raw);
  const cap = Math.min(max, HARD_MAX_LIMIT);
  if (n === null || Number.isNaN(n) || n <= 0) return Math.min(def, cap);
  return Math.min(n, cap);
}

/** Lenient offset: NaN/negative → def (0). */
export function parseOffset(raw: unknown, def = 0): number {
  const n = toInt(raw);
  if (n === null || Number.isNaN(n) || n < 0) return def;
  return n;
}

/** Lenient 1-based page: NaN/<1 → def. */
export function parsePage(raw: unknown, def = 1): number {
  const n = toInt(raw);
  if (n === null || Number.isNaN(n) || n < 1) return def;
  return n;
}

export interface ReadPaginationOpts {
  defaultLimit: number;
  maxLimit: number;
  /** When true, `page` (1-based) is honoured and overrides `offset`. */
  allowPage?: boolean;
  /** Default page when none is supplied (0 = "use offset"). */
  defaultPage?: number;
}

/**
 * Strict reader for public list endpoints: negative limit/offset/page → 400.
 * Non-numeric strings fall back to defaults (they cannot hurt the DB).
 */
export function readPagination(query: Record<string, unknown>, opts: ReadPaginationOpts): PaginationResult {
  const cap = Math.min(opts.maxLimit, HARD_MAX_LIMIT);

  const l = toInt(query.limit);
  if (l !== null && !Number.isNaN(l) && l < 0) {
    return { ok: false, status: 400, message: "limit must be a positive integer", field: "limit" };
  }
  const limit = l === null || Number.isNaN(l) || l === 0 ? Math.min(opts.defaultLimit, cap) : Math.min(l, cap);

  const o = toInt(query.offset);
  if (o !== null && !Number.isNaN(o) && o < 0) {
    return { ok: false, status: 400, message: "offset must be a non-negative integer", field: "offset" };
  }
  const offsetRaw = o === null || Number.isNaN(o) ? 0 : o;

  let page = opts.defaultPage ?? 0;
  if (opts.allowPage) {
    const p = toInt(query.page);
    if (p !== null && !Number.isNaN(p) && p < 1) {
      return { ok: false, status: 400, message: "page must be >= 1", field: "page" };
    }
    if (p !== null && !Number.isNaN(p)) page = p;
  }

  const offset = opts.allowPage && page > 0 ? (page - 1) * limit : offsetRaw;
  return { ok: true, limit: boundedLimit(limit, opts.defaultLimit), offset, page };
}

// ---- Express adapter -------------------------------------------------------
type MinimalReq = { query: Record<string, unknown>; path?: string; ip?: string };
type MinimalRes = { status: (code: number) => { json: (body: unknown) => unknown } };

/**
 * Read pagination or send a 400 and return null. Logs rejected values so the
 * ops team can see probing (`grep "rejected pagination"`).
 */
export function paginationOrReject(
  req: MinimalReq,
  res: MinimalRes,
  opts: ReadPaginationOpts,
  warn: (msg: string) => void = (m) => console.warn(m),
): PaginationOk | null {
  const pg = readPagination(req.query, opts);
  if (pg.ok) return pg;
  warn(
    `[pagination] rejected ${pg.field}=${JSON.stringify(req.query[pg.field])} on ${req.path ?? "?"} ip=${req.ip ?? "?"}`,
  );
  res.status(pg.status).json({ success: false, error: pg.message, field: pg.field });
  return null;
}
