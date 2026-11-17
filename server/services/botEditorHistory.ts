import { and, eq, inArray, or, sql } from "drizzle-orm";
import { activityLogs, articleEvents, articleRevisions, articleVersions, articles, enArticleEvents, enArticleRevisions, enArticles } from "@shared/schema";
import { db } from "../db";
import { BotDraftError } from "./botDraftsService";

type Language = "ar" | "en";
type Kind = "version" | "event" | "revision" | "activity";
type Key = { kind: Kind; id: string; created_at: Date | string };

/** The union paginates narrow keys first; snapshots are loaded only for the selected page. */
export async function listBotEditorRevisions(language: Language, articleId: string, query: Record<string, unknown> = {}) {
  if (Object.keys(query).some(k => !["limit", "offset", "includeDetails"].includes(k))) throw new BotDraftError(400, "validation_error", "Invalid history query");
  const parse = (v: unknown, fallback: number, max: number, min: number) => {
    if (v === undefined) return fallback;
    if (typeof v !== "string" || !/^(0|[1-9]\d*)$/.test(v) || Number(v) < min || Number(v) > max) throw new BotDraftError(400, "validation_error", "Invalid history pagination");
    return Number(v);
  };
  const limit = parse(query.limit, 25, 100, 1), offset = parse(query.offset, 0, 1000, 0);
  if (query.includeDetails !== undefined && query.includeDetails !== "1") throw new BotDraftError(400, "validation_error", "Invalid includeDetails");
  const details = query.includeDetails === "1";
  if (language !== "ar" && language !== "en") throw new BotDraftError(400, "validation_error", "Invalid language");
  if (language === "ar") {
    const [article] = await db.select({ id: articles.id }).from(articles).where(and(eq(articles.id, articleId), or(eq(articles.articleType, "news"), and(eq(articles.articleType, "infographic"), eq(articles.source, "bot"))))).limit(1);
    if (!article) throw new BotDraftError(404, "not_found", "الخبر غير موجود");
  } else {
    const [article] = await db.select({ id: enArticles.id }).from(enArticles).where(and(eq(enArticles.id, articleId), or(eq(enArticles.articleType, "news"), and(eq(enArticles.articleType, "infographic"), sql`${enArticles.seoMetadata}->>'source' = 'bot'`)))).limit(1);
    if (!article) throw new BotDraftError(404, "not_found", "الخبر غير موجود");
  }
  const union = language === "ar" ? sql`
    SELECT 'version' AS kind, id, created_at FROM article_versions WHERE article_id = ${articleId}
    UNION ALL SELECT 'event', id, created_at FROM article_events WHERE article_id = ${articleId}
    UNION ALL SELECT 'revision', id, created_at FROM article_revisions WHERE article_id = ${articleId}` : sql`
    SELECT 'event' AS kind, id, created_at FROM en_article_events WHERE article_id = ${articleId}
    UNION ALL SELECT 'revision', id, created_at FROM en_article_revisions WHERE article_id = ${articleId}
    UNION ALL SELECT 'activity', id, created_at FROM activity_logs WHERE entity_type = 'en_article' AND entity_id = ${articleId}`;
  const result = await db.execute(sql`SELECT kind, id, created_at FROM (${union}) AS history ORDER BY created_at DESC, kind DESC, id DESC LIMIT ${limit + 1} OFFSET ${offset}`);
  const keys = (result.rows as unknown as Key[]).slice(0, limit);
  const ids = (kind: Kind) => keys.filter(k => k.kind === kind).map(k => k.id);
  const versionIds = ids("version"), eventIds = ids("event"), revisionIds = ids("revision"), activityIds = ids("activity");
  const [versions, events, revisions, activities] = await Promise.all([
    versionIds.length ? db.select({ id: articleVersions.id, articleId: articleVersions.articleId, versionNumber: articleVersions.versionNumber, action: articleVersions.action, actorId: articleVersions.actorId, changedFields: articleVersions.changedFields, reason: articleVersions.reason, createdAt: articleVersions.createdAt, ...(details ? { snapshot: articleVersions.snapshot } : {}) }).from(articleVersions).where(inArray(articleVersions.id, versionIds)) : [],
    eventIds.length ? (language === "ar" ? db.select().from(articleEvents).where(inArray(articleEvents.id, eventIds)) : db.select().from(enArticleEvents).where(inArray(enArticleEvents.id, eventIds))) : [],
    revisionIds.length ? (language === "ar" ? db.select({ id: articleRevisions.id, articleId: articleRevisions.articleId, editorUserId: articleRevisions.editorUserId, editorName: articleRevisions.editorName, changedFields: articleRevisions.changedFields, updateReason: articleRevisions.updateReason, originalSource: articleRevisions.originalSource, createdAt: articleRevisions.createdAt, ...(details ? { previousValues: articleRevisions.previousValues } : {}) }).from(articleRevisions).where(inArray(articleRevisions.id, revisionIds)) : db.select({ id: enArticleRevisions.id, articleId: enArticleRevisions.articleId, editorUserId: enArticleRevisions.editorUserId, editorName: enArticleRevisions.editorName, changedFields: enArticleRevisions.changedFields, updateReason: enArticleRevisions.updateReason, originalSource: enArticleRevisions.originalSource, createdAt: enArticleRevisions.createdAt, ...(details ? { previousValues: enArticleRevisions.previousValues } : {}) }).from(enArticleRevisions).where(inArray(enArticleRevisions.id, revisionIds))) : [],
    activityIds.length ? db.select({ id: activityLogs.id, action: activityLogs.action, userId: activityLogs.userId, createdAt: activityLogs.createdAt, ...(details ? { oldValue: activityLogs.oldValue, newValue: activityLogs.newValue } : {}) }).from(activityLogs).where(inArray(activityLogs.id, activityIds)) : [],
  ]);
  const rows = new Map<string, unknown>();
  for (const [kind, group] of [["version", versions], ["event", events], ["revision", revisions], ["activity", activities]] as const) for (const row of group) rows.set(`${kind}:${row.id}`, row);
  return { items: keys.map(key => ({ kind: key.kind, id: key.id, createdAt: key.created_at, data: rows.get(`${key.kind}:${key.id}`) ?? null })), nextOffset: result.rows.length > limit && offset + limit <= 1000 ? offset + limit : null };
}
