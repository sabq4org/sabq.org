/**
 * إضافات صفحة الكاتب (/author/:name) لكتّاب الرأي: يوم الكتابة المعتاد،
 * وموعده القادم، وتصنيفاته الغالبة، و«كتّاب اليوم نفسه».
 * القواعد الخالصة في shared/writerPage.ts. بلا مشاهدات.
 */
import { and, eq, gte } from "drizzle-orm";
import { db } from "../db";
import { articles, categories, users } from "@shared/schema";
import { memoryCache } from "../memoryCache";
import { nextWritingDayKey, topNames, usualWeekday } from "@shared/writerPage";

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 120;
const CACHE_TTL_MS = 10 * 60 * 1000;
const PEERS_LIMIT = 8;

type WriterHistory = {
  id: string;
  name: string;
  avatarUrl: string | null;
  dates: Date[];
  categories: (string | null)[];
};

export type WriterPeer = { id: string; name: string; avatarUrl: string | null };

export type WriterPageExtras = {
  /** 0 الأحد … 6 السبت بتوقيت الرياض، أو null حين لا يوم واضحًا. */
  weekday: number | null;
  nextDayKey: string | null;
  usualCategories: string[];
  peers: WriterPeer[];
};

async function loadOpinionHistory(now: Date): Promise<Map<string, WriterHistory>> {
  const cacheKey = "writer:page:opinion-history:v1";
  const cached = memoryCache.get<Map<string, WriterHistory>>(cacheKey);
  if (cached) return cached;

  const rows = await db
    .select({
      authorId: articles.authorId,
      publishedAt: articles.publishedAt,
      categoryName: categories.nameAr,
      firstName: users.firstName,
      lastName: users.lastName,
      avatarUrl: users.profileImageUrl,
    })
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .leftJoin(users, eq(articles.authorId, users.id))
    .where(
      and(
        eq(articles.articleType, "opinion"),
        eq(articles.status, "published"),
        gte(articles.publishedAt, new Date(now.getTime() - WINDOW_DAYS * DAY_MS)),
      ),
    )
    .limit(3000);

  const byWriter = new Map<string, WriterHistory>();
  for (const r of rows) {
    if (!r.authorId || !r.publishedAt) continue;
    let w = byWriter.get(r.authorId);
    if (!w) {
      const name = `${r.firstName || ""} ${r.lastName || ""}`.trim();
      if (!name) continue;
      w = { id: r.authorId, name, avatarUrl: r.avatarUrl || null, dates: [], categories: [] };
      byWriter.set(r.authorId, w);
    }
    w.dates.push(new Date(r.publishedAt));
    w.categories.push(r.categoryName ?? null);
  }
  memoryCache.set(cacheKey, byWriter, CACHE_TTL_MS);
  return byWriter;
}

/** null لغير كتّاب الرأي (مثل المراسلين) أو لمن لم يكتب رأيًا في آخر 120 يومًا. */
export async function getWriterPageExtras(authorId: string, now = new Date()): Promise<WriterPageExtras | null> {
  const history = await loadOpinionHistory(now);
  const me = history.get(authorId);
  if (!me) return null;

  const weekday = usualWeekday(me.dates);
  const latest = me.dates.reduce<Date | null>((acc, d) => (!acc || d > acc ? d : acc), null);
  const recentCutoff = now.getTime() - 60 * DAY_MS;

  const peers: WriterPeer[] = [];
  if (weekday !== null) {
    for (const w of history.values()) {
      if (w.id === authorId) continue;
      if (!w.dates.some((d) => d.getTime() >= recentCutoff)) continue;
      if (usualWeekday(w.dates) !== weekday) continue;
      peers.push({ id: w.id, name: w.name, avatarUrl: w.avatarUrl });
    }
    peers.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }

  return {
    weekday,
    nextDayKey: weekday === null ? null : nextWritingDayKey(weekday, now, latest),
    usualCategories: topNames(me.categories, 2),
    peers: peers.slice(0, PEERS_LIMIT),
  };
}
