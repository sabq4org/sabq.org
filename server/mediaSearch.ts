import { sql, and, or, type SQL } from "drizzle-orm";
import { mediaFiles } from "@shared/schema";

/** Max search tokens honoured (extra tokens are ignored). */
export const MAX_SEARCH_TOKENS = 6;

const TASHKEEL_RE = /[\u064B-\u0652\u0640]/g;

/** Normalise Arabic/Latin text the same way the SQL expression does. */
export function normalizeSearchText(input: string): string {
  return input
    .replace(TASHKEEL_RE, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase();
}

/** Escape LIKE wildcards (default escape char is backslash). */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Normalise + split on whitespace, dropping empties, capped. */
export function tokenizeSearch(input: string): string[] {
  return normalizeSearchText(input)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_SEARCH_TOKENS);
}

// Constant SQL fragments (no user input) mirroring normalizeSearchText.
const normalizeSql = (expr: SQL): SQL =>
  sql`lower(translate(regexp_replace(coalesce(${expr}, ''), '[\u064B-\u0652\u0640]', '', 'g'), 'أإآٱةى', 'اااااهي'))`;

export const MEDIA_SEARCH_FIELDS = [
  { name: "title", weight: 4, expr: () => sql`${mediaFiles.title}` },
  { name: "altText", weight: 3, expr: () => sql`${mediaFiles.altText}` },
  { name: "keywords", weight: 3, expr: () => sql`array_to_string(${mediaFiles.keywords}, ' ')` },
  { name: "caption", weight: 2, expr: () => sql`${mediaFiles.caption}` },
  { name: "description", weight: 1, expr: () => sql`${mediaFiles.description}` },
  { name: "fileName", weight: 1, expr: () => sql`${mediaFiles.fileName}` },
] as const;

const PHRASE_BONUS = 5;

export interface MediaSearchSql {
  where: SQL;
  score: SQL<number>;
  tokens: string[];
}

/**
 * Build the WHERE (every token matches ≥1 field) and a relevance score
 * (weighted per-token field matches + full-phrase bonus in title/alt).
 * Returns null when the query has no usable tokens.
 */
export function buildMediaSearch(raw: string): MediaSearchSql | null {
  const tokens = tokenizeSearch(raw);
  if (tokens.length === 0) return null;
  const fields = MEDIA_SEARCH_FIELDS.map((f) => ({ ...f, norm: normalizeSql(f.expr()) }));

  const where = and(
    ...tokens.map((t) => {
      const pat = `%${escapeLike(t)}%`;
      return or(...fields.map((f) => sql`${f.norm} LIKE ${pat}`))!;
    }),
  )!;

  const parts: SQL[] = [];
  for (const t of tokens) {
    const pat = `%${escapeLike(t)}%`;
    for (const f of fields) parts.push(sql`(CASE WHEN ${f.norm} LIKE ${pat} THEN ${f.weight} ELSE 0 END)`);
  }
  if (tokens.length > 1) {
    const phrase = `%${escapeLike(tokens.join(" "))}%`;
    for (const f of fields.filter((x) => x.name === "title" || x.name === "altText")) {
      parts.push(sql`(CASE WHEN ${f.norm} LIKE ${phrase} THEN ${PHRASE_BONUS} ELSE 0 END)`);
    }
  }
  const score = sql<number>`(${sql.join(parts, sql` + `)})`;
  return { where, score, tokens };
}
