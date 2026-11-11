/**
 * كلمات محظورة من النشر — القراءة والكتابة والفحص عند النشر.
 *
 * المنع يفشل مفتوحًا: أي خطأ في قراءة القائمة (جدول غير موجود بعد، انقطاع
 * قاعدة البيانات) لا يوقف النشر، بل يُسجَّل ويمر الخبر. تعطّل غرفة الأخبار
 * أسوأ من مرور كلمة.
 */
import { and, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import * as Sentry from "@sentry/node";
import { articles, publishBannedWordBlocks, publishBannedWords, users } from "@shared/schema";
import {
  BANNED_WORD_CODE,
  bannedWordMessage,
  cleanBannedWordInput,
  findBannedWords,
  newlyIntroducedBannedWords,
  normalizeBannedText,
  type BannedWordContent,
  type BannedWordEntry,
  type BannedWordMatch,
} from "@shared/publishBannedWords";
import { db } from "../db";
import { memoryCache } from "../memoryCache";
import { getEffectiveUserPermissions } from "../rbac";
import { isPublishingStatus } from "./publishGateRules";

// لكل نسخة خادم ذاكرتها؛ تعديل القائمة يصل النسخة الأخرى خلال هذه المدة.
const ACTIVE_WORDS_CACHE_ID = "publish-banned-words:active";
const ACTIVE_WORDS_TTL_MS = 15 * 1000;
const IMPACT_WINDOW_DAYS = 30;

export class PublishBannedWordsError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "PublishBannedWordsError";
  }
}

export type BannedWordDenial = {
  httpStatus: number;
  message: string;
  code: typeof BANNED_WORD_CODE;
  bannedWords: BannedWordMatch[];
};

export type BannedWordSurface = "dashboard" | "desk" | "bot";

async function activeWords(): Promise<BannedWordEntry[]> {
  const cached = memoryCache.get<BannedWordEntry[]>(ACTIVE_WORDS_CACHE_ID);
  if (cached) return cached;
  const rows = await db
    .select({ id: publishBannedWords.id, word: publishBannedWords.word })
    .from(publishBannedWords)
    .where(eq(publishBannedWords.isActive, true));
  memoryCache.set(ACTIVE_WORDS_CACHE_ID, rows, ACTIVE_WORDS_TTL_MS);
  return rows;
}

function invalidateActiveWords(): void {
  memoryCache.delete(ACTIVE_WORDS_CACHE_ID);
}

/** المسؤول ومدير النظام ("*") يُستثنيان: القرار قرارهما. */
async function isExempt(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const permissions = await getEffectiveUserPermissions(userId);
  return permissions.includes("*");
}

async function recordBlocks(input: {
  matches: BannedWordMatch[];
  articleId?: string | null;
  articleTitle?: unknown;
  actorId?: string | null;
  actorLabel?: string | null;
  action: "publish" | "schedule" | "edit";
  surface: BannedWordSurface;
}): Promise<void> {
  try {
    const title = typeof input.articleTitle === "string" ? input.articleTitle.slice(0, 300) : null;
    await db.insert(publishBannedWordBlocks).values(
      input.matches.map((match) => ({
        wordId: match.id,
        word: match.word,
        articleId: input.articleId ?? null,
        articleTitle: title,
        actorId: input.actorId ?? null,
        actorLabel: input.actorLabel ?? null,
        action: input.action,
        surface: input.surface,
      })),
    );
    for (const match of input.matches) {
      await db
        .update(publishBannedWords)
        .set({ blockedCount: sql`${publishBannedWords.blockedCount} + 1` })
        .where(eq(publishBannedWords.id, match.id));
    }
  } catch (error) {
    console.error("[publish-banned-words] تعذر تسجيل محاولة المنع", error);
  }
}

/**
 * يعيد null إن جاز الحفظ، أو رفضًا جاهزًا للإرسال.
 *
 * - `nextStatus` ليست نشرًا ولا جدولة → لا فحص (المسودة تُحفظ دائمًا).
 * - انتقال إلى نشر/جدولة → يُمنع إن وردت أي كلمة مفعّلة.
 * - تعديل مادة منشورة/مجدولة أصلًا (`previous` وحالتها نشر) → تُمنع فقط
 *   الكلمة التي أُدخلت بهذا الحفظ.
 */
export async function denyBannedWords(input: {
  userId: string | null | undefined;
  nextStatus: unknown;
  content: BannedWordContent;
  previous?: (BannedWordContent & { status?: unknown }) | null;
  articleId?: string | null;
  actorLabel?: string | null;
  surface: BannedWordSurface;
}): Promise<BannedWordDenial | null> {
  if (!isPublishingStatus(input.nextStatus)) return null;
  try {
    const words = await activeWords();
    if (words.length === 0) return null;

    const alreadyLive = Boolean(input.previous) && isPublishingStatus(input.previous?.status);
    const matches = alreadyLive
      ? newlyIntroducedBannedWords(words, input.previous!, input.content)
      : findBannedWords(words, input.content);
    if (matches.length === 0) return null;
    if (await isExempt(input.userId)) return null;

    await recordBlocks({
      matches,
      articleId: input.articleId,
      articleTitle: input.content.title,
      actorId: input.userId,
      actorLabel: input.actorLabel ?? (await bannedWordActorLabel(input.userId)),
      action: alreadyLive ? "edit" : input.nextStatus === "scheduled" ? "schedule" : "publish",
      surface: input.surface,
    });
    return {
      httpStatus: 422,
      message: bannedWordMessage(matches),
      code: BANNED_WORD_CODE,
      bannedWords: matches,
    };
  } catch (error) {
    console.error("[publish-banned-words] تعذر الفحص — يمر النشر", error);
    Sentry.captureException(error, { tags: { subsystem: "publish-banned-words" } });
    return null;
  }
}

