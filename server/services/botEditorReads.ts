import { and, asc, desc, eq, getTableColumns, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { articles, enArticles, categories, enCategories, users, tags, articleTags, articleMediaAssets } from "@shared/schema";
import { db } from "../db";
import { BotDraftError, toBotDraftResponse } from "./botDraftsService";
import { toEnBotDraftResponse } from "./enBotDraftsService";
import { botEditorAssignableStaff } from "./botEditorWritesRoster";

type Lang = "ar" | "en";
type Query = Record<string, unknown>;
const fail = (message: string): never => { throw new BotDraftError(400, "validation_error", message); };
function parameters(input: unknown, allowed: string[]): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("Invalid query");
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.includes(key) || typeof value !== "string" || !value.trim() || value.length > 500) return fail(`Invalid ${key}`);
    out[key] = value.trim();
  }
  return out;
}
function pageSize(value?: string): number {
  if (!value) return 25;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 100) return fail("limit must be 1–100");
  return Number(value);
}
function decodeCursor(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const id = Buffer.from(value, "base64url").toString("utf8");
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(id) || Buffer.from(id).toString("base64url") !== value) return fail("Invalid cursor");
    return id;
  } catch { return fail("Invalid cursor"); }
}
const cursorFor = (id: string) => Buffer.from(id).toString("base64url");
function date(value?: string): Date | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return fail("Date must include time and timezone");
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) return fail("Invalid date");
  // Reject normalized invalid calendar dates, e.g. February 30.
  const parts = value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)/)!;
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59) return fail("Invalid date");
  return result;
}
function langCheck(lang: string): asserts lang is Lang { if (lang !== "ar" && lang !== "en") fail("Invalid language"); }
function escapeLike(q: string) { return q.replace(/[\\%_]/g, "\\$&"); }
const statuses = ["draft", "ready_to_publish", "scheduled", "published", "archived"];
const sourceEn = sql<string>`case when ${enArticles.seoMetadata}->>'source' = 'bot' then 'bot' else 'manual' end`;

