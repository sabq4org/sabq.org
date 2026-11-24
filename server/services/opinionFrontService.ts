/**
 * صفحة الرأي للقارئ (/opinion): مقالات الأسبوع يومًا بيوم، و«يقرؤونه الآن»
 * بسرعة القراءة، و«تعرّف على كاتب»، وقائمة الكتّاب أبجديًا.
 * القواعد الخالصة في shared/opinionFront.ts.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { articles, categories, users } from "@shared/schema";
import { memoryCache } from "../memoryCache";
import {
  pickHotArticles,
  pickSpotlight,
  riyadhDayKey,
  riyadhWeekDays,
  rotateByHour,
  sortRosterByName,
} from "@shared/opinionFront";

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 60_000;

export type OpinionFrontArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  aiSummary: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  imageFocalPoint: unknown;
  publishedAt: string;
  readMinutes: number;
  category: { id: string; nameAr: string; slug: string | null } | null;
  author: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    bio: string | null;
    gender: string | null;
  } | null;
};

export type OpinionFrontWriter = {
  id: string;
  name: string;
  profileImageUrl: string | null;
  bio: string | null;
  gender: string | null;
  articleCount: number;
};

export type OpinionFrontPayload = {
  today: string;
  days: { key: string; count: number; isToday: boolean; isFuture: boolean }[];
  /** آخر يوم فيه مقالات (يُعرض حين يكون اليوم فارغًا). */
  latestDay: string | null;
  articlesByDay: Record<string, OpinionFrontArticle[]>;
  hot: OpinionFrontArticle[];
  spotlight: { writer: OpinionFrontWriter; article: OpinionFrontArticle | null } | null;
  roster: { total: number; writers: OpinionFrontWriter[] };
};

function displayName(firstName: string | null, lastName: string | null): string {
  return `${firstName || ""} ${lastName || ""}`.trim();
}

async function loadRecentArticles(since: Date): Promise<(OpinionFrontArticle & { views: number; authorId: string | null })[]> {
  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      excerpt: articles.excerpt,
      aiSummary: articles.aiSummary,
      imageUrl: articles.imageUrl,
      thumbnailUrl: articles.thumbnailUrl,
      imageFocalPoint: articles.imageFocalPoint,
      publishedAt: articles.publishedAt,
      views: articles.views,
      authorId: articles.authorId,
      contentLength: sql<number>`length(regexp_replace(coalesce(${articles.content}, ''), '<[^>]*>', '', 'g'))`,
      categoryId: categories.id,
      categoryName: categories.nameAr,
      categorySlug: categories.slug,
      uId: users.id,
      uFirst: users.firstName,
      uLast: users.lastName,
      uPhoto: users.profileImageUrl,
      uBio: users.bio,
      uGender: users.gender,
    })
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .leftJoin(users, eq(articles.authorId, users.id))
    .where(
      and(
        eq(articles.articleType, "opinion"),
        eq(articles.status, "published"),
        gte(articles.publishedAt, since),
      ),
    )
    .orderBy(desc(articles.publishedAt))
    // سقف أمان فقط: نحو 5 مقالات يوميًا = قرابة 300 في 60 يومًا، فلا تُقتطع إحصاءات الكتّاب.
    .limit(2000);

  return rows
    .filter((r) => r.publishedAt)
    .map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      excerpt: r.excerpt,
      aiSummary: r.aiSummary,
      imageUrl: r.imageUrl,
      thumbnailUrl: r.thumbnailUrl,
      imageFocalPoint: r.imageFocalPoint,
      publishedAt: (r.publishedAt as Date).toISOString(),
      // نحو 1100 حرف في الدقيقة للنص العربي.
      readMinutes: Math.max(1, Math.round(Number(r.contentLength || 0) / 1100)),
      views: Number(r.views || 0),
      authorId: r.authorId,
      category: r.categoryId ? { id: r.categoryId, nameAr: r.categoryName || "", slug: r.categorySlug } : null,
      author: r.uId
        ? {
            id: r.uId,
            firstName: r.uFirst,
            lastName: r.uLast,
            profileImageUrl: r.uPhoto,
            bio: r.uBio,
            gender: r.uGender,
          }
        : null,
    }));
}