// ── صفحة الإدارة ─────────────────────────────────────────────────────

export async function listBannedWords() {
  const [words, blocks] = await Promise.all([
    db.select().from(publishBannedWords).orderBy(desc(publishBannedWords.createdAt)),
    db
      .select()
      .from(publishBannedWordBlocks)
      .orderBy(desc(publishBannedWordBlocks.createdAt))
      .limit(20),
  ]);
  const monthAgo = new Date(Date.now() - IMPACT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    words: words.map((row) => ({
      id: row.id,
      word: row.word,
      note: row.note,
      isActive: row.isActive,
      blockedCount: row.blockedCount,
      createdAt: row.createdAt.toISOString(),
    })),
    recentBlocks: blocks.map((row) => ({
      id: row.id,
      word: row.word,
      articleId: row.articleId,
      articleTitle: row.articleTitle,
      actorLabel: row.actorLabel,
      action: row.action,
      surface: row.surface,
      createdAt: row.createdAt.toISOString(),
    })),
    blockedThisMonth: blocks.filter((row) => row.createdAt >= monthAgo).length,
  };
}

/**
 * «فحص قبل الحفظ»: كم خبرًا منشورًا آخر 30 يومًا وردت فيه العبارة. ILIKE يختار
 * المرشحين بسرعة ثم نطبّق المطابقة الدقيقة نفسها التي يطبّقها المنع.
 */
export async function previewBannedWordImpact(rawWord: unknown) {
  const word = cleanBannedWordInput(rawWord);
  if (!word) throw new PublishBannedWordsError(400, "اكتب كلمة أو عبارة من حرفين على الأقل");
  const since = new Date(Date.now() - IMPACT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const firstToken = word.split(" ")[0];
  const pattern = `%${firstToken.replace(/[%_\\]/g, "\\$&")}%`;
  const candidates = await db
    .select({
      id: articles.id,
      title: articles.title,
      subtitle: articles.subtitle,
      excerpt: articles.excerpt,
      content: articles.content,
      seo: articles.seo,
      publishedAt: articles.publishedAt,
    })
    .from(articles)
    .where(
      and(
        eq(articles.status, "published"),
        gte(articles.publishedAt, since),
        or(ilike(articles.title, pattern), ilike(articles.content, pattern)),
      ),
    )
    .orderBy(desc(articles.publishedAt))
    .limit(500);
  const entry = [{ id: "preview", word }];
  const hits = candidates.filter((row) => findBannedWords(entry, row).length > 0);
  return {
    word,
    days: IMPACT_WINDOW_DAYS,
    count: hits.length,
    samples: hits.slice(0, 4).map((row) => ({
      id: row.id,
      title: row.title,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    })),
  };
}

export async function addBannedWord(input: { word: unknown; note?: unknown; actorId: string | null }) {
  const word = cleanBannedWordInput(input.word);
  if (!word) throw new PublishBannedWordsError(400, "اكتب كلمة أو عبارة من حرفين على الأقل");
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 300) : null;
  const normalizedWord = normalizeBannedText(word);
  const [existing] = await db
    .select({ id: publishBannedWords.id })
    .from(publishBannedWords)
    .where(eq(publishBannedWords.normalizedWord, normalizedWord))
    .limit(1);
  if (existing) throw new PublishBannedWordsError(409, `«${word}» موجودة في القائمة`);
  const [row] = await db
    .insert(publishBannedWords)
    .values({ word, normalizedWord, note, addedBy: input.actorId })
    .returning({ id: publishBannedWords.id });
  invalidateActiveWords();
  return row;
}

export async function setBannedWordActive(id: string, isActive: boolean) {
  const [row] = await db
    .update(publishBannedWords)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(publishBannedWords.id, id))
    .returning({ id: publishBannedWords.id });
  if (!row) throw new PublishBannedWordsError(404, "الكلمة غير موجودة");
  invalidateActiveWords();
  return row;
}

export async function removeBannedWord(id: string) {
  const [row] = await db
    .delete(publishBannedWords)
    .where(eq(publishBannedWords.id, id))
    .returning({ id: publishBannedWords.id });
  if (!row) throw new PublishBannedWordsError(404, "الكلمة غير موجودة");
  invalidateActiveWords();
  return row;
}

/** وصف من حاول النشر كما يظهر في السجل: الدور لا الاسم. */
export async function bannedWordActorLabel(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    return row?.role ?? null;
  } catch {
    return null;
  }
}