function decodeArticleCursor(value?: string): { id: string; createdAt: string } | undefined {
  if (!value) return undefined;
  try {
    const raw = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(raw).toString("base64url") !== value) return fail("Invalid cursor");
    const data = JSON.parse(raw);
    if (!data || typeof data.id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(data.id) || typeof data.createdAt !== "string" || !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{6}$/.test(data.createdAt)) return fail("Invalid cursor");
    date(`${data.createdAt.slice(0, 10)}T${data.createdAt.slice(11, 19)}.${data.createdAt.slice(20, 23)}Z`);
    return data;
  } catch { return fail("Invalid cursor"); }
}
const articleCursor = (row: { id: string; cursorTimestamp: string }) => Buffer.from(JSON.stringify({ id: row.id, createdAt: row.cursorTimestamp })).toString("base64url");
function listItem<T extends { bodyImageUrls: string[]; status: string }>(item: T) {
  const { bodyImageUrls: _bodyImageUrls, ...rest } = item;
  return { ...rest, updatable: statuses.slice(0, 4).includes(item.status) };
}
export async function listBotArticles(lang: Lang, query: Query) {
  langCheck(lang);
  const p = parameters(query, ["q", "status", "source", "categoryId", "authorId", "from", "to", "limit", "cursor"]);
  const limit = pageSize(p.limit), cursor = decodeArticleCursor(p.cursor), from = date(p.from), to = date(p.to);
  if (from && to && from > to) fail("from must not be after to");
  const status = p.status === "ready" ? "ready_to_publish" : p.status;
  if (status && !statuses.includes(status)) fail("Invalid status");
  if (p.source && !["bot", "manual", "all"].includes(p.source)) fail("Invalid source");
  const table = lang === "ar" ? articles : enArticles;
  const conditions: SQL[] = [eq(table.articleType, "news")];
  if (status) conditions.push(eq(table.status, status));
  if (p.categoryId) conditions.push(eq(table.categoryId, p.categoryId));
  if (p.authorId) conditions.push(eq(table.authorId, p.authorId));
  if (p.q) {
    // Trigram indexes need at least three characters; shorter terms would scan the whole table.
    if (Array.from(p.q).length < 3) fail("q must be at least 3 characters");
    const term = `%${escapeLike(p.q)}%`;
    // Arabic searches the title and excerpt: both have trigram indexes on the ~1M-row articles table,
    // while the body has none. The small English table keeps its indexed body search.
    conditions.push(lang === "ar" ? or(ilike(articles.title, term), ilike(articles.excerpt, term))! : or(ilike(enArticles.title, term), ilike(enArticles.content, term))!);
  }
  if (from) conditions.push(sql`${table.createdAt} >= ${from}`);
  if (to) conditions.push(sql`${table.createdAt} <= ${to}`);
  if (p.source && p.source !== "all") conditions.push(lang === "ar" ? (p.source === "bot" ? eq(articles.source, "bot") : sql`${articles.source} is distinct from 'bot'`) : sql`${sourceEn} = ${p.source}`);
  if (cursor) conditions.push(sql`(${table.createdAt}, ${table.id}) < (${cursor.createdAt}::timestamp, ${cursor.id})`);
  const stamp = sql<string>`to_char(${table.createdAt}, 'YYYY-MM-DD HH24:MI:SS.US')`;
  if (lang === "ar") {
    const { content: _content, ...columns } = getTableColumns(articles);
    const rows = await db.select({ ...columns, cursorTimestamp: stamp }).from(articles).where(and(...conditions)).orderBy(desc(articles.createdAt), desc(articles.id)).limit(limit + 1);
    const ids = [...new Set(rows.flatMap(r => r.categoryId ? [r.categoryId] : []))];
    const cats = ids.length ? await db.select({ id: categories.id, slug: categories.slug }).from(categories).where(inArray(categories.id, ids)) : [];
    const slugs = new Map(cats.map(c => [c.id, c.slug]));
    return { items: rows.slice(0, limit).map(row => listItem(toBotDraftResponse({ ...row, content: "" }, slugs.get(row.categoryId ?? "") ?? null))), nextCursor: rows.length > limit ? articleCursor(rows[limit - 1]) : null };
  }
  const { content: _content, ...columns } = getTableColumns(enArticles);
  const rows = await db.select({ ...columns, cursorTimestamp: stamp }).from(enArticles).where(and(...conditions)).orderBy(desc(enArticles.createdAt), desc(enArticles.id)).limit(limit + 1);
  const ids = [...new Set(rows.flatMap(r => r.categoryId ? [r.categoryId] : []))];
  const cats = ids.length ? await db.select({ id: enCategories.id, slug: enCategories.slug }).from(enCategories).where(inArray(enCategories.id, ids)) : [];
  const slugs = new Map(cats.map(c => [c.id, c.slug]));
  return { items: rows.slice(0, limit).map(row => { const item = toEnBotDraftResponse({ ...row, content: "" }, slugs.get(row.categoryId ?? "") ?? null); return listItem({ ...item, source: item.source || "manual" }); }), nextCursor: rows.length > limit ? articleCursor(rows[limit - 1]) : null };
}
async function arResponse(row: typeof articles.$inferSelect, full: boolean, includeContent = full) {
  const [category] = row.categoryId ? await db.select({ slug: categories.slug }).from(categories).where(eq(categories.id, row.categoryId)).limit(1) : [];
  const base = toBotDraftResponse(row, category?.slug ?? null, { includeContent });
  if (!full) return base;
  const linked = await db.select({ id: tags.id, slug: tags.slug, nameAr: tags.nameAr, nameEn: tags.nameEn }).from(articleTags).innerJoin(tags, eq(tags.id, articleTags.tagId)).where(eq(articleTags.articleId, row.id));
  const [hero] = await db.select({ captionPlain: articleMediaAssets.captionPlain, captionHtml: articleMediaAssets.captionHtml, altText: articleMediaAssets.altText }).from(articleMediaAssets).where(and(eq(articleMediaAssets.articleId, row.id), eq(articleMediaAssets.locale, "ar"), eq(articleMediaAssets.displayOrder, 0), eq(articleMediaAssets.moderationStatus, "approved"))).orderBy(asc(articleMediaAssets.id)).limit(1);
  return { ...base, updatable: statuses.slice(0, 4).includes(row.status), authorId: row.authorId, reporterId: row.reporterId, seo: row.seo, alternativeTitle: (row.seo as Record<string, unknown> | null)?.alternativeTitle ?? null, videoUrl: row.videoUrl, tags: linked, tagIds: linked.map(t => t.id), imageUrls: base.bodyImageUrls, imageCaption: hero?.captionPlain ?? hero?.captionHtml ?? null, imageAltText: hero?.altText ?? null, isReading: row.isReading, displayOrder: row.displayOrder, imageFocalPoint: row.imageFocalPoint, updatedAt: row.updatedAt.toISOString() };
}
async function enResponse(row: typeof enArticles.$inferSelect, full: boolean, includeContent = full) {
  const [category] = row.categoryId ? await db.select({ slug: enCategories.slug }).from(enCategories).where(eq(enCategories.id, row.categoryId)).limit(1) : [];
  const response = toEnBotDraftResponse(row, category?.slug ?? null, { includeContent });
  const base = { ...response, source: response.source || "manual" };
  if (!full) return base;
  const tagIds = (row.seo as { tagIds?: unknown } | null)?.tagIds;
  const linked = Array.isArray(tagIds) ? tagIds.filter((id): id is string => typeof id === "string") : [];
  const resolved = linked.length ? await db.select({ id: tags.id, slug: tags.slug, nameAr: tags.nameAr, nameEn: tags.nameEn }).from(tags).where(inArray(tags.id, linked)) : [];
  return { ...base, updatable: statuses.slice(0, 4).includes(row.status), tags: resolved, tagIds: linked, authorId: row.authorId, reporterId: row.reporterId, seo: row.seo, alternativeTitle: (row.seo as Record<string, unknown> | null)?.alternativeTitle ?? null, imageUrls: base.bodyImageUrls, imageCaption: row.seo?.imageCaption ?? null, imageAltText: row.seo?.imageAltText ?? null, isReading: row.isReading, displayOrder: row.displayOrder, imageFocalPoint: row.imageFocalPoint };
}
export async function readBotArticle(lang: Lang, id: string, query: Query) {
  langCheck(lang); const p = parameters(query, ["includeContent"]);
  if (p.includeContent && p.includeContent !== "1") fail("includeContent must be 1");
  if (!id || id.length > 200) fail("Invalid id");
  if (lang === "ar") {
    const [row] = await db.select().from(articles).where(and(eq(articles.id, id), or(eq(articles.articleType, "news"), and(eq(articles.articleType, "infographic"), eq(articles.source, "bot"))))).limit(1);
    if (!row) throw new BotDraftError(404, "not_found", "الخبر غير موجود");
    return arResponse(row, true, p.includeContent === "1");
  }
  const [row] = await db.select().from(enArticles).where(and(eq(enArticles.id, id), or(eq(enArticles.articleType, "news"), and(eq(enArticles.articleType, "infographic"), sql`${enArticles.seoMetadata}->>'source' = 'bot'`)))).limit(1);
  if (!row) throw new BotDraftError(404, "not_found", "الخبر غير موجود");
  return enResponse(row, true, p.includeContent === "1");
}

