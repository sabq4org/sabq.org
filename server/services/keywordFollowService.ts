/**
 * متابعة الكلمات المفتاحية لحساب القارئ — نفس جداول مسارات الويب
 * (keywordFollowing.ts: tags + user_followed_terms) لتتطابق قائمة «كلماتي»
 * بين الموقع والتطبيقات. التطبيقات تعرف الكلمة نصًا لا معرّف الوسم، فكل
 * العمليات هنا بالاسم. الفهرس على (user_id, tag_id) غير فريد، فنفحص
 * الوجود قبل الإدراج بدل الاعتماد على onConflictDoNothing.
 */
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { tags, userFollowedTerms, articles, articleTags } from "@shared/schema";

export interface FollowedKeyword {
  tagId: string;
  name: string;
  articleCount: number;
}

/** أقصى عدد كلمات يُقبل في مزامنة واحدة — حارس ضد حمولة عشوائية. */
export const KEYWORD_SYNC_MAX = 100;

export function normalizeKeyword(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const k = raw.replace(/\s+/g, " ").trim();
  return k.length > 0 && k.length <= 80 ? k : null;
}

function slugOf(keyword: string): string {
  return keyword.toLowerCase().trim().replace(/\s+/g, "-");
}

async function findTag(keyword: string) {
  return db.query.tags.findFirst({
    where: or(eq(tags.slug, slugOf(keyword)), eq(tags.nameAr, keyword)),
  });
}

async function findOrCreateTag(keyword: string) {
  const existing = await findTag(keyword);
  if (existing) return existing;
  const [created] = await db
    .insert(tags)
    .values({ nameAr: keyword, nameEn: keyword, slug: slugOf(keyword), usageCount: 0, status: "active" })
    .onConflictDoNothing()
    .returning();
  // سباق على نفس السلاج: أدرجه طلب آخر بين البحث والإدراج
  return created ?? (await findTag(keyword));
}

/** يتابع كلمة؛ يرجّع معرّف الوسم. لا يكرر صف المتابعة ولا يضاعف العدّاد. */
export async function followKeyword(userId: string, keyword: string): Promise<string | null> {
  const tag = await findOrCreateTag(keyword);
  if (!tag) return null;
  const already = await db.query.userFollowedTerms.findFirst({
    where: and(eq(userFollowedTerms.userId, userId), eq(userFollowedTerms.tagId, tag.id)),
  });
  if (already) return tag.id;
  await db.insert(userFollowedTerms).values({ userId, tagId: tag.id, notify: true });
  await db
    .update(tags)
    .set({ usageCount: sql`${tags.usageCount} + 1` })
    .where(eq(tags.id, tag.id));
  return tag.id;
}

/** يلغي متابعة كلمة بالاسم؛ لا شيء إن لم تكن متابَعة. */
export async function unfollowKeyword(userId: string, keyword: string): Promise<void> {
  const tag = await findTag(keyword);
  if (!tag) return;
  const removed = await db
    .delete(userFollowedTerms)
    .where(and(eq(userFollowedTerms.userId, userId), eq(userFollowedTerms.tagId, tag.id)))
    .returning({ id: userFollowedTerms.id });
  if (removed.length === 0) return;
  await db
    .update(tags)
    .set({ usageCount: sql`greatest(${tags.usageCount} - ${removed.length}, 0)` })
    .where(eq(tags.id, tag.id));
}

/** قائمة «كلماتي»: الأحدث متابعةً أولًا، مع عدد الأخبار المنشورة لكل كلمة. */
export async function listFollowedKeywords(userId: string): Promise<FollowedKeyword[]> {
  const rows = await db
    .select({ tagId: userFollowedTerms.tagId, name: tags.nameAr })
    .from(userFollowedTerms)
    .innerJoin(tags, eq(userFollowedTerms.tagId, tags.id))
    .where(eq(userFollowedTerms.userId, userId))
    .orderBy(desc(userFollowedTerms.createdAt));

  // صف مكرر قديم (الفهرس غير فريد) يُعرض مرة واحدة
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(r.tagId) ? false : (seen.add(r.tagId), true)));
  if (unique.length === 0) return [];

  const counts = await db
    .select({ tagId: articleTags.tagId, count: sql<number>`count(*)::int` })
    .from(articleTags)
    .innerJoin(articles, eq(articleTags.articleId, articles.id))
    .where(and(inArray(articleTags.tagId, unique.map((r) => r.tagId)), eq(articles.status, "published")))
    .groupBy(articleTags.tagId);
  const countMap = new Map(counts.map((c) => [c.tagId, c.count]));

  return unique.map((r) => ({ tagId: r.tagId, name: r.name, articleCount: countMap.get(r.tagId) ?? 0 }));
}