function publicArticle(a: OpinionFrontArticle & { views?: number; authorId?: string | null }): OpinionFrontArticle {
  const { views: _views, authorId: _authorId, ...rest } = a;
  return rest;
}

export async function getOpinionFront(now = new Date()): Promise<OpinionFrontPayload> {
  const hourKey = Math.floor(now.getTime() / (60 * 60 * 1000));
  const cacheKey = `opinion:front:v1:${hourKey}`;
  const cached = memoryCache.get<OpinionFrontPayload>(cacheKey);
  if (cached) return cached;

  // 60 يومًا: قائمة الكتّاب، و30 منها لمقياس الظهور، وأسبوعان لمقالات الصفحة.
  const recent = await loadRecentArticles(new Date(now.getTime() - 60 * DAY_MS));
  const todayKey = riyadhDayKey(now);
  const week = riyadhWeekDays(now);
  const pageSince = now.getTime() - 14 * DAY_MS;

  const byDay: Record<string, typeof recent> = {};
  for (const a of recent) {
    if (new Date(a.publishedAt).getTime() < pageSince) continue;
    const key = riyadhDayKey(new Date(a.publishedAt));
    (byDay[key] ||= []).push(a);
  }
  const latestDay = Object.keys(byDay).sort().pop() || null;

  const articlesByDay: Record<string, OpinionFrontArticle[]> = {};
  const wanted = new Set(week.filter((d) => !d.isFuture).map((d) => d.key));
  if (latestDay) wanted.add(latestDay);
  for (const key of wanted) {
    // الأقدم أولًا ثم إزاحة كل ساعة لليوم الحالي؛ الأيام الماضية بترتيب النشر.
    const list = [...(byDay[key] || [])].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
    articlesByDay[key] = (key === todayKey ? rotateByHour(list, now) : list).map(publicArticle);
  }

  const hot = pickHotArticles(
    recent.map((a) => ({ ...a, publishedAt: new Date(a.publishedAt) })),
    now,
  ).map((a) => publicArticle({ ...a, publishedAt: a.publishedAt.toISOString() }));

  // الكتّاب: من نشر في آخر 60 يومًا.
  const writers = new Map<string, OpinionFrontWriter & { recentViews: number; lastPublishedAt: Date; latest: OpinionFrontArticle }>();
  const thirtyDaysAgo = now.getTime() - 30 * DAY_MS;
  for (const a of recent) {
    if (!a.author) continue;
    const name = displayName(a.author.firstName, a.author.lastName);
    if (!name) continue;
    const published = new Date(a.publishedAt);
    const entry = writers.get(a.author.id);
    const viewsInWindow = published.getTime() >= thirtyDaysAgo ? a.views : 0;
    if (entry) {
      entry.articleCount += 1;
      entry.recentViews += viewsInWindow;
    } else {
      // recent مرتبة الأحدث أولًا، فأول ظهور هو آخر مقال.
      writers.set(a.author.id, {
        id: a.author.id,
        name,
        profileImageUrl: a.author.profileImageUrl,
        bio: a.author.bio,
        gender: a.author.gender,
        articleCount: 1,
        recentViews: viewsInWindow,
        lastPublishedAt: published,
        latest: publicArticle(a),
      });
    }
  }
  const writerList = [...writers.values()];
  const strip = ({ recentViews: _r, lastPublishedAt: _l, latest: _a, ...w }: (typeof writerList)[number]): OpinionFrontWriter => w;
  const chosen = pickSpotlight(
    writerList.map((w) => ({ ...w, authorId: w.id })),
    now,
  );

  const payload: OpinionFrontPayload = {
    today: todayKey,
    days: week.map((d) => ({ ...d, count: (byDay[d.key] || []).length })),
    latestDay,
    articlesByDay,
    hot,
    spotlight: chosen ? { writer: strip(chosen), article: chosen.latest } : null,
    roster: { total: writerList.length, writers: sortRosterByName(writerList).map(strip) },
  };
  memoryCache.set(cacheKey, payload, CACHE_TTL_MS);
  return payload;
}