export async function readBotReference(lang: Lang, kind: string, query: Query) {
  langCheck(lang);
  if (!["categories", "authors", "tags"].includes(kind)) fail("Invalid reference kind");
  const p = parameters(query, ["q", "limit", "cursor"]), limit = pageSize(p.limit), cursor = decodeCursor(p.cursor);
  const search = p.q ? `%${escapeLike(p.q)}%` : undefined;
  let items: Array<{ id: string; [key: string]: unknown }>;
  if (kind === "categories" && lang === "ar") {
    const filters: SQL[] = [inArray(categories.status, ["active", "visible"])];
    if (search) filters.push(or(ilike(categories.nameAr, search), ilike(categories.nameEn, search), ilike(categories.slug, search))!);
    if (cursor) filters.push(sql`${categories.id} > ${cursor}`);
    items = await db.select({ id: categories.id, slug: categories.slug, nameAr: categories.nameAr, nameEn: categories.nameEn }).from(categories).where(and(...filters)).orderBy(asc(categories.id)).limit(limit + 1);
  } else if (kind === "categories") {
    const filters: SQL[] = [eq(enCategories.status, "active"), eq(enCategories.type, "core")];
    if (search) filters.push(or(ilike(enCategories.name, search), ilike(enCategories.slug, search))!);
    if (cursor) filters.push(sql`${enCategories.id} > ${cursor}`);
    items = await db.select({ id: enCategories.id, slug: enCategories.slug, name: enCategories.name }).from(enCategories).where(and(...filters)).orderBy(asc(enCategories.id)).limit(limit + 1);
  } else if (kind === "tags") {
    const filters: SQL[] = [eq(tags.status, "active")];
    if (search) filters.push(or(ilike(tags.nameAr, search), ilike(tags.nameEn, search), ilike(tags.slug, search))!);
    if (cursor) filters.push(sql`${tags.id} > ${cursor}`);
    items = await db.select({ id: tags.id, slug: tags.slug, nameAr: tags.nameAr, nameEn: tags.nameEn }).from(tags).where(and(...filters)).orderBy(asc(tags.id)).limit(limit + 1);
  } else {
    const filters: SQL[] = [botEditorAssignableStaff()!];
    if (search) filters.push(or(ilike(users.firstName, search), ilike(users.lastName, search), ilike(users.firstNameEn, search), ilike(users.lastNameEn, search))!);
    if (cursor) filters.push(sql`${users.id} > ${cursor}`);
    items = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, firstNameEn: users.firstNameEn, lastNameEn: users.lastNameEn }).from(users).where(and(...filters)).orderBy(asc(users.id)).limit(limit + 1);
  }
  return { items: items.slice(0, limit), nextCursor: items.length > limit ? cursorFor(items[limit - 1].id) : null };
}

