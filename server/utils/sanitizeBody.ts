import { getTableColumns, type Table } from "drizzle-orm";

// Columns no client request may ever set directly, regardless of table.
// `updatedAt` is excluded here because write sites always set it explicitly to
// `new Date()`; letting the client supply it would be both pointless and a way
// to forge audit timestamps.
const ALWAYS_OMIT = new Set(["id", "createdAt", "updatedAt"]);

/**
 * Mass-assignment guard for Drizzle writes.
 *
 * Restricts an untrusted request body to the actual columns of `table`,
 * dropping unknown keys and any protected/immutable columns. This replaces the
 * dangerous `.set({ ...req.body })` / `.values({ ...req.body })` pattern where a
 * caller could smuggle in columns the endpoint never intended to expose
 * (ownership, role, status flags, primary keys, etc.).
 *
 * Behaviour-preserving for legitimate edits: any real, editable column the
 * client was already allowed to send still passes through unchanged.
 *
 * @param table   The Drizzle table being written to.
 * @param body    The untrusted request body (typically `req.body`).
 * @param options `omit` adds table-specific protected columns; `allow`, when
 *                provided, is a strict allowlist (only these columns survive).
 */
export function pickTableColumns<T extends Table>(
  table: T,
  body: unknown,
  options?: { omit?: string[]; allow?: string[] },
): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};

  const columns = getTableColumns(table);
  const omit = new Set<string>([...ALWAYS_OMIT, ...(options?.omit ?? [])]);
  const allow = options?.allow ? new Set(options.allow) : null;

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(body as Record<string, unknown>)) {
    if (!(key in columns)) continue; // not a real column on this table
    if (omit.has(key)) continue; // protected / immutable
    if (allow && !allow.has(key)) continue; // outside the strict allowlist
    out[key] = (body as Record<string, unknown>)[key];
  }
  return out;
}
