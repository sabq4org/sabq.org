import { sql, and, or, type SQL } from "drizzle-orm";
import { mediaFiles, articleMediaAssets, mediaUsageLog } from "@shared/schema";

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
  sql`lower(translate(regexp_replace(coalesce(${expr}, ''), '[\u064B-\u0652\u0640]', '', 'g'), 'أإآٱةى', 'ااااهي'))`;

export const MEDIA_SEARCH_FIELDS = [
  { name: "title", weight: 4, expr: () => sql`${mediaFiles.title}` },
  { name: "altText", weight: 3, expr: () => sql`${mediaFiles.altText}` },
  { name: "keywords", weight: 3, expr: () => sql`array_to_string(${mediaFiles.keywords}, ' ')` },
  { name: "caption", weight: 2, expr: () => sql`${mediaFiles.caption}` },
  { name: "description", weight: 1, expr: () => sql`${mediaFiles.description}` },
  { name: "fileName", weight: 1, expr: () => sql`${mediaFiles.fileName}` },
] as const;

const PHRASE_BONUS = 5;

// Keep copied article headlines from masquerading as independent visual labels.
const visualLabel = (expr: SQL): SQL => sql`btrim(regexp_replace(${normalizeSql(expr)}, '(^صوره[[:space:]]+|[[:space:]]*[-–—][[:space:]]*صوره[[:space:]]*[0-9٠-٩]+$)', '', 'g'))`;

/** Metadata evidence only: this ranks existing labels, it does not identify faces. */
function subjectPriority(phrase: string): SQL<number> {
  const pattern = `%${escapeLike(phrase)}%`;
  const title = visualLabel(sql`${mediaFiles.title}`);
  const independentMatch = (expr: SQL): SQL => {
    const label = visualLabel(expr);
    return sql`(${label} LIKE ${pattern} AND ${label} <> ${title})`;
  };
  const visualMatch = or(
    independentMatch(sql`${mediaFiles.altText}`),
    independentMatch(sql`${mediaFiles.caption}`),
    // Untitled, analyzed uploads can carry the subject only in the visual
    // description. A saved article's excerpt must not count as visual evidence.
    sql`(${title} = '' AND ${mediaFiles.aiAnalysisStatus} = 'done' AND ${normalizeSql(sql`${mediaFiles.description}`)} LIKE ${pattern})`,
  )!;
  const exactKeyword = sql`EXISTS (SELECT 1 FROM unnest(${mediaFiles.keywords}) AS subject_keyword(value) WHERE ${normalizeSql(sql`subject_keyword.value`)} = ${phrase})`;
  const exactLabel = or(sql`${title} = ${phrase}`, exactKeyword)!;
  const visualText = normalizeSql(sql`concat_ws(' ', ${mediaFiles.altText}, ${mediaFiles.caption}, array_to_string(${mediaFiles.keywords}, ' '))`);
  const portrait = sql`${visualText} ~ ${"(صوره شخصيه|بورتريه|portrait|headshot)"}`;
  const presentation = sql`${visualText} ~ ${"(لقطه شاشه|شاشه تعرض|screenshot|screen capture|بانر|اعلان|انفوجرافيك|infographic|poster|banner|collage|كولاج|رسم توضيحي|illustration)"}`;
  // Each tier outranks the entire bounded token score (at most 94). Repeated
  // mentions in title/description cannot outweigh a direct portrait label.
  return sql<number>`(CASE
    WHEN ${presentation} OR ${mediaFiles.isAiGenerated} THEN 0
    WHEN ${mediaFiles.type} = 'image' AND NOT ${mediaFiles.isAiGenerated} AND NOT (${presentation}) AND (${visualMatch} OR ${exactLabel}) AND ${portrait} THEN 300
    WHEN ${exactLabel} THEN 200
    WHEN ${visualMatch} THEN 100
    ELSE 0 END)`;
}

export interface MediaSearchSql {
  where: SQL;
  score: SQL<number>;
  tokens: string[];
}

/** Computed fields must be aliased before the outer media page orders by them. */
export function mediaListSortFields(search: MediaSearchSql | null, mostUsed: boolean) {
  const usage = mostUsed
    ? sql<number>`((SELECT count(*) FROM ${articleMediaAssets} WHERE ${articleMediaAssets.mediaFileId} = ${mediaFiles.id}) + (SELECT count(*) FROM ${mediaUsageLog} WHERE ${mediaUsageLog.mediaId} = ${mediaFiles.id}))`
    : sql<number>`0`;
  return {
    usage: usage.as("usage"),
    score: (search ? search.score : sql<number>`0`).as("score"),
  };
}

/**
 * Build the WHERE (every token matches ≥1 field) and a relevance score
 * (subject/portrait evidence first, then bounded lexical relevance).
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
  const score = sql<number>`(${subjectPriority(tokens.join(" "))} + ${sql.join(parts, sql` + `)})`;
  return { where, score, tokens };
}