export async function relatedBotArticles(lang: Lang, id: string, body: unknown) {
  langCheck(lang);
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("Invalid body");
  const values = body as Record<string, unknown>;
  if (Object.keys(values).some(k => k !== "limit")) fail("Invalid related request");
  const limit = values.limit === undefined ? 5 : typeof values.limit === "number" && Number.isInteger(values.limit) && values.limit >= 1 && values.limit <= 20 ? values.limit : fail("limit must be 1–20");
  if (lang === "ar") {
    const [row] = await db.select({ categoryId: articles.categoryId }).from(articles).where(and(eq(articles.id, id), eq(articles.articleType, "news"))).limit(1);
    if (!row) throw new BotDraftError(404, "not_found", "الخبر غير موجود");
    if (!row.categoryId) return { items: [] };
    const rows = await db.select().from(articles).where(and(eq(articles.articleType, "news"), eq(articles.status, "published"), eq(articles.categoryId, row.categoryId), sql`${articles.id} <> ${id}`)).orderBy(desc(articles.publishedAt), desc(articles.id)).limit(limit);
    return { items: await Promise.all(rows.map(r => arResponse(r, false))) };
  }
  const [row] = await db.select({ categoryId: enArticles.categoryId }).from(enArticles).where(and(eq(enArticles.id, id), eq(enArticles.articleType, "news"))).limit(1);
  if (!row) throw new BotDraftError(404, "not_found", "الخبر غير موجود");
  if (!row.categoryId) return { items: [] };
  const rows = await db.select().from(enArticles).where(and(eq(enArticles.articleType, "news"), eq(enArticles.status, "published"), eq(enArticles.categoryId, row.categoryId), sql`${enArticles.id} <> ${id}`)).orderBy(desc(enArticles.publishedAt), desc(enArticles.id)).limit(limit);
  return { items: await Promise.all(rows.map(r => enResponse(r, false))) };
}
